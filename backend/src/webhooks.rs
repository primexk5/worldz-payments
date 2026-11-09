use std::{net::IpAddr, time::Duration};

use hmac::{Hmac, Mac};
use serde_json::{json, Value};
use sha2::Sha256;
use sqlx::Row;
use tokio::net::lookup_host;
use url::Url;

use crate::{db::sqlx, state::AppState};

type HmacSha256 = Hmac<Sha256>;

pub fn spawn_worker(state: AppState) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(3));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        let mut backoff = crate::workers::Backoff::default();
        loop {
            interval.tick().await;
            if let Err(error) = deliver_batch(&state).await {
                tracing::error!(%error, "webhook worker failed");
                backoff.failed("webhooks").await;
            } else {
                backoff.reset();
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
                sqlx::query("UPDATE webhook_deliveries SET state=?, attempts=?, last_error=?, next_attempt_at=UTC_TIMESTAMP(6) + (? * INTERVAL '1 second'), updated_at=UTC_TIMESTAMP(6) WHERE delivery_id=?")
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
    if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() {
        return Err("webhook URL must use HTTPS without credentials".into());
    }
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
        .no_proxy()
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
            let [a, b, c, _] = ip.octets();
            !ip.is_private()
                && !ip.is_loopback()
                && !ip.is_link_local()
                && !ip.is_broadcast()
                && !ip.is_unspecified()
                && !ip.is_multicast()
                && a != 0
                && a < 224
                && !(a == 100 && (64..=127).contains(&b))
                && !(a == 192 && b == 0 && (c == 0 || c == 2))
                && !(a == 192 && b == 88 && c == 99)
                && !(a == 198 && (b == 18 || b == 19 || (b == 51 && c == 100)))
                && !(a == 203 && b == 0 && c == 113)
        }
        IpAddr::V6(ip) => {
            if let Some(mapped) = ip.to_ipv4_mapped() {
                return is_public_ip(IpAddr::V4(mapped));
            }
            let [a, b, c, ..] = ip.segments();
            // Only global unicast 2000::/3, excluding protocol assignments,
            // documentation, benchmarking, and 6to4 transition addresses.
            (a & 0xe000) == 0x2000
                && !(a == 0x2001 && (b < 0x0200 || b == 0x0db8))
                && !(a == 0x2002)
                && !(a == 0x3fff && b < 0x1000)
                && !(a == 0x2620 && b == 0x004f && c == 0x8000)
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
            "0.1.2.3",
            "100.64.0.1",
            "100.127.255.254",
            "192.0.2.1",
            "198.19.0.1",
            "198.51.100.1",
            "203.0.113.1",
            "240.0.0.1",
            "::ffff:100.64.0.1",
            "::ffff:127.0.0.1",
            "2001:db8::1",
            "2002:7f00:1::1",
            "3fff::1",
            "64:ff9b::7f00:1",
        ] {
            assert!(
                !is_public_ip(address.parse::<IpAddr>().unwrap()),
                "{address}"
            );
        }
        assert!(is_public_ip("1.1.1.1".parse().unwrap()));
        assert!(is_public_ip("::ffff:1.1.1.1".parse().unwrap()));
        assert!(is_public_ip("2606:4700:4700::1111".parse().unwrap()));
    }
}
