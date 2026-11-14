use crate::{auth, db::sqlx, error::ApiError, state::AppState};
use axum::{
    body::Bytes,
    extract::{Path, State},
    http::HeaderMap,
    Json,
};
use hmac::{Hmac, Mac};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::Row;

fn verified_event(
    raw: &[u8],
    headers: &HeaderMap,
    secret: &str,
    now: i64,
) -> Result<Value, ApiError> {
    let signature = headers
        .get("x-worldz-signature")
        .and_then(|h| h.to_str().ok())
        .and_then(|s| s.strip_prefix("sha256="))
        .filter(|s| s.len() == 64)
        .and_then(|s| hex::decode(s).ok())
        .ok_or_else(ApiError::unauthorized)?;
    let mut mac =
        Hmac::<Sha256>::new_from_slice(secret.as_bytes()).map_err(|_| ApiError::internal())?;
    mac.update(raw);
    mac.verify_slice(&signature)
        .map_err(|_| ApiError::unauthorized())?;
    let event: Value =
        serde_json::from_slice(raw).map_err(|_| ApiError::bad_request("Invalid event JSON."))?;
    let id = event["id"]
        .as_str()
        .filter(|id| !id.is_empty())
        .ok_or_else(|| ApiError::bad_request("Missing event ID."))?;
    if headers
        .get("x-worldz-event-id")
        .and_then(|h| h.to_str().ok())
        != Some(id)
        || event["type"] != "payment.confirmed"
        || event["data"]["state"] != "SETTLED"
        || event["created"]
            .as_i64()
            .is_none_or(|created| now.abs_diff(created) > 300)
    {
        return Err(ApiError::bad_request(
            "Expected a fresh, matching confirmed event.",
        ));
    }
    Ok(event)
}

pub async fn accept(
    State(state): State<AppState>,
    headers: HeaderMap,
    raw: Bytes,
) -> Result<Json<Value>, ApiError> {
    let merchant = auth::current_merchant(&state, &headers).await?;
    let secret = state
        .config
        .webhook_signing_secret
        .as_deref()
        .ok_or_else(|| ApiError::unavailable("Webhook signing is not configured."))?;
    let event = verified_event(&raw, &headers, secret, chrono::Utc::now().timestamp())?;
    if event["data"]["merchantId"] != merchant.merchant_id {
        return Err(ApiError::forbidden("Event belongs to another merchant."));
    }
    let id = event["id"].as_str().ok_or_else(ApiError::internal)?;
    let stored = sqlx::query(
        "SELECT payload FROM payment_events WHERE event_id=? AND merchant_id=? AND finalized=true",
    )
    .bind(id)
    .bind(&merchant.merchant_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::not_found("Finalized merchant event not found."))?;
    let payload: Value = stored.try_get("payload")?;
    if payload != event["data"] {
        return Err(ApiError::conflict(
            "Payment data differs from the finalized event.",
        ));
    }
    let hash = hex::encode(Sha256::digest(&raw));
    let row = sqlx::query("INSERT INTO webhook_receiver_receipts (event_id,merchant_id,raw_body_sha256) VALUES (?,?,?) ON CONFLICT (event_id) DO NOTHING RETURNING event_id")
        .bind(id).bind(&merchant.merchant_id).bind(hash).fetch_optional(&state.pool).await?;
    Ok(Json(
        json!({"result":if row.is_some(){"accepted"}else{"duplicate"},"eventId":id,"signatureVerified":true}),
    ))
}

pub async fn get(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let merchant = auth::current_merchant(&state, &headers).await?;
    let row = sqlx::query("SELECT event_id,raw_body_sha256,accepted_at FROM webhook_receiver_receipts WHERE event_id=? AND merchant_id=?")
        .bind(&id).bind(&merchant.merchant_id).fetch_optional(&state.pool).await?
        .ok_or_else(|| ApiError::not_found("Receiver receipt not found."))?;
    Ok(Json(
        json!({"eventId":row.try_get::<String,_>("event_id")?,"rawBodySha256":row.try_get::<String,_>("raw_body_sha256")?,
        "acceptedAtUtc":row.try_get::<chrono::DateTime<chrono::Utc>,_>("accepted_at")?,"signatureVerified":true}),
    ))
}

pub async fn retry(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let merchant = auth::current_merchant(&state, &headers).await?;
    let row = sqlx::query("UPDATE webhook_deliveries SET state='pending',attempts=0,last_error=NULL,next_attempt_at=now(),updated_at=now() WHERE event_id=? AND merchant_id=? AND state='failed' RETURNING delivery_id")
        .bind(&id).bind(&merchant.merchant_id).fetch_optional(&state.pool).await?;
    if row.is_none() {
        return Err(ApiError::conflict("No failed delivery for this merchant/event. Pending or delivered events are not requeued."));
    }
    Ok(Json(json!({"eventId":id,"state":"pending"})))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (Vec<u8>, HeaderMap) {
        let raw = serde_json::to_vec(&json!({"id":"evt","type":"payment.confirmed","created":1000,"data":{"state":"SETTLED"}})).unwrap();
        let mut mac = Hmac::<Sha256>::new_from_slice(b"test-secret").unwrap();
        mac.update(&raw);
        let mut headers = HeaderMap::new();
        headers.insert(
            "x-worldz-signature",
            format!("sha256={}", hex::encode(mac.finalize().into_bytes()))
                .parse()
                .unwrap(),
        );
        headers.insert("x-worldz-event-id", "evt".parse().unwrap());
        (raw, headers)
    }
    #[test]
    fn signature_tamper_and_freshness() {
        let (mut raw, headers) = fixture();
        assert!(verified_event(&raw, &headers, "test-secret", 1000).is_ok());
        assert!(verified_event(&raw, &headers, "test-secret", 1301).is_err());
        assert!(verified_event(&raw, &headers, "different", 1000).is_err());
        raw.push(b' ');
        assert!(verified_event(&raw, &headers, "test-secret", 1000).is_err());
    }
    #[test]
    fn requires_matching_header() {
        let (raw, mut headers) = fixture();
        headers.insert("x-worldz-event-id", "other".parse().unwrap());
        assert!(verified_event(&raw, &headers, "test-secret", 1000).is_err());
    }
}
