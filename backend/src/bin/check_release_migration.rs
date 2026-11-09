//! Validates release SQL in an isolated schema inside a transaction that is rolled back.
//! Uses the configured database, but never reads or writes its application schema.
use sqlx::{postgres::PgPoolOptions, Row};
use std::time::Duration;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let _ = dotenvy::from_path(std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(".env"));
    let url = std::env::var("DATABASE_URL").map_err(|_| "DATABASE_URL is required")?;
    if !(url.starts_with("postgres://") || url.starts_with("postgresql://")) {
        return Err("DATABASE_URL must use PostgreSQL; the isolated migration checker will not use another database".into());
    }
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .acquire_timeout(Duration::from_secs(20))
        .connect(&url)
        .await
        .map_err(|_| {
            "Could not connect to the configured database for the isolated migration check"
        })?;
    let mut tx = pool.begin().await?;
    let schema = format!("worldz_release_check_{}", uuid::Uuid::new_v4().simple());
    sqlx::query(&format!("CREATE SCHEMA {schema}"))
        .execute(&mut *tx)
        .await?;
    sqlx::query(&format!("SET LOCAL search_path TO {schema}"))
        .execute(&mut *tx)
        .await?;
    for migration in [
        include_str!("../../migrations/postgres/0001_initial.sql"),
        include_str!("../../migrations/postgres/0002_shopify.sql"),
    ] {
        sqlx::raw_sql(migration).execute(&mut *tx).await?;
    }
    sqlx::raw_sql("INSERT INTO merchants (merchant_id,account_id,payout_account_id,display_name) VALUES ('fixture','fixture.testnet','fixture.testnet','Fixture');
        INSERT INTO payment_links (slug,merchant_id,network_id,asset,amount,amount_display,display_name,multi_pay,max_redemptions,claims_used) VALUES ('fixture','fixture','testnet','{\"type\":\"native\"}','10000','0.00000000000000000001','Fixture',TRUE,2,2);")
        .execute(&mut *tx).await?;
    for (id, key, state, receipt) in [
        ("open", "0".repeat(64), "OPEN", None),
        ("paid", "1".repeat(64), "SETTLED", Some("verified-fixture")),
    ] {
        sqlx::query("INSERT INTO orders (order_id,merchant_id,payer_account_id,network_id,contract_id,order_key,\"authorization\",asset,amount,fee,net,state,source,link_slug,settlement_receipt_id) VALUES ($1,'fixture','fixture.testnet','testnet','router.testnet',$2,$3,'{\"type\":\"native\"}','10000','30','9970',$4,'link','fixture',$5)")
            .bind(id).bind(key).bind(serde_json::json!({"expiresAtSeconds":1900000000u64})).bind(state).bind(receipt).execute(&mut *tx).await?;
    }
    sqlx::query("INSERT INTO merchant_sessions (token_hash,merchant_id,expires_at) VALUES ($1,'fixture',NOW()+INTERVAL '1 hour')")
        .bind(&[7u8;32][..]).execute(&mut *tx).await?;
    sqlx::raw_sql(include_str!(
        "../../migrations/postgres/0003_checkout_recovery_security.sql"
    ))
    .execute(&mut *tx)
    .await?;
    assert_eq!(
        sqlx::query("SELECT claims_used FROM payment_links WHERE slug='fixture'")
            .fetch_one(&mut *tx)
            .await?
            .get::<i32, _>(0),
        1
    );
    assert_eq!(
        sqlx::query("SELECT count(*) FROM merchant_sessions")
            .fetch_one(&mut *tx)
            .await?
            .get::<i64, _>(0),
        0
    );
    assert_eq!(
        sqlx::query("SELECT auth_network_id FROM merchants WHERE merchant_id='fixture'")
            .fetch_one(&mut *tx)
            .await?
            .get::<String, _>(0),
        "testnet"
    );
    assert!(
        sqlx::query("SELECT reserved_until IS NOT NULL FROM orders WHERE order_id='open'")
            .fetch_one(&mut *tx)
            .await?
            .get::<bool, _>(0)
    );
    sqlx::query("UPDATE orders SET edit_token_hash=$1 WHERE order_id='open'")
        .bind(&[8u8; 32][..])
        .execute(&mut *tx)
        .await?;
    for (capability, expected) in [(&[9u8; 32][..], 0u64), (&[8u8; 32][..], 1u64)] {
        let changed = sqlx::query("UPDATE orders SET customer_name='Verified customer' WHERE order_id='open' AND edit_token_hash=$1 AND settlement_receipt_id IS NULL AND state IN ('OPEN','PROCESSING')")
            .bind(capability).execute(&mut *tx).await?;
        assert_eq!(changed.rows_affected(), expected);
    }
    sqlx::query(
        "UPDATE orders SET state='SETTLED',settlement_receipt_id='verified' WHERE order_id='open'",
    )
    .execute(&mut *tx)
    .await?;
    assert_eq!(sqlx::query("UPDATE orders SET customer_name='Wrong name' WHERE order_id='open' AND edit_token_hash=$1 AND settlement_receipt_id IS NULL AND state IN ('OPEN','PROCESSING')")
        .bind(&[8u8;32][..]).execute(&mut *tx).await?.rows_affected(), 0);
    sqlx::query("UPDATE orders SET state='OPEN',settlement_receipt_id=NULL WHERE order_id='open'")
        .execute(&mut *tx)
        .await?;
    for index in 0..60 {
        sqlx::query("INSERT INTO order_submissions(network_id,contract_id,order_id,transaction_hash,signer_account_id,next_reconcile_at) VALUES ('testnet','router.testnet','open',$1,'fixture.testnet',NOW()-INTERVAL '1 day')")
            .bind(format!("abandoned-{index}")).execute(&mut *tx).await?;
    }
    sqlx::query("UPDATE order_submissions SET next_reconcile_at=NOW()+INTERVAL '30 seconds' WHERE transaction_hash IN (SELECT transaction_hash FROM order_submissions ORDER BY next_reconcile_at,submitted_at LIMIT 50)")
        .execute(&mut *tx).await?;
    sqlx::query("INSERT INTO order_submissions(network_id,contract_id,order_id,transaction_hash,signer_account_id) VALUES ('testnet','router.testnet','open','new-payment','fixture.testnet')")
        .execute(&mut *tx).await?;
    let due = sqlx::query("SELECT transaction_hash FROM order_submissions WHERE NOT reconcile_complete AND next_reconcile_at<=NOW() ORDER BY next_reconcile_at,submitted_at LIMIT 50")
        .fetch_all(&mut *tx).await?;
    assert!(due
        .iter()
        .any(|row| row.get::<String, _>(0) == "new-payment"));
    tx.rollback().await?;
    pool.close().await;
    println!("Passed: migration, network backfill, verified redemption count, session invalidation, reservation backfill, receipt-edit guard, and reconciliation rotation. Isolated schema rolled back; application data unchanged.");
    Ok(())
}
