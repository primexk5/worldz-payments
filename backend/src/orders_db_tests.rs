//! Uses an explicit disposable PostgreSQL database and a local fake finalized RPC.
use std::sync::{Arc, Mutex};

use axum::{extract::State, routing::post, Json, Router};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use sqlx::Row;
use worldz_near_protocol::NetworkId;

use crate::{oneclick_db_tests, orders, state::AppState};

struct RpcFixture {
    fee_recipient: String,
    order: Value,
    transaction: Value,
    chain_time: u64,
}

async fn rpc(
    State(fixture): State<Arc<Mutex<RpcFixture>>>,
    Json(request): Json<Value>,
) -> Json<Value> {
    let fixture = fixture.lock().unwrap();
    let params = &request["params"];
    if request["method"] == "query" {
        assert_eq!(params["finality"], "final");
    }
    let result = match request["method"].as_str().unwrap() {
        "block" => {
            json!({"header":{"timestamp_nanosec":(fixture.chain_time * 1_000_000_000).to_string()}})
        }
        "tx" => fixture.transaction.clone(),
        "query" if params["request_type"] == "view_state" => {
            let key = ed25519_dalek::SigningKey::from_bytes(&[42; 32]);
            json!({"values":[{"key":params["prefix_base64"],"value":STANDARD.encode(borsh::to_vec(&key.verifying_key().to_bytes().to_vec()).unwrap())}]})
        }
        "query" => {
            let value = match params["method_name"].as_str().unwrap() {
                "get_config" => json!({"feeBps":30,"feeRecipientAccountId":fixture.fee_recipient}),
                "get_order" => fixture.order.clone(),
                other => panic!("unexpected view {other}"),
            };
            json!({"result":serde_json::to_vec(&value).unwrap()})
        }
        other => panic!("unexpected RPC method {other}"),
    };
    Json(json!({"jsonrpc":"2.0","id":request["id"],"result":result}))
}

#[tokio::test]
#[ignore = "requires SECURITY_TEST_DATABASE_URL pointing to disposable PostgreSQL"]
async fn fee_rotation_preserves_delayed_settlement_and_only_replaces_expired_unstarted_orders() {
    let url = std::env::var("SECURITY_TEST_DATABASE_URL").expect("disposable database required");
    let schema = format!("orders_test_{}", uuid::Uuid::new_v4().simple());
    let pool = oneclick_db_tests::pool_for(&url, &schema).await;
    sqlx::migrate!("./migrations/postgres")
        .run(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO merchants (merchant_id,account_id,payout_account_id,display_name) VALUES ('one','one.testnet','one.testnet','One')")
        .execute(&pool).await.unwrap();
    let fixture = Arc::new(Mutex::new(RpcFixture {
        fee_recipient: "fees.testnet".into(),
        order: Value::Null,
        transaction: Value::Null,
        chain_time: (chrono::Utc::now().timestamp() + 3600) as u64,
    }));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!("http://{}", listener.local_addr().unwrap());
    let app = Router::new()
        .route("/", post(rpc))
        .with_state(fixture.clone());
    let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    let mut config = oneclick_db_tests::config(url.clone(), None);
    config.testnet.rpc_url = endpoint;
    config.testnet.signer = Some(ed25519_dalek::SigningKey::from_bytes(&[42; 32]));

    for (slug, on_chain, expired) in [
        ("unsubmitted", Value::Null, false),
        ("processing", json!({"state":"PROCESSING"}), true),
        (
            "paid",
            json!({"state":"SETTLED","fee":"30","merchantLeg":{"state":"succeeded"},"feeLeg":{"state":"succeeded"}}),
            true,
        ),
        ("expired-unused", Value::Null, true),
    ] {
        fixture.lock().unwrap().fee_recipient = "fees.testnet".into();
        sqlx::query("INSERT INTO payment_links (slug,merchant_id,network_id,asset,amount,amount_display,display_name,max_redemptions) VALUES ($1,'one','testnet','{\"type\":\"native\",\"symbol\":\"NEAR\",\"decimals\":24}','10000','0.00000000000000000001','Fixture',1)")
            .bind(slug).execute(&pool).await.unwrap();
        let original_state = AppState::new(pool.clone(), config.clone());
        let original = orders::claim_link(
            &original_state,
            slug,
            NetworkId::Testnet,
            "payer.testnet",
            None,
        )
        .await
        .unwrap();
        if expired {
            sqlx::query(
                "UPDATE orders SET reserved_until=now()-interval '1 hour' WHERE order_id=$1",
            )
            .bind(&original.order_id)
            .execute(&pool)
            .await
            .unwrap();
        }
        let before = sqlx::query("SELECT * FROM orders WHERE order_id=$1")
            .bind(&original.order_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        {
            let mut fixture = fixture.lock().unwrap();
            fixture.fee_recipient = "rotated-fees.testnet".into();
            fixture.order = on_chain.clone();
        }
        let mut rotated_config = config.clone();
        rotated_config.testnet.fee_recipient = Some("rotated-fees.testnet".into());
        rotated_config.testnet.signer_key_id = "rotated-fixture".into();
        let rotated_state = AppState::new(pool.clone(), rotated_config);
        let reclaimed = orders::claim_link(
            &rotated_state,
            slug,
            NetworkId::Testnet,
            "payer.testnet",
            Some("Buyer"),
        )
        .await
        .unwrap();
        let after = sqlx::query("SELECT * FROM orders WHERE order_id=$1")
            .bind(&original.order_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        if expired && on_chain.is_null() {
            assert_ne!(original.order_id, reclaimed.order_id);
            assert_eq!(after.get::<String, _>("state"), "EXPIRED");
            assert_eq!(
                reclaimed.authorization["feeRecipientAccountId"],
                "rotated-fees.testnet"
            );
            assert_eq!(reclaimed.authorization["signerKeyId"], "rotated-fixture");
            assert_ne!(
                original.authorization["nonce"],
                reclaimed.authorization["nonce"]
            );
            eprintln!(
                "RECOVERY_EVIDENCE:{}",
                json!({"scenario":slug,"result":"passed","oldOrderState":"EXPIRED","replacementUsesCurrentTerms":true,"newReplayNonce":true})
            );
            continue;
        }
        assert_eq!(original.order_id, reclaimed.order_id);
        assert_eq!(original.authorization, reclaimed.authorization);
        assert_eq!(
            after.get::<Value, _>("authorization"),
            original.authorization
        );
        for field in ["amount", "fee", "net"] {
            assert_eq!(
                before.get::<String, _>(field),
                after.get::<String, _>(field)
            );
        }
        assert_eq!(
            before.get::<Option<chrono::DateTime<chrono::Utc>>, _>("reserved_until"),
            after.get::<Option<chrono::DateTime<chrono::Utc>>, _>("reserved_until")
        );
        assert_eq!(after.get::<String, _>("customer_name"), "Buyer");
        assert_ne!(original.edit_token, reclaimed.edit_token);
        if on_chain["state"] != "SETTLED" {
            eprintln!(
                "RECOVERY_EVIDENCE:{}",
                json!({"scenario":slug,"result":"passed","originalAuthorizationPreserved":true,"financialTermsPreserved":true,"deadlinePreserved":true})
            );
            continue;
        }

        // The chain has paid the ORIGINAL recipient while the database is still OPEN.
        assert_eq!(after.get::<String, _>("state"), "OPEN");
        let data = json!({"orderId":original.order_id,"merchantId":"one","amount":"10000","fee":"30","net":"9970","merchantAccountId":"one.testnet","payoutAccountId":"one.testnet","feeRecipientAccountId":"fees.testnet"});
        let event = json!({"standard":"worldz-payments","event":"payment_settled","data":[data]});
        fixture.lock().unwrap().transaction = json!({
            "final_execution_status":"FINAL",
            "transaction":{"hash":"paid-tx","signer_id":"payer.testnet"},
            "receipts_outcome":[{"id":"paid-receipt","outcome":{"executor_id":"router.testnet","status":{"SuccessValue":""},"logs":[format!("EVENT_JSON:{event}")]}}]
        });
        sqlx::query("UPDATE orders SET transaction_hash='paid-tx' WHERE order_id=$1")
            .bind(&original.order_id)
            .execute(&pool)
            .await
            .unwrap();
        let pending = sqlx::query("SELECT * FROM orders WHERE order_id=$1")
            .bind(&original.order_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        orders::reconcile_order(&rotated_state, &pending)
            .await
            .unwrap();
        let settled =
            sqlx::query("SELECT state,settlement_receipt_id FROM orders WHERE order_id=$1")
                .bind(&original.order_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(settled.get::<String, _>("state"), "SETTLED");
        assert_eq!(
            settled.get::<String, _>("settlement_receipt_id"),
            "paid-receipt"
        );
        let claims: i32 = sqlx::query_scalar("SELECT claims_used FROM payment_links WHERE slug=$1")
            .bind(slug)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(claims, 1);
        eprintln!(
            "RECOVERY_EVIDENCE:{}",
            json!({"scenario":slug,"result":"passed","databaseStateBeforeReconciliation":"OPEN","routerState":"SETTLED","originalAuthorizationPreserved":true,"feeRecipientUsed":"fees.testnet","currentFeeRecipient":"rotated-fees.testnet","databaseStateAfterReconciliation":"SETTLED","verifiedReceiptRecorded":true,"redemptions":claims})
        );
    }
    server.abort();
    pool.close().await;
    let admin = sqlx::PgPool::connect(&url).await.unwrap();
    sqlx::query(&format!("DROP SCHEMA {schema} CASCADE"))
        .execute(&admin)
        .await
        .unwrap();
}
