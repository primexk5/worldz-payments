use sha2::{Digest, Sha256};
use std::time::Duration;
use subtle::ConstantTimeEq;

use base64::{engine::general_purpose::STANDARD, Engine};
use chrono::{DateTime, Utc};
use ed25519_dalek::Signer;
use hex::encode as hex_encode;
use rand::{rngs::OsRng, RngCore};
use serde_json::{json, Value};
use sqlx::{postgres::PgRow, Row};
use worldz_near_protocol::{
    AuthorizationPayload, NetworkId, OrderState, SignedAuthorization, AUTH_PROTOCOL_VERSION,
    DEFAULT_FEE_BPS,
};

use crate::{
    api::decimal_to_base_units,
    db::sqlx,
    error::ApiError,
    models::{AssetDto, LinkClaimDto, OrderStatusDto, PaymentEventDto, PaymentMetaRequest},
    near_rpc,
    state::AppState,
};

pub async fn claim_link(
    state: &AppState,
    slug: &str,
    network_id: NetworkId,
    payer_account_id: &str,
    customer_name: Option<&str>,
) -> Result<LinkClaimDto, ApiError> {
    let customer_name = normalized_customer_name(customer_name)?;
    let payer = payer_account_id
        .parse::<near_account_id::AccountId>()
        .map_err(|_| ApiError::bad_request("Invalid payer account ID."))?;
    near_rpc::verify_payment_configuration(state, network_id).await?;
    let mut tx = state.pool.begin().await?;
    let row = sqlx::query(
        "SELECT l.*, m.account_id AS merchant_account_id, m.payout_account_id AS payout_account_id \
         FROM payment_links l JOIN merchants m USING (merchant_id) \
         WHERE l.slug = ? AND l.active FOR UPDATE OF l",
    )
    .bind(slug)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| ApiError::not_found("Payment link not found."))?;

    let link_network = parse_network(row.try_get::<String, _>("network_id")?.as_str())?;
    if link_network != network_id {
        return Err(ApiError::bad_request(
            "Payment link is configured for a different NEAR network.",
        ));
    }
    if let Some(expiry) = row.try_get::<Option<DateTime<Utc>>, _>("expires_at")? {
        if expiry <= Utc::now() {
            return Err(ApiError::conflict("Payment link has expired."));
        }
    }
    if let Some(buyer) = sqlx::query("SELECT requires_shipping,buyer_data_ciphertext,buyer_data_nonce,quantity,quantity_priced FROM shopify_checkout_sessions WHERE slug=? FOR UPDATE")
        .bind(slug).fetch_optional(&mut *tx).await? {
        crate::shopify::validate_claim_buyer(state, &buyer)?;
    }
    // Only release expired reservations after finalized chain state proves the
    // authorization cannot execute and no router order has started.
    let max_redemptions: Option<i32> = row.try_get("max_redemptions")?;
    if max_redemptions.is_some_and(|limit| row.get::<i32, _>("claims_used") >= limit) {
        return Err(ApiError::conflict(
            "This payment link has already reached its verified payment limit.",
        ));
    }
    {
        let expired = sqlx::query("SELECT order_id,order_key,contract_id,\"authorization\" FROM orders WHERE link_slug=? AND state='OPEN' AND reserved_until < UTC_TIMESTAMP(6) AND (CAST(? AS BOOLEAN) OR payer_account_id=?) FOR UPDATE")
            .bind(slug).bind(max_redemptions.is_some()).bind(payer.as_str()).fetch_all(&mut *tx).await?;
        if !expired.is_empty() {
            let chain_time = near_rpc::finalized_timestamp_seconds(state, network_id).await?;
            for reservation in expired {
                let authorization: AuthorizationPayload =
                    serde_json::from_value(reservation.try_get("authorization")?)
                        .map_err(|_| ApiError::internal())?;
                if authorization.expires_at_seconds == 0
                    || chain_time < authorization.expires_at_seconds
                {
                    continue;
                }
                let view = near_rpc::view_function(
                    state,
                    network_id,
                    &reservation.try_get::<String, _>("contract_id")?,
                    "get_order",
                    json!({"order_key":reservation.try_get::<String,_>("order_key")?}),
                )
                .await?;
                if view.is_null() {
                    sqlx::query("UPDATE orders SET state='EXPIRED',updated_at=UTC_TIMESTAMP(6) WHERE order_id=? AND state='OPEN'")
                        .bind(reservation.try_get::<String,_>("order_id")?).execute(&mut *tx).await?;
                }
            }
        }
    }
    let edit_token = new_edit_token();
    let edit_hash = Sha256::digest(edit_token.as_bytes());
    let network = state.config.network(network_id);
    // Reuse an active order without extending its authorization deadline. Expired
    // orders are released above only after a finalized no-payment proof.
    let existing = sqlx::query("SELECT order_id, merchant_id, payer_account_id, \"authorization\" FROM orders WHERE link_slug = ? AND network_id = ? AND payer_account_id = ? AND contract_id = ? AND state = 'OPEN' ORDER BY created_at DESC LIMIT 1 FOR UPDATE")
        .bind(slug).bind(network_id.as_str()).bind(payer.as_str())
        .bind(network.router_id.as_deref().unwrap_or_default())
        .fetch_optional(&mut *tx).await?;
    if let Some(existing) = existing {
        // OPEN is only the database's last observation: this authorization may
        // already be executing or settled on-chain. Preserve it byte-for-byte,
        // including its signature and fee terms, for submission validation and
        // delayed reconciliation. Current configuration applies to new orders
        // after the finalized expiry/no-order proof above releases this one.
        let authorization: Value = existing.try_get("authorization")?;
        let order_id: String = existing.try_get("order_id")?;
        sqlx::query("UPDATE orders SET customer_name = COALESCE(?, customer_name), edit_token_hash=?, updated_at = UTC_TIMESTAMP(6) WHERE order_id = ?")
            .bind(customer_name).bind(&edit_hash[..]).bind(&order_id).execute(&mut *tx).await?;
        tx.commit().await?;
        return Ok(LinkClaimDto {
            edit_token,
            order_id,
            merchant_id: existing.try_get("merchant_id")?,
            payer_account_id: payer.to_string(),
            authorization,
        });
    }
    let occupied = sqlx::query("SELECT count(*) AS count FROM orders WHERE link_slug=? AND state NOT IN ('EXPIRED','CANCELLED','REFUNDED')")
        .bind(slug).fetch_one(&mut *tx).await?.try_get::<i64,_>("count")?;
    if max_redemptions.is_some_and(|max| occupied >= i64::from(max)) {
        return Err(ApiError::conflict(
            "Payment link is fully paid or reserved. Wait for pending checkouts to finish or expire.",
        ));
    }

    let contract_id = network
        .router_id
        .as_deref()
        .ok_or_else(|| ApiError::unavailable("Payment router is not configured for this network."))?
        .parse::<near_account_id::AccountId>()
        .map_err(|_| ApiError::configuration("Configured router account ID is invalid."))?;
    let fee_recipient = network
        .fee_recipient
        .as_deref()
        .ok_or_else(|| ApiError::unavailable("Fee recipient is not configured for this network."))?
        .parse::<near_account_id::AccountId>()
        .map_err(|_| ApiError::configuration("Configured fee recipient account ID is invalid."))?;
    let signer = network.signer.as_ref().ok_or_else(|| {
        ApiError::unavailable("Order signing is not configured for this network.")
    })?;

    let asset: AssetDto =
        serde_json::from_value(row.try_get("asset")?).map_err(|_| ApiError::internal())?;
    let amount_display: String = row.try_get("amount_display")?;
    let decimals = match &asset {
        AssetDto::Native { decimals, .. } | AssetDto::Nep141 { decimals, .. } => *decimals,
    };
    let amount = decimal_to_base_units(&amount_display, decimals)?;
    let persisted_amount: String = row.try_get("amount")?;
    if amount.to_string() != persisted_amount {
        return Err(ApiError::internal());
    }
    let merchant_id: String = row.try_get("merchant_id")?;
    let order_id = format!("ord_{}", uuid::Uuid::new_v4().simple());
    let mut nonce = [0u8; 32];
    OsRng.fill_bytes(&mut nonce);
    let merchant_account_id: String = row.try_get("merchant_account_id")?;
    let payout_account_id: String = row.try_get("payout_account_id")?;
    let payload = AuthorizationPayload {
        protocol_version: AUTH_PROTOCOL_VERSION,
        signer_key_id: network.signer_key_id.clone(),
        network_id,
        contract_id: contract_id.to_string(),
        merchant_id: merchant_id.clone(),
        merchant_account_id,
        payout_account_id,
        order_id: order_id.clone(),
        asset: asset.protocol_asset(),
        amount,
        expires_at_seconds: u64::try_from(Utc::now().timestamp() + 15 * 60)
            .map_err(|_| ApiError::internal())?,
        fee_bps: DEFAULT_FEE_BPS,
        fee_recipient_account_id: fee_recipient.to_string(),
        expected_payer_account_id: Some(payer.to_string()),
        nonce,
    };
    let digest = payload.signing_digest().map_err(|_| ApiError::internal())?;
    let signature = STANDARD.encode(signer.sign(&digest).to_bytes());
    let signed = SignedAuthorization {
        payload: payload.clone(),
        signature,
    };
    let mut authorization = serde_json::to_value(&signed).map_err(|_| ApiError::internal())?;
    authorization["asset"] = serde_json::to_value(&asset).map_err(|_| ApiError::internal())?;
    let order_key = hex_encode(payload.replay_key().map_err(|_| ApiError::internal())?);
    let fee = amount
        .checked_mul(u128::from(DEFAULT_FEE_BPS))
        .ok_or_else(ApiError::internal)?
        / 10_000;
    let net = amount.checked_sub(fee).ok_or_else(ApiError::internal)?;
    let source_asset = serde_json::to_value(&asset).map_err(|_| ApiError::internal())?;

    sqlx::query(
        "INSERT INTO orders (order_id, merchant_id, payer_account_id, network_id, contract_id, order_key, \"authorization\", asset, amount, fee, net, source, link_slug, customer_name, edit_token_hash, reserved_until) \
         VALUES (?,?,?,?,?,?,?,?,?,?,?,'link',?,?,?,to_timestamp(?))",
    )
    .bind(&order_id)
    .bind(&merchant_id)
    .bind(payer.as_str())
    .bind(network_id.as_str())
    .bind(contract_id.as_str())
    .bind(&order_key)
    .bind(&authorization)
    .bind(source_asset)
    .bind(amount.to_string())
    .bind(fee.to_string())
    .bind(net.to_string())
    .bind(slug)
    .bind(customer_name)
    .bind(&edit_hash[..])
    .bind(payload.expires_at_seconds as f64)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(LinkClaimDto {
        edit_token,
        order_id,
        merchant_id,
        payer_account_id: payer.to_string(),
        authorization,
    })
}

fn new_edit_token() -> String {
    let mut secret = [0u8; 32];
    OsRng.fill_bytes(&mut secret);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(secret)
}

fn can_edit_name(stored: Option<&[u8]>, token: Option<&str>, state: &str, settled: bool) -> bool {
    if settled || !matches!(state, "OPEN" | "PROCESSING") {
        return false;
    }
    valid_checkout_token(stored, token)
}

pub fn valid_checkout_token(stored: Option<&[u8]>, token: Option<&str>) -> bool {
    let Some(token) = token.filter(|t| t.len() == 43) else {
        return false;
    };
    stored.is_some_and(|stored| bool::from(stored.ct_eq(&Sha256::digest(token.as_bytes())[..])))
}

fn normalized_customer_name(name: Option<&str>) -> Result<Option<&str>, ApiError> {
    let name = name.map(str::trim).filter(|name| !name.is_empty());
    if name.is_some_and(|name| name.chars().count() > 120) {
        return Err(ApiError::bad_request(
            "Payer name must contain at most 120 characters.",
        ));
    }
    Ok(name)
}

pub async fn get_order_status(
    state: &AppState,
    merchant_id: &str,
    order_id: &str,
    network_id: NetworkId,
) -> Result<OrderStatusDto, ApiError> {
    let latest = sqlx::query(
        "SELECT o.*, NULLIF(TRIM(l.display_name), '') AS payment_description, m.display_name AS merchant_name \
         FROM orders o LEFT JOIN payment_links l ON l.slug = o.link_slug AND l.merchant_id = o.merchant_id \
         LEFT JOIN merchants m ON m.merchant_id = o.merchant_id \
         WHERE o.merchant_id = ? AND o.order_id = ? AND o.network_id = ?",
    )
    .bind(merchant_id)
    .bind(order_id)
    .bind(network_id.as_str())
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::not_found("Order not found."))?;
    order_status_from_row(&latest)
}

pub async fn update_order_meta(
    state: &AppState,
    merchant_id: &str,
    order_id: &str,
    input: PaymentMetaRequest,
) -> Result<(), ApiError> {
    let customer_name = normalized_customer_name(input.customer_name.as_deref())?;
    let row = sqlx::query(
        "SELECT * FROM orders WHERE merchant_id = ? AND order_id = ? AND network_id = ?",
    )
    .bind(merchant_id)
    .bind(order_id)
    .bind(input.network_id.as_str())
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::not_found("Order not found."))?;
    let token_hash: Option<Vec<u8>> = row.try_get("edit_token_hash")?;
    if customer_name.is_some() {
        if !can_edit_name(
            token_hash.as_deref(),
            input.edit_token.as_deref(),
            &row.try_get::<String, _>("state")?,
            row.try_get::<Option<String>, _>("settlement_receipt_id")?
                .is_some(),
        ) {
            return Err(ApiError::forbidden("Receipt-name edits require this checkout's private edit token and an unsettled order."));
        }
    }
    if let Some(slug) = input.slug.as_deref() {
        if row.try_get::<Option<String>, _>("link_slug")?.as_deref() != Some(slug) {
            return Err(ApiError::bad_request(
                "Payment link does not match this order.",
            ));
        }
    }
    let tx_hash = input.transaction_hash.as_deref();
    if let Some(hash) = tx_hash {
        let bytes = bs58::decode(hash)
            .into_vec()
            .map_err(|_| ApiError::bad_request("Transaction hash must be base58."))?;
        if bytes.len() != 32 {
            return Err(ApiError::bad_request(
                "Transaction hash must decode to 32 bytes.",
            ));
        }
        validate_submission(state, &row, hash, input.network_id).await?;
    }
    let mut tx = state.pool.begin().await?;
    let updated = sqlx::query(
        "UPDATE orders SET failure_reason = CASE WHEN ? IS NOT NULL AND ? <> COALESCE(transaction_hash, '') THEN NULL ELSE failure_reason END, transaction_hash = COALESCE(?, transaction_hash), \
         customer_name = CASE WHEN settlement_receipt_id IS NULL AND state IN ('OPEN','PROCESSING') THEN COALESCE(?, customer_name) ELSE customer_name END, updated_at = UTC_TIMESTAMP(6) \
         WHERE merchant_id = ? AND order_id = ? AND network_id = ? AND (CAST(? AS BYTEA) IS NULL OR (edit_token_hash=? AND settlement_receipt_id IS NULL AND state IN ('OPEN','PROCESSING')))",
    )
    .bind(tx_hash)
    .bind(tx_hash)
    .bind(tx_hash)
    .bind(customer_name)
    .bind(merchant_id)
    .bind(order_id)
    .bind(input.network_id.as_str())
    .bind(if customer_name.is_some() { token_hash.as_deref() } else { None })
    .bind(if customer_name.is_some() { token_hash.as_deref() } else { None })
    .execute(&mut *tx)
    .await?;
    if updated.rows_affected() == 0 {
        return Err(ApiError::forbidden(
            "The receipt is finalized or the edit token has changed.",
        ));
    }
    if let Some(hash) = tx_hash {
        sqlx::query("INSERT IGNORE INTO order_submissions (network_id, contract_id, order_id, transaction_hash, signer_account_id) SELECT network_id, contract_id, order_id, ?, payer_account_id FROM orders WHERE merchant_id=? AND order_id=? AND network_id=?")
            .bind(hash)
            .bind(merchant_id)
            .bind(order_id)
            .bind(input.network_id.as_str())
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    if tx_hash.is_some() {
        let current = sqlx::query(
            "SELECT * FROM orders WHERE merchant_id = ? AND order_id = ? AND network_id = ?",
        )
        .bind(merchant_id)
        .bind(order_id)
        .bind(input.network_id.as_str())
        .fetch_one(&state.pool)
        .await?;
        let _ = reconcile_order(state, &current).await;
    }
    Ok(())
}

pub fn spawn_reconciliation_worker(state: AppState) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(5));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        let mut backoff = crate::workers::Backoff::default();
        loop {
            interval.tick().await;
            let rows = match sqlx::query(
                "SELECT o.*, s.transaction_hash AS reconciliation_tx_hash, s.signer_account_id AS reconciliation_signer_id FROM orders o \
                 JOIN order_submissions s USING (network_id, contract_id, order_id) \
                 WHERE o.settlement_receipt_id IS NULL AND o.state NOT IN ('REFUNDED','EXPIRED','CANCELLED','RECONCILIATION_REQUIRED') AND NOT s.reconcile_complete AND s.next_reconcile_at <= UTC_TIMESTAMP(6) \
                 ORDER BY s.next_reconcile_at ASC, s.submitted_at ASC LIMIT 50",
            )
            .fetch_all(&state.pool)
            .await
            {
                Ok(rows) => rows,
                Err(error) => {
                    tracing::error!(%error, "could not load orders for reconciliation");
                    backoff.failed("reconciliation").await;
                    continue;
                }
            };
            backoff.reset();
            for row in rows {
                // Rotate attempted submissions even when RPC or payouts keep failing.
                if let Err(error) = sqlx::query("UPDATE order_submissions SET next_reconcile_at=UTC_TIMESTAMP(6) + INTERVAL '30 seconds' WHERE network_id=? AND contract_id=? AND order_id=? AND transaction_hash=?")
                    .bind(row.get::<String,_>("network_id")).bind(row.get::<String,_>("contract_id")).bind(row.get::<String,_>("order_id")).bind(row.get::<String,_>("reconciliation_tx_hash")).execute(&state.pool).await {
                    tracing::error!(%error, "could not reschedule reconciliation");
                    backoff.failed("reconciliation").await;
                    break;
                }
                if let Err(error) = reconcile_order(&state, &row).await {
                    tracing::warn!(error = %error, "order reconciliation deferred");
                }
            }
        }
    });
}

pub async fn reconcile_order(state: &AppState, row: &PgRow) -> Result<(), ApiError> {
    let network_id = parse_network(&row.try_get::<String, _>("network_id")?)?;
    let transaction_hash: String = row
        .try_get::<Option<String>, _>("reconciliation_tx_hash")
        .ok()
        .flatten()
        .or(row.try_get::<Option<String>, _>("transaction_hash")?)
        .ok_or_else(ApiError::internal)?;
    let payer: String = row.try_get("payer_account_id")?;
    let transaction_signer = row
        .try_get::<Option<String>, _>("reconciliation_signer_id")
        .ok()
        .flatten()
        .unwrap_or_else(|| payer.clone());
    let status =
        near_rpc::transaction_status(state, network_id, &transaction_hash, &transaction_signer)
            .await?;
    if status
        .get("transaction")
        .and_then(|tx| tx.get("hash"))
        .and_then(Value::as_str)
        != Some(transaction_hash.as_str())
    {
        return Err(ApiError::bad_request(
            "NEAR RPC transaction hash does not match the submitted hash.",
        ));
    }
    if status
        .get("transaction")
        .and_then(|tx| tx.get("signer_id"))
        .and_then(Value::as_str)
        != Some(transaction_signer.as_str())
    {
        return Err(ApiError::bad_request(
            "NEAR RPC transaction signer does not match the indexed signer.",
        ));
    }
    let receipts = status
        .get("receipts_outcome")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            ApiError::unavailable("NEAR transaction status has no finalized receipts.")
        })?;
    let contract_id: String = row.try_get("contract_id")?;
    let order_id: String = row.try_get("order_id")?;
    let merchant_id: String = row.try_get("merchant_id")?;
    let order_key: String = row.try_get("order_key")?;
    let router_view = near_rpc::view_function(
        state,
        network_id,
        &contract_id,
        "get_order",
        json!({ "order_key": order_key }),
    )
    .await?;
    let Some(router_state) = router_view.get("state").and_then(Value::as_str) else {
        // A finalized failed submission with no router order never began payouts.
        // Keep ambiguous submissions locked; only this verified case can be retried.
        if failed_before_processing(&status, &router_view) {
            sqlx::query("UPDATE order_submissions SET reconcile_complete=TRUE WHERE network_id=? AND contract_id=? AND order_id=? AND transaction_hash=?")
                .bind(network_id.as_str()).bind(&contract_id).bind(&order_id).bind(&transaction_hash).execute(&state.pool).await?;
            sqlx::query("UPDATE orders SET failure_reason = ?, updated_at = UTC_TIMESTAMP(6) WHERE network_id = ? AND contract_id = ? AND order_id = ? AND transaction_hash = ? AND state = 'OPEN' AND settlement_receipt_id IS NULL")
                .bind("The wallet transaction failed before payment processing began. Your payment was not completed; you may retry this order.")
                .bind(network_id.as_str()).bind(&contract_id).bind(&order_id).bind(&transaction_hash)
                .execute(&state.pool).await?;
        }
        return Ok(());
    };
    let db_state = match router_state {
        "SETTLED" => "PROCESSING",
        "PROCESSING"
        | "PAYOUT_RETRYABLE"
        | "PARTIAL_PAYOUT"
        | "REFUND_PENDING"
        | "REFUNDED"
        | "EXPIRED"
        | "CANCELLED"
        | "RECONCILIATION_REQUIRED" => router_state,
        _ => "PROCESSING",
    };
    sqlx::query("UPDATE orders SET state=?, updated_at=UTC_TIMESTAMP(6) WHERE network_id=? AND contract_id=? AND order_id=? AND settlement_receipt_id IS NULL")
        .bind(db_state)
        .bind(network_id.as_str())
        .bind(&contract_id)
        .bind(&order_id)
        .execute(&state.pool)
        .await?;
    let mut settlement: Option<(String, usize, Value)> = None;
    for receipt in receipts {
        let outcome = receipt.get("outcome").unwrap_or(&Value::Null);
        if outcome.get("executor_id").and_then(Value::as_str) != Some(contract_id.as_str())
            || !receipt_succeeded(outcome)
        {
            continue;
        }
        let receipt_id = receipt
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let logs = outcome
            .get("logs")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        for (log_index, log) in logs.iter().enumerate() {
            let Some(log) = log
                .as_str()
                .and_then(|line| line.strip_prefix("EVENT_JSON:"))
            else {
                continue;
            };
            let Ok(event) = serde_json::from_str::<Value>(log) else {
                continue;
            };
            if event.get("standard").and_then(Value::as_str) != Some("worldz-payments")
                || event.get("event").and_then(Value::as_str) != Some("payment_settled")
            {
                continue;
            }
            let Some(data) = event
                .get("data")
                .and_then(Value::as_array)
                .and_then(|items| items.first())
            else {
                continue;
            };
            if data.get("orderId").and_then(Value::as_str) == Some(order_id.as_str())
                && data.get("merchantId").and_then(Value::as_str) == Some(merchant_id.as_str())
            {
                settlement = Some((receipt_id.to_owned(), log_index, data.clone()));
                break;
            }
        }
        if settlement.is_some() {
            break;
        }
    }
    let Some((receipt_id, log_index, data)) = settlement else {
        return Ok(());
    };
    if router_view.get("state").and_then(Value::as_str) != Some("SETTLED")
        || !leg_succeeded(&router_view, "merchantLeg")
        || (router_view.get("fee").and_then(parse_u128).unwrap_or(0) > 0
            && !leg_succeeded(&router_view, "feeLeg"))
    {
        return Ok(());
    }
    let expected_amount: String = row.try_get("amount")?;
    let expected_fee: String = row.try_get("fee")?;
    let expected_net: String = row.try_get("net")?;
    let authorization: Value = row.try_get("authorization")?;
    if data.get("amount").and_then(Value::as_str) != Some(expected_amount.as_str())
        || data.get("fee").and_then(Value::as_str) != Some(expected_fee.as_str())
        || data.get("net").and_then(Value::as_str) != Some(expected_net.as_str())
        || data.get("merchantAccountId") != authorization.get("merchantAccountId")
        || data.get("payoutAccountId") != authorization.get("payoutAccountId")
        || data.get("feeRecipientAccountId") != authorization.get("feeRecipientAccountId")
    {
        return Err(ApiError::conflict(
            "Finalized router event does not match the authorized order.",
        ));
    }

    let receipt = SettlementReceipt {
        transaction_hash: &transaction_hash,
        receipt_id: &receipt_id,
        log_index,
        payout_account_id: data
            .get("payoutAccountId")
            .and_then(Value::as_str)
            .unwrap_or_default(),
    };
    finalize_settlement(
        state,
        row,
        network_id,
        &contract_id,
        &order_id,
        &merchant_id,
        &payer,
        receipt,
    )
    .await
}

pub(crate) struct SettlementReceipt<'a> {
    pub transaction_hash: &'a str,
    pub receipt_id: &'a str,
    pub log_index: usize,
    pub payout_account_id: &'a str,
}

pub(crate) async fn finalize_settlement(
    state: &AppState,
    row: &PgRow,
    network_id: NetworkId,
    contract_id: &str,
    order_id: &str,
    merchant_id: &str,
    payer: &str,
    receipt: SettlementReceipt<'_>,
) -> Result<(), ApiError> {
    let asset: AssetDto =
        serde_json::from_value(row.try_get("asset")?).map_err(|_| ApiError::internal())?;
    let event_id = format!(
        "{}:{}:{}:{}",
        network_id.as_str(),
        contract_id,
        receipt.receipt_id,
        receipt.log_index
    );
    let dto = PaymentEventDto {
        id: event_id.clone(),
        network_id,
        contract_id: contract_id.to_owned(),
        receipt_id: receipt.receipt_id.to_owned(),
        settlement_receipt_id: Some(receipt.receipt_id.to_owned()),
        transaction_hash: receipt.transaction_hash.to_owned(),
        order_id: order_id.to_owned(),
        merchant_id: merchant_id.to_owned(),
        payer_account_id: payer.to_owned(),
        payout_account_id: receipt.payout_account_id.to_owned(),
        asset,
        amount: row.try_get("amount")?,
        fee: row.try_get("fee")?,
        net: row.try_get("net")?,
        state: OrderState::Settled,
        timestamp_ms: Utc::now().timestamp_millis(),
        merchant_reference: row.try_get("merchant_reference")?,
        source: Some(row.try_get("source")?),
        webhook: None,
    };
    let payload = serde_json::to_value(dto).map_err(|_| ApiError::internal())?;
    let mut tx = state.pool.begin().await?;
    let link_budget = sqlx::query(
        "SELECT max_redemptions, claims_used FROM payment_links WHERE slug=? FOR UPDATE",
    )
    .bind(row.try_get::<Option<String>, _>("link_slug")?)
    .fetch_optional(&mut *tx)
    .await?;
    if let Some(budget_row) = link_budget {
        let max_redemptions: Option<i32> = budget_row.try_get("max_redemptions")?;
        let claims_used: i32 = budget_row.try_get("claims_used")?;
        if let Some(max_redemptions) = max_redemptions {
            if claims_used >= max_redemptions {
                sqlx::query("UPDATE orders SET state='RECONCILIATION_REQUIRED', failure_reason=?, updated_at=UTC_TIMESTAMP(6) WHERE network_id=? AND contract_id=? AND order_id=? AND settlement_receipt_id IS NULL")
                    .bind("Payment link redemption budget was already consumed by another payment. No additional settlement was recorded.")
                    .bind(network_id.as_str())
                    .bind(contract_id)
                    .bind(order_id)
                    .execute(&mut *tx)
                    .await?;
                tx.commit().await?;
                return Ok(());
            }
        }
    }
    let settled = sqlx::query("UPDATE orders SET state='SETTLED', settlement_receipt_id=?, failure_reason=NULL, updated_at=UTC_TIMESTAMP(6) WHERE network_id=? AND contract_id=? AND order_id=? AND settlement_receipt_id IS NULL")
        .bind(receipt.receipt_id)
        .bind(network_id.as_str())
        .bind(contract_id)
        .bind(order_id)
        .execute(&mut *tx)
        .await?;
    if settled.rows_affected() == 1 {
        sqlx::query("UPDATE payment_links SET claims_used=claims_used+1 WHERE slug=?")
            .bind(row.try_get::<Option<String>, _>("link_slug")?)
            .execute(&mut *tx)
            .await?;
    }
    sqlx::query(
        "UPDATE orders SET transaction_hash=? WHERE network_id=? AND contract_id=? AND order_id=?",
    )
    .bind(receipt.transaction_hash)
    .bind(network_id.as_str())
    .bind(contract_id)
    .bind(order_id)
    .execute(&mut *tx)
    .await?;
    sqlx::query("INSERT IGNORE INTO payment_events (event_id, network_id, contract_id, receipt_id, transaction_hash, order_id, merchant_id, payload, finalized) VALUES (?,?,?,?,?,?,?, ?,true)")
        .bind(&event_id)
        .bind(network_id.as_str())
        .bind(contract_id)
        .bind(receipt.receipt_id)
        .bind(receipt.transaction_hash)
        .bind(order_id)
        .bind(merchant_id)
        .bind(payload)
        .execute(&mut *tx)
        .await?;
    sqlx::query("INSERT IGNORE INTO webhook_deliveries (delivery_id, event_id, merchant_id, state) SELECT ?,?, ?, CASE WHEN m.webhook_url IS NULL THEN 'skipped' ELSE 'pending' END FROM merchants m WHERE m.merchant_id=?")
        .bind(uuid::Uuid::new_v4())
        .bind(&event_id)
        .bind(merchant_id)
        .bind(merchant_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("INSERT IGNORE INTO shopify_order_sync (slug) SELECT c.slug FROM shopify_checkout_sessions c JOIN orders o ON o.link_slug=c.slug WHERE o.network_id=? AND o.contract_id=? AND o.order_id=?")
        .bind(network_id.as_str())
        .bind(contract_id)
        .bind(order_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(())
}

async fn validate_submission(
    state: &AppState,
    order: &PgRow,
    transaction_hash: &str,
    network_id: NetworkId,
) -> Result<(), ApiError> {
    let payer: String = order.try_get("payer_account_id")?;
    let status = near_rpc::transaction_status(state, network_id, transaction_hash, &payer).await?;
    let transaction = status
        .get("transaction")
        .ok_or_else(|| ApiError::bad_request("NEAR RPC has not indexed this transaction yet."))?;
    if transaction.get("hash").and_then(Value::as_str) != Some(transaction_hash)
        || transaction.get("signer_id").and_then(Value::as_str) != Some(payer.as_str())
    {
        return Err(ApiError::forbidden(
            "Transaction hash is not signed by this order's payer.",
        ));
    }
    let asset: AssetDto =
        serde_json::from_value(order.try_get("asset")?).map_err(|_| ApiError::internal())?;
    let receiver: String = transaction
        .get("receiver_id")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();
    let router: String = order.try_get("contract_id")?;
    let expected_receiver = asset.token_contract_id().unwrap_or(router.as_str());
    if receiver != expected_receiver {
        return Err(ApiError::bad_request(
            "Transaction receiver does not match the authorized payment asset.",
        ));
    }
    let signed: SignedAuthorization = serde_json::from_value(order.try_get("authorization")?)
        .map_err(|_| ApiError::internal())?;
    if !submission_matches(transaction, &signed) {
        return Err(ApiError::bad_request(
            "Transaction actions do not match this signed order.",
        ));
    }
    Ok(())
}

fn failed_before_processing(status: &Value, router_view: &Value) -> bool {
    router_view.is_null()
        && status.get("final_execution_status").and_then(Value::as_str) == Some("FINAL")
        && status
            .get("status")
            .and_then(|s| s.get("Failure"))
            .is_some()
}

fn submission_matches(transaction: &Value, signed: &SignedAuthorization) -> bool {
    let Some(actions) = transaction.get("actions").and_then(Value::as_array) else {
        return false;
    };
    if actions.len() != 1 {
        return false;
    }
    let Some(call) = actions[0].get("FunctionCall") else {
        return false;
    };
    let Some(args) = call
        .get("args")
        .and_then(Value::as_str)
        .and_then(|s| STANDARD.decode(s).ok())
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
    else {
        return false;
    };
    let native = matches!(signed.payload.asset, worldz_near_protocol::Asset::Native);
    let (authorization, signature) = if native {
        if call.get("method_name").and_then(Value::as_str) != Some("pay_native")
            || call.get("deposit").and_then(parse_u128) != Some(signed.payload.amount)
        {
            return false;
        }
        (
            args.get("authorization").cloned(),
            args.get("signature")
                .and_then(Value::as_str)
                .map(str::to_owned),
        )
    } else {
        if call.get("method_name").and_then(Value::as_str) != Some("ft_transfer_call")
            || call.get("deposit").and_then(parse_u128) != Some(1)
            || args.get("receiver_id").and_then(Value::as_str)
                != Some(signed.payload.contract_id.as_str())
            || args.get("amount").and_then(parse_u128) != Some(signed.payload.amount)
        {
            return false;
        }
        let Some(msg) = args
            .get("msg")
            .and_then(Value::as_str)
            .and_then(|s| serde_json::from_str::<Value>(s).ok())
        else {
            return false;
        };
        if msg.get("action").and_then(Value::as_str) != Some("pay") {
            return false;
        }
        (
            msg.get("authorization").cloned(),
            msg.get("signature")
                .and_then(Value::as_str)
                .map(str::to_owned),
        )
    };
    authorization
        .and_then(|v| serde_json::from_value::<AuthorizationPayload>(v).ok())
        .as_ref()
        == Some(&signed.payload)
        && signature.as_deref() == Some(signed.signature.as_str())
}

fn receipt_succeeded(outcome: &Value) -> bool {
    let Some(status) = outcome.get("status") else {
        return false;
    };
    status.get("SuccessValue").is_some() || status.get("SuccessReceiptId").is_some()
}

fn parse_u128(value: &Value) -> Option<u128> {
    value.as_str()?.parse().ok()
}

fn leg_succeeded(order: &Value, leg_name: &str) -> bool {
    order
        .get(leg_name)
        .and_then(|leg| leg.get("state"))
        .and_then(Value::as_str)
        == Some("succeeded")
}

fn order_status_from_row(row: &PgRow) -> Result<OrderStatusDto, ApiError> {
    let network_id = parse_network(&row.try_get::<String, _>("network_id")?)?;
    let asset: AssetDto =
        serde_json::from_value(row.try_get("asset")?).map_err(|_| ApiError::internal())?;
    let state: String = row.try_get("state")?;
    let state = serde_json::from_value(json!(state)).map_err(|_| ApiError::internal())?;
    Ok(OrderStatusDto {
        payment_description: row.try_get("payment_description")?,
        customer_name: row.try_get("customer_name")?,
        merchant_name: row.try_get("merchant_name")?,
        merchant_reference: row.try_get("merchant_reference")?,
        order_id: row.try_get("order_id")?,
        merchant_id: row.try_get("merchant_id")?,
        network_id,
        contract_id: row.try_get("contract_id")?,
        state,
        asset,
        amount: row.try_get("amount")?,
        fee: row.try_get("fee")?,
        net: row.try_get("net")?,
        payer_account_id: row.try_get("payer_account_id")?,
        merchant_account_id: row
            .try_get("authorization")
            .ok()
            .and_then(|value: Value| {
                value
                    .get("merchantAccountId")
                    .and_then(Value::as_str)
                    .map(str::to_owned)
            })
            .unwrap_or_default(),
        payout_account_id: row
            .try_get("authorization")
            .ok()
            .and_then(|value: Value| {
                value
                    .get("payoutAccountId")
                    .and_then(Value::as_str)
                    .map(str::to_owned)
            })
            .unwrap_or_default(),
        transaction_hash: row.try_get("transaction_hash")?,
        settlement_receipt_id: row.try_get("settlement_receipt_id")?,
        updated_at_ms: row.get::<DateTime<Utc>, _>("updated_at").timestamp_millis(),
        failure_reason: row.try_get("failure_reason")?,
        // Only authenticated, unpaid checkouts need authorization for payment/retry.
        authorization: if state == OrderState::Open {
            row.try_get::<Option<Value>, _>("authorization")?
        } else {
            None
        },
    })
}

fn parse_network(value: &str) -> Result<NetworkId, ApiError> {
    match value {
        "testnet" => Ok(NetworkId::Testnet),
        "mainnet" => Ok(NetworkId::Mainnet),
        _ => Err(ApiError::internal()),
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn receipt_edits_require_a_private_token_and_an_unsettled_order() {
        use sha2::{Digest, Sha256};
        let token = super::new_edit_token();
        let hash = Sha256::digest(token.as_bytes());
        assert!(super::can_edit_name(
            Some(&hash),
            Some(&token),
            "OPEN",
            false
        ));
        assert!(super::can_edit_name(
            Some(&hash),
            Some(&token),
            "PROCESSING",
            false
        ));
        assert!(!super::can_edit_name(Some(&hash), None, "OPEN", false));
        assert!(!super::can_edit_name(
            Some(&hash),
            Some(&super::new_edit_token()),
            "OPEN",
            false
        ));
        assert!(!super::can_edit_name(None, Some(&token), "OPEN", false));
        assert!(!super::can_edit_name(
            Some(&hash),
            Some(&token),
            "SETTLED",
            true
        ));
        assert!(!super::can_edit_name(
            Some(&hash),
            Some(&token),
            "OPEN",
            true
        ));
    }

    use super::{
        failed_before_processing, leg_succeeded, normalized_customer_name, submission_matches,
    };
    use base64::{engine::general_purpose::STANDARD, Engine};
    use serde_json::json;
    use worldz_near_protocol::SignedAuthorization;

    #[test]
    fn customer_names_are_trimmed_and_validated_before_creating_an_order() {
        assert_eq!(
            normalized_customer_name(Some("  Yusef  ")).unwrap(),
            Some("Yusef")
        );
        assert_eq!(normalized_customer_name(Some("   ")).unwrap(), None);
        assert_eq!(normalized_customer_name(None).unwrap(), None);
        let valid = "é".repeat(120);
        assert_eq!(
            normalized_customer_name(Some(&valid)).unwrap(),
            Some(valid.as_str())
        );
        assert!(normalized_customer_name(Some(&"é".repeat(121))).is_err());
    }

    #[test]
    fn claim_requests_accept_an_optional_customer_name() {
        let request = json!({"payerAccountId":"payer.testnet","networkId":"testnet","customerName":"Yusef","proof":{"message":"checkout","nonce":"nonce","state":"state","publicKey":"key","signature":"signature"}});
        let named: crate::models::ClaimLinkRequest =
            serde_json::from_value(request.clone()).unwrap();
        assert_eq!(named.customer_name.as_deref(), Some("Yusef"));
        let mut legacy = request;
        legacy.as_object_mut().unwrap().remove("customerName");
        let legacy: crate::models::ClaimLinkRequest = serde_json::from_value(legacy).unwrap();
        assert!(legacy.customer_name.is_none());
    }

    #[test]
    fn only_final_failed_submissions_without_a_router_order_are_retryable() {
        let failed = json!({"final_execution_status":"FINAL", "status":{"Failure":{}}});
        assert!(failed_before_processing(&failed, &json!(null)));
        assert!(!failed_before_processing(
            &failed,
            &json!({"state":"PROCESSING"})
        ));
        assert!(!failed_before_processing(
            &failed,
            &json!({"state":"PARTIAL_PAYOUT"})
        ));
        assert!(!failed_before_processing(
            &json!({"final_execution_status":"EXECUTED", "status":{"Failure":{}}}),
            &json!(null)
        ));
        assert!(!failed_before_processing(
            &json!({"final_execution_status":"FINAL", "status":{"SuccessValue":""}}),
            &json!(null)
        ));
    }

    #[test]
    fn submission_binds_the_exact_order_signature_amount_and_method() {
        let vector: serde_json::Value =
            serde_json::from_str(include_str!("../../docs/vectors/near-auth-v1.json")).unwrap();
        let signed = SignedAuthorization {
            payload: serde_json::from_value(vector["payload"].clone()).unwrap(),
            signature: vector["signatureBase64"].as_str().unwrap().into(),
        };
        let args = json!({"authorization":signed.payload,"signature":signed.signature});
        let tx = json!({"actions":[{"FunctionCall":{"method_name":"pay_native", "deposit":signed.payload.amount.to_string(),"args":STANDARD.encode(serde_json::to_vec(&args).unwrap())}}]});
        assert!(submission_matches(&tx, &signed));
        let mut other = signed.clone();
        other.payload.order_id = "another-order".into();
        assert!(!submission_matches(&tx, &other));
        other = signed.clone();
        other.signature = "different-signature".into();
        assert!(!submission_matches(&tx, &other));
        let mut wrong = tx.clone();
        wrong["actions"][0]["FunctionCall"]["deposit"] = json!("1");
        assert!(!submission_matches(&wrong, &signed));
        wrong = tx.clone();
        wrong["actions"][0]["FunctionCall"]["method_name"] = json!("cancel_authorization");
        assert!(!submission_matches(&wrong, &signed));

        let mut token = signed.clone();
        token.payload.asset = worldz_near_protocol::Asset::Nep141 {
            contract_id: "token.testnet".into(),
        };
        let args = json!({"receiver_id":token.payload.contract_id,"amount":token.payload.amount.to_string(),"msg":json!({"action":"pay","authorization":token.payload,"signature":token.signature}).to_string()});
        let tx = json!({"actions":[{"FunctionCall":{"method_name":"ft_transfer_call","deposit":"1","args":STANDARD.encode(serde_json::to_vec(&args).unwrap())}}]});
        assert!(submission_matches(&tx, &token));
        assert!(!submission_matches(&tx, &signed));
    }

    #[test]
    fn contract_leg_states_are_read_using_snake_case_values() {
        let order = json!({
            "merchantLeg": { "state": "succeeded" },
            "feeLeg": { "state": "succeeded" },
        });
        assert!(leg_succeeded(&order, "merchantLeg"));
        assert!(leg_succeeded(&order, "feeLeg"));
        assert!(!leg_succeeded(
            &json!({ "merchantLeg": { "state": "SUCCEEDED" } }),
            "merchantLeg"
        ));
    }
}
