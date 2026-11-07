use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    routing::{delete, get, post, put},
    Json, Router,
};
use base64::{
    engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
    Engine,
};
use chrono::{DateTime, TimeZone, Utc};
use rand::{rngs::OsRng, RngCore};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::{postgres::PgRow, Row};
use uuid::Uuid;
use worldz_near_protocol::NetworkId;

use crate::{
    auth,
    db::sqlx,
    error::ApiError,
    models::{
        ApiKeyDto, AssetDto, ClaimLinkRequest, CreateApiKeyRequest, CreateLinkRequest,
        MerchantProfile, NewApiKeyDto, PaymentLink, PaymentMetaRequest, PayoutUpdateRequest,
        ProfileUpdateRequest,
    },
    near_rpc, orders,
    state::AppState,
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/auth/challenge", post(auth::issue_challenge))
        .route("/auth/login", post(auth::login))
        .route("/auth/logout", post(auth::logout))
        .route("/onboarding", post(auth::onboard))
        .route("/me", get(get_me).patch(patch_me))
        .route("/me/payouts", put(put_payout))
        .route("/me/deliveries", get(get_deliveries))
        .route("/me/apikeys", get(list_api_keys).post(create_api_key))
        .route("/me/apikeys/{key_ref}", delete(revoke_api_key))
        .route("/assets", get(get_assets))
        .route("/network-config", get(get_network_config))
        .route("/payment-readiness", get(get_payment_readiness))
        .route("/links", get(list_links).post(create_link))
        .route("/links/{slug}", get(get_link).delete(delete_link))
        .route("/links/{slug}/claim", post(claim_link))
        .route("/orders/{merchant_id}/{order_id}", get(get_order))
        .route(
            "/orders/{merchant_id}/{order_id}/meta",
            post(update_order_meta),
        )
        .route("/shopify/install", get(crate::shopify::install))
        .route("/shopify/callback", get(crate::shopify::callback))
        .route("/shopify/connection", get(crate::shopify::connection))
        .route(
            "/shopify/proxy/checkout",
            get(crate::shopify::proxy_checkout),
        )
        .route(
            "/shopify/checkouts/{slug}",
            get(crate::shopify::get_checkout).put(crate::shopify::save_buyer_details),
        )
}

pub async fn ready(State(state): State<AppState>) -> Result<&'static str, ApiError> {
    sqlx::query("SELECT 1").execute(&state.pool).await?;
    Ok("ready")
}

async fn get_me(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<MerchantProfile>, ApiError> {
    Ok(Json(auth::me(&state, &headers).await?))
}

async fn patch_me(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<ProfileUpdateRequest>,
) -> Result<Json<MerchantProfile>, ApiError> {
    Ok(Json(
        auth::update_profile(&state, &headers, input.display_name, input.webhook_url).await?,
    ))
}

async fn put_payout(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<PayoutUpdateRequest>,
) -> Result<Json<MerchantProfile>, ApiError> {
    Ok(Json(auth::update_payout(&state, &headers, input).await?))
}

async fn get_assets(
    State(state): State<AppState>,
    Query(query): Query<NetworkQuery>,
) -> Result<Json<Value>, ApiError> {
    let network = state.config.network(query.network_id);
    let mut tokens = Vec::new();
    for token_id in &network.ft_allowlist {
        let metadata = near_rpc::ft_metadata(&state, query.network_id, token_id).await?;
        let name = metadata
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or(token_id);
        let symbol = metadata
            .get("symbol")
            .and_then(Value::as_str)
            .unwrap_or(token_id);
        let decimals = metadata
            .get("decimals")
            .and_then(Value::as_u64)
            .unwrap_or(0);
        tokens.push(json!({
            "contractId": token_id,
            "name": name,
            "symbol": symbol,
            "decimals": decimals,
            "icon": metadata.get("icon").cloned().unwrap_or(Value::Null),
        }));
    }
    Ok(Json(json!({ "tokens": tokens })))
}

async fn get_network_config(
    State(state): State<AppState>,
    Query(query): Query<NetworkQuery>,
) -> Json<Value> {
    let network = state.config.network(query.network_id);
    let public_key = network
        .signer
        .as_ref()
        .map(|signer| STANDARD.encode(signer.verifying_key().to_bytes()));
    Json(json!({
        "networkId": query.network_id,
        "routerId": network.router_id,
        "feeRecipientAccountId": network.fee_recipient,
        "signerKeyId": network.signer_key_id,
        "signerPublicKeyBase64": public_key,
        "allowedFungibleTokens": network.ft_allowlist,
    }))
}

async fn list_links(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let merchant = auth::current_merchant(&state, &headers).await?;
    let rows = sqlx::query("SELECT l.*, m.payout_account_id AS payout_account_id FROM payment_links l JOIN merchants m USING (merchant_id) WHERE l.merchant_id = ? AND l.active = TRUE ORDER BY l.created_at DESC")
        .bind(merchant.merchant_id)
        .fetch_all(&state.pool)
        .await?;
    let links = rows
        .iter()
        .map(link_from_row)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(json!({ "links": links })))
}

async fn create_link(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateLinkRequest>,
) -> Result<(StatusCode, Json<PaymentLink>), ApiError> {
    let merchant = auth::current_merchant(&state, &headers).await?;
    validate_link_request(&state, &input).await?;
    let slug = make_slug();
    let expiry = match input.expires_at_seconds {
        Some(seconds) => Some(
            Utc.timestamp_opt(seconds, 0)
                .single()
                .ok_or_else(|| ApiError::bad_request("Expiry must be a valid Unix timestamp."))?,
        ),
        None => None,
    };
    let max_redemptions = normalize_max_redemptions(input.multi_pay, input.max_redemptions)?;
    let asset_json = serde_json::to_value(&input.asset).map_err(|_| ApiError::internal())?;
    sqlx::query(
        "INSERT INTO payment_links (slug, merchant_id, network_id, asset, amount, amount_display, display_name, expires_at, multi_pay, max_redemptions) \
         VALUES (?,?,?,?,?,?,?,?,?,?)",
    )
    .bind(&slug)
    .bind(&merchant.merchant_id)
    .bind(input.network_id.as_str())
    .bind(asset_json)
    .bind(&input.amount)
    .bind(input.amount_display.trim())
    .bind(input.display_name.trim())
    .bind(expiry)
    .bind(input.multi_pay)
    .bind(max_redemptions)
    .execute(&state.pool)
    .await?;
    let row = sqlx::query("SELECT l.*, m.payout_account_id AS payout_account_id FROM payment_links l JOIN merchants m USING (merchant_id) WHERE l.slug = ?")
        .bind(&slug)
        .fetch_one(&state.pool)
        .await?;
    Ok((StatusCode::CREATED, Json(link_from_row(&row)?)))
}

async fn get_link(
    State(state): State<AppState>,
    Path(slug): Path<String>,
) -> Result<Json<PaymentLink>, ApiError> {
    let row = sqlx::query("SELECT l.*, m.payout_account_id AS payout_account_id FROM payment_links l JOIN merchants m USING (merchant_id) WHERE l.slug = ? AND l.active")
        .bind(slug)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| ApiError::not_found("Payment link not found."))?;
    let link = link_from_row(&row)?;
    if link
        .expires_at_seconds
        .is_some_and(|time| time <= Utc::now().timestamp())
    {
        return Err(ApiError::not_found("Payment link has expired."));
    }
    Ok(Json(link))
}

async fn delete_link(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(slug): Path<String>,
) -> Result<StatusCode, ApiError> {
    let merchant = auth::current_merchant(&state, &headers).await?;
    let result =
        sqlx::query("UPDATE payment_links SET active=FALSE WHERE slug=? AND merchant_id=?")
            .bind(&slug)
            .bind(&merchant.merchant_id)
            .execute(&state.pool)
            .await?;
    if result.rows_affected() == 0 {
        let exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM payment_links WHERE slug=$1 AND merchant_id=$2)",
        )
        .bind(&slug)
        .bind(&merchant.merchant_id)
        .fetch_one(&state.pool)
        .await?;
        if !exists {
            return Err(ApiError::not_found("Payment link not found."));
        }
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn get_payment_readiness(
    State(state): State<AppState>,
    Query(query): Query<NetworkQuery>,
) -> Result<StatusCode, ApiError> {
    near_rpc::verify_order_signer(&state, query.network_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn claim_link(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    Json(input): Json<ClaimLinkRequest>,
) -> Result<(StatusCode, Json<crate::models::LinkClaimDto>), ApiError> {
    let payer = input
        .payer_account_id
        .parse::<near_account_id::AccountId>()
        .map_err(|_| ApiError::bad_request("Invalid payer account ID."))?;
    let proof = input.proof.as_ref().ok_or_else(ApiError::unauthorized)?;
    auth::consume_proof(
        &state,
        input.network_id,
        &payer,
        &proof.state,
        crate::models::ChallengePurpose::Checkout,
        &proof.message,
        auth::decode_nonce(&proof.nonce)?,
        &proof.public_key,
        &proof.signature,
        Some(json!({"checkoutSlug":slug})),
    )
    .await?;
    let claim = orders::claim_link(
        &state,
        &slug,
        input.network_id,
        payer.as_str(),
        input.customer_name.as_deref(),
    )
    .await?;
    Ok((StatusCode::CREATED, Json(claim)))
}

async fn get_order(
    State(state): State<AppState>,
    Path((merchant_id, order_id)): Path<(String, String)>,
    Query(query): Query<NetworkQuery>,
) -> Result<Json<crate::models::OrderStatusDto>, ApiError> {
    if let Some(transaction_hash) = query.transaction_hash.as_deref() {
        orders::update_order_meta(
            &state,
            &merchant_id,
            &order_id,
            PaymentMetaRequest {
                network_id: query.network_id,
                edit_token: None,
                customer_name: None,
                slug: None,
                transaction_hash: Some(transaction_hash.to_owned()),
            },
        )
        .await?;
    }
    Ok(Json(
        orders::get_order_status(&state, &merchant_id, &order_id, query.network_id).await?,
    ))
}

async fn update_order_meta(
    State(state): State<AppState>,
    Path((merchant_id, order_id)): Path<(String, String)>,
    Json(input): Json<PaymentMetaRequest>,
) -> Result<StatusCode, ApiError> {
    orders::update_order_meta(&state, &merchant_id, &order_id, input).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn get_deliveries(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let merchant = auth::current_merchant(&state, &headers).await?;
    let rows = sqlx::query(
        "SELECT e.payload, o.customer_name, NULLIF(TRIM(l.display_name), '') AS payment_description, m.display_name AS merchant_name, \
         w.delivery_id, w.state AS webhook_state, w.attempts, w.last_error, w.updated_at AS webhook_updated_at \
         FROM payment_events e LEFT JOIN orders o ON o.merchant_id = e.merchant_id AND o.order_id = e.order_id \
         AND o.network_id = e.network_id AND o.contract_id = e.contract_id \
         LEFT JOIN payment_links l ON l.slug = o.link_slug AND l.merchant_id = o.merchant_id \
         LEFT JOIN merchants m ON m.merchant_id = e.merchant_id \
         LEFT JOIN webhook_deliveries w ON w.event_id = e.event_id \
         WHERE e.merchant_id = ? AND e.finalized ORDER BY e.created_at DESC LIMIT 100",
    )
    .bind(merchant.merchant_id)
    .fetch_all(&state.pool)
    .await?;
    let mut deliveries = Vec::with_capacity(rows.len());
    for row in rows {
        let mut payload: Value = row.try_get("payload")?;
        payload["customerName"] = json!(row.try_get::<Option<String>, _>("customer_name")?);
        payload["paymentDescription"] =
            json!(row.try_get::<Option<String>, _>("payment_description")?);
        payload["merchantName"] = json!(row.try_get::<Option<String>, _>("merchant_name")?);
        if let Some(delivery_id) = row.try_get::<Option<Uuid>, _>("delivery_id")? {
            payload["webhook"] = json!({
                "id": delivery_id.to_string(),
                "eventId": payload.get("id").cloned().unwrap_or(Value::Null),
                "state": row.try_get::<String, _>("webhook_state")?,
                "attempts": row.try_get::<i32, _>("attempts")?,
                "lastError": row.try_get::<Option<String>, _>("last_error")?,
                "updatedAtMs": row.try_get::<chrono::DateTime<Utc>, _>("webhook_updated_at")?.timestamp_millis(),
            });
        } else {
            payload["webhook"] = Value::Null;
        }
        deliveries.push(payload);
    }
    Ok(Json(json!({ "deliveries": deliveries })))
}

async fn list_api_keys(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let merchant = auth::current_merchant(&state, &headers).await?;
    let rows = sqlx::query("SELECT * FROM merchant_api_keys WHERE merchant_id = ? AND revoked_at IS NULL ORDER BY created_at DESC")
        .bind(merchant.merchant_id)
        .fetch_all(&state.pool)
        .await?;
    let keys = rows
        .into_iter()
        .map(|row| ApiKeyDto {
            key_ref: row.get("key_ref"),
            label: row.get("label"),
            created_at_ms: row.get::<DateTime<Utc>, _>("created_at").timestamp_millis(),
            last_used_at_ms: row
                .get::<Option<DateTime<Utc>>, _>("last_used_at")
                .map(|value| value.timestamp_millis()),
        })
        .collect::<Vec<_>>();
    Ok(Json(json!({ "keys": keys })))
}

async fn create_api_key(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateApiKeyRequest>,
) -> Result<(StatusCode, Json<NewApiKeyDto>), ApiError> {
    let merchant = auth::current_merchant(&state, &headers).await?;
    let label = input.label.trim();
    if label.is_empty() || label.len() > 64 {
        return Err(ApiError::bad_request(
            "API key label must contain 1 to 64 characters.",
        ));
    }
    let mut random = [0u8; 32];
    OsRng.fill_bytes(&mut random);
    let secret = format!("wzp_{}", URL_SAFE_NO_PAD.encode(random));
    let secret_hash: [u8; 32] = Sha256::digest(secret.as_bytes()).into();
    let key_ref = format!("key_{}", Uuid::new_v4().simple());
    sqlx::query(
        "INSERT INTO merchant_api_keys (key_ref, merchant_id, secret_hash, label) VALUES (?,?,?,?)",
    )
    .bind(&key_ref)
    .bind(&merchant.merchant_id)
    .bind(secret_hash.as_slice())
    .bind(label)
    .execute(&state.pool)
    .await?;
    let row = sqlx::query("SELECT created_at FROM merchant_api_keys WHERE key_ref = ?")
        .bind(&key_ref)
        .fetch_one(&state.pool)
        .await?;
    Ok((
        StatusCode::CREATED,
        Json(NewApiKeyDto {
            key: ApiKeyDto {
                key_ref,
                label: label.to_owned(),
                created_at_ms: row.get::<DateTime<Utc>, _>("created_at").timestamp_millis(),
                last_used_at_ms: None,
            },
            secret,
        }),
    ))
}

async fn revoke_api_key(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(key_ref): Path<String>,
) -> Result<StatusCode, ApiError> {
    let merchant = auth::current_merchant(&state, &headers).await?;
    let result = sqlx::query("UPDATE merchant_api_keys SET revoked_at = UTC_TIMESTAMP(6) WHERE key_ref = ? AND merchant_id = ? AND revoked_at IS NULL")
        .bind(key_ref)
        .bind(merchant.merchant_id)
        .execute(&state.pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(ApiError::not_found("API key not found."));
    }
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NetworkQuery {
    network_id: NetworkId,
    transaction_hash: Option<String>,
}

async fn validate_link_request(
    state: &AppState,
    input: &CreateLinkRequest,
) -> Result<(), ApiError> {
    if input.amount.parse::<u128>().map_err(|_| {
        ApiError::bad_request("Amount must be an unsigned base-unit integer string.")
    })? == 0
    {
        return Err(ApiError::bad_request("Amount must be greater than zero."));
    }
    if input.display_name.chars().count() > 80 {
        return Err(ApiError::bad_request(
            "Display name must contain at most 80 characters.",
        ));
    }
    if input.amount_display.trim().is_empty() || input.amount_display.len() > 64 {
        return Err(ApiError::bad_request("Display amount is required."));
    }
    if input
        .expires_at_seconds
        .is_some_and(|seconds| seconds <= Utc::now().timestamp())
    {
        return Err(ApiError::bad_request("Expiry must be in the future."));
    }
    normalize_max_redemptions(input.multi_pay, input.max_redemptions)?;
    match &input.asset {
        AssetDto::Native { symbol, decimals } if symbol == "NEAR" && *decimals == 24 => {}
        AssetDto::Native { .. } => {
            return Err(ApiError::bad_request(
                "Native NEAR uses symbol NEAR and 24 decimals.",
            ))
        }
        AssetDto::Nep141 {
            contract_id,
            symbol,
            decimals,
        } => {
            contract_id
                .parse::<near_account_id::AccountId>()
                .map_err(|_| ApiError::bad_request("Invalid NEP-141 contract account."))?;
            let network = state.config.network(input.network_id);
            if !network
                .ft_allowlist
                .iter()
                .any(|allowed| allowed == contract_id)
            {
                return Err(ApiError::bad_request(
                    "NEP-141 token is not allowlisted for this network.",
                ));
            }
            let metadata = near_rpc::ft_metadata(state, input.network_id, contract_id).await?;
            if metadata.get("decimals").and_then(Value::as_u64) != Some(u64::from(*decimals)) {
                return Err(ApiError::bad_request(
                    "Token decimal metadata does not match the NEAR contract.",
                ));
            }
            if metadata.get("symbol").and_then(Value::as_str) != Some(symbol.as_str()) {
                return Err(ApiError::bad_request(
                    "Token symbol metadata does not match the NEAR contract.",
                ));
            }
        }
    }
    let decimals = match &input.asset {
        AssetDto::Native { decimals, .. } | AssetDto::Nep141 { decimals, .. } => *decimals,
    };
    if decimal_to_base_units(&input.amount_display, decimals)?.to_string() != input.amount {
        return Err(ApiError::bad_request(
            "Display amount does not match its exact base-unit amount.",
        ));
    }
    Ok(())
}

fn normalize_max_redemptions(
    multi_pay: bool,
    max_redemptions: Option<i32>,
) -> Result<Option<i32>, ApiError> {
    if !multi_pay {
        if max_redemptions.is_some_and(|limit| limit != 1) {
            return Err(ApiError::bad_request(
                "Single-payment links must have a redemption limit of one.",
            ));
        }
        return Ok(Some(1));
    }
    match max_redemptions {
        None | Some(0) => Ok(None),
        Some(limit @ 1..=1_000_000) => Ok(Some(limit)),
        Some(_) => Err(ApiError::bad_request(
            "Redemption limit must be zero (unlimited) or between 1 and 1,000,000.",
        )),
    }
}

fn link_from_row(row: &PgRow) -> Result<PaymentLink, ApiError> {
    let asset: AssetDto =
        serde_json::from_value(row.try_get("asset")?).map_err(|_| ApiError::internal())?;
    let network: String = row.try_get("network_id")?;
    let network_id = parse_network(&network)?;
    let expiry: Option<DateTime<Utc>> = row.try_get("expires_at")?;
    Ok(PaymentLink {
        slug: row.try_get("slug")?,
        merchant_id: row.try_get("merchant_id")?,
        display_name: row.try_get("display_name")?,
        payout_account_id: row.try_get("payout_account_id")?,
        network_id,
        asset,
        amount: row.try_get("amount")?,
        amount_display: row.try_get("amount_display")?,
        expires_at_seconds: expiry.map(|value| value.timestamp()),
        multi_pay: row.try_get("multi_pay")?,
        max_redemptions: row.try_get("max_redemptions")?,
        created_at_ms: row.get::<DateTime<Utc>, _>("created_at").timestamp_millis(),
        claims_used: row.try_get("claims_used")?,
    })
}

fn parse_network(value: &str) -> Result<NetworkId, ApiError> {
    match value {
        "testnet" => Ok(NetworkId::Testnet),
        "mainnet" => Ok(NetworkId::Mainnet),
        _ => Err(ApiError::internal()),
    }
}

fn make_slug() -> String {
    let mut bytes = [0u8; 12];
    OsRng.fill_bytes(&mut bytes);
    bs58::encode(bytes).into_string()
}

#[cfg(test)]
mod tests {
    use super::{decimal_to_base_units, normalize_max_redemptions};

    #[test]
    fn amount_conversion_is_exact_for_each_asset_precision() {
        assert_eq!(
            decimal_to_base_units("1.25", 24).unwrap(),
            1_250_000_000_000_000_000_000_000
        );
        assert_eq!(decimal_to_base_units("0.000001", 6).unwrap(), 1);
        assert_eq!(decimal_to_base_units("25", 0).unwrap(), 25);
    }

    #[test]
    fn amount_conversion_rejects_rounding_and_exponents() {
        assert!(decimal_to_base_units("0.0000001", 6).is_err());
        assert!(decimal_to_base_units("1e3", 24).is_err());
        assert!(decimal_to_base_units("-1", 24).is_err());
    }

    #[test]
    fn zero_multi_pay_redemptions_normalizes_to_unlimited() {
        assert_eq!(normalize_max_redemptions(true, Some(0)).unwrap(), None);
        assert_eq!(normalize_max_redemptions(true, None).unwrap(), None);
        assert_eq!(normalize_max_redemptions(true, Some(5)).unwrap(), Some(5));
        assert_eq!(normalize_max_redemptions(false, Some(1)).unwrap(), Some(1));
        assert!(normalize_max_redemptions(true, Some(-1)).is_err());
        assert!(normalize_max_redemptions(false, Some(2)).is_err());
    }
}

pub fn decimal_to_base_units(value: &str, decimals: u8) -> Result<u128, ApiError> {
    let value = value.trim();
    if value.is_empty()
        || value.starts_with('-')
        || value.starts_with('+')
        || value.contains(['e', 'E'])
    {
        return Err(ApiError::bad_request(
            "Amount must be a positive plain decimal.",
        ));
    }
    let mut parts = value.split('.');
    let whole = parts.next().unwrap_or_default();
    let fraction = parts.next().unwrap_or_default();
    if parts.next().is_some()
        || whole.is_empty()
        || !whole.bytes().all(|byte| byte.is_ascii_digit())
        || !fraction.bytes().all(|byte| byte.is_ascii_digit())
    {
        return Err(ApiError::bad_request(
            "Amount must be a positive plain decimal.",
        ));
    }
    if fraction.len() > usize::from(decimals) {
        return Err(ApiError::bad_request(
            "Amount has more fractional digits than the asset supports.",
        ));
    }
    let scale = 10u128
        .checked_pow(u32::from(decimals))
        .ok_or_else(ApiError::internal)?;
    let integer = whole
        .parse::<u128>()
        .map_err(|_| ApiError::bad_request("Amount is too large."))?;
    let fractional = if fraction.is_empty() {
        0
    } else {
        fraction
            .parse::<u128>()
            .map_err(|_| ApiError::bad_request("Invalid fractional amount."))?
            .checked_mul(
                10u128
                    .checked_pow(u32::from(decimals) - fraction.len() as u32)
                    .ok_or_else(ApiError::internal)?,
            )
            .ok_or_else(|| ApiError::bad_request("Amount is too large."))?
    };
    integer
        .checked_mul(scale)
        .and_then(|amount| amount.checked_add(fractional))
        .ok_or_else(|| ApiError::bad_request("Amount is too large."))
}
