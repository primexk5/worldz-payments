//! Run against a disposable PostgreSQL server with SECURITY_TEST_DATABASE_URL set.
//! These tests cover the cross-chain settle-once guarantee, the native-vs-cross-chain
//! race, and the full mock-mode lifecycle. They use the shared finalize_settlement
//! latch; no external 1Click traffic is made.

use crate::config::NetworkConfig;
use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::postgres::PgRow;
use sqlx::Row;
use tower::util::ServiceExt;

use crate::config::AppConfig;
use crate::oneclick::SwapOutcome;
use crate::state::AppState;
use worldz_near_protocol::NetworkId;

pub(super) fn config(database_url: String, mock_outcome: Option<&str>) -> AppConfig {
    let network = NetworkConfig {
        rpc_url: "http://127.0.0.1:1".into(),
        rpc_fallback_urls: vec![],
        router_id: Some("router.testnet".into()),
        fee_recipient: Some("fees.testnet".into()),
        signer_key_id: "fixture".into(),
        signer: None,
        ft_allowlist: vec![],
        indexer_start_height: 0,
    };
    AppConfig {
        host: "127.0.0.1".parse().unwrap(),
        port: 0,
        database_url,
        auth_recipient: "localhost".into(),
        auth_network_id: NetworkId::Testnet,
        auth_challenge_ttl_seconds: 300,
        session_cookie_name: "worldz_session".into(),
        session_ttl_hours: 24,
        session_cookie_secure: false,
        cors_origins: vec![],
        webhook_signing_secret: None,
        shopify_api_key: None,
        shopify_api_secret: None,
        shopify_app_url: None,
        shopify_checkout_url: None,
        shopify_token_encryption_key: None,
        vtpass_api_key: None,
        vtpass_public_key: None,
        vtpass_secret_key: None,
        vtpass_data_encryption_key: None,
        oneclick_enabled: true,
        oneclick_mode: "mock".into(),
        oneclick_base_url: "https://1click.chaindefuser.com".into(),
        oneclick_api_key: None,
        oneclick_mock_outcome: mock_outcome.map(str::to_owned),
        testnet: network.clone(),
        mainnet: network,
    }
}

pub(super) async fn pool_for(url: &str, schema: &str) -> sqlx::PgPool {
    let admin = sqlx::PgPool::connect(url).await.unwrap();
    sqlx::query(&format!("CREATE SCHEMA {schema}"))
        .execute(&admin)
        .await
        .unwrap();
    let search_path = format!("SET search_path TO {schema}");
    sqlx::postgres::PgPoolOptions::new()
        .max_connections(8)
        .after_connect(move |connection, _| {
            let sql = search_path.clone();
            Box::pin(async move {
                sqlx::query(&sql).execute(connection).await?;
                Ok(())
            })
        })
        .connect(url)
        .await
        .unwrap()
}

async fn seed(pool: &sqlx::PgPool, single_pay: bool) {
    sqlx::migrate!("./migrations/postgres")
        .run(pool)
        .await
        .unwrap();
    sqlx::raw_sql(
        "INSERT INTO merchants (merchant_id,account_id,payout_account_id,display_name) VALUES ('one','one.testnet','one.testnet','One');
         INSERT INTO payment_links (slug,merchant_id,network_id,asset,amount,amount_display,display_name,multi_pay,max_redemptions) VALUES ('ccfixture','one','testnet','{\"type\":\"nep141\",\"contractId\":\"usdc.fakes.testnet\",\"symbol\":\"USDC\",\"decimals\":6}','1000000','1','Cross chain fixture',FALSE,NULL);",
    )
    .execute(pool)
    .await
    .unwrap();
    if single_pay {
        sqlx::query(
            "UPDATE payment_links SET multi_pay=FALSE, max_redemptions=1 WHERE slug='ccfixture'",
        )
        .execute(pool)
        .await
        .unwrap();
    }
}

async fn insert_cross_chain_order(
    pool: &sqlx::PgPool,
    order_id: &str,
    status: &str,
    tx_hash: Option<&str>,
) {
    sqlx::query(
        "INSERT INTO orders (order_id,merchant_id,payer_account_id,network_id,contract_id,order_key,\"authorization\",asset,amount,fee,net,source,link_slug,pay_method) \
         VALUES ($1,'one','0x2527d02599ba641c19fea793cd0f167589a0f10d','testnet','router.testnet',$2,NULL,'{\"type\":\"nep141\",\"contractId\":\"usdc.fakes.testnet\",\"symbol\":\"USDC\",\"decimals\":6}','1000000','0','1000000','1click','ccfixture','cross_chain')",
    )
    .bind(order_id)
    .bind(hex::encode(Sha256::digest(order_id.as_bytes())))
    .execute(pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO one_click_attempts (attempt_id,network_id,contract_id,order_id,merchant_id,link_slug,origin_asset,destination_asset,amount_out,amount_in,slippage_bps,refund_to,refund_chain,deposit_address,deadline,status,tx_hash) \
         VALUES ($1,'testnet','router.testnet',$2,'one','ccfixture','nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near','nep141:usdc.fakes.testnet.omft.near','1000000','1050000',100,'0x2527d02599ba641c19fea793cd0f167589a0f10d','arb',$3,NOW()+INTERVAL '30 minutes',$4,$5)",
    )
    .bind(format!("oc_{order_id}"))
    .bind(order_id)
    .bind(format!("0xdeposit-{order_id}"))
    .bind(status)
    .bind(tx_hash)
    .execute(pool)
    .await
    .unwrap();
}

async fn insert_native_order(pool: &sqlx::PgPool, order_id: &str) {
    sqlx::query(
        "INSERT INTO orders (order_id,merchant_id,payer_account_id,network_id,contract_id,order_key,\"authorization\",asset,amount,fee,net,source,link_slug,edit_token_hash) \
         VALUES ($1,'one','payer.testnet','testnet','router.testnet',$2,$3,'{\"type\":\"nep141\",\"contractId\":\"usdc.fakes.testnet\",\"symbol\":\"USDC\",\"decimals\":6}','1000000','0','1000000','link','ccfixture',$4)",
    )
    .bind(order_id)
    .bind(hex::encode(Sha256::digest(order_id.as_bytes())))
    .bind(json!({"merchantAccountId":"one.testnet","payoutAccountId":"one.testnet","signature":"fixture"}))
    .bind(&Sha256::digest(order_id.as_bytes())[..])
    .execute(pool)
    .await
    .unwrap();
}

async fn order_state(pool: &sqlx::PgPool, order_id: &str) -> String {
    sqlx::query("SELECT state FROM orders WHERE order_id=$1")
        .bind(order_id)
        .fetch_one(pool)
        .await
        .unwrap()
        .try_get("state")
        .unwrap()
}

async fn attempt_row(pool: &sqlx::PgPool, order_id: &str) -> PgRow {
    sqlx::query("SELECT * FROM one_click_attempts WHERE order_id=$1")
        .bind(order_id)
        .fetch_one(pool)
        .await
        .unwrap()
}

fn success_outcome(amount_out: &str) -> SwapOutcome {
    SwapOutcome {
        near_tx_hashes: vec!["verified".to_owned()],
        destination_tx_hashes: vec![],
        amount_out: Some(amount_out.to_owned()),
    }
}

#[tokio::test]
#[ignore = "requires SECURITY_TEST_DATABASE_URL pointing to disposable PostgreSQL"]
async fn repeated_and_concurrent_cross_chain_success_settles_exactly_once() {
    let url = std::env::var("SECURITY_TEST_DATABASE_URL")
        .expect("explicit disposable database URL required");
    let schema = format!("oneclick_once_{}", uuid::Uuid::new_v4().simple());
    let pool = pool_for(&url, &schema).await;
    seed(&pool, false).await;
    insert_cross_chain_order(&pool, "ord-cc", "PENDING_DEPOSIT", Some("0xtx")).await;
    let state = AppState::new(pool.clone(), config(url, None));
    let row = attempt_row(&pool, "ord-cc").await;
    let outcome = success_outcome("1000000");
    let (first, second) = tokio::join!(
        crate::oneclick::test_hooks::settle_success_for_test(&state, &row, &outcome),
        crate::oneclick::test_hooks::settle_success_for_test(&state, &row, &outcome),
    );
    first.unwrap();
    second.unwrap();
    assert_eq!(order_state(&pool, "ord-cc").await, "SETTLED");
    let row = attempt_row(&pool, "ord-cc").await;
    assert_eq!(row.try_get::<String, _>("status").unwrap(), "SETTLED");
    let claims_used: i32 =
        sqlx::query("SELECT claims_used FROM payment_links WHERE slug='ccfixture'")
            .fetch_one(&pool)
            .await
            .unwrap()
            .try_get("claims_used")
            .unwrap();
    assert_eq!(claims_used, 1);
    let payment_events: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM payment_events")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(payment_events, 1);
    let webhook_deliveries: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM webhook_deliveries")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(webhook_deliveries, 1);
    crate::oneclick::test_hooks::settle_success_for_test(&state, &row, &success_outcome("1000000"))
        .await
        .unwrap();
    let claims_used: i32 =
        sqlx::query("SELECT claims_used FROM payment_links WHERE slug='ccfixture'")
            .fetch_one(&pool)
            .await
            .unwrap()
            .try_get("claims_used")
            .unwrap();
    assert_eq!(claims_used, 1);
    let payment_events: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM payment_events")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(payment_events, 1);
}

#[tokio::test]
#[ignore = "requires SECURITY_TEST_DATABASE_URL pointing to disposable PostgreSQL"]
async fn native_and_cross_chain_race_produces_one_winner() {
    let url = std::env::var("SECURITY_TEST_DATABASE_URL")
        .expect("explicit disposable database URL required");
    let schema = format!("oneclick_race_{}", uuid::Uuid::new_v4().simple());
    let pool = pool_for(&url, &schema).await;
    seed(&pool, true).await;
    insert_native_order(&pool, "ord-native").await;
    insert_cross_chain_order(&pool, "ord-cc", "PENDING_DEPOSIT", Some("0xtx")).await;
    let state = AppState::new(pool.clone(), config(url, None));
    let cc_row = attempt_row(&pool, "ord-cc").await;
    let native_row = sqlx::query("SELECT * FROM orders WHERE order_id='ord-native'")
        .fetch_one(&pool)
        .await
        .unwrap();
    let outcome = success_outcome("1000000");
    let receipt = crate::orders::SettlementReceipt {
        transaction_hash: "nativehash",
        receipt_id: "native-receipt",
        log_index: 0,
        payout_account_id: "one.testnet",
    };
    let (native, cross_chain) = tokio::join!(
        async {
            crate::orders::finalize_settlement(
                &state,
                &native_row,
                NetworkId::Testnet,
                "router.testnet",
                "ord-native",
                "one",
                "payer.testnet",
                receipt,
            )
            .await
        },
        crate::oneclick::test_hooks::settle_success_for_test(&state, &cc_row, &outcome),
    );
    native.unwrap();
    cross_chain.unwrap();
    let native_state = order_state(&pool, "ord-native").await;
    let cross_chain_state = order_state(&pool, "ord-cc").await;
    let settled = [native_state.as_str(), cross_chain_state.as_str()]
        .iter()
        .filter(|state| **state == "SETTLED")
        .count();
    assert_eq!(
        settled, 1,
        "exactly one payment may settle a single-pay link"
    );
    for (order_id, state_name) in [
        ("ord-native", &native_state),
        ("ord-cc", &cross_chain_state),
    ] {
        if state_name != "SETTLED" {
            assert_eq!(
                *state_name, "RECONCILIATION_REQUIRED",
                "the losing path for {order_id} must be flagged"
            );
        }
    }
    let claims_used: i32 =
        sqlx::query("SELECT claims_used FROM payment_links WHERE slug='ccfixture'")
            .fetch_one(&pool)
            .await
            .unwrap()
            .try_get("claims_used")
            .unwrap();
    assert_eq!(claims_used, 1);
    let attempt_status: String = attempt_row(&pool, "ord-cc")
        .await
        .try_get("status")
        .unwrap();
    if cross_chain_state == "SETTLED" {
        assert_eq!(attempt_status, "SETTLED");
    } else {
        assert_eq!(attempt_status, "RECONCILIATION_REQUIRED");
    }
}

#[tokio::test]
#[ignore = "requires SECURITY_TEST_DATABASE_URL pointing to disposable PostgreSQL"]
async fn refunded_failed_and_incomplete_attempts_never_settle() {
    let url = std::env::var("SECURITY_TEST_DATABASE_URL")
        .expect("explicit disposable database URL required");
    for outcome in ["refunded", "failed", "incomplete_deposit"] {
        let schema = format!(
            "oneclick_fail_{}_{}",
            outcome,
            uuid::Uuid::new_v4().simple()
        );
        let pool = pool_for(&url, &schema).await;
        seed(&pool, false).await;
        insert_cross_chain_order(&pool, "ord-cc", "PENDING_DEPOSIT", Some("0xtx")).await;
        sqlx::query("UPDATE one_click_attempts SET updated_at=NOW()-INTERVAL '1 hour'")
            .execute(&pool)
            .await
            .unwrap();
        let state = AppState::new(pool.clone(), config(url.clone(), Some(outcome)));
        let processed = crate::oneclick::test_hooks::worker_tick_for_test(&state)
            .await
            .unwrap();
        assert_eq!(processed, 1);
        assert_eq!(order_state(&pool, "ord-cc").await, "OPEN");
        let row = attempt_row(&pool, "ord-cc").await;
        let expected = match outcome {
            "refunded" => "REFUNDED",
            "failed" => "FAILED",
            _ => "INCOMPLETE_DEPOSIT",
        };
        assert_eq!(row.try_get::<String, _>("status").unwrap(), expected);
    }
}

#[tokio::test]
#[ignore = "requires SECURITY_TEST_DATABASE_URL pointing to disposable PostgreSQL"]
async fn expired_attempts_close_without_settling() {
    let url = std::env::var("SECURITY_TEST_DATABASE_URL")
        .expect("explicit disposable database URL required");
    let schema = format!("oneclick_expiry_{}", uuid::Uuid::new_v4().simple());
    let pool = pool_for(&url, &schema).await;
    seed(&pool, false).await;
    insert_cross_chain_order(&pool, "ord-cc", "AWAITING_DEPOSIT", None).await;
    sqlx::query("UPDATE one_click_attempts SET deadline=NOW()-INTERVAL '1 minute'")
        .execute(&pool)
        .await
        .unwrap();
    let state = AppState::new(pool.clone(), config(url, None));
    crate::oneclick::test_hooks::worker_tick_for_test(&state)
        .await
        .unwrap();
    let row = attempt_row(&pool, "ord-cc").await;
    assert_eq!(row.try_get::<String, _>("status").unwrap(), "EXPIRED");
    assert_eq!(order_state(&pool, "ord-cc").await, "OPEN");
}

#[tokio::test]
#[ignore = "requires SECURITY_TEST_DATABASE_URL pointing to disposable PostgreSQL"]
async fn mock_lifecycle_runs_the_real_settlement_path_and_never_reuses_deposit_addresses() {
    let url = std::env::var("SECURITY_TEST_DATABASE_URL")
        .expect("explicit disposable database URL required");
    let schema = format!("oneclick_life_{}", uuid::Uuid::new_v4().simple());
    let pool = pool_for(&url, &schema).await;
    seed(&pool, false).await;
    let state = AppState::new(pool.clone(), config(url, None));
    // Seed current prices so this integration test never calls external services.
    let payload: Value = serde_json::from_str(crate::oneclick::MOCK_TOKENS_FIXTURE).unwrap();
    let mut prices = crate::oneclick::test_hooks::priced_tokens_for_test(&payload);
    for token in &mut prices {
        token.price_units = Some(100_000_000);
        token.price_updated_at = Some(chrono::Utc::now().timestamp());
    }
    *state.oneclick_tokens.lock().await = Some(crate::state::CachedOneClickTokens {
        tokens: std::sync::Arc::new(prices),
        fetched_at: std::time::Instant::now(),
    });
    let app = crate::api::routes().with_state(state.clone());
    let (code, attempt) = call(
        &app,
        "POST",
        "/links/ccfixture/oneclick/attempts",
        &json!({
            "originAsset": "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near",
            "refundTo": "0x2527d02599ba641c19fea793cd0f167589a0f10d",
            "slippageBps": 100,
            "customerName": "Checkout regression"
        }),
    )
    .await;
    assert_eq!(
        code,
        StatusCode::CREATED,
        "attempt creation failed: {attempt}"
    );
    assert_eq!(attempt["simulated"], true);
    let deposit_address = attempt["depositAddress"].as_str().unwrap().to_owned();
    let attempt_id = attempt["attemptId"].as_str().unwrap().to_owned();
    let order_id = attempt["orderId"].as_str().unwrap().to_owned();
    let order = sqlx::query("SELECT asset, amount, fee, net, \"authorization\", customer_name, pay_method FROM orders WHERE order_id=$1")
        .bind(&order_id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(
        order.try_get::<Value, _>("asset").unwrap()["symbol"],
        "USDC"
    );
    assert_eq!(order.try_get::<String, _>("amount").unwrap(), "1000000");
    assert_eq!(order.try_get::<String, _>("fee").unwrap(), "0");
    assert_eq!(order.try_get::<String, _>("net").unwrap(), "1000000");
    assert!(order
        .try_get::<Option<Value>, _>("authorization")
        .unwrap()
        .is_none());
    assert_eq!(
        order.try_get::<String, _>("customer_name").unwrap(),
        "Checkout regression"
    );
    assert_eq!(
        order.try_get::<String, _>("pay_method").unwrap(),
        "cross_chain"
    );
    let persisted_attempt = attempt_row(&pool, &order_id).await;
    assert_eq!(
        persisted_attempt.try_get::<String, _>("status").unwrap(),
        "AWAITING_DEPOSIT"
    );
    assert_eq!(
        persisted_attempt
            .try_get::<String, _>("deposit_address")
            .unwrap(),
        deposit_address
    );

    let (code, _) = call(
        &app,
        "POST",
        &format!("/oneclick/attempts/{attempt_id}/deposit"),
        &json!({"txHash": "0xabc123"}),
    )
    .await;
    assert_eq!(code, StatusCode::OK);
    // Repeated processing polls must not reset the simulation's settlement clock.
    crate::oneclick::test_hooks::worker_tick_for_test(&state)
        .await
        .unwrap();
    let first_poll = attempt_row(&pool, &order_id).await;
    let first_update: chrono::DateTime<chrono::Utc> = first_poll.try_get("updated_at").unwrap();
    crate::oneclick::test_hooks::worker_tick_for_test(&state)
        .await
        .unwrap();
    let second_poll = attempt_row(&pool, &order_id).await;
    assert_eq!(
        second_poll
            .try_get::<chrono::DateTime<chrono::Utc>, _>("updated_at")
            .unwrap(),
        first_update
    );
    sqlx::query("UPDATE one_click_attempts SET updated_at=NOW()-INTERVAL '1 hour'")
        .execute(&pool)
        .await
        .unwrap();
    for _ in 0..10 {
        crate::oneclick::test_hooks::worker_tick_for_test(&state)
            .await
            .unwrap();
        let row = attempt_row(&pool, &order_id).await;
        if row.try_get::<String, _>("status").unwrap() == "SETTLED" {
            break;
        }
    }
    assert_eq!(order_state(&pool, &order_id).await, "SETTLED");
    let payment_events: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM payment_events")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(payment_events, 1);
    let (code, second) = call(
        &app,
        "POST",
        "/links/ccfixture/oneclick/attempts",
        &json!({
            "originAsset": "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near",
            "refundTo": "0x2527d02599ba641c19fea793cd0f167589a0f10d"
        }),
    )
    .await;
    assert_eq!(code, StatusCode::CREATED);
    assert_ne!(second["depositAddress"].as_str().unwrap(), deposit_address);
    let (code, _) = call(
        &app,
        "POST",
        &format!("/oneclick/attempts/{}/deposit", attempt_id),
        &json!({"txHash": "0xdeadbeef"}),
    )
    .await;
    assert_eq!(code, StatusCode::CONFLICT);
}

async fn call(
    app: &axum::Router<()>,
    method: &str,
    path: &str,
    body: &Value,
) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(method)
                .uri(path)
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}
