use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use worldz_near_protocol::NetworkId;

use crate::{error::ApiError, state::AppState};

/// The deployed v1 router uses a legacy LookupMap with this Borsh storage key.
/// Check before creating a claim so a changed server seed cannot cost a payer gas.
pub async fn verify_order_signer(state: &AppState, network_id: NetworkId) -> Result<(), ApiError> {
    let network = state.config.network(network_id);
    let router = network
        .router_id
        .as_deref()
        .ok_or_else(|| ApiError::unavailable("Payment router is not configured."))?;
    let signer = network
        .signer
        .as_ref()
        .ok_or_else(|| ApiError::unavailable("Order signing is not configured."))?;
    let mut key = b"signer_keys".to_vec();
    key.extend(borsh::to_vec(&network.signer_key_id).map_err(|_| ApiError::internal())?);
    let result = rpc(
        state,
        network_id,
        "query",
        json!({
            "request_type": "view_state", "finality": "final", "account_id": router,
            "prefix_base64": STANDARD.encode(&key),
        }),
    )
    .await?;
    if !signer_matches(&result, &key, &signer.verifying_key().to_bytes()) {
        tracing::error!(router, key_id = %network.signer_key_id, "API signer does not match the router's enabled public key");
        return Err(ApiError::unavailable("The merchant's payment signing configuration needs an update. No payment was submitted. Please try again after the merchant fixes it."));
    }
    Ok(())
}

fn signer_matches(result: &Value, storage_key: &[u8], public_key: &[u8; 32]) -> bool {
    result
        .get("values")
        .and_then(Value::as_array)
        .is_some_and(|values| {
            values.iter().any(|entry| {
                let key = entry
                    .get("key")
                    .and_then(Value::as_str)
                    .and_then(|v| STANDARD.decode(v).ok());
                let value = entry
                    .get("value")
                    .and_then(Value::as_str)
                    .and_then(|v| STANDARD.decode(v).ok());
                key.as_deref() == Some(storage_key)
                    && value.is_some_and(|v| {
                        borsh::from_slice::<Vec<u8>>(&v)
                            .is_ok_and(|stored| stored.as_slice() == public_key)
                    })
            })
        })
}

pub async fn rpc(
    state: &AppState,
    network_id: NetworkId,
    method: &str,
    params: Value,
) -> Result<Value, ApiError> {
    let network = state.config.network(network_id);
    let mut endpoints = Vec::with_capacity(1 + network.rpc_fallback_urls.len());
    endpoints.push(network.rpc_url.as_str());
    endpoints.extend(network.rpc_fallback_urls.iter().map(String::as_str));
    for endpoint in endpoints {
        let response = match state
            .http
            .post(endpoint)
            .json(&json!({ "jsonrpc": "2.0", "id": "worldz", "method": method, "params": params }))
            .send()
            .await
        {
            Ok(response) if response.status().is_success() => response,
            Ok(response) => {
                tracing::debug!(%method, endpoint, status = %response.status(), "NEAR RPC endpoint unavailable; trying fallback");
                continue;
            }
            Err(error) => {
                tracing::debug!(%method, endpoint, error = %error, "NEAR RPC request failed; trying fallback");
                continue;
            }
        };
        let response: Value = match response.json().await {
            Ok(response) => response,
            Err(error) => {
                tracing::debug!(%method, endpoint, error = %error, "NEAR RPC returned invalid JSON; trying fallback");
                continue;
            }
        };
        if let Some(error) = response.get("error") {
            tracing::debug!(%method, endpoint, error = %error, "NEAR RPC returned an error; trying fallback");
            continue;
        }
        if let Some(result) = response.get("result").cloned() {
            return Ok(result);
        }
    }
    Err(ApiError::unavailable(
        "All configured NEAR RPC endpoints are temporarily unavailable.",
    ))
}

pub async fn verify_full_access_key(
    state: &AppState,
    network_id: NetworkId,
    account_id: &str,
    public_key: &str,
) -> Result<(), ApiError> {
    let result = rpc(
        state,
        network_id,
        "query",
        json!({
            "request_type": "view_access_key",
            "finality": "final",
            "account_id": account_id,
            "public_key": public_key,
        }),
    )
    .await?;
    if result.get("permission").and_then(Value::as_str) != Some("FullAccess") {
        return Err(ApiError::forbidden(
            "NEP-413 authentication requires a finalized FullAccess key.",
        ));
    }
    Ok(())
}

pub async fn view_function(
    state: &AppState,
    network_id: NetworkId,
    account_id: &str,
    method_name: &str,
    args: Value,
) -> Result<Value, ApiError> {
    let args = STANDARD.encode(serde_json::to_vec(&args).map_err(|_| ApiError::internal())?);
    let result = rpc(
        state,
        network_id,
        "query",
        json!({
            "request_type": "call_function",
            "finality": "final",
            "account_id": account_id,
            "method_name": method_name,
            "args_base64": args,
        }),
    )
    .await?;
    let bytes = result
        .get("result")
        .and_then(Value::as_array)
        .ok_or_else(|| ApiError::unavailable("NEAR view returned an invalid result."))?
        .iter()
        .map(|byte| {
            byte.as_u64()
                .and_then(|value| u8::try_from(value).ok())
                .ok_or_else(|| ApiError::unavailable("NEAR view returned invalid bytes."))
        })
        .collect::<Result<Vec<_>, _>>()?;
    serde_json::from_slice(&bytes)
        .map_err(|_| ApiError::unavailable("NEAR view returned invalid JSON."))
}

pub async fn transaction_status(
    state: &AppState,
    network_id: NetworkId,
    transaction_hash: &str,
    signer_account_id: &str,
) -> Result<Value, ApiError> {
    rpc(
        state,
        network_id,
        "tx",
        json!({ "tx_hash": transaction_hash, "sender_account_id": signer_account_id, "wait_until": "FINAL" }),
    )
    .await
}

#[cfg(test)]
mod signer_tests {
    #[test]
    fn skipped_height_requires_a_verified_predecessor_gap() {
        let next = serde_json::json!({"header":{"height":105,"prev_hash":"previous"}});
        let previous = serde_json::json!({"header":{"height":100,"hash":"previous"}});
        assert!(super::proves_skipped_height(101, &next, &previous));
        assert!(!super::proves_skipped_height(100, &next, &previous));
        assert!(!super::proves_skipped_height(105, &next, &previous));
        assert!(!super::proves_skipped_height(
            101,
            &next,
            &serde_json::json!({"header":{"height":101,"hash":"previous"}})
        ));
        assert!(!super::proves_skipped_height(
            101,
            &next,
            &serde_json::json!({"header":{"height":100,"hash":"different"}})
        ));
    }

    use super::*;

    #[test]
    fn signer_must_be_enabled_under_the_exact_key_and_match_the_api() {
        let key = b"signer_keys\x03\0\0\0key";
        let public = [42; 32];
        let result = json!({"values": [{"key": STANDARD.encode(key), "value": STANDARD.encode(borsh::to_vec(&public.to_vec()).unwrap())}]});
        assert!(signer_matches(&result, key, &public));
        assert!(!signer_matches(&result, key, &[43; 32]));
        assert!(!signer_matches(&result, b"another-key", &public));
        assert!(!signer_matches(&json!({"values": []}), key, &public));
        assert!(!signer_matches(
            &json!({"values": [{"key": STANDARD.encode(key), "value": "invalid"}]}),
            key,
            &public
        ));
    }
}

pub async fn finalized_tip(state: &AppState, network_id: NetworkId) -> Result<u64, ApiError> {
    let block = rpc(state, network_id, "block", json!({ "finality": "final" })).await?;
    block
        .get("header")
        .and_then(|header| header.get("height"))
        .and_then(Value::as_u64)
        .ok_or_else(|| ApiError::unavailable("NEAR RPC returned an invalid final block."))
}

pub async fn finalized_timestamp_seconds(
    state: &AppState,
    network_id: NetworkId,
) -> Result<u64, ApiError> {
    let block = rpc(state, network_id, "block", json!({"finality":"final"})).await?;
    block
        .pointer("/header/timestamp_nanosec")
        .and_then(Value::as_str)
        .and_then(|v| v.parse::<u64>().ok())
        .or_else(|| block.pointer("/header/timestamp").and_then(Value::as_u64))
        .map(|value| value / 1_000_000_000)
        .ok_or_else(|| ApiError::unavailable("Finalized block timestamp is missing."))
}

fn proves_skipped_height(height: u64, next: &Value, previous: &Value) -> bool {
    let before = previous.pointer("/header/height").and_then(Value::as_u64);
    let after = next.pointer("/header/height").and_then(Value::as_u64);
    before.is_some_and(|v| v < height)
        && after.is_some_and(|v| v > height)
        && next
            .pointer("/header/prev_hash")
            .and_then(Value::as_str)
            .is_some()
        && next.pointer("/header/prev_hash") == previous.pointer("/header/hash")
}

pub async fn next_finalized_block(
    state: &AppState,
    network_id: NetworkId,
    height: u64,
    tip: u64,
) -> Result<Value, ApiError> {
    let error = match finalized_block(state, network_id, height).await {
        Ok(block) => return Ok(block),
        Err(error) => error,
    };
    // An UNKNOWN_BLOCK alone can also mean a pruned or unavailable block. Prove
    // the gap using the next actual block's predecessor before advancing.
    for candidate in height.saturating_add(1)..=tip.min(height.saturating_add(64)) {
        let Ok(next) = finalized_block(state, network_id, candidate).await else {
            continue;
        };
        let hash = next
            .pointer("/header/prev_hash")
            .and_then(Value::as_str)
            .ok_or_else(|| ApiError::unavailable("Finalized block predecessor is missing."))?;
        let previous = rpc(state, network_id, "block", json!({"block_id":hash})).await?;
        return if proves_skipped_height(height, &next, &previous) {
            Ok(next)
        } else {
            Err(error)
        };
    }
    Err(error)
}

pub async fn finalized_block(
    state: &AppState,
    network_id: NetworkId,
    height: u64,
) -> Result<Value, ApiError> {
    rpc(state, network_id, "block", json!({ "block_id": height })).await
}

pub async fn chunk(
    state: &AppState,
    network_id: NetworkId,
    chunk_hash: &str,
) -> Result<Value, ApiError> {
    rpc(
        state,
        network_id,
        "chunk",
        json!({ "chunk_id": chunk_hash }),
    )
    .await
}

pub async fn ft_metadata(
    state: &AppState,
    network_id: NetworkId,
    token_contract_id: &str,
) -> Result<Value, ApiError> {
    view_function(
        state,
        network_id,
        token_contract_id,
        "ft_metadata",
        json!({}),
    )
    .await
}
