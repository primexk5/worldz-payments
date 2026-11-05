use std::{net::IpAddr, time::Duration};

use hmac::{Hmac, Mac};
use serde_json::{json, Value};
use sha2::Sha256;
use sqlx::Row;
use tokio::net::lookup_host;
use url::Url;

use crate::state::AppState;

type HmacSha256 = Hmac<Sha256>;

pub fn spawn_worker(state: AppState) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(3));
        loop {
            interval.tick().await;
            if let Err(error) = deliver_batch(&state).await {
                tracing::error!(%error, "webhook worker failed");
            }
        }
    });
}

async fn deliver_batch(state: &AppState) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let rows = sqlx::query(
        "SELECT w.delivery_id, w.event_id, w.merchant_id, w.attempts, e.payload, m.webhook_url \
         FROM webhook_deliveries w JOIN payment_events e ON e.event_id = w.event_id JOIN merchants m ON m.merchant_id = w.merchant_id \
         WHERE w.state IN ('pending','failed') AND w.attempts < 10 AND w.next_attempt_at <= now() AND m.webhook_url IS NOT NULL \
         ORDER BY w.next_attempt_at LIMIT 25",
    )
    .fetch_all(&state.pool)
    .await?;

    for row in rows {
        let id: uuid::Uuid = row.try_get("delivery_id")?;
        let event_id: String = row.try_get("event_id")?;
        let attempts: i32 = row.try_get("attempts")?;
        let payload: Value = row.try_get("payload")?;
        let endpoint: String = row.try_get("webhook_url")?;
        let result = send_webhook(state, &endpoint, &event_id, &payload).await;
        let next_attempt = attempts + 1;
        match result {
            Ok(()) => {
                sqlx::query("UPDATE webhook_deliveries SET state='delivered', attempts=?, delivered_at=UTC_TIMESTAMP(6), last_error=NULL, updated_at=UTC_TIMESTAMP(6) WHERE delivery_id=?")
                    .bind(next_attempt)
                    .bind(id)
                    .execute(&state.pool)
                    .await?;
            }
            Err(error) => {
                let clipped = error.to_string().chars().take(400).collect::<String>();
                let state_value = if next_attempt >= 10 {
                    "failed"
                } else {
                    "pending"
                };
                let delay = (2i64.pow(next_attempt.min(10) as u32)).min(3600);
                sqlx::query("UPDATE webhook_deliveries SET state=?, attempts=?, last_error=?, next_attempt_at=DATE_ADD(UTC_TIMESTAMP(6), INTERVAL ? SECOND), updated_at=UTC_TIMESTAMP(6) WHERE delivery_id=?")
                    .bind(state_value)
                    .bind(next_attempt)
                    .bind(clipped)
                    .bind(delay)
                    .bind(id)
                    .execute(&state.pool)
                    .await?;
            }
        }
    }
    Ok(())
}

async fn send_webhook(
    state: &AppState,
    endpoint: &str,
    event_id: &str,
    event: &Value,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let secret = state
        .config
        .webhook_signing_secret
        .as_deref()
        .ok_or("WEBHOOK_SIGNING_SECRET is not configured")?;
    let url = Url::parse(endpoint)?;
    let host = url.host_str().ok_or("webhook URL has no host")?;
    if matches!(host, "localhost" | "localhost.localdomain")
        || host.ends_with(".localhost")
        || host.ends_with(".local")
        || host.ends_with(".internal")
    {
        return Err("webhook host is local or internal".into());
    }
    let port = url
        .port_or_known_default()
        .ok_or("webhook URL has no port")?;
    let addresses = lookup_host((host, port)).await?.collect::<Vec<_>>();
    if addresses.is_empty() || addresses.iter().any(|address| !is_public_ip(address.ip())) {
        return Err("webhook host resolves to a non-public address".into());
    }
    let mut body = serde_json::to_vec(&json!({
        "id": event_id,
        "type": "payment.confirmed",
        "created": chrono::Utc::now().timestamp(),
        "data": event,
    }))?;
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())?;
    mac.update(&body);
    let signature = hex::encode(mac.finalize().into_bytes());
    // Bind DNS resolution into a one-shot client to reduce DNS-rebinding/redirect risk.
    let mut client_builder = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("WorldzPayments-Webhooks/1.0");
    for address in addresses {
        client_builder = client_builder.resolve(host, address);
    }
    let client = client_builder.build()?;
    let response = client
        .post(url)
        .header("content-type", "application/json")
        .header("x-worldz-event-id", event_id)
        .header("x-worldz-signature", format!("sha256={signature}"))
        .body(std::mem::take(&mut body))
        .send()
        .await?;
    if !response.status().is_success() {
        return Err(format!("webhook endpoint returned {}", response.status()).into());
    }
    Ok(())
}

fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            !ip.is_private()
                && !ip.is_loopback()
                && !ip.is_link_local()
                && !ip.is_broadcast()
                && !ip.is_unspecified()
                && !ip.is_multicast()
                && !ip.octets().starts_with(&[192, 0, 0])
                && !ip.octets().starts_with(&[198, 18])
        }
        IpAddr::V6(ip) => {
            !ip.is_loopback()
                && !ip.is_unspecified()
                && !ip.is_multicast()
                && !ip.is_unique_local()
                && !ip.is_unicast_link_local()
                && ip
                    .to_ipv4_mapped()
                    .map(|mapped| is_public_ip(IpAddr::V4(mapped)))
                    .unwrap_or(true)
        }
    }
}

#[cfg(test)]
mod tests {
    use std::net::IpAddr;

    use super::is_public_ip;

    #[test]
    fn webhook_delivery_blocks_private_and_link_local_addresses() {
        for address in [
            "127.0.0.1",
            "10.1.2.3",
            "172.16.0.1",
            "192.168.1.10",
            "169.254.169.254",
            "::1",
            "fc00::1",
            "fe80::1",
        ] {
            assert!(
                !is_public_ip(address.parse::<IpAddr>().unwrap()),
                "{address}"
            );
        }
        assert!(is_public_ip("1.1.1.1".parse().unwrap()));
        assert!(is_public_ip("2606:4700:4700::1111".parse().unwrap()));
    }
}
