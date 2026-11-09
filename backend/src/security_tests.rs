//! Run against a disposable PostgreSQL server with SECURITY_TEST_DATABASE_URL set.
//! Each run creates and removes a private schema; it never uses the application's .env.
use axum::{
    body::Body,
    http::{Request, StatusCode},
    Router,
};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::{postgres::PgPoolOptions, Row};
use tower::ServiceExt;
use worldz_near_protocol::NetworkId;

use crate::{
    api, auth,
    config::{AppConfig, NetworkConfig},
    state::AppState,
};

#[tokio::test]
async fn cors_allows_only_the_configured_browser_origin() {
    let app = Router::new()
        .route("/status", axum::routing::get(|| async { "ok" }))
        .layer(crate::cors_layer(&["https://worldz-payments.vercel.app".into()]).unwrap());
    for (origin, allowed) in [
        ("https://worldz-payments.vercel.app", true),
        ("https://attacker.example", false),
    ] {
        let request = Request::builder()
            .method("OPTIONS")
            .uri("/status")
            .header("origin", origin)
            .header("access-control-request-method", "POST")
            .header(
                "access-control-request-headers",
                "content-type,x-checkout-token",
            )
            .body(Body::empty())
            .unwrap();
        let response = app.clone().oneshot(request).await.unwrap();
        assert_eq!(
            response
                .headers()
                .get("access-control-allow-origin")
                .is_some(),
            allowed
        );
        if allowed {
            assert_eq!(
                response.headers()["access-control-allow-credentials"],
                "true"
            );
            assert!(response.headers()["access-control-allow-headers"]
                .to_str()
                .unwrap()
                .contains("x-checkout-token"));
        }
    }
}

#[tokio::test]
async fn public_limits_ignore_spoofed_headers_and_bound_concurrency() {
    let pool = PgPoolOptions::new()
        .connect_lazy("postgres://unused@127.0.0.1/unused")
        .unwrap();
    let state = AppState::new(pool, config("unused".into()));
    let app = Router::new()
        .route("/v1/assets", axum::routing::get(|| async { "ok" }))
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            crate::abuse::protect,
        ));
    let permits = state
        .public_requests
        .clone()
        .acquire_many_owned(32)
        .await
        .unwrap();
    assert_eq!(
        call(&app, "GET", "/v1/assets", None, None).await.0,
        StatusCode::SERVICE_UNAVAILABLE
    );
    drop(permits);
    for i in 1..120 {
        let spoofed = format!("192.0.2.{i}");
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/v1/assets")
                    .header("x-forwarded-for", spoofed)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()["cache-control"], "private, no-store");
    }
    assert_eq!(
        call(
            &app,
            "GET",
            "/v1/assets",
            Some(("x-forwarded-for", "1.1.1.1")),
            None
        )
        .await
        .0,
        StatusCode::TOO_MANY_REQUESTS
    );
}

fn config(database_url: String) -> AppConfig {
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
        testnet: network.clone(),
        mainnet: network,
    }
}

async fn call(
    app: &Router,
    method: &str,
    path: &str,
    auth: Option<(&str, &str)>,
    body: Option<Value>,
) -> (StatusCode, Value) {
    let mut request = Request::builder().method(method).uri(path);
    if let Some((key, value)) = auth {
        request = request.header(key, value);
    }
    let payload = if let Some(body) = body {
        request = request.header("content-type", "application/json");
        body.to_string()
    } else {
        String::new()
    };
    let response = app
        .clone()
        .oneshot(request.body(Body::from(payload)).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}

#[tokio::test]
#[ignore = "requires SECURITY_TEST_DATABASE_URL pointing to disposable PostgreSQL"]
async fn postgres_checkout_access_api_keys_and_atomic_limits() {
    let url = std::env::var("SECURITY_TEST_DATABASE_URL")
        .expect("explicit disposable database URL required");
    let admin = PgPoolOptions::new()
        .max_connections(1)
        .connect(&url)
        .await
        .unwrap();
    let schema = format!("security_test_{}", uuid::Uuid::new_v4().simple());
    sqlx::query(&format!("CREATE SCHEMA {schema}"))
        .execute(&admin)
        .await
        .unwrap();
    let search_path = format!("SET search_path TO {schema}");
    let pool = PgPoolOptions::new()
        .max_connections(8)
        .after_connect(move |connection, _| {
            let sql = search_path.clone();
            Box::pin(async move {
                sqlx::query(&sql).execute(connection).await?;
                Ok(())
            })
        })
        .connect(&url)
        .await
        .unwrap();
    sqlx::migrate!("./migrations/postgres")
        .run(&pool)
        .await
        .unwrap();
    let state = AppState::new(pool.clone(), config(url));
    sqlx::raw_sql("INSERT INTO merchants (merchant_id,account_id,payout_account_id,display_name) VALUES ('one','one.testnet','one.testnet','One'),('two','two.testnet','two.testnet','Two');
        INSERT INTO payment_links (slug,merchant_id,network_id,asset,amount,amount_display,display_name) VALUES ('fixture','one','testnet','{\"type\":\"native\",\"symbol\":\"NEAR\",\"decimals\":24}','10000','0.00000000000000000001','Fixture');")
        .execute(&pool).await.unwrap();
    let token = "a".repeat(43);
    let other_token = "b".repeat(43);
    for (id, capability) in [("order-one", &token), ("order-two", &other_token)] {
        sqlx::query("INSERT INTO orders (order_id,merchant_id,payer_account_id,network_id,contract_id,order_key,\"authorization\",asset,amount,fee,net,source,link_slug,edit_token_hash) VALUES ($1,'one','payer.testnet','testnet','router.testnet',$2,$3,'{\"type\":\"native\",\"symbol\":\"NEAR\",\"decimals\":24}','10000','30','9970','link','fixture',$4)")
            .bind(id).bind(hex::encode(Sha256::digest(id.as_bytes())))
            .bind(json!({"merchantAccountId":"one.testnet","payoutAccountId":"one.testnet","signature":"fixture"}))
            .bind(&Sha256::digest(capability.as_bytes())[..]).execute(&pool).await.unwrap();
    }
    for (merchant, session) in [("one", "session-one"), ("two", "session-two")] {
        sqlx::query("INSERT INTO merchant_sessions (token_hash,merchant_id,expires_at) VALUES ($1,$2,NOW()+INTERVAL '1 hour')")
            .bind(&Sha256::digest(session.as_bytes())[..]).bind(merchant).execute(&pool).await.unwrap();
    }
    let key = format!("wzp_{}", "k".repeat(43));
    sqlx::query("INSERT INTO merchant_api_keys (key_ref,merchant_id,secret_hash,label) VALUES ('fixture-key','one',$1,'Fixture')")
        .bind(&Sha256::digest(key.as_bytes())[..]).execute(&pool).await.unwrap();
    let app = api::routes().with_state(state.clone());
    let status_path = "/orders/one/order-one?networkId=testnet";
    let meta_path = "/orders/one/order-one/meta";
    assert_eq!(
        call(&app, "GET", status_path, None, None).await.0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        call(
            &app,
            "GET",
            status_path,
            Some(("cookie", "worldz_session=session-two")),
            None
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        call(
            &app,
            "GET",
            status_path,
            Some(("x-checkout-token", &other_token)),
            None
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    let customer = Some(("x-checkout-token", token.as_str()));
    let (code, order) = call(&app, "GET", status_path, customer, None).await;
    assert_eq!(code, StatusCode::OK);
    assert_eq!(order["authorization"]["signature"], "fixture");
    assert_eq!(
        call(
            &app,
            "GET",
            "/orders/one/order-two?networkId=testnet",
            customer,
            None
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        call(
            &app,
            "GET",
            "/orders/one/order-one?networkId=mainnet",
            customer,
            None
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        call(
            &app,
            "POST",
            meta_path,
            None,
            Some(json!({"networkId":"testnet","transactionHash":"untrusted"}))
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        call(
            &app,
            "POST",
            meta_path,
            customer,
            Some(json!({"networkId":"testnet","editToken":token,"customerName":"Yusef"}))
        )
        .await
        .0,
        StatusCode::NO_CONTENT
    );
    let (code, order) = call(
        &app,
        "GET",
        &format!("{status_path}&transactionHash=untrusted"),
        customer,
        None,
    )
    .await;
    assert_eq!(code, StatusCode::OK);
    assert_eq!(order["customerName"], "Yusef");
    assert!(order["transactionHash"].is_null());
    let bearer = format!("Bearer {key}");
    assert_eq!(
        call(
            &app,
            "GET",
            status_path,
            Some(("authorization", &bearer)),
            None
        )
        .await
        .0,
        StatusCode::OK
    );
    let used: bool = sqlx::query_scalar(
        "SELECT last_used_at IS NOT NULL FROM merchant_api_keys WHERE key_ref='fixture-key'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(used);
    sqlx::query("UPDATE merchant_api_keys SET revoked_at=NOW() WHERE key_ref='fixture-key'")
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        call(
            &app,
            "GET",
            status_path,
            Some(("authorization", &bearer)),
            None
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    sqlx::query("UPDATE orders SET state='SETTLED',settlement_receipt_id='verified-fixture' WHERE order_id='order-one'").execute(&pool).await.unwrap();
    let (code, order) = call(&app, "GET", status_path, customer, None).await;
    assert_eq!(code, StatusCode::OK);
    assert!(order["authorization"].is_null());
    assert_eq!(
        call(
            &app,
            "POST",
            meta_path,
            customer,
            Some(json!({"networkId":"testnet","editToken":token,"customerName":"Attacker"}))
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    for _ in 0..2 {
        assert_eq!(
            call(
                &app,
                "DELETE",
                "/links/fixture",
                Some(("cookie", "worldz_session=session-one")),
                None
            )
            .await
            .0,
            StatusCode::NO_CONTENT
        );
    }
    assert_eq!(
        call(
            &app,
            "DELETE",
            "/links/missing",
            Some(("cookie", "worldz_session=session-one")),
            None
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    for proof in [None, Some(Value::Null)] {
        let mut input = json!({"payerAccountId":"payer.testnet","networkId":"testnet"});
        if let Some(proof) = proof {
            input["proof"] = proof;
        }
        assert_eq!(
            call(&app, "POST", "/links/fixture/claim", None, Some(input))
                .await
                .0,
            StatusCode::UNPROCESSABLE_ENTITY
        );
    }
    let mut tasks = tokio::task::JoinSet::new();
    for _ in 0..40 {
        let state = state.clone();
        tasks.spawn(async move {
            auth::enforce_rate_limit(&state, "concurrent-fixture", 10)
                .await
                .is_ok()
        });
    }
    let mut accepted = 0;
    while let Some(result) = tasks.join_next().await {
        accepted += result.unwrap() as usize;
    }
    assert_eq!(accepted, 10);
    let attempts: i32 =
        sqlx::query("SELECT attempts FROM auth_rate_limits WHERE subject='concurrent-fixture'")
            .fetch_one(&pool)
            .await
            .unwrap()
            .get("attempts");
    assert_eq!(attempts, 10);
    sqlx::query("UPDATE auth_rate_limits SET window_started_at=NOW()-INTERVAL '16 minutes'")
        .execute(&pool)
        .await
        .unwrap();
    assert!(auth::enforce_rate_limit(&state, "concurrent-fixture", 10)
        .await
        .is_ok());
    drop(app);
    drop(state);
    pool.close().await;
    sqlx::query(&format!("DROP SCHEMA {schema} CASCADE"))
        .execute(&admin)
        .await
        .unwrap();
}
