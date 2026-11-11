use std::sync::Arc;

use axum::{
    extract::{Path, State},
    Json,
};
use chrono::Utc;
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::Row;
use uuid::Uuid;
use worldz_near_protocol::NetworkId;

use crate::db::sqlx;
use crate::error::ApiError;
use crate::models::AssetDto;
use crate::near_rpc;
use crate::state::{AppState, CachedOneClickTokens};

const TOKENS_CACHE_TTL_SECONDS: u64 = 600;
const QUOTE_HTTP_TIMEOUT_SECONDS: u64 = 8;
pub(crate) const MAX_SLIPPAGE_BPS: u32 = 1000;
pub(crate) const DEFAULT_SLIPPAGE_BPS: u32 = 100;
pub(crate) const QUOTE_TTL_SECONDS: i64 = 600;

pub(crate) const MOCK_TOKENS_FIXTURE: &str = r#"[
  {"assetId":"nep141:wrap.near","decimals":24,"blockchain":"near","symbol":"wNEAR","contractAddress":"wrap.near"},
  {"assetId":"nep141:brz-0xe0caa5f511cf2e3500a9d6df8efc384c56567840.omft.near","decimals":6,"blockchain":"near","symbol":"BRZ","contractAddress":null},
  {"assetId":"nep141:eth-0x2170ed0880ac9a755fd29b2688956bd959f933f8.omft.near","decimals":18,"blockchain":"eth","symbol":"ETH","contractAddress":"0x2170ed0880ac9a755fd29b2688956bd959f933f8"},
  {"assetId":"nep141:base-0x0000000000000000000000000000000000000000.omft.near","decimals":18,"blockchain":"base","symbol":"ETH","contractAddress":"0x0000000000000000000000000000000000000000"},
  {"assetId":"nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near","decimals":6,"blockchain":"arb","symbol":"USDC","contractAddress":"0xaf88d065e77c8cc2239327c5edb3a432268e5831"},
  {"assetId":"nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near","decimals":6,"blockchain":"base","symbol":"USDC","contractAddress":"0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"},
  {"assetId":"nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near","decimals":9,"blockchain":"sol","symbol":"SOL","contractAddress":"5ce3bf3a31af18be40ba30f721101b4341690186"},
  {"assetId":"nep141:sol-EPjFWdd5AufqSSqeM2qN1xzybdba6RbFsu9EAg9MniPm.omft.near","decimals":6,"blockchain":"sol","symbol":"USDC","contractAddress":"EPjFWdd5AufqSSqeM2qN1xzybdba6RbFsu9EAg9MniPm"},
  {"assetId":"btc:bitcoin","decimals":8,"blockchain":"btc","symbol":"BTC","contractAddress":null}
]"#;

#[derive(Clone, Debug)]
pub(crate) struct OneClickToken {
    pub asset_id: String,
    pub decimals: u8,
    pub blockchain: String,
    pub symbol: String,
    pub contract_address: Option<String>,
}

#[derive(Clone, Debug)]
pub(crate) struct QuoteParams {
    pub origin_asset: String,
    pub destination_asset: String,
    pub amount_out: String,
    pub recipient: String,
    pub refund_to: String,
    pub refund_type: &'static str,
    pub slippage_bps: u32,
}

#[derive(Clone, Debug)]
pub(crate) struct OneClickQuote {
    pub deposit_address: Option<String>,
    pub deposit_memo: Option<String>,
    pub amount_in: String,
    pub min_amount_in: String,
    pub amount_out: String,
    pub deadline: Option<String>,
    pub time_estimate_seconds: i64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum SwapStatus {
    KnownDepositTx,
    PendingDeposit,
    IncompleteDeposit,
    Processing,
    Success,
    Refunded,
    Failed,
}

impl SwapStatus {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            SwapStatus::KnownDepositTx => "KNOWN_DEPOSIT_TX",
            SwapStatus::PendingDeposit => "PENDING_DEPOSIT",
            SwapStatus::IncompleteDeposit => "INCOMPLETE_DEPOSIT",
            SwapStatus::Processing => "PROCESSING",
            SwapStatus::Success => "SUCCESS",
            SwapStatus::Refunded => "REFUNDED",
            SwapStatus::Failed => "FAILED",
        }
    }

    fn from_str(value: &str) -> Option<Self> {
        Some(match value {
            "KNOWN_DEPOSIT_TX" => SwapStatus::KnownDepositTx,
            "PENDING_DEPOSIT" => SwapStatus::PendingDeposit,
            "INCOMPLETE_DEPOSIT" => SwapStatus::IncompleteDeposit,
            "PROCESSING" => SwapStatus::Processing,
            "SUCCESS" => SwapStatus::Success,
            "REFUNDED" => SwapStatus::Refunded,
            "FAILED" => SwapStatus::Failed,
            _ => return None,
        })
    }
}

#[derive(Clone, Debug, Default)]
pub(crate) struct SwapOutcome {
    pub near_tx_hashes: Vec<String>,
    pub destination_tx_hashes: Vec<String>,
    pub amount_out: Option<String>,
}

#[derive(Clone, Debug)]
pub(crate) struct StatusResponse {
    pub status: SwapStatus,
    pub swap_outcome: SwapOutcome,
}

fn digit_string(value: &Value, field: &str) -> Result<String, ApiError> {
    let raw = value
        .get(field)
        .and_then(Value::as_str)
        .ok_or_else(|| ApiError::unavailable(format!("1Click response has no {field}.")))?;
    if raw.is_empty() || !raw.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(ApiError::unavailable(format!(
            "1Click response field {field} is not an integer base-unit string."
        )));
    }
    Ok(raw.to_owned())
}

pub(crate) fn validate_slippage_bps(slippage_bps: u32) -> Result<(), ApiError> {
    if slippage_bps > MAX_SLIPPAGE_BPS {
        return Err(ApiError::bad_request(format!(
            "Slippage tolerance must be between 0 and {MAX_SLIPPAGE_BPS} basis points."
        )));
    }
    Ok(())
}

pub(crate) fn build_quote_request(
    params: &QuoteParams,
    dry: bool,
    deadline_seconds: i64,
) -> Result<Value, ApiError> {
    validate_slippage_bps(params.slippage_bps)?;
    if params.origin_asset.is_empty() || params.destination_asset.is_empty() {
        return Err(ApiError::bad_request(
            "Origin and destination assets are required.",
        ));
    }
    if params.recipient.is_empty() {
        return Err(ApiError::bad_request(
            "The merchant receive account is required.",
        ));
    }
    if params.refund_to.is_empty() {
        return Err(ApiError::bad_request(
            "The connected wallet refund address is required.",
        ));
    }
    if params.amount_out.is_empty() || !params.amount_out.bytes().all(|byte| byte.is_ascii_digit())
    {
        return Err(ApiError::bad_request(
            "The payment amount must be an integer string in the receive token's smallest units.",
        ));
    }
    let deadline = chrono::DateTime::from_timestamp(deadline_seconds, 0)
        .ok_or_else(ApiError::internal)?
        .to_rfc3339();
    Ok(json!({
        "dry": dry,
        "swapType": "EXACT_OUTPUT",
        "slippageTolerance": params.slippage_bps,
        "originAsset": params.origin_asset,
        "destinationAsset": params.destination_asset,
        "amount": params.amount_out,
        "depositType": "ORIGIN_CHAIN",
        "recipientType": "DESTINATION_CHAIN",
        "refundType": params.refund_type,
        "refundTo": params.refund_to,
        "recipient": params.recipient,
        "deadline": deadline,
    }))
}

pub(crate) fn parse_quote_response(payload: &Value, dry: bool) -> Result<OneClickQuote, ApiError> {
    let quote = payload
        .get("quote")
        .ok_or_else(|| ApiError::unavailable("1Click quote response has no quote object."))?;
    let deposit_address = quote
        .get("depositAddress")
        .and_then(Value::as_str)
        .map(str::to_owned);
    if !dry && deposit_address.as_deref().is_none_or(str::is_empty) {
        return Err(ApiError::unavailable(
            "1Click quote response has no deposit address.",
        ));
    }
    if dry && deposit_address.is_some() {
        return Err(ApiError::unavailable(
            "1Click dry quote unexpectedly returned a deposit address.",
        ));
    }
    Ok(OneClickQuote {
        deposit_address,
        deposit_memo: quote
            .get("depositMemo")
            .and_then(Value::as_str)
            .map(str::to_owned),
        amount_in: digit_string(quote, "amountIn")?,
        min_amount_in: digit_string(quote, "minAmountIn")?,
        amount_out: digit_string(quote, "amountOut")?,
        deadline: quote
            .get("deadline")
            .and_then(Value::as_str)
            .map(str::to_owned),
        time_estimate_seconds: quote
            .get("timeEstimate")
            .and_then(Value::as_i64)
            .unwrap_or_default(),
    })
}

pub(crate) fn parse_status_response(payload: &Value) -> Result<StatusResponse, ApiError> {
    let status = payload
        .get("status")
        .and_then(Value::as_str)
        .and_then(SwapStatus::from_str)
        .ok_or_else(|| ApiError::unavailable("1Click status response has an unknown state."))?;
    let details = payload.get("swapDetails").cloned().unwrap_or(Value::Null);
    let collect_hashes = |field: &str| -> Vec<String> {
        details
            .get(field)
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| {
                        if item.is_string() {
                            item.as_str().map(str::to_owned)
                        } else {
                            item.get("hash").and_then(Value::as_str).map(str::to_owned)
                        }
                    })
                    .collect()
            })
            .unwrap_or_default()
    };
    let amount_out = details
        .get("amountOut")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty() && value.bytes().all(|byte| byte.is_ascii_digit()))
        .map(str::to_owned);
    Ok(StatusResponse {
        status,
        swap_outcome: SwapOutcome {
            near_tx_hashes: collect_hashes("nearTxHashes"),
            destination_tx_hashes: collect_hashes("destinationChainTxHashes"),
            amount_out,
        },
    })
}

fn parse_tokens(payload: &Value) -> Result<Vec<OneClickToken>, ApiError> {
    let items = payload
        .as_array()
        .ok_or_else(|| ApiError::unavailable("1Click token list is not an array."))?;
    let mut tokens = Vec::with_capacity(items.len());
    for item in items {
        let asset_id = item
            .get("assetId")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| {
                ApiError::unavailable("1Click token list has an entry without assetId.")
            })?
            .to_owned();
        let decimals = item.get("decimals").and_then(Value::as_u64).unwrap_or(0);
        if decimals > 255 {
            return Err(ApiError::unavailable(
                "1Click token list has an invalid decimals value.",
            ));
        }
        tokens.push(OneClickToken {
            asset_id,
            decimals: decimals as u8,
            blockchain: item
                .get("blockchain")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned(),
            symbol: item
                .get("symbol")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned(),
            contract_address: item
                .get("contractAddress")
                .and_then(Value::as_str)
                .filter(|value| !value.is_empty())
                .map(str::to_owned),
        });
    }
    if tokens.is_empty() {
        return Err(ApiError::unavailable("1Click token list is empty."));
    }
    Ok(tokens)
}

fn mock_tokens() -> Vec<OneClickToken> {
    let payload: Value =
        serde_json::from_str(MOCK_TOKENS_FIXTURE).expect("mock token fixture is valid JSON");
    parse_tokens(&payload).expect("mock token fixture parses")
}

pub(crate) async fn tokens(state: &AppState) -> Result<Arc<Vec<OneClickToken>>, ApiError> {
    if state.config.oneclick_mode == "mock" {
        return Ok(Arc::new(mock_tokens()));
    }
    let mut cached = state.oneclick_tokens.lock().await;
    if let Some(cached) = cached
        .as_ref()
        .filter(|cached| cached.fetched_at.elapsed().as_secs() < TOKENS_CACHE_TTL_SECONDS)
    {
        return Ok(cached.tokens.clone());
    }
    let url = format!("{}/v0/tokens", state.config.oneclick_base_url);
    let mut request = state
        .http
        .get(url)
        .timeout(std::time::Duration::from_secs(QUOTE_HTTP_TIMEOUT_SECONDS));
    if let Some(api_key) = state.config.oneclick_api_key.as_deref() {
        request = request.header("X-API-Key", api_key);
    }
    let response = request.send().await.map_err(|error| {
        tracing::warn!(%error, "1Click token list fetch failed");
        ApiError::unavailable("1Click token list is temporarily unavailable.")
    })?;
    if !response.status().is_success() {
        tracing::warn!(status = %response.status(), "1Click token list rejected the request");
        return Err(ApiError::unavailable(
            "1Click token list is temporarily unavailable.",
        ));
    }
    let payload: Value = response.json().await.map_err(|error| {
        tracing::warn!(%error, "1Click token list returned invalid JSON");
        ApiError::unavailable("1Click token list returned an invalid response.")
    })?;
    let tokens = Arc::new(parse_tokens(&payload)?);
    *cached = Some(CachedOneClickTokens {
        tokens: tokens.clone(),
        fetched_at: std::time::Instant::now(),
    });
    Ok(tokens)
}

fn auth_header(state: &AppState) -> Option<&str> {
    state.config.oneclick_api_key.as_deref()
}

async fn post_quote(state: &AppState, body: Value) -> Result<Value, ApiError> {
    let url = format!("{}/v0/quote", state.config.oneclick_base_url);
    let mut request = state
        .http
        .post(url)
        .json(&body)
        .timeout(std::time::Duration::from_secs(QUOTE_HTTP_TIMEOUT_SECONDS));
    if let Some(api_key) = auth_header(state) {
        request = request.header("X-API-Key", api_key);
    }
    let response = request.send().await.map_err(|error| {
        tracing::warn!(%error, "1Click quote request failed");
        ApiError::unavailable("1Click quotes are temporarily unavailable.")
    })?;
    let status = response.status();
    let payload: Value = response.json().await.unwrap_or(Value::Null);
    if !status.is_success() {
        let message = payload
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("1Click rejected the quote request.");
        tracing::warn!(status = %status, message, "1Click quote rejected");
        if status.as_u16() == 401 {
            return Err(ApiError::configuration(
                "1Click rejected the quote credentials. Check ONECLICK_API_KEY.",
            ));
        }
        return Err(ApiError::bad_request(format!(
            "1Click rejected the quote: {message}"
        )));
    }
    Ok(payload)
}

pub(crate) async fn live_quote(
    state: &AppState,
    params: &QuoteParams,
    dry: bool,
    deadline_seconds: i64,
) -> Result<OneClickQuote, ApiError> {
    let body = build_quote_request(params, dry, deadline_seconds)?;
    let payload = post_quote(state, body).await?;
    parse_quote_response(&payload, dry)
}

pub(crate) async fn live_status(
    state: &AppState,
    deposit_address: &str,
) -> Result<StatusResponse, ApiError> {
    let url = format!("{}/v0/status", state.config.oneclick_base_url);
    let mut request = state
        .http
        .get(url)
        .query(&[("depositAddress", deposit_address)])
        .timeout(std::time::Duration::from_secs(QUOTE_HTTP_TIMEOUT_SECONDS));
    if let Some(api_key) = auth_header(state) {
        request = request.header("X-API-Key", api_key);
    }
    let response = request.send().await.map_err(|error| {
        tracing::warn!(%error, "1Click status request failed");
        ApiError::unavailable("1Click status is temporarily unavailable.")
    })?;
    if !response.status().is_success() {
        tracing::warn!(status = %response.status(), "1Click status rejected the request");
        return Err(ApiError::unavailable(
            "1Click status is temporarily unavailable.",
        ));
    }
    let payload: Value = response.json().await.map_err(|error| {
        tracing::warn!(%error, "1Click status returned invalid JSON");
        ApiError::unavailable("1Click status returned an invalid response.")
    })?;
    parse_status_response(&payload)
}

pub(crate) async fn submit_deposit_tx(
    state: &AppState,
    deposit_address: &str,
    tx_hash: &str,
) -> Result<StatusResponse, ApiError> {
    let url = format!("{}/v0/deposit/submit", state.config.oneclick_base_url);
    let mut request = state
        .http
        .post(url)
        .json(&json!({"depositAddress": deposit_address, "txHash": tx_hash}))
        .timeout(std::time::Duration::from_secs(QUOTE_HTTP_TIMEOUT_SECONDS));
    if let Some(api_key) = auth_header(state) {
        request = request.header("X-API-Key", api_key);
    }
    let response = request.send().await.map_err(|error| {
        tracing::warn!(%error, "1Click deposit submit failed");
        ApiError::unavailable("1Click deposit submission is temporarily unavailable.")
    })?;
    if !response.status().is_success() {
        tracing::warn!(status = %response.status(), "1Click deposit submit rejected the request");
        return Err(ApiError::unavailable(
            "1Click deposit submission is temporarily unavailable.",
        ));
    }
    let payload: Value = response.json().await.map_err(|error| {
        tracing::warn!(%error, "1Click deposit submit returned invalid JSON");
        ApiError::unavailable("1Click deposit submission returned an invalid response.")
    })?;
    parse_status_response(&payload)
}

const WET_QUOTE_REQUEST_DEADLINE_SECONDS: i64 = 15 * 60;
const MOCK_SETTLE_DELAY_SECONDS: i64 = 15;
const OPEN_ATTEMPT_STATUSES: [&str; 4] = [
    "AWAITING_DEPOSIT",
    "PENDING_DEPOSIT",
    "PROCESSING",
    "INCOMPLETE_DEPOSIT",
];

fn enabled(state: &AppState) -> Result<(), ApiError> {
    if !state.config.oneclick_enabled {
        return Err(ApiError::unavailable(
            "Cross-chain payments are not enabled on this deployment.",
        ));
    }
    Ok(())
}

fn simulated(state: &AppState) -> bool {
    state.config.oneclick_enabled && state.config.oneclick_mode == "mock"
}

fn parse_payload_asset(payload: &Value) -> Result<AssetDto, ApiError> {
    serde_json::from_value(payload.clone())
        .map_err(|_| ApiError::unavailable("Payment link asset is invalid."))
}

fn resolve_destination_asset<'a>(
    tokens: &'a [OneClickToken],
    asset: &AssetDto,
) -> Result<&'a str, ApiError> {
    match asset {
        AssetDto::Native { .. } => Err(ApiError::bad_request(
            "Native NEAR receive links cannot accept cross-chain payments. Use a NEP-141 receive token.",
        )),
        AssetDto::Nep141 { contract_id, .. } => tokens
            .iter()
            .find(|token| {
                token.asset_id.starts_with("nep141:")
                    && token.contract_address.as_deref() == Some(contract_id.as_str())
            })
            .map(|token| token.asset_id.as_str())
            .ok_or_else(|| ApiError::bad_request(
                "The merchant's receive token is not in the 1Click token list, so it cannot receive cross-chain payments.",
            )),
    }
}

fn origin_token<'a>(
    tokens: &'a [OneClickToken],
    origin_asset: &str,
) -> Result<&'a OneClickToken, ApiError> {
    tokens
        .iter()
        .find(|token| token.asset_id == origin_asset)
        .ok_or_else(|| ApiError::bad_request(
            "The selected token is not in the 1Click token list. Refresh the token picker and choose again.",
        ))
}

fn mock_amount_in(
    origin_decimals: u8,
    destination_decimals: u8,
    amount_out: &str,
    slippage_bps: u32,
) -> Result<String, ApiError> {
    let amount: u128 = amount_out.parse().map_err(|_| ApiError::internal())?;
    let mut amount_in = if origin_decimals >= destination_decimals {
        amount
            .checked_mul(10u128.pow(u32::from(origin_decimals - destination_decimals)))
            .ok_or_else(|| ApiError::bad_request("The payment amount is too large."))?
    } else {
        amount / 10u128.pow(u32::from(destination_decimals - origin_decimals))
    };
    amount_in = amount_in.saturating_add(
        amount_in
            .saturating_mul(u128::from(slippage_bps))
            .saturating_div(10_000),
    );
    if amount_in == 0 {
        return Err(ApiError::bad_request(
            "The payment amount is too small to swap.",
        ));
    }
    Ok(amount_in.to_string())
}

fn mock_deposit_address() -> String {
    let mut hex = String::with_capacity(42);
    hex.push_str("0x");
    while hex.len() < 42 {
        hex.push_str(&Uuid::new_v4().simple().to_string());
    }
    hex.truncate(42);
    hex
}

struct LinkContext {
    slug: String,
    merchant_id: String,
    payout_account_id: String,
    network_id: NetworkId,
    asset: AssetDto,
    amount: String,
    max_redemptions: Option<i32>,
    claims_used: i32,
}

async fn load_active_link(state: &AppState, slug: &str) -> Result<LinkContext, ApiError> {
    let row = sqlx::query(
        "SELECT l.slug, l.merchant_id, l.network_id, l.asset, l.amount, l.expires_at, l.max_redemptions, l.claims_used, m.payout_account_id \
         FROM payment_links l JOIN merchants m USING (merchant_id) WHERE l.slug=? AND l.active",
    )
    .bind(slug)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::not_found("Payment link not found."))?;
    let expires_at: Option<chrono::DateTime<Utc>> = row.try_get("expires_at")?;
    if expires_at.is_some_and(|time| time <= Utc::now()) {
        return Err(ApiError::not_found("Payment link has expired."));
    }
    let network_raw: String = row.try_get("network_id")?;
    let network_id = match network_raw.as_str() {
        "testnet" => NetworkId::Testnet,
        "mainnet" => NetworkId::Mainnet,
        _ => return Err(ApiError::internal()),
    };
    let asset_value: Value = row.try_get("asset")?;
    Ok(LinkContext {
        slug: row.try_get("slug")?,
        merchant_id: row.try_get("merchant_id")?,
        payout_account_id: row.try_get("payout_account_id")?,
        network_id,
        asset: parse_payload_asset(&asset_value)?,
        amount: row.try_get("amount")?,
        max_redemptions: row.try_get("max_redemptions")?,
        claims_used: row.try_get("claims_used")?,
    })
}

fn link_accepts_new_payments(link: &LinkContext) -> Result<(), ApiError> {
    if let Some(max_redemptions) = link.max_redemptions {
        if link.claims_used >= max_redemptions {
            return Err(ApiError::conflict(
                "This payment link has already been paid the maximum number of times.",
            ));
        }
    }
    Ok(())
}

fn require_live_mode_network(state: &AppState, link: &LinkContext) -> Result<(), ApiError> {
    if state.config.oneclick_mode == "live" && link.network_id != NetworkId::Mainnet {
        return Err(ApiError::bad_request(
            "Cross-chain payments are available on NEAR mainnet only.",
        ));
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DryQuoteInput {
    origin_asset: String,
    refund_to: String,
    slippage_bps: Option<u32>,
}

pub async fn tokens_handler(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    enabled(&state)?;
    let tokens = tokens(&state).await?;
    let items: Vec<Value> = tokens
        .iter()
        .map(|token| {
            json!({
                "assetId": token.asset_id,
                "blockchain": token.blockchain,
                "symbol": token.symbol,
                "decimals": token.decimals,
                "contractAddress": token.contract_address,
            })
        })
        .collect();
    Ok(Json(json!({
        "mode": state.config.oneclick_mode,
        "tokens": items,
    })))
}

pub async fn quote(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    Json(input): Json<DryQuoteInput>,
) -> Result<Json<Value>, ApiError> {
    enabled(&state)?;
    let link = load_active_link(&state, &slug).await?;
    link_accepts_new_payments(&link)?;
    require_live_mode_network(&state, &link)?;
    let tokens = tokens(&state).await?;
    let destination_asset = resolve_destination_asset(&tokens, &link.asset)?.to_owned();
    let origin = origin_token(&tokens, input.origin_asset.trim())?;
    let params = QuoteParams {
        origin_asset: origin.asset_id.clone(),
        destination_asset,
        amount_out: link.amount.clone(),
        recipient: link.payout_account_id.clone(),
        refund_to: input.refund_to.trim().to_owned(),
        refund_type: "ORIGIN_CHAIN",
        slippage_bps: input.slippage_bps.unwrap_or(DEFAULT_SLIPPAGE_BPS),
    };
    let quote = if simulated(&state) {
        let amount_in = mock_amount_in(
            origin.decimals,
            token_decimals(&tokens, &link.asset)?,
            &link.amount,
            params.slippage_bps,
        )?;
        let min_amount_in = amount_in.clone();
        OneClickQuote {
            deposit_address: None,
            deposit_memo: None,
            amount_in,
            min_amount_in,
            amount_out: link.amount.clone(),
            deadline: None,
            time_estimate_seconds: MOCK_SETTLE_DELAY_SECONDS,
        }
    } else {
        live_quote(
            &state,
            &params,
            true,
            Utc::now().timestamp() + WET_QUOTE_REQUEST_DEADLINE_SECONDS,
        )
        .await?
    };
    Ok(Json(json!({
        "amountIn": quote.amount_in,
        "minAmountIn": quote.min_amount_in,
        "amountOut": quote.amount_out,
        "originDecimals": origin.decimals,
        "timeEstimateSeconds": quote.time_estimate_seconds,
        "expiresAtSeconds": Utc::now().timestamp() + WET_QUOTE_REQUEST_DEADLINE_SECONDS,
        "simulated": simulated(&state),
    })))
}

fn token_decimals(tokens: &[OneClickToken], asset: &AssetDto) -> Result<u8, ApiError> {
    let AssetDto::Nep141 { contract_id, .. } = asset else {
        return Err(ApiError::bad_request(
            "Native NEAR receive links cannot accept cross-chain payments. Use a NEP-141 receive token.",
        ));
    };
    Ok(tokens
        .iter()
        .find(|token| {
            token.asset_id.starts_with("nep141:")
                && token.contract_address.as_deref() == Some(contract_id.as_str())
        })
        .map(|token| token.decimals)
        .unwrap_or(asset_token_decimals(asset)))
}

fn asset_token_decimals(asset: &AssetDto) -> u8 {
    match asset {
        AssetDto::Native { decimals, .. } => *decimals,
        AssetDto::Nep141 { decimals, .. } => *decimals,
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttemptInput {
    origin_asset: String,
    refund_to: String,
    slippage_bps: Option<u32>,
    customer_name: Option<String>,
}

pub async fn create_attempt(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    Json(input): Json<AttemptInput>,
) -> Result<(axum::http::StatusCode, Json<Value>), ApiError> {
    enabled(&state)?;
    let link = load_active_link(&state, &slug).await?;
    link_accepts_new_payments(&link)?;
    require_live_mode_network(&state, &link)?;
    let network = state.config.network(link.network_id);
    let contract_id = network.router_id.clone().ok_or_else(|| {
        ApiError::unavailable("Cross-chain payments are unavailable on this network.")
    })?;
    let tokens = tokens(&state).await?;
    let destination_asset = resolve_destination_asset(&tokens, &link.asset)?.to_owned();
    let origin = origin_token(&tokens, input.origin_asset.trim())?;
    let slippage_bps = input.slippage_bps.unwrap_or(DEFAULT_SLIPPAGE_BPS);
    let refund_to = input.refund_to.trim().to_owned();
    if refund_to.is_empty() || refund_to.len() > 255 {
        return Err(ApiError::bad_request(
            "A connected wallet address is required for cross-chain payments.",
        ));
    }
    let params = QuoteParams {
        origin_asset: origin.asset_id.clone(),
        destination_asset: destination_asset.clone(),
        amount_out: link.amount.clone(),
        recipient: link.payout_account_id.clone(),
        refund_to: refund_to.clone(),
        refund_type: "ORIGIN_CHAIN",
        slippage_bps,
    };
    let wet = if simulated(&state) {
        let amount_in = mock_amount_in(
            origin.decimals,
            token_decimals(&tokens, &link.asset)?,
            &link.amount,
            slippage_bps,
        )?;
        let deadline = Utc::now() + chrono::Duration::seconds(QUOTE_TTL_SECONDS);
        OneClickQuote {
            deposit_address: Some(mock_deposit_address()),
            deposit_memo: None,
            min_amount_in: amount_in.clone(),
            amount_in,
            amount_out: link.amount.clone(),
            deadline: Some(deadline.to_rfc3339()),
            time_estimate_seconds: MOCK_SETTLE_DELAY_SECONDS,
        }
    } else {
        live_quote(
            &state,
            &params,
            false,
            Utc::now().timestamp() + WET_QUOTE_REQUEST_DEADLINE_SECONDS,
        )
        .await?
    };
    let Some(deposit_address) = wet.deposit_address.clone() else {
        return Err(ApiError::unavailable(
            "1Click did not return a deposit address for the swap.",
        ));
    };
    let deadline_seconds = wet
        .deadline
        .as_deref()
        .and_then(|value| chrono::DateTime::parse_from_rfc3339(value).ok())
        .map(|time| time.timestamp())
        .ok_or_else(|| ApiError::unavailable("1Click quote has no deadline."))?;
    let attempt_id = format!("oc_{}", Uuid::new_v4().simple());
    let order_id = format!("ord_{}", Uuid::new_v4().simple());
    let order_key = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    let customer_name = input
        .customer_name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned);
    let mut tx = state.pool.begin().await?;
    sqlx::query(
        "INSERT INTO orders (order_id, merchant_id, payer_account_id, network_id, contract_id, order_key, \"authorization\", asset, amount, fee, net, source, link_slug, customer_name, pay_method) \
         VALUES (?,?,?,?,?,?,?,?,?, '0', ?, '1click', ?, ?, 'cross_chain')",
    )
    .bind(&order_id)
    .bind(&link.merchant_id)
    .bind(&refund_to)
    .bind(link.network_id.as_str())
    .bind(&contract_id)
    .bind(&order_key)
    .bind(serde_json::to_value(&link.asset).map_err(|_| ApiError::internal())?)
    .bind(&link.amount)
    .bind(&link.amount)
    .bind(&link.slug)
    .bind(&customer_name)
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        "INSERT INTO one_click_attempts (attempt_id, network_id, contract_id, order_id, merchant_id, link_slug, origin_asset, destination_asset, amount_out, amount_in, slippage_bps, refund_to, refund_chain, deposit_address, deposit_memo, deadline, status) \
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,to_timestamp(?),'AWAITING_DEPOSIT')",
    )
    .bind(&attempt_id)
    .bind(link.network_id.as_str())
    .bind(&contract_id)
    .bind(&order_id)
    .bind(&link.merchant_id)
    .bind(&link.slug)
    .bind(&origin.asset_id)
    .bind(&destination_asset)
    .bind(&link.amount)
    .bind(&wet.amount_in)
    .bind(i64::from(slippage_bps))
    .bind(&refund_to)
    .bind(&origin.blockchain)
    .bind(&deposit_address)
    .bind(&wet.deposit_memo)
    .bind(deadline_seconds)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok((
        axum::http::StatusCode::CREATED,
        Json(json!({
            "attemptId": attempt_id,
            "orderId": order_id,
            "merchantId": link.merchant_id,
            "amountIn": wet.amount_in,
            "minAmountIn": wet.min_amount_in,
            "depositAddress": deposit_address,
            "depositMemo": wet.deposit_memo,
            "deadlineSeconds": deadline_seconds,
            "originDecimals": origin.decimals,
            "simulated": simulated(&state),
        })),
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DepositInput {
    tx_hash: String,
}

pub async fn submit_deposit(
    State(state): State<AppState>,
    Path(attempt_id): Path<String>,
    Json(input): Json<DepositInput>,
) -> Result<Json<Value>, ApiError> {
    enabled(&state)?;
    let tx_hash = input.tx_hash.trim();
    if tx_hash.is_empty() || tx_hash.len() > 255 {
        return Err(ApiError::bad_request(
            "A deposit transaction hash is required.",
        ));
    }
    let mut tx = state.pool.begin().await?;
    let attempt = sqlx::query(
        "SELECT attempt_id, deposit_address, deposit_memo, status, deadline FROM one_click_attempts WHERE attempt_id=? FOR UPDATE",
    )
    .bind(&attempt_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| ApiError::not_found("Cross-chain payment attempt not found."))?;
    let status: String = attempt.try_get("status")?;
    if !OPEN_ATTEMPT_STATUSES.contains(&status.as_str()) {
        return Err(ApiError::conflict(
            "This cross-chain payment attempt is already closed. Start a new payment.",
        ));
    }
    let deadline: chrono::DateTime<Utc> = attempt.try_get("deadline")?;
    if deadline <= Utc::now() {
        sqlx::query("UPDATE one_click_attempts SET status='EXPIRED', updated_at=UTC_TIMESTAMP(6) WHERE attempt_id=?")
            .bind(&attempt_id)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        return Err(ApiError::conflict(
            "The swap quote expired. Start a new payment to get a fresh deposit address.",
        ));
    }
    sqlx::query("UPDATE one_click_attempts SET tx_hash=?, status='PENDING_DEPOSIT', updated_at=UTC_TIMESTAMP(6) WHERE attempt_id=?")
        .bind(tx_hash)
        .bind(&attempt_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    let deposit_address: String = attempt.try_get("deposit_address")?;
    if !simulated(&state) {
        let response = submit_deposit_tx(&state, &deposit_address, tx_hash).await?;
        tracing::info!(
            attempt_id,
            provider_status = response.status.as_str(),
            "1Click deposit submitted"
        );
    }
    let (attempt_status, order_state) = read_attempt_state(&state, &attempt_id).await?;
    Ok(Json(json!({
        "attemptId": attempt_id,
        "status": attempt_status,
        "orderState": order_state,
        "simulated": simulated(&state),
    })))
}

pub async fn attempt_status(
    State(state): State<AppState>,
    Path(attempt_id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    enabled(&state)?;
    let (attempt_status, order_state, tx_hash, failure_reason) =
        read_attempt_detail(&state, &attempt_id).await?;
    Ok(Json(json!({
        "attemptId": attempt_id,
        "status": attempt_status,
        "orderState": order_state,
        "txHash": tx_hash,
        "failureReason": failure_reason,
        "simulated": simulated(&state),
    })))
}

async fn read_attempt_state(
    state: &AppState,
    attempt_id: &str,
) -> Result<(String, Option<String>), ApiError> {
    let detail = read_attempt_detail(state, attempt_id).await?;
    Ok((detail.0, detail.1))
}

async fn read_attempt_detail(
    state: &AppState,
    attempt_id: &str,
) -> Result<(String, Option<String>, Option<String>, Option<String>), ApiError> {
    let row = sqlx::query(
        "SELECT a.status, a.tx_hash, a.failure_reason, o.state AS order_state \
         FROM one_click_attempts a JOIN orders o ON o.network_id=a.network_id AND o.contract_id=a.contract_id AND o.order_id=a.order_id \
         WHERE a.attempt_id=?",
    )
    .bind(attempt_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::not_found("Cross-chain payment attempt not found."))?;
    Ok((
        row.try_get("status")?,
        row.try_get("order_state")?,
        row.try_get("tx_hash")?,
        row.try_get("failure_reason")?,
    ))
}

pub fn spawn_oneclick_worker(state: AppState) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(5));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        let mut backoff = crate::workers::Backoff::default();
        loop {
            interval.tick().await;
            match worker_tick(&state).await {
                Ok(_) => backoff.reset(),
                Err(error) => {
                    tracing::warn!(%error, "1Click worker tick failed");
                    backoff.failed("oneclick").await;
                }
            }
        }
    });
}

async fn worker_tick(state: &AppState) -> Result<usize, ApiError> {
    if !state.config.oneclick_enabled {
        return Ok(0);
    }
    let rows = sqlx::query(
        "SELECT a.attempt_id, a.network_id, a.contract_id, a.order_id, a.merchant_id, a.destination_asset, a.amount_out, a.deposit_address, a.tx_hash, a.deadline, a.status, a.updated_at \
         FROM one_click_attempts a \
         WHERE a.status IN ('AWAITING_DEPOSIT','PENDING_DEPOSIT','PROCESSING','INCOMPLETE_DEPOSIT') \
         ORDER BY a.created_at LIMIT 25",
    )
    .fetch_all(&state.pool)
    .await?;
    let mut processed = 0usize;
    for row in rows {
        if let Err(error) = refresh_attempt(state, &row).await {
            let attempt_id: String = row.try_get("attempt_id")?;
            tracing::warn!(%attempt_id, %error, "1Click attempt refresh failed");
        } else {
            processed += 1;
        }
    }
    Ok(processed)
}

async fn refresh_attempt(state: &AppState, row: &sqlx::postgres::PgRow) -> Result<(), ApiError> {
    let attempt_id: String = row.try_get("attempt_id")?;
    let status: String = row.try_get("status")?;
    let deadline: chrono::DateTime<Utc> = row.try_get("deadline")?;
    if deadline <= Utc::now() && status != "AWAITING_DEPOSIT" {
        return close_attempt(state, &attempt_id, "INCOMPLETE_DEPOSIT").await;
    }
    if deadline <= Utc::now() {
        return close_attempt(state, &attempt_id, "EXPIRED").await;
    }
    if status == "AWAITING_DEPOSIT" {
        return Ok(());
    }
    if simulated(state) {
        return mock_refresh(state, row).await;
    }
    let deposit_address: String = row.try_get("deposit_address")?;
    let response = live_status(state, &deposit_address).await?;
    match response.status {
        SwapStatus::Success => settle_success(state, row, &response.swap_outcome).await,
        SwapStatus::KnownDepositTx | SwapStatus::PendingDeposit => {
            set_attempt_status(state, &attempt_id, "PENDING_DEPOSIT").await
        }
        SwapStatus::Processing => set_attempt_status(state, &attempt_id, "PROCESSING").await,
        SwapStatus::IncompleteDeposit => {
            set_attempt_status(state, &attempt_id, "INCOMPLETE_DEPOSIT").await
        }
        SwapStatus::Refunded => close_attempt(state, &attempt_id, "REFUNDED").await,
        SwapStatus::Failed => close_attempt(state, &attempt_id, "FAILED").await,
    }
}

fn mock_outcome(state: &AppState) -> SwapStatus {
    match state.config.oneclick_mock_outcome.as_deref() {
        Some("refunded") => SwapStatus::Refunded,
        Some("failed") => SwapStatus::Failed,
        Some("incomplete_deposit") => SwapStatus::IncompleteDeposit,
        _ => SwapStatus::Success,
    }
}

fn synthetic_near_hash(seed: &str) -> String {
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(seed.as_bytes());
    bs58::encode(digest).into_string()
}

async fn mock_refresh(state: &AppState, row: &sqlx::postgres::PgRow) -> Result<(), ApiError> {
    let attempt_id: String = row.try_get("attempt_id")?;
    let updated_at: chrono::DateTime<Utc> = row.try_get("updated_at")?;
    let elapsed = (Utc::now() - updated_at).num_seconds();
    if elapsed < MOCK_SETTLE_DELAY_SECONDS {
        return set_attempt_status(state, &attempt_id, "PROCESSING").await;
    }
    match mock_outcome(state) {
        SwapStatus::Success => {
            let outcome = SwapOutcome {
                near_tx_hashes: vec![synthetic_near_hash(&attempt_id)],
                destination_tx_hashes: vec![],
                amount_out: Some(row.try_get::<String, _>("amount_out").unwrap_or_default()),
            };
            settle_success(state, row, &outcome).await
        }
        SwapStatus::Refunded => close_attempt(state, &attempt_id, "REFUNDED").await,
        SwapStatus::Failed => close_attempt(state, &attempt_id, "FAILED").await,
        SwapStatus::IncompleteDeposit => {
            set_attempt_status(state, &attempt_id, "INCOMPLETE_DEPOSIT").await
        }
        _ => set_attempt_status(state, &attempt_id, "PROCESSING").await,
    }
}

async fn set_attempt_status(
    state: &AppState,
    attempt_id: &str,
    status: &str,
) -> Result<(), ApiError> {
    sqlx::query("UPDATE one_click_attempts SET status=?, updated_at=UTC_TIMESTAMP(6) WHERE attempt_id=? AND status IN ('AWAITING_DEPOSIT','PENDING_DEPOSIT','PROCESSING','INCOMPLETE_DEPOSIT')")
        .bind(status)
        .bind(attempt_id)
        .execute(&state.pool)
        .await?;
    Ok(())
}

async fn close_attempt(state: &AppState, attempt_id: &str, status: &str) -> Result<(), ApiError> {
    sqlx::query("UPDATE one_click_attempts SET status=?, updated_at=UTC_TIMESTAMP(6) WHERE attempt_id=? AND status IN ('AWAITING_DEPOSIT','PENDING_DEPOSIT','PROCESSING','INCOMPLETE_DEPOSIT')")
        .bind(status)
        .bind(attempt_id)
        .execute(&state.pool)
        .await?;
    Ok(())
}

fn receipt_succeeded(outcome: &Value) -> bool {
    matches!(
        outcome.get("status").and_then(Value::as_str),
        Some("SuccessValue") | Some("SuccessReceiptId")
    )
}

pub(crate) fn find_verified_transfer(
    receipts: &Value,
    token_contract: &str,
    payout_account: &str,
    expected_amount: &str,
) -> Option<(String, usize)> {
    let expected: u128 = if expected_amount.is_empty()
        || !expected_amount.bytes().all(|byte| byte.is_ascii_digit())
    {
        return None;
    } else {
        expected_amount.parse().ok()?
    };
    for receipt in receipts
        .get("receipts_outcome")
        .and_then(Value::as_array)
        .unwrap_or(&Vec::new())
    {
        let outcome = receipt.get("outcome").unwrap_or(&Value::Null);
        if outcome.get("executor_id").and_then(Value::as_str) != Some(token_contract)
            || !receipt_succeeded(outcome)
        {
            continue;
        }
        let receipt_id = receipt
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default();
        for (log_index, log) in outcome
            .get("logs")
            .and_then(Value::as_array)
            .unwrap_or(&Vec::new())
            .iter()
            .enumerate()
        {
            let Some(event) = log
                .as_str()
                .and_then(|line| line.strip_prefix("EVENT_JSON:"))
                .and_then(|line| serde_json::from_str::<Value>(line).ok())
            else {
                continue;
            };
            if event.get("standard").and_then(Value::as_str) != Some("nep141")
                || event.get("event").and_then(Value::as_str) != Some("ft_transfer")
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
            let transferred = data.get("amount").and_then(Value::as_str).unwrap_or("");
            if data.get("new_owner_id").and_then(Value::as_str) != Some(payout_account)
                || transferred.is_empty()
                || !transferred.bytes().all(|byte| byte.is_ascii_digit())
            {
                continue;
            }
            let transferred: u128 = transferred.parse().unwrap_or(0);
            if transferred >= expected {
                return Some((receipt_id.to_owned(), log_index));
            }
        }
    }
    None
}

async fn settle_success(
    state: &AppState,
    row: &sqlx::postgres::PgRow,
    outcome: &SwapOutcome,
) -> Result<(), ApiError> {
    let attempt_id: String = row.try_get("attempt_id")?;
    let claimed = sqlx::query("UPDATE one_click_attempts SET status='PROCESSING', updated_at=UTC_TIMESTAMP(6) WHERE attempt_id=? AND status IN ('PENDING_DEPOSIT','PROCESSING','INCOMPLETE_DEPOSIT')")
        .bind(&attempt_id)
        .execute(&state.pool)
        .await?;
    if claimed.rows_affected() == 0 {
        return Ok(());
    }
    let network_raw: String = row.try_get("network_id")?;
    let network_id = match network_raw.as_str() {
        "testnet" => NetworkId::Testnet,
        "mainnet" => NetworkId::Mainnet,
        _ => return Err(ApiError::internal()),
    };
    let contract_id: String = row.try_get("contract_id")?;
    let order_id: String = row.try_get("order_id")?;
    let merchant_id: String = row.try_get("merchant_id")?;
    let amount_out: String = row.try_get("amount_out")?;
    let expected: u128 = amount_out.parse().unwrap_or(0);
    if let Some(reported) = outcome
        .amount_out
        .as_deref()
        .and_then(|value| value.parse::<u128>().ok())
    {
        if reported < expected {
            tracing::warn!(
                %attempt_id,
                reported,
                expected,
                "1Click reported less than the quoted amount out; refusing to settle"
            );
            return Ok(());
        }
    }
    let destination_asset: String = row.try_get("destination_asset")?;
    let token_contract = destination_asset
        .strip_prefix("nep141:")
        .unwrap_or(&destination_asset)
        .to_owned();
    let payout_account: String =
        sqlx::query("SELECT payout_account_id FROM merchants WHERE merchant_id=?")
            .bind(&merchant_id)
            .fetch_one(&state.pool)
            .await?
            .try_get("payout_account_id")?;
    let verified = if simulated(state) {
        let receipt = synthetic_near_hash(&format!("{attempt_id}:receipt"));
        let hash = synthetic_near_hash(&attempt_id);
        Some((receipt, 0usize, hash))
    } else {
        let mut verified = None;
        let mut hashes = outcome.near_tx_hashes.clone();
        hashes.extend(outcome.destination_tx_hashes.clone());
        for hash in &hashes {
            let Ok(status) =
                near_rpc::transaction_status(state, network_id, hash, &token_contract).await
            else {
                continue;
            };
            if let Some(found) =
                find_verified_transfer(&status, &token_contract, &payout_account, &amount_out)
            {
                verified = Some((found.0, found.1, hash.clone()));
                break;
            }
        }
        verified
    };
    let Some((receipt_id, log_index, near_tx_hash)) = verified else {
        tracing::warn!(
            %attempt_id,
            "1Click reports SUCCESS but no verified NEAR transfer to the merchant was found; will retry"
        );
        return Ok(());
    };
    let order_row =
        sqlx::query("SELECT * FROM orders WHERE network_id=? AND contract_id=? AND order_id=?")
            .bind(network_id.as_str())
            .bind(&contract_id)
            .bind(&order_id)
            .fetch_one(&state.pool)
            .await?;
    let payer: String = order_row.try_get("payer_account_id")?;
    let receipt = crate::orders::SettlementReceipt {
        transaction_hash: &near_tx_hash,
        receipt_id: &receipt_id,
        log_index,
        payout_account_id: &payout_account,
    };
    crate::orders::finalize_settlement(
        state,
        &order_row,
        network_id,
        &contract_id,
        &order_id,
        &merchant_id,
        &payer,
        receipt,
    )
    .await?;
    let order_state: String =
        sqlx::query("SELECT state FROM orders WHERE network_id=? AND contract_id=? AND order_id=?")
            .bind(network_id.as_str())
            .bind(&contract_id)
            .bind(&order_id)
            .fetch_one(&state.pool)
            .await?
            .try_get("state")?;
    let attempt_status = if order_state == "SETTLED" {
        "SETTLED"
    } else {
        "RECONCILIATION_REQUIRED"
    };
    sqlx::query(
        "UPDATE one_click_attempts SET status=?, updated_at=UTC_TIMESTAMP(6) WHERE attempt_id=?",
    )
    .bind(attempt_status)
    .bind(&attempt_id)
    .execute(&state.pool)
    .await?;
    Ok(())
}

#[cfg(test)]
pub(crate) mod test_hooks {
    use super::*;

    pub(crate) async fn settle_success_for_test(
        state: &AppState,
        row: &sqlx::postgres::PgRow,
        outcome: &SwapOutcome,
    ) -> Result<(), ApiError> {
        settle_success(state, row, outcome).await
    }

    pub(crate) async fn worker_tick_for_test(state: &AppState) -> Result<usize, ApiError> {
        worker_tick(state).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quote_request_uses_exact_output_and_integer_amounts() {
        let params = QuoteParams {
            origin_asset: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near"
                .to_owned(),
            destination_asset: "nep141:wrap.near".to_owned(),
            amount_out: "1000000".to_owned(),
            recipient: "merchant.near".to_owned(),
            refund_to: "0x2527d02599ba641c19fea793cd0f167589a0f10d".to_owned(),
            refund_type: "ORIGIN_CHAIN",
            slippage_bps: 100,
        };
        let body = build_quote_request(&params, true, 1_800_000_000).unwrap();
        assert_eq!(body["swapType"], "EXACT_OUTPUT");
        assert_eq!(body["dry"], true);
        assert_eq!(body["amount"], "1000000");
        assert_eq!(body["recipient"], "merchant.near");
        assert_eq!(
            body["refundTo"],
            "0x2527d02599ba641c19fea793cd0f167589a0f10d"
        );
        assert_eq!(body["refundType"], "ORIGIN_CHAIN");
        assert_eq!(body["slippageTolerance"], 100);
        assert_eq!(body["depositType"], "ORIGIN_CHAIN");
        assert_eq!(body["recipientType"], "DESTINATION_CHAIN");
        chrono::DateTime::parse_from_rfc3339(body["deadline"].as_str().unwrap()).unwrap();
        let wet = build_quote_request(&params, false, 1_800_000_000).unwrap();
        assert_eq!(wet["dry"], false);
    }

    #[test]
    fn quote_request_rejects_invalid_amounts_and_parameters() {
        let base = QuoteParams {
            origin_asset: "nep141:wrap.near".to_owned(),
            destination_asset: "nep141:wrap.near".to_owned(),
            amount_out: "1000000".to_owned(),
            recipient: "merchant.near".to_owned(),
            refund_to: "0xabc".to_owned(),
            refund_type: "ORIGIN_CHAIN",
            slippage_bps: DEFAULT_SLIPPAGE_BPS,
        };
        assert!(build_quote_request(
            &QuoteParams {
                amount_out: "1.5".to_owned(),
                ..base.clone()
            },
            true,
            0
        )
        .is_err());
        assert!(build_quote_request(
            &QuoteParams {
                amount_out: "1e6".to_owned(),
                ..base.clone()
            },
            true,
            0
        )
        .is_err());
        assert!(build_quote_request(
            &QuoteParams {
                amount_out: "".to_owned(),
                ..base.clone()
            },
            true,
            0
        )
        .is_err());
        assert!(build_quote_request(
            &QuoteParams {
                origin_asset: "".to_owned(),
                ..base.clone()
            },
            true,
            0
        )
        .is_err());
        assert!(build_quote_request(
            &QuoteParams {
                recipient: "".to_owned(),
                ..base.clone()
            },
            true,
            0
        )
        .is_err());
        assert!(build_quote_request(
            &QuoteParams {
                refund_to: "".to_owned(),
                ..base.clone()
            },
            true,
            0
        )
        .is_err());
        assert!(build_quote_request(
            &QuoteParams {
                slippage_bps: MAX_SLIPPAGE_BPS + 1,
                ..base
            },
            true,
            0
        )
        .is_err());
    }

    #[test]
    fn wet_quotes_require_a_deposit_address_and_dry_quotes_forbid_one() {
        let payload = json!({
            "quote": {
                "depositAddress": "0x76b4c56085ED136a8744D52bE956396624a730E8",
                "depositMemo": null,
                "amountIn": "1050000",
                "minAmountIn": "1000000",
                "amountOut": "9950000",
                "deadline": "2026-11-10T10:30:00Z",
                "timeEstimate": 120
            }
        });
        let wet = parse_quote_response(&payload, false).unwrap();
        assert_eq!(
            wet.deposit_address.as_deref(),
            Some("0x76b4c56085ED136a8744D52bE956396624a730E8")
        );
        assert_eq!(wet.amount_in, "1050000");
        assert_eq!(wet.deadline.as_deref(), Some("2026-11-10T10:30:00Z"));
        assert!(parse_quote_response(&payload, true).is_err());
        let dry_payload = json!({
            "quote": {
                "amountIn": "1050000",
                "minAmountIn": "1000000",
                "amountOut": "9950000",
                "timeEstimate": 120
            }
        });
        let dry = parse_quote_response(&dry_payload, true).unwrap();
        assert!(dry.deposit_address.is_none());
        assert!(dry.deadline.is_none());
        assert!(parse_quote_response(&dry_payload, false).is_err());
    }

    #[test]
    fn quote_parsing_rejects_non_integer_amounts() {
        let payload = json!({
            "quote": {
                "amountIn": "1.05",
                "minAmountIn": "1000000",
                "amountOut": "9950000"
            }
        });
        assert!(parse_quote_response(&payload, true).is_err());
    }

    #[test]
    fn status_parsing_maps_known_states_and_hash_shapes() {
        let payload = json!({
            "status": "SUCCESS",
            "swapDetails": {
                "nearTxHashes": ["abc123"],
                "destinationChainTxHashes": [
                    {"hash": "0xdef456", "explorerUrl": "https://explorer.test/tx/0xdef456"}
                ],
                "amountOut": "9950000"
            }
        });
        let parsed = parse_status_response(&payload).unwrap();
        assert_eq!(parsed.status, SwapStatus::Success);
        assert_eq!(parsed.swap_outcome.near_tx_hashes, vec!["abc123"]);
        assert_eq!(parsed.swap_outcome.destination_tx_hashes, vec!["0xdef456"]);
        assert_eq!(parsed.swap_outcome.amount_out.as_deref(), Some("9950000"));
        for (raw, expected) in [
            ("PENDING_DEPOSIT", SwapStatus::PendingDeposit),
            ("INCOMPLETE_DEPOSIT", SwapStatus::IncompleteDeposit),
            ("PROCESSING", SwapStatus::Processing),
            ("REFUNDED", SwapStatus::Refunded),
            ("FAILED", SwapStatus::Failed),
            ("KNOWN_DEPOSIT_TX", SwapStatus::KnownDepositTx),
        ] {
            assert_eq!(
                parse_status_response(&json!({"status": raw}))
                    .unwrap()
                    .status,
                expected
            );
        }
        assert!(parse_status_response(&json!({"status": "MYSTERY"})).is_err());
        assert!(parse_status_response(&json!({})).is_err());
        assert!(SwapStatus::Success == SwapStatus::Success);
        assert_eq!(SwapStatus::Refunded.as_str(), "REFUNDED");
    }

    #[test]
    fn status_parsing_ignores_malformed_amount_out() {
        let payload = json!({
            "status": "PROCESSING",
            "swapDetails": { "amountOut": "12.5" }
        });
        let parsed = parse_status_response(&payload).unwrap();
        assert_eq!(parsed.swap_outcome.amount_out, None);
    }

    #[test]
    fn token_list_parsing_extracts_contract_addresses() {
        let tokens = mock_tokens();
        assert!(tokens.len() >= 8);
        let usdc = tokens
            .iter()
            .find(|token| token.blockchain == "arb" && token.symbol == "USDC")
            .unwrap();
        assert_eq!(
            usdc.asset_id,
            "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near"
        );
        assert_eq!(usdc.decimals, 6);
        assert_eq!(
            usdc.contract_address.as_deref(),
            Some("0xaf88d065e77c8cc2239327c5edb3a432268e5831")
        );
        assert!(tokens.iter().any(|token| token.blockchain == "near"));
        assert!(tokens.iter().any(|token| token.blockchain == "sol"));
        assert!(tokens.iter().any(|token| token.blockchain == "btc"));
        assert!(parse_tokens(&json!({"not": "an array"})).is_err());
        assert!(parse_tokens(&json!([])).is_err());
        assert!(parse_tokens(&json!([{"assetId": "x", "decimals": 300}])).is_err());
    }

    #[test]
    fn destination_assets_resolves_near_nep141_tokens_and_rejects_the_rest() {
        let tokens = mock_tokens();
        let usdc = AssetDto::Nep141 {
            contract_id: "0xaf88d065e77c8cc2239327c5edb3a432268e5831".to_owned(),
            symbol: "USDC".to_owned(),
            decimals: 6,
        };
        assert_eq!(
            resolve_destination_asset(&tokens, &usdc).unwrap(),
            "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near"
        );
        let unknown = AssetDto::Nep141 {
            contract_id: "usdc.fakes.testnet".to_owned(),
            symbol: "USDC".to_owned(),
            decimals: 6,
        };
        assert!(resolve_destination_asset(&tokens, &unknown).is_err());
        let native = AssetDto::Native {
            symbol: "NEAR".to_owned(),
            decimals: 24,
        };
        let error = resolve_destination_asset(&tokens, &native).unwrap_err();
        assert!(error.to_string().contains("NEP-141"));
    }

    #[test]
    fn unknown_origin_assets_are_rejected() {
        let tokens = mock_tokens();
        assert!(origin_token(&tokens, "nep141:not-a-token").is_err());
        assert!(origin_token(&tokens, "").is_err());
        assert_eq!(
            origin_token(&tokens, "nep141:wrap.near").unwrap().decimals,
            24
        );
    }

    #[test]
    fn mock_amount_in_scales_decimals_and_applies_slippage_buffer() {
        assert_eq!(mock_amount_in(6, 6, "1000000", 100).unwrap(), "1010000");
        assert_eq!(mock_amount_in(9, 6, "1000000", 0).unwrap(), "1000000000");
        assert_eq!(mock_amount_in(6, 9, "1000000000", 0).unwrap(), "1000000");
        assert_eq!(
            mock_amount_in(24, 24, "1000000000000000000000000", 300).unwrap(),
            "1030000000000000000000000"
        );
        assert!(mock_amount_in(24, 24, "0", 0).is_err());
    }

    #[test]
    fn mock_deposit_addresses_are_unique_and_evm_shaped() {
        let first = mock_deposit_address();
        let second = mock_deposit_address();
        assert_ne!(first, second);
        assert!(first.starts_with("0x"));
        assert_eq!(first.len(), 42);
        assert!(first[2..].bytes().all(|byte| byte.is_ascii_hexdigit()));
    }
}
