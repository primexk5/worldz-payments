use std::sync::Arc;

use serde_json::{json, Value};

use crate::error::ApiError;
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
        .ok_or_else(|| ApiError::internal())?
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

pub(crate) async fn submit_deposit(
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
}
