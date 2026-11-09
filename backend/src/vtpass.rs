use aes_gcm::{aead::Aead, Aes256Gcm, KeyInit, Nonce};
use axum::{
    extract::{Path, Query, State},
    http::HeaderMap,
    Json,
};
use chrono::{Duration, TimeZone, Utc};
use rand::{rngs::OsRng, RngCore};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::Row;
use uuid::Uuid;

use crate::{auth, db::sqlx, error::ApiError, models::AssetDto, state::AppState};

const SANDBOX_API: &str = "https://sandbox.vtpass.com/api";
const FX_RATE_URL: &str = "https://open.er-api.com/v6/latest/USD";
const FX_SOURCE: &str = "open.er-api.com";
const FX_CACHE_TTL: std::time::Duration = std::time::Duration::from_secs(15 * 60);
const FX_MAX_AGE_SECONDS: i64 = 48 * 60 * 60;

fn configured(state: &AppState) -> Result<(&str, &str, &str), ApiError> {
    let config = &state.config;
    match (
        config.vtpass_api_key.as_deref(),
        config.vtpass_public_key.as_deref(),
        config.vtpass_secret_key.as_deref(),
    ) {
        (Some(api), Some(public), Some(secret)) => Ok((api, public, secret)),
        _ => Err(ApiError::unavailable(
            "VTpass sandbox credentials are not configured.",
        )),
    }
}

async fn get(state: &AppState, path: &str) -> Result<Value, ApiError> {
    let (api_key, public_key, _) = configured(state)?;
    let response = state
        .http
        .get(format!("{SANDBOX_API}{path}"))
        .header("api-key", api_key)
        .header("public-key", public_key)
        .send()
        .await
        .map_err(|error| {
            tracing::warn!(%error, "VTpass sandbox GET failed");
            ApiError::unavailable("VTpass sandbox is temporarily unavailable.")
        })?;
    let status = response.status();
    let body = response.json::<Value>().await.map_err(|error| {
        tracing::warn!(%error, "VTpass sandbox returned invalid JSON");
        ApiError::unavailable("VTpass sandbox returned an invalid response.")
    })?;
    if !status.is_success() {
        tracing::warn!(status = %status, "VTpass sandbox rejected GET request");
        return Err(ApiError::unavailable("VTpass sandbox request failed."));
    }
    Ok(body)
}

async fn post(state: &AppState, path: &str, body: &Value) -> Result<Value, ApiError> {
    let (api_key, _, secret_key) = configured(state)?;
    let response = state
        .http
        .post(format!("{SANDBOX_API}{path}"))
        .header("api-key", api_key)
        .header("secret-key", secret_key)
        .json(body)
        .send()
        .await
        .map_err(|error| {
            tracing::warn!(%error, "VTpass sandbox POST failed");
            ApiError::unavailable("VTpass sandbox is temporarily unavailable.")
        })?;
    let status = response.status();
    let response_body = response.json::<Value>().await.map_err(|error| {
        tracing::warn!(%error, "VTpass sandbox returned invalid JSON");
        ApiError::unavailable("VTpass sandbox returned an invalid response.")
    })?;
    if !status.is_success() {
        tracing::warn!(status = %status, "VTpass sandbox rejected POST request");
        return Err(ApiError::unavailable("VTpass sandbox request failed."));
    }
    Ok(response_body)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceQuery {
    identifier: String,
}

pub async fn categories(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    Ok(Json(get(&state, "/service-categories").await?))
}

pub async fn services(
    State(state): State<AppState>,
    Query(query): Query<ServiceQuery>,
) -> Result<Json<Value>, ApiError> {
    if !matches!(
        query.identifier.as_str(),
        "airtime" | "data" | "electricity-bill" | "tv-subscription"
    ) {
        return Err(ApiError::bad_request(
            "Unsupported VTpass service category.",
        ));
    }
    Ok(Json(
        get(
            &state,
            &format!("/services?identifier={}", query.identifier),
        )
        .await?,
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VariationQuery {
    service_id: String,
}

pub async fn variations(
    State(state): State<AppState>,
    Query(query): Query<VariationQuery>,
) -> Result<Json<Value>, ApiError> {
    validate_service_id(&query.service_id)?;
    Ok(Json(
        get(
            &state,
            &format!("/service-variations?serviceID={}", query.service_id),
        )
        .await?,
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuoteRequest {
    amount_ngn: String,
    token_decimals: u8,
}

pub async fn quote(
    State(state): State<AppState>,
    Json(input): Json<QuoteRequest>,
) -> Result<Json<Value>, ApiError> {
    configured(&state)?;
    let amount_ngn = parse_ngn_minor(&input.amount_ngn)?;
    if amount_ngn == 0 || amount_ngn > 100_000_000 || input.token_decimals > 24 {
        return Err(ApiError::bad_request(
            "Amount or token precision is outside supported limits.",
        ));
    }
    let fx = usd_ngn_rate(&state).await?;
    let usd_micros = ngn_minor_to_usd_micros(amount_ngn, fx.rate_micros)?;
    let token_amount = token_base_units(usd_micros, input.token_decimals)?;
    if usd_micros == 0 || token_amount == 0 {
        return Err(ApiError::bad_request(
            "This NGN amount is too small for the selected token precision.",
        ));
    }
    let expires_at = Utc::now() + Duration::minutes(10);
    let quote_id = format!("fxq_{}", Uuid::new_v4().simple());
    let amount_ngn_display = format_ngn_minor(amount_ngn);
    let amount_usd_display = format_micros(usd_micros);
    let token_amount = token_amount.to_string();
    let source_updated_at = Utc
        .timestamp_opt(fx.source_updated_at_seconds, 0)
        .single()
        .ok_or_else(ApiError::internal)?;
    sqlx::query("DELETE FROM vtpass_fx_quotes WHERE consumed_at IS NULL AND expires_at < now() - INTERVAL '1 day'")
        .execute(&state.pool)
        .await?;
    sqlx::query("INSERT INTO vtpass_fx_quotes (quote_id,amount_ngn,amount_usd,rate_ngn_per_usd,token_decimals,token_amount_base_units,fx_source,fx_source_updated_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?)")
        .bind(&quote_id)
        .bind(&amount_ngn_display)
        .bind(&amount_usd_display)
        .bind(&fx.rate_display)
        .bind(i16::from(input.token_decimals))
        .bind(&token_amount)
        .bind(FX_SOURCE)
        .bind(source_updated_at)
        .bind(expires_at)
        .execute(&state.pool)
        .await?;
    Ok(Json(json!({
        "quoteId": quote_id,
        "amountNgn": amount_ngn_display,
        "amountUsd": amount_usd_display,
        "tokenDecimals": input.token_decimals,
        "tokenAmountBaseUnits": token_amount,
        "exchangeRateNgnPerUsd": fx.rate_display,
        "fxSource": FX_SOURCE,
        "fxSourceUpdatedAtSeconds": fx.source_updated_at_seconds,
        "expiresAtSeconds": expires_at.timestamp(),
    })))
}

async fn usd_ngn_rate(state: &AppState) -> Result<crate::state::CachedUsdNgnRate, ApiError> {
    let mut cached = state.usd_ngn_rate.lock().await;
    if let Some(rate) = cached
        .as_ref()
        .filter(|rate| rate.fetched_at.elapsed() < FX_CACHE_TTL)
    {
        return Ok(rate.clone());
    }
    let response = state.http.get(FX_RATE_URL).send().await.map_err(|error| {
        tracing::warn!(%error, "USD/NGN FX rate fetch failed");
        ApiError::unavailable("Live USD/NGN pricing is temporarily unavailable.")
    })?;
    if !response.status().is_success() {
        tracing::warn!(status = %response.status(), "USD/NGN FX source rejected the request");
        return Err(ApiError::unavailable(
            "Live USD/NGN pricing is temporarily unavailable.",
        ));
    }
    let payload = response.json::<Value>().await.map_err(|error| {
        tracing::warn!(%error, "USD/NGN FX source returned invalid JSON");
        ApiError::unavailable("Live USD/NGN pricing returned an invalid response.")
    })?;
    let rate = parse_usd_ngn_rate(&payload, Utc::now().timestamp())?;
    *cached = Some(rate.clone());
    Ok(rate)
}

fn parse_usd_ngn_rate(
    payload: &Value,
    now_seconds: i64,
) -> Result<crate::state::CachedUsdNgnRate, ApiError> {
    if payload.get("result").and_then(Value::as_str) != Some("success") {
        return Err(ApiError::unavailable(
            "Live USD/NGN pricing source returned an unsuccessful result.",
        ));
    }
    let updated_at = payload
        .get("time_last_update_unix")
        .and_then(Value::as_i64)
        .ok_or_else(|| ApiError::unavailable("Live USD/NGN pricing source has no update time."))?;
    if updated_at > now_seconds + 300 || now_seconds.saturating_sub(updated_at) > FX_MAX_AGE_SECONDS
    {
        return Err(ApiError::unavailable(
            "Live USD/NGN pricing source is stale. Try again when its rate feed is current.",
        ));
    }
    let rate = payload
        .pointer("/rates/NGN")
        .and_then(Value::as_f64)
        .filter(|rate| rate.is_finite() && *rate > 0.0 && *rate <= 1_000_000_000.0)
        .ok_or_else(|| {
            ApiError::unavailable("Live USD/NGN pricing source has no valid NGN rate.")
        })?;
    let rate_micros_float = (rate * 1_000_000.0).round();
    if !rate_micros_float.is_finite() || rate_micros_float < 1.0 {
        return Err(ApiError::unavailable(
            "Live USD/NGN rate is outside supported precision.",
        ));
    }
    let rate_micros = rate_micros_float as u128;
    Ok(crate::state::CachedUsdNgnRate {
        rate_micros,
        rate_display: format_micros(rate_micros),
        source_updated_at_seconds: updated_at,
        fetched_at: std::time::Instant::now(),
    })
}

fn token_base_units(usd_micros: u128, decimals: u8) -> Result<u128, ApiError> {
    if decimals >= 6 {
        usd_micros
            .checked_mul(10u128.pow(u32::from(decimals - 6)))
            .ok_or_else(ApiError::internal)
    } else {
        Ok(usd_micros / 10u128.pow(u32::from(6 - decimals)))
    }
}

fn ngn_minor_to_usd_micros(amount_minor: u64, rate_micros: u128) -> Result<u128, ApiError> {
    u128::from(amount_minor)
        .checked_mul(10_000_000_000)
        .ok_or_else(ApiError::internal)
        .map(|amount| amount / rate_micros)
}

fn parse_ngn_minor(value: &str) -> Result<u64, ApiError> {
    let mut parts = value.split('.');
    let whole = parts
        .next()
        .unwrap_or_default()
        .parse::<u64>()
        .map_err(|_| ApiError::bad_request("Amount must be a valid NGN amount."))?;
    let fractional = parts.next().unwrap_or("0");
    if parts.next().is_some()
        || fractional.len() > 2
        || !fractional.bytes().all(|byte| byte.is_ascii_digit())
    {
        return Err(ApiError::bad_request(
            "Amount can have at most two decimal places.",
        ));
    }
    let minor = if fractional.len() == 1 {
        fractional.parse::<u64>().unwrap_or(0) * 10
    } else {
        fractional.parse::<u64>().unwrap_or(0)
    };
    whole
        .checked_mul(100)
        .and_then(|amount| amount.checked_add(minor))
        .ok_or_else(ApiError::internal)
}

fn format_ngn_minor(amount: u64) -> String {
    let whole = amount / 100;
    let fraction = amount % 100;
    if fraction == 0 {
        whole.to_string()
    } else {
        format!("{whole}.{fraction:02}")
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerCheck {
    #[serde(rename = "serviceID")]
    service_id: String,
    billers_code: String,
    #[serde(rename = "type")]
    customer_type: Option<String>,
}

pub async fn verify_customer(
    State(state): State<AppState>,
    Json(input): Json<CustomerCheck>,
) -> Result<Json<Value>, ApiError> {
    validate_service_id(&input.service_id)?;
    if input.billers_code.trim().is_empty() || input.billers_code.len() > 80 {
        return Err(ApiError::bad_request(
            "Enter a valid customer or meter number.",
        ));
    }
    let mut body =
        json!({ "serviceID": input.service_id, "billersCode": input.billers_code.trim() });
    if let Some(kind) = input.customer_type.filter(|value| !value.trim().is_empty()) {
        body["type"] = json!(kind.trim());
    }
    Ok(Json(post(&state, "/merchant-verify", &body).await?))
}

fn validate_service_id(service_id: &str) -> Result<(), ApiError> {
    if service_id.is_empty()
        || service_id.len() > 64
        || !service_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return Err(ApiError::bad_request("Invalid VTpass service ID."));
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePurchase {
    pub link_slug: String,
    pub quote_id: String,
    pub category: String,
    #[serde(rename = "serviceID")]
    pub service_id: String,
    pub variation_code: Option<String>,
    pub provider_fields: Value,
}

fn category_identifier(category: &str) -> Option<&'static str> {
    match category {
        "airtime" => Some("airtime"),
        "data" => Some("data"),
        "electricity" => Some("electricity-bill"),
        "tv" => Some("tv-subscription"),
        _ => None,
    }
}

pub async fn create_purchase(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreatePurchase>,
) -> Result<Json<Value>, ApiError> {
    let merchant = auth::current_merchant(&state, &headers).await?;
    configured(&state)?;
    validate_service_id(&input.service_id)?;
    if !matches!(
        input.category.as_str(),
        "airtime" | "data" | "electricity" | "tv"
    ) {
        return Err(ApiError::bad_request(
            "Unsupported VTpass purchase category.",
        ));
    }
    let identifier = category_identifier(&input.category)
        .ok_or_else(|| ApiError::bad_request("Unsupported VTpass purchase category."))?;
    let service_catalog = get(&state, &format!("/services?identifier={identifier}")).await?;
    let service_is_available = service_catalog
        .get("content")
        .and_then(Value::as_array)
        .is_some_and(|services| {
            services.iter().any(|service| {
                service.get("serviceID").and_then(Value::as_str) == Some(input.service_id.as_str())
            })
        });
    if !service_is_available {
        return Err(ApiError::bad_request(
            "Selected VTpass provider is not available in the sandbox catalog.",
        ));
    }
    if input.link_slug.is_empty()
        || input.link_slug.len() > 32
        || !input
            .link_slug
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return Err(ApiError::bad_request("Invalid checkout link."));
    }
    if input.provider_fields.to_string().len() > 4096 || !input.provider_fields.is_object() {
        return Err(ApiError::bad_request("Invalid VTpass recipient details."));
    }
    if input.provider_fields.as_object().is_some_and(|fields| {
        fields.iter().any(|(key, value)| {
            !matches!(key.as_str(), "phone" | "billersCode" | "type" | "email")
                || value
                    .as_str()
                    .is_none_or(|value| value.trim().is_empty() || value.len() > 160)
        })
    }) {
        return Err(ApiError::bad_request(
            "VTpass recipient details contain unsupported fields.",
        ));
    }
    if let Some(code) = input.variation_code.as_deref() {
        if code.is_empty()
            || code.len() > 128
            || !code
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        {
            return Err(ApiError::bad_request("Invalid VTpass variation code."));
        }
    }
    if matches!(input.category.as_str(), "data" | "tv") && input.variation_code.is_none() {
        return Err(ApiError::bad_request("Select a VTpass package."));
    }
    if input.category == "electricity"
        && !matches!(
            input.variation_code.as_deref(),
            Some("prepaid" | "postpaid")
        )
    {
        return Err(ApiError::bad_request(
            "Select prepaid or postpaid electricity.",
        ));
    }

    let link = sqlx::query(
        "SELECT network_id, asset, amount, merchant_id, active FROM payment_links WHERE slug=?",
    )
    .bind(&input.link_slug)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::not_found("Payment checkout link not found."))?;
    if link.try_get::<String, _>("merchant_id")? != merchant.merchant_id
        || !link.try_get::<bool, _>("active")?
    {
        return Err(ApiError::forbidden(
            "Checkout link does not belong to your workspace.",
        ));
    }
    if link.try_get::<String, _>("network_id")? != "testnet" {
        return Err(ApiError::bad_request(
            "VTpass integration is restricted to NEAR testnet.",
        ));
    }
    let asset: AssetDto =
        serde_json::from_value(link.try_get("asset")?).map_err(|_| ApiError::internal())?;
    let AssetDto::Nep141 {
        symbol, decimals, ..
    } = asset
    else {
        return Err(ApiError::bad_request(
            "VTpass sandbox checkout currently requires a stable fungible token.",
        ));
    };
    if !matches!(
        symbol.to_ascii_uppercase().as_str(),
        "USDC" | "USDT" | "DAI"
    ) {
        return Err(ApiError::bad_request(
            "VTpass sandbox checkout supports USDC, USDT, or DAI only.",
        ));
    }
    let key = state
        .config
        .vtpass_data_encryption_key
        .as_ref()
        .ok_or_else(|| ApiError::unavailable("VTpass recipient encryption is not configured."))?;
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| ApiError::internal())?;
    let recipient_bytes =
        serde_json::to_vec(&input.provider_fields).map_err(|_| ApiError::internal())?;
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce_bytes), recipient_bytes.as_ref())
        .map_err(|_| ApiError::internal())?;
    let purchase_id = format!("vps_{}", Uuid::new_v4().simple());
    let mut tx = state.pool.begin().await?;
    let quote = sqlx::query("SELECT * FROM vtpass_fx_quotes WHERE quote_id=? AND consumed_at IS NULL AND expires_at > now() FOR UPDATE")
        .bind(&input.quote_id).fetch_optional(&mut *tx).await?
        .ok_or_else(|| ApiError::conflict("Quote expired or already used. Request a fresh quote."))?;
    let amount_ngn: String = quote.try_get("amount_ngn")?;
    let amount_usd: String = quote.try_get("amount_usd")?;
    let quote_expires_at: chrono::DateTime<Utc> = quote.try_get("expires_at")?;
    let quote_decimals: i16 = quote.try_get("token_decimals")?;
    let quote_token_amount: String = quote.try_get("token_amount_base_units")?;
    if quote_decimals != i16::from(decimals)
        || link.try_get::<String, _>("amount")? != quote_token_amount
    {
        return Err(ApiError::bad_request(
            "Checkout amount does not match the locked USD quote.",
        ));
    }
    let amount_ngn_minor = parse_ngn_minor(&amount_ngn)?;
    if matches!(input.category.as_str(), "data" | "tv") {
        let variation_code = input
            .variation_code
            .as_deref()
            .ok_or_else(|| ApiError::bad_request("Select a VTpass package."))?;
        let variations = get(
            &state,
            &format!("/service-variations?serviceID={}", input.service_id),
        )
        .await?;
        let available = variations
            .pointer("/content/variations")
            .and_then(Value::as_array)
            .is_some_and(|items| {
                items.iter().any(|variation| {
                    variation.get("variation_code").and_then(Value::as_str) == Some(variation_code)
                        && variation
                            .get("variation_amount")
                            .and_then(Value::as_str)
                            .and_then(|amount| parse_ngn_minor(amount).ok())
                            == Some(amount_ngn_minor)
                })
            });
        if !available {
            return Err(ApiError::bad_request(
                "Selected VTpass package or price is no longer available.",
            ));
        }
    }
    let rate_ngn_per_usd: String = quote.try_get("rate_ngn_per_usd")?;
    let fx_source: String = quote.try_get("fx_source")?;
    let fx_source_updated_at: chrono::DateTime<Utc> = quote.try_get("fx_source_updated_at")?;
    sqlx::query(
        "UPDATE vtpass_fx_quotes SET consumed_at=now() WHERE quote_id=? AND consumed_at IS NULL",
    )
    .bind(&input.quote_id)
    .execute(&mut *tx)
    .await?;
    sqlx::query("INSERT INTO vtpass_service_purchases (purchase_id,merchant_id,link_slug,category,service_id,variation_code,amount_ngn,amount_usd,quote_expires_at,recipient_ciphertext,recipient_nonce,quote_id,rate_ngn_per_usd,fx_source,fx_source_updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(&purchase_id).bind(&merchant.merchant_id).bind(&input.link_slug).bind(&input.category)
        .bind(&input.service_id).bind(&input.variation_code).bind(&amount_ngn).bind(&amount_usd)
        .bind(quote_expires_at).bind(ciphertext).bind(nonce_bytes.as_slice()).bind(&input.quote_id)
        .bind(rate_ngn_per_usd).bind(fx_source).bind(fx_source_updated_at).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(Json(json!({
        "purchaseId": purchase_id,
        "linkSlug": input.link_slug,
        "category": input.category,
        "serviceID": input.service_id,
        "amountNgn": amount_ngn,
        "amountUsd": amount_usd,
        "state": "AWAITING_PAYMENT",
        "networkId": "testnet",
    })))
}

fn format_micros(amount: u128) -> String {
    let whole = amount / 1_000_000;
    let fraction = format!("{:06}", amount % 1_000_000);
    let fraction = fraction.trim_end_matches('0');
    if fraction.is_empty() {
        whole.to_string()
    } else {
        format!("{whole}.{fraction}")
    }
}

pub async fn purchase_status(
    State(state): State<AppState>,
    Path(purchase_id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let row = sqlx::query("SELECT purchase_id,link_slug,category,service_id,amount_ngn,amount_usd,state,provider_transaction_id,provider_response,failure_reason FROM vtpass_service_purchases WHERE purchase_id=?")
        .bind(purchase_id).fetch_optional(&state.pool).await?
        .ok_or_else(|| ApiError::not_found("VTpass purchase not found."))?;
    Ok(Json(json!({
        "purchaseId": row.try_get::<String,_>("purchase_id")?,
        "linkSlug": row.try_get::<String,_>("link_slug")?,
        "category": row.try_get::<String,_>("category")?,
        "serviceID": row.try_get::<String,_>("service_id")?,
        "amountNgn": row.try_get::<String,_>("amount_ngn")?,
        "amountUsd": row.try_get::<String,_>("amount_usd")?,
        "state": row.try_get::<String,_>("state")?,
        "providerTransactionId": row.try_get::<Option<String>,_>("provider_transaction_id")?,
        "providerResponse": row.try_get::<Option<Value>,_>("provider_response")?,
        "failureReason": row.try_get::<Option<String>,_>("failure_reason")?,
    })))
}

pub async fn fulfill_purchase(
    State(state): State<AppState>,
    Path(purchase_id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    configured(&state)?;
    let mut tx = state.pool.begin().await?;
    let row = sqlx::query("SELECT p.*, l.network_id FROM vtpass_service_purchases p JOIN payment_links l USING(link_slug) WHERE p.purchase_id=? FOR UPDATE")
        .bind(&purchase_id).fetch_optional(&mut *tx).await?
        .ok_or_else(|| ApiError::not_found("VTpass purchase not found."))?;
    let state_name: String = row.try_get("state")?;
    if state_name == "FULFILLED" || state_name == "FAILED" {
        tx.commit().await?;
        return Ok(Json(
            json!({"purchaseId":purchase_id,"state":state_name,"providerResponse":row.try_get::<Option<Value>,_>("provider_response")?}),
        ));
    }
    if row.try_get::<String, _>("network_id")? != "testnet" {
        return Err(ApiError::bad_request(
            "VTpass purchases are allowed on NEAR testnet only.",
        ));
    }
    let link_slug: String = row.try_get("link_slug")?;
    let merchant_id: String = row.try_get("merchant_id")?;
    let _order = sqlx::query("SELECT order_id FROM orders WHERE link_slug=? AND merchant_id=? AND network_id='testnet' AND state='SETTLED' AND settlement_receipt_id IS NOT NULL LIMIT 1")
        .bind(&link_slug).bind(&merchant_id).fetch_optional(&mut *tx).await?
        .ok_or_else(|| ApiError::conflict("Verify the NEAR testnet payment before fulfillment."))?;
    let request_id: String = match row.try_get::<Option<String>, _>("request_id")? {
        Some(value) => value,
        None => {
            let value = new_request_id();
            sqlx::query("UPDATE vtpass_service_purchases SET state='SUBMITTING',request_id=?,updated_at=now() WHERE purchase_id=?")
                .bind(&value).bind(&purchase_id).execute(&mut *tx).await?;
            value
        }
    };
    if matches!(
        state_name.as_str(),
        "SUBMITTING" | "FULFILLMENT_PENDING" | "SUBMITTED" | "RECONCILIATION_REQUIRED"
    ) {
        tx.commit().await?;
        let result = post(&state, "/requery", &json!({"request_id":request_id})).await?;
        update_from_provider(&state, &purchase_id, &result).await?;
        return Ok(Json(
            json!({"purchaseId":purchase_id,"state":provider_state(&result),"providerResponse":sanitize_response(&result)}),
        ));
    }
    let key = state
        .config
        .vtpass_data_encryption_key
        .as_ref()
        .ok_or_else(|| ApiError::unavailable("VTpass recipient encryption is not configured."))?;
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| ApiError::internal())?;
    let nonce: Vec<u8> = row.try_get("recipient_nonce")?;
    let ciphertext: Vec<u8> = row.try_get("recipient_ciphertext")?;
    let plaintext = cipher
        .decrypt(Nonce::from_slice(&nonce), ciphertext.as_ref())
        .map_err(|_| ApiError::internal())?;
    let fields: Value = serde_json::from_slice(&plaintext).map_err(|_| ApiError::internal())?;
    let mut provider_request = fields;
    let object = provider_request
        .as_object_mut()
        .ok_or_else(ApiError::internal)?;
    object.insert("request_id".into(), json!(request_id));
    object.insert(
        "serviceID".into(),
        row.try_get::<String, _>("service_id")?.into(),
    );
    object.insert(
        "amount".into(),
        row.try_get::<String, _>("amount_ngn")?.into(),
    );
    if let Some(code) = row.try_get::<Option<String>, _>("variation_code")? {
        object.insert("variation_code".into(), json!(code));
    }
    tx.commit().await?;

    let result = match post(&state, "/pay", &provider_request).await {
        Ok(value) => value,
        Err(error) => {
            sqlx::query("UPDATE vtpass_service_purchases SET state='RECONCILIATION_REQUIRED',failure_reason='VTpass response was ambiguous; requery before retrying.',updated_at=now() WHERE purchase_id=?")
                .bind(&purchase_id).execute(&state.pool).await?;
            return Err(error);
        }
    };
    update_from_provider(&state, &purchase_id, &result).await?;
    Ok(Json(
        json!({"purchaseId":purchase_id,"state":provider_state(&result),"providerResponse":sanitize_response(&result)}),
    ))
}

fn new_request_id() -> String {
    let lagos_now = Utc::now() + Duration::hours(1);
    format!(
        "{}{}",
        lagos_now.format("%Y%m%d%H%M"),
        Uuid::new_v4().simple()
    )
}

fn provider_state(response: &Value) -> &'static str {
    let status = response
        .pointer("/content/transactions/status")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if status.eq_ignore_ascii_case("delivered") {
        "FULFILLED"
    } else if status.eq_ignore_ascii_case("pending") || status.eq_ignore_ascii_case("processing") {
        "SUBMITTED"
    } else {
        "FAILED"
    }
}

fn sanitize_response(response: &Value) -> Value {
    json!({
        "code": response.get("code"),
        "description": response.get("response_description"),
        "requestId": response.get("requestId"),
        "transactionId": response.pointer("/content/transactions/transactionId"),
        "purchasedCode": response.get("purchased_code"),
        "status": response.pointer("/content/transactions/status"),
    })
}

async fn update_from_provider(
    state: &AppState,
    purchase_id: &str,
    response: &Value,
) -> Result<(), ApiError> {
    let status = provider_state(response);
    let transaction_id = response
        .pointer("/content/transactions/transactionId")
        .and_then(Value::as_str);
    let failure = if status == "FAILED" {
        response
            .get("response_description")
            .and_then(Value::as_str)
            .unwrap_or("VTpass sandbox purchase failed.")
    } else {
        ""
    };
    sqlx::query("UPDATE vtpass_service_purchases SET state=?,provider_transaction_id=COALESCE(?,provider_transaction_id),provider_response=?,failure_reason=NULLIF(?,''),updated_at=now() WHERE purchase_id=?")
        .bind(status).bind(transaction_id).bind(sanitize_response(response)).bind(failure).bind(purchase_id).execute(&state.pool).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        format_micros, format_ngn_minor, new_request_id, ngn_minor_to_usd_micros, parse_ngn_minor,
        parse_usd_ngn_rate, provider_state, validate_service_id,
    };
    use serde_json::json;

    #[test]
    fn request_ids_start_with_lagos_date_and_minute_and_are_unique() {
        let id = new_request_id();
        assert!(id.len() >= 12);
        assert!(id[..12].bytes().all(|byte| byte.is_ascii_digit()));
        assert_ne!(id, new_request_id());
    }

    #[test]
    fn service_ids_are_bounded_and_safe_for_query_strings() {
        assert!(validate_service_id("mtn-data").is_ok());
        assert!(validate_service_id("../pay").is_err());
        assert!(validate_service_id("a&b").is_err());
    }

    #[test]
    fn quote_and_provider_status_formatting_are_deterministic() {
        assert_eq!(format_micros(1_250_000), "1.25");
        assert_eq!(format_micros(2_000_000), "2");
        assert_eq!(parse_ngn_minor("400.00").unwrap(), 40_000);
        assert_eq!(format_ngn_minor(40_050), "400.50");
        assert!(parse_ngn_minor("1.001").is_err());
        assert_eq!(
            ngn_minor_to_usd_micros(100_000, 1_500_000_000).unwrap(),
            666_666
        );
        assert_eq!(
            provider_state(&json!({"content":{"transactions":{"status":"delivered"}}})),
            "FULFILLED"
        );
        assert_eq!(
            provider_state(&json!({"content":{"transactions":{"status":"pending"}}})),
            "SUBMITTED"
        );
        assert_eq!(
            provider_state(&json!({"content":{"transactions":{"status":"failed"}}})),
            "FAILED"
        );
    }

    #[test]
    fn live_fx_response_must_be_successful_and_recent() {
        let now = 1_800_000_000;
        let payload = json!({
            "result": "success",
            "time_last_update_unix": now - 60,
            "rates": { "NGN": 1525.75 }
        });
        let rate = parse_usd_ngn_rate(&payload, now).unwrap();
        assert_eq!(rate.rate_micros, 1_525_750_000);
        assert_eq!(rate.rate_display, "1525.75");
        assert!(parse_usd_ngn_rate(&payload, now + 49 * 60 * 60).is_err());
        assert!(parse_usd_ngn_rate(&json!({"result":"error"}), now).is_err());
    }
}
