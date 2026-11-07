use std::time::Duration;

use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::Value;
use sqlx::Row;
use worldz_near_protocol::NetworkId;

use crate::{db::sqlx, near_rpc, orders, state::AppState};

const MAX_BLOCKS_PER_TICK: u64 = 4;

pub fn spawn_indexer_worker(state: AppState) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(3));
        loop {
            interval.tick().await;
            for network_id in [NetworkId::Testnet, NetworkId::Mainnet] {
                if let Err(error) = index_network(&state, network_id).await {
                    tracing::debug!(network = network_id.as_str(), error = %error, "NEAR indexer will retry");
                }
            }
        }
    });
}

async fn index_network(
    state: &AppState,
    network_id: NetworkId,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let network = state.config.network(network_id);
    let Some(contract_id) = network.router_id.as_deref() else {
        return Ok(());
    };
    let tip = near_rpc::finalized_tip(state, network_id).await?;
    let cursor = sqlx::query(
        "SELECT block_height FROM near_indexer_cursors WHERE network_id=? AND contract_id=?",
    )
    .bind(network_id.as_str())
    .bind(contract_id)
    .fetch_optional(&state.pool)
    .await?;
    let mut height = if let Some(row) = cursor {
        row.get::<i64, _>("block_height") as u64 + 1
    } else {
        let start = network.indexer_start_height;
        let initial = if start > 0 {
            start.saturating_sub(1)
        } else {
            tip.saturating_sub(1)
        };
        sqlx::query("INSERT IGNORE INTO near_indexer_cursors (network_id, contract_id, block_height) VALUES (?,?,?)")
            .bind(network_id.as_str())
            .bind(contract_id)
            .bind(i64::try_from(initial)?)
            .execute(&state.pool)
            .await?;
        initial + 1
    };
    let end = tip.min(height.saturating_add(MAX_BLOCKS_PER_TICK.saturating_sub(1)));
    while height <= end {
        let block = near_rpc::next_finalized_block(state, network_id, height, tip).await?;
        height = block
            .pointer("/header/height")
            .and_then(Value::as_u64)
            .ok_or("finalized block height is missing")?;
        let chunks = block
            .get("chunks")
            .and_then(Value::as_array)
            .ok_or("finalized block has no chunk list")?;
        for header in chunks {
            let included_height = header
                .get("height_included")
                .and_then(Value::as_u64)
                .unwrap_or_default();
            if included_height != height {
                continue;
            }
            let Some(chunk_hash) = header.get("chunk_hash").and_then(Value::as_str) else {
                continue;
            };
            let chunk = near_rpc::chunk(state, network_id, chunk_hash).await?;
            let Some(transactions) = chunk.get("transactions").and_then(Value::as_array) else {
                continue;
            };
            for transaction in transactions {
                if !is_relevant_transaction(transaction, contract_id, &network.ft_allowlist) {
                    continue;
                }
                let Some(hash) = transaction.get("hash").and_then(Value::as_str) else {
                    continue;
                };
                let Some(signer) = transaction.get("signer_id").and_then(Value::as_str) else {
                    continue;
                };
                let status = near_rpc::transaction_status(state, network_id, hash, signer).await?;
                observe_transaction(state, network_id, contract_id, hash, &status).await?;
            }
        }
        sqlx::query("UPDATE near_indexer_cursors SET block_height=?, updated_at=UTC_TIMESTAMP(6) WHERE network_id=? AND contract_id=?")
            .bind(i64::try_from(height)?)
            .bind(network_id.as_str())
            .bind(contract_id)
            .execute(&state.pool)
            .await?;
        height += 1;
    }
    Ok(())
}

fn is_relevant_transaction(transaction: &Value, router_id: &str, tokens: &[String]) -> bool {
    let receiver = transaction
        .get("receiver_id")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let actions = transaction
        .get("actions")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if receiver == router_id {
        return actions.iter().any(|action| {
            let Some(call) = action.get("FunctionCall") else {
                return false;
            };
            matches!(
                call.get("method_name").and_then(Value::as_str),
                Some("pay_native" | "retry_payout" | "refund_order" | "retry_refund")
            )
        });
    }
    if !tokens.iter().any(|token| token == receiver) {
        return false;
    }
    actions.iter().any(|action| {
        let Some(call) = action.get("FunctionCall") else {
            return false;
        };
        if call.get("method_name").and_then(Value::as_str) != Some("ft_transfer_call") {
            return false;
        }
        let Some(args) = call.get("args").and_then(Value::as_str) else {
            return false;
        };
        let Ok(args) = STANDARD.decode(args) else {
            return false;
        };
        let Ok(args) = serde_json::from_slice::<Value>(&args) else {
            return false;
        };
        args.get("receiver_id").and_then(Value::as_str) == Some(router_id)
    })
}

async fn observe_transaction(
    state: &AppState,
    network_id: NetworkId,
    contract_id: &str,
    transaction_hash: &str,
    status: &Value,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let Some(receipts) = status.get("receipts_outcome").and_then(Value::as_array) else {
        return Ok(());
    };
    let mut observed = Vec::new();
    for receipt in receipts {
        let outcome = receipt.get("outcome").unwrap_or(&Value::Null);
        if outcome.get("executor_id").and_then(Value::as_str) != Some(contract_id) {
            continue;
        }
        let logs = outcome
            .get("logs")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        for log in logs {
            let Some(event_text) = log
                .as_str()
                .and_then(|line| line.strip_prefix("EVENT_JSON:"))
            else {
                continue;
            };
            let Ok(envelope) = serde_json::from_str::<Value>(event_text) else {
                continue;
            };
            if envelope.get("standard").and_then(Value::as_str) != Some("worldz-payments")
                || envelope.get("version").and_then(Value::as_str) != Some("1.0.0")
            {
                continue;
            }
            let Some(items) = envelope.get("data").and_then(Value::as_array) else {
                continue;
            };
            for data in items {
                let (Some(order_id), Some(merchant_id)) = (
                    data.get("orderId").and_then(Value::as_str),
                    data.get("merchantId").and_then(Value::as_str),
                ) else {
                    continue;
                };
                observed.push((order_id.to_owned(), merchant_id.to_owned()));
            }
        }
    }
    observed.sort();
    observed.dedup();
    for (order_id, merchant_id) in observed {
        let order = sqlx::query("SELECT * FROM orders WHERE network_id=? AND contract_id=? AND order_id=? AND merchant_id=?")
            .bind(network_id.as_str())
            .bind(contract_id)
            .bind(&order_id)
            .bind(&merchant_id)
            .fetch_optional(&state.pool)
            .await?;
        let Some(_order) = order else {
            continue;
        };
        let signer = status
            .get("transaction")
            .and_then(|tx| tx.get("signer_id"))
            .and_then(Value::as_str)
            .unwrap_or_default();
        sqlx::query("INSERT IGNORE INTO order_submissions (network_id, contract_id, order_id, transaction_hash, signer_account_id) VALUES (?,?,?,?,?)")
            .bind(network_id.as_str())
            .bind(contract_id)
            .bind(&order_id)
            .bind(transaction_hash)
            .bind(signer)
            .execute(&state.pool)
            .await?;
        sqlx::query("UPDATE orders SET transaction_hash=COALESCE(transaction_hash,?), updated_at=UTC_TIMESTAMP(6) WHERE network_id=? AND contract_id=? AND order_id=?")
            .bind(transaction_hash)
            .bind(network_id.as_str())
            .bind(contract_id)
            .bind(&order_id)
            .execute(&state.pool)
            .await?;
        let row = sqlx::query("SELECT o.*, CAST(? AS CHAR) AS reconciliation_tx_hash, CAST(? AS CHAR) AS reconciliation_signer_id FROM orders o WHERE network_id=? AND contract_id=? AND order_id=?")
            .bind(transaction_hash)
            .bind(signer)
            .bind(network_id.as_str())
            .bind(contract_id)
            .bind(&order_id)
            .fetch_one(&state.pool)
            .await?;
        if let Err(error) = orders::reconcile_order(state, &row).await {
            tracing::debug!(%order_id, error = %error, "event-driven order reconciliation deferred");
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::is_relevant_transaction;

    #[test]
    fn indexer_filters_unrelated_token_transfers_and_router_calls() {
        let ft_args = STANDARD.encode(br#"{"receiver_id":"router.testnet"}"#);
        let payment = json!({
            "receiver_id": "token.testnet",
            "actions": [{ "FunctionCall": { "method_name": "ft_transfer_call", "args": ft_args } }]
        });
        let unrelated = json!({
            "receiver_id": "token.testnet",
            "actions": [{ "FunctionCall": { "method_name": "ft_transfer", "args": "" } }]
        });
        let native = json!({
            "receiver_id": "router.testnet",
            "actions": [{ "FunctionCall": { "method_name": "pay_native" } }]
        });
        assert!(is_relevant_transaction(
            &payment,
            "router.testnet",
            &["token.testnet".into()]
        ));
        assert!(!is_relevant_transaction(
            &unrelated,
            "router.testnet",
            &["token.testnet".into()]
        ));
        assert!(is_relevant_transaction(&native, "router.testnet", &[]));
    }

    use base64::{engine::general_purpose::STANDARD, Engine};
}
