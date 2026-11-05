use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use worldz_near_protocol::NetworkId;

use crate::{error::ApiError, state::AppState};

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
        "EXPERIMENTAL_tx_status",
        json!([transaction_hash, signer_account_id]),
    )
    .await
}

pub async fn finalized_tip(state: &AppState, network_id: NetworkId) -> Result<u64, ApiError> {
    let block = rpc(state, network_id, "block", json!({ "finality": "final" })).await?;
    block
        .get("header")
        .and_then(|header| header.get("height"))
        .and_then(Value::as_u64)
        .ok_or_else(|| ApiError::unavailable("NEAR RPC returned an invalid final block."))
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
