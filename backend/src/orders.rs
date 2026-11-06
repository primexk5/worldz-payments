use std::time::Duration;

use base64::{engine::general_purpose::STANDARD, Engine};
use chrono::{DateTime, Utc};
use ed25519_dalek::Signer;
use hex::encode as hex_encode;
use rand::{rngs::OsRng, RngCore};
use serde_json::{json, Value};
use sqlx::{mysql::MySqlRow, Row};
use worldz_near_protocol::{
    AuthorizationPayload, NetworkId, OrderState, SignedAuthorization, AUTH_PROTOCOL_VERSION,
    DEFAULT_FEE_BPS,
};

use crate::{
    api::decimal_to_base_units,
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
) -> Result<LinkClaimDto, ApiError> {
    let payer = payer_account_id
        .parse::<near_account_id::AccountId>()
        .map_err(|_| ApiError::bad_request("Invalid payer account ID."))?;
    let mut tx = state.pool.begin().await?;
    let row = sqlx::query(
        "SELECT l.*, m.account_id AS merchant_account_id, m.payout_account_id AS payout_account_id \
         FROM payment_links l JOIN merchants m USING (merchant_id) \
         WHERE l.slug = ? AND l.active FOR UPDATE",
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
    let claims_used: i32 = row.try_get("claims_used")?;
    let max_redemptions: Option<i32> = row.try_get("max_redemptions")?;
    if max_redemptions.is_some_and(|max| claims_used >= max) {
        return Err(ApiError::conflict(
            "Payment link has reached its redemption limit.",
        ));
    }

    let network = state.config.network(network_id);
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
        "INSERT INTO orders (order_id, merchant_id, payer_account_id, network_id, contract_id, order_key, authorization, asset, amount, fee, net, source, link_slug) \
         VALUES (?,?,?,?,?,?,?,?,?,?,?,'link',?)",
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
    .execute(&mut *tx)
    .await?;

    let update = sqlx::query(
        "UPDATE payment_links SET claims_used = claims_used + 1 \
         WHERE slug = ? AND active AND (max_redemptions IS NULL OR claims_used < max_redemptions)",
    )
    .bind(slug)
    .execute(&mut *tx)
    .await?;
    if update.rows_affected() != 1 {
        return Err(ApiError::conflict(
            "Payment link has reached its redemption limit.",
        ));
    }
    tx.commit().await?;

    Ok(LinkClaimDto {
        order_id,
        merchant_id,
        payer_account_id: payer.to_string(),
        authorization,
    })
}

pub async fn get_order_status(
    state: &AppState,
    merchant_id: &str,
    order_id: &str,
    network_id: NetworkId,
) -> Result<OrderStatusDto, ApiError> {
    let row = sqlx::query(
        "SELECT * FROM orders WHERE merchant_id = ? AND order_id = ? AND network_id = ?",
    )
    .bind(merchant_id)
    .bind(order_id)
    .bind(network_id.as_str())
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::not_found("Order not found."))?;
    if row
        .try_get::<Option<String>, _>("transaction_hash")?
        .is_some()
    {
        if let Err(error) = reconcile_order(state, &row).await {
            tracing::warn!(%merchant_id, %order_id, error = %error, "order status reconciliation deferred");
        }
    }
    let latest = sqlx::query(
        "SELECT o.*, NULLIF(TRIM(l.display_name), '') AS payment_description, m.display_name AS merchant_name \
         FROM orders o LEFT JOIN payment_links l ON l.slug = o.link_slug AND l.merchant_id = o.merchant_id \
         LEFT JOIN merchants m ON m.merchant_id = o.merchant_id \
         WHERE o.merchant_id = ? AND o.order_id = ? AND o.network_id = ?",
    )
    .bind(merchant_id)
    .bind(order_id)
    .bind(network_id.as_str())
    .fetch_one(&state.pool)
    .await?;
    order_status_from_row(&latest)
}

pub async fn update_order_meta(
    state: &AppState,
    merchant_id: &str,
    order_id: &str,
    input: PaymentMetaRequest,
) -> Result<(), ApiError> {
    if input
        .customer_name
        .as_deref()
        .is_some_and(|name| name.trim().chars().count() > 120)
    {
        return Err(ApiError::bad_request(
            "Payer name must contain at most 120 characters.",
        ));
    }
    let row = sqlx::query(
        "SELECT * FROM orders WHERE merchant_id = ? AND order_id = ? AND network_id = ?",
    )
    .bind(merchant_id)
    .bind(order_id)
    .bind(input.network_id.as_str())
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::not_found("Order not found."))?;
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
    sqlx::query(
        "UPDATE orders SET transaction_hash = COALESCE(?, transaction_hash), \
         customer_name = COALESCE(?, customer_name), updated_at = UTC_TIMESTAMP(6) \
         WHERE merchant_id = ? AND order_id = ? AND network_id = ?",
    )
    .bind(tx_hash)
    .bind(
        input
            .customer_name
            .as_deref()
            .map(str::trim)
            .filter(|name| !name.is_empty()),
    )
    .bind(merchant_id)
    .bind(order_id)
    .bind(input.network_id.as_str())
    .execute(&mut *tx)
    .await?;
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
        loop {
            interval.tick().await;
            let rows = match sqlx::query(
                "SELECT o.*, s.transaction_hash AS reconciliation_tx_hash, s.signer_account_id AS reconciliation_signer_id FROM orders o \
                 JOIN order_submissions s USING (network_id, contract_id, order_id) \
                 WHERE o.settlement_receipt_id IS NULL AND o.state NOT IN ('REFUNDED','EXPIRED','CANCELLED','RECONCILIATION_REQUIRED') \
                 ORDER BY s.submitted_at ASC LIMIT 50",
            )
            .fetch_all(&state.pool)
            .await
            {
                Ok(rows) => rows,
                Err(error) => {
                    tracing::error!(%error, "could not load orders for reconciliation");
                    continue;
                }
            };
            for row in rows {
                if let Err(error) = reconcile_order(&state, &row).await {
                    tracing::warn!(error = %error, "order reconciliation deferred");
                }
            }
        }
    });
}

pub async fn reconcile_order(state: &AppState, row: &MySqlRow) -> Result<(), ApiError> {
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

    let asset: AssetDto =
        serde_json::from_value(row.try_get("asset")?).map_err(|_| ApiError::internal())?;
    let event_id = format!(
        "{}:{}:{}:{}",
        network_id.as_str(),
        contract_id,
        receipt_id,
        log_index
    );
    let dto = PaymentEventDto {
        id: event_id.clone(),
        network_id,
        contract_id: contract_id.clone(),
        receipt_id: receipt_id.clone(),
        settlement_receipt_id: Some(receipt_id.clone()),
        transaction_hash: transaction_hash.clone(),
        order_id: order_id.clone(),
        merchant_id: merchant_id.clone(),
        payer_account_id: payer,
        payout_account_id: data
            .get("payoutAccountId")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned(),
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
    sqlx::query("UPDATE orders SET state='SETTLED', settlement_receipt_id=?, failure_reason=NULL, updated_at=UTC_TIMESTAMP(6) WHERE network_id=? AND contract_id=? AND order_id=?")
        .bind(&receipt_id)
        .bind(network_id.as_str())
        .bind(&contract_id)
        .bind(&order_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        "UPDATE orders SET transaction_hash=? WHERE network_id=? AND contract_id=? AND order_id=?",
    )
    .bind(&transaction_hash)
    .bind(network_id.as_str())
    .bind(&contract_id)
    .bind(&order_id)
    .execute(&mut *tx)
    .await?;
    sqlx::query("INSERT IGNORE INTO payment_events (event_id, network_id, contract_id, receipt_id, transaction_hash, order_id, merchant_id, payload, finalized) VALUES (?,?,?,?,?,?,?, ?,true)")
        .bind(&event_id)
        .bind(network_id.as_str())
        .bind(&contract_id)
        .bind(&receipt_id)
        .bind(&transaction_hash)
        .bind(&order_id)
        .bind(&merchant_id)
        .bind(payload)
        .execute(&mut *tx)
        .await?;
    sqlx::query("INSERT IGNORE INTO webhook_deliveries (delivery_id, event_id, merchant_id, state) SELECT ?,?, ?, CASE WHEN m.webhook_url IS NULL THEN 'skipped' ELSE 'pending' END FROM merchants m WHERE m.merchant_id=?")
        .bind(uuid::Uuid::new_v4())
        .bind(&event_id)
        .bind(&merchant_id)
        .bind(&merchant_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("INSERT IGNORE INTO shopify_order_sync (slug) SELECT c.slug FROM shopify_checkout_sessions c JOIN orders o ON o.link_slug=c.slug WHERE o.network_id=? AND o.contract_id=? AND o.order_id=?")
        .bind(network_id.as_str())
        .bind(&contract_id)
        .bind(&order_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(())
}

async fn validate_submission(
    state: &AppState,
    order: &MySqlRow,
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
    Ok(())
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

fn order_status_from_row(row: &MySqlRow) -> Result<OrderStatusDto, ApiError> {
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
        authorization: row.try_get("authorization")?,
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
    use super::leg_succeeded;
    use serde_json::json;

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
