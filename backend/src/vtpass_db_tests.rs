//! Isolated HTTP + PostgreSQL lifecycle tests. Provider and settlement evidence
//! are fixtures; this never signs a wallet transaction or purchases a real service.
use crate::state::{AppState, CachedNearUsdRate, CachedUsdNgnRate};
use axum::{
    body::Body,
    http::{Request, StatusCode},
    routing::{get, post},
    Json, Router,
};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
    time::Instant,
};
use tower::ServiceExt;

async fn call(
    app: &Router,
    method: &str,
    path: &str,
    body: Value,
    authenticated: bool,
) -> (StatusCode, Value) {
    let mut request = Request::builder()
        .method(method)
        .uri(path)
        .header("content-type", "application/json");
    if authenticated {
        request = request.header("cookie", "worldz_session=service-session");
    }
    let response = app
        .clone()
        .oneshot(request.body(Body::from(body.to_string())).unwrap())
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
async fn subscription_http_lifecycle_and_fulfill_once() {
    let url = std::env::var("SECURITY_TEST_DATABASE_URL").expect("disposable database required");
    let schema = format!("vtpass_test_{}", uuid::Uuid::new_v4().simple());
    let pool = crate::oneclick_db_tests::pool_for(&url, &schema).await;
    sqlx::migrate!("./migrations/postgres")
        .run(&pool)
        .await
        .unwrap();
    let mut config = crate::oneclick_db_tests::config(url.clone(), None);
    config.vtpass_api_key = Some("fixture".into());
    config.vtpass_public_key = Some("fixture".into());
    config.vtpass_secret_key = Some("fixture".into());
    config.vtpass_data_encryption_key = Some([7; 32]);
    let payments = Arc::new(AtomicUsize::new(0));
    let queries = Arc::new(AtomicUsize::new(0));
    let pay_calls = payments.clone();
    let requery_calls = queries.clone();
    let provider = Router::new()
        .route("/services", get(|| async { Json(json!({"content":[{"serviceID":"fixture-provider","name":"Fixture provider"},{"serviceID":"dstv","name":"DSTV"}]})) }))
        .route("/service-variations", get(|| async { Json(json!({"content":{"variations":[{"variation_code":"basic","variation_amount":"1000","name":"Basic"}]}})) }))
        .route("/merchant-verify", post(|| async { Json(json!({"code":"000","content":{"Customer_Name":"Test Customer"}})) }))
        .route("/pay", post(move |Json(body): Json<Value>| { let calls = pay_calls.clone(); async move {
            assert_eq!(body["amount"], "1000");
            assert_eq!(body["phone"], "08011111111");
            if body["serviceID"] == "dstv" {
                assert_eq!(body["subscription_type"], "change");
                assert_eq!(body["quantity"], 1);
                assert_eq!(body["variation_code"], "basic");
            } else {
                assert_eq!(body["serviceID"], "fixture-provider");
            }
            assert!(body["request_id"].as_str().unwrap().len() > 12);
            let attempt = calls.fetch_add(1, Ordering::SeqCst);
            if attempt == 0 {
                return (StatusCode::SERVICE_UNAVAILABLE, Json(json!({"error":"Ambiguous provider response"})));
            }
            (StatusCode::OK, Json(json!({"code":"000","content":{"transactions":{"status":"pending","transactionId":"provider-1"}}})))
        }}))
        .route("/requery", post(move || { let calls = requery_calls.clone(); async move {
            calls.fetch_add(1, Ordering::SeqCst);
            Json(json!({"code":"000","purchased_code":"TOKEN-123","content":{"transactions":{"status":"delivered","transactionId":"provider-1"}}}))
        }}));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let provider_url = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        axum::serve(listener, provider).await.unwrap();
    });
    let mut state = AppState::new(pool.clone(), config);
    state.vtpass_test_url = Some(provider_url);
    *state.usd_ngn_rate.lock().await = Some(CachedUsdNgnRate {
        rate_micros: 1_000_000_000,
        rate_display: "1000".into(),
        source_updated_at_seconds: chrono::Utc::now().timestamp(),
        fetched_at: Instant::now(),
    });
    *state.near_usd_rate.lock().await = Some(CachedNearUsdRate {
        price_micros: 2_000_000,
        price_display: "2".into(),
        source_updated_at_seconds: chrono::Utc::now().timestamp(),
        source: "test fixture",
        fetched_at: Instant::now(),
    });
    sqlx::query("INSERT INTO merchants (merchant_id,account_id,payout_account_id,display_name) VALUES ('one','one.testnet','one.testnet','One')").execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO merchant_sessions (token_hash,merchant_id,expires_at) VALUES ($1,'one',now()+INTERVAL '1 hour')")
        .bind(&Sha256::digest(b"service-session")[..]).execute(&pool).await.unwrap();
    let app = crate::api::routes().with_state(state.clone());
    for category in ["airtime", "data", "electricity", "tv"] {
        let (status, _) = call(
            &app,
            "POST",
            "/vtpass/verify",
            json!({"serviceID":"fixture-provider","billersCode":"123456"}),
            false,
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        let asset = json!({"type":"native","symbol":"NEAR","decimals":24});
        let (status, quote) = call(
            &app,
            "POST",
            "/vtpass/quote",
            json!({"amountNgn":"1000","asset":asset}),
            false,
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{quote}");
        assert_eq!(quote["amountUsd"], "1");
        assert_eq!(quote["tokenAmountBaseUnits"], "500000000000000000000000");
        let (status, link) = call(&app, "POST", "/links", json!({"networkId":"testnet","asset":asset,"amount":quote["tokenAmountBaseUnits"],"amountDisplay":"0.5","displayName":"Service fixture","expiresAtSeconds":quote["expiresAtSeconds"],"multiPay":false,"maxRedemptions":1}), true).await;
        assert_eq!(status, StatusCode::CREATED, "{link}");
        let variation = if category == "electricity" {
            "prepaid"
        } else {
            "basic"
        };
        let service_id = if category == "tv" {
            "dstv"
        } else {
            "fixture-provider"
        };
        let purchase_body = json!({"linkSlug":link["slug"],"quoteId":quote["quoteId"],"category":category,"serviceID":service_id,"variationCode":variation,"providerFields":{"phone":"08011111111","billersCode":"123456","type":"prepaid"}});
        let (unauth, _) = call(
            &app,
            "POST",
            "/vtpass/purchases",
            purchase_body.clone(),
            false,
        )
        .await;
        assert_eq!(unauth, StatusCode::UNAUTHORIZED);
        if category == "tv" || category == "data" {
            let mut invalid = purchase_body.clone();
            invalid["variationCode"] = json!("missing");
            let (status, _) = call(&app, "POST", "/vtpass/purchases", invalid, true).await;
            assert_eq!(status, StatusCode::BAD_REQUEST);
        }
        let (status, purchase) = call(
            &app,
            "POST",
            "/vtpass/purchases",
            purchase_body.clone(),
            true,
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{purchase}");
        assert_eq!(purchase["state"], "AWAITING_PAYMENT");
        let (reused, _) = call(&app, "POST", "/vtpass/purchases", purchase_body, true).await;
        assert_eq!(reused, StatusCode::CONFLICT);
        let path = format!(
            "/vtpass/purchases/{}/fulfill",
            purchase["purchaseId"].as_str().unwrap()
        );
        let (unpaid, _) = call(&app, "POST", &path, json!({}), false).await;
        assert_eq!(unpaid, StatusCode::CONFLICT);
        // Simulate the chain verifier writing settlement evidence; wallet signing
        // and actual on-chain receipt verification remain outside this fixture.
        sqlx::query("INSERT INTO orders (order_id,merchant_id,payer_account_id,network_id,contract_id,order_key,\"authorization\",asset,amount,fee,net,source,link_slug,edit_token_hash,state,settlement_receipt_id) VALUES ($1,'one','payer.testnet','testnet','router.testnet',$2,$3,$4,$5,'0',$5,'link',$6,$7,'SETTLED','verified-fixture')")
            .bind(category).bind(hex::encode(Sha256::digest(category.as_bytes())))
            .bind(json!({"merchantAccountId":"one.testnet","payoutAccountId":"one.testnet"}))
            .bind(&asset).bind(quote["tokenAmountBaseUnits"].as_str().unwrap())
            .bind(link["slug"].as_str().unwrap()).bind(&Sha256::digest(category.as_bytes())[..])
            .execute(&pool).await.unwrap();
        let (status, submitted) = call(&app, "POST", &path, json!({}), false).await;
        if category == "airtime" {
            assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE, "{submitted}");
            let (_, recovery) = call(
                &app,
                "GET",
                path.strip_suffix("/fulfill").unwrap(),
                json!({}),
                false,
            )
            .await;
            assert_eq!(recovery["state"], "RECONCILIATION_REQUIRED");
        } else {
            assert_eq!(status, StatusCode::OK, "{submitted}");
            assert_eq!(submitted["state"], "SUBMITTED");
        }
        let (status, delivered) = call(&app, "POST", &path, json!({}), false).await;
        assert_eq!(status, StatusCode::OK, "{delivered}");
        assert_eq!(delivered["state"], "FULFILLED");
        let (_, repeated) = call(&app, "POST", &path, json!({}), false).await;
        assert_eq!(repeated["state"], "FULFILLED");
        let (_, receipt) = call(
            &app,
            "GET",
            path.strip_suffix("/fulfill").unwrap(),
            json!({}),
            false,
        )
        .await;
        assert_eq!(receipt["providerResponse"]["purchasedCode"], "TOKEN-123");
    }
    assert_eq!(
        payments.load(Ordering::SeqCst),
        4,
        "one provider charge per purchase"
    );
    assert_eq!(queries.load(Ordering::SeqCst), 4);
    // A delayed pending response cannot overwrite a completed delivery.
    let row: (String,) = sqlx::query_as("SELECT purchase_id FROM vtpass_service_purchases LIMIT 1")
        .fetch_one(&pool)
        .await
        .unwrap();
    crate::vtpass::update_from_provider(
        &state,
        &row.0,
        &json!({"content":{"transactions":{"status":"pending"}}}),
    )
    .await
    .unwrap();
    let final_state: (String,) =
        sqlx::query_as("SELECT state FROM vtpass_service_purchases WHERE purchase_id=$1")
            .bind(&row.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(final_state.0, "FULFILLED");
    server.abort();
    pool.close().await;
    let admin = sqlx::PgPool::connect(&url).await.unwrap();
    sqlx::query(&format!("DROP SCHEMA {schema} CASCADE"))
        .execute(&admin)
        .await
        .unwrap();
}
