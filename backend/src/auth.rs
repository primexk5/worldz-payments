use borsh::BorshSerialize;
use chrono::{Duration, Utc};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use rand::{rngs::OsRng, RngCore};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use worldz_near_protocol::NetworkId;

use axum::{
    extract::State,
    http::{header, HeaderMap, HeaderValue},
    response::IntoResponse,
    Json,
};
use base64::{
    engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
    Engine,
};
use near_account_id::AccountId;
use sqlx::{postgres::PgRow, Row};
use uuid::Uuid;

use crate::{
    db::sqlx,
    error::ApiError,
    models::{
        AuthSessionDto, ChallengePurpose, ChallengeRequest, ChallengeResponse, LoginRequest,
        MerchantProfile, OnboardingRequest, PayoutUpdateRequest,
    },
    near_rpc,
    state::AppState,
};

#[derive(BorshSerialize)]
struct Nep413Payload {
    message: String,
    nonce: [u8; 32],
    recipient: String,
    callback_url: Option<String>,
}

pub async fn issue_challenge(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<ChallengeRequest>,
) -> Result<Json<ChallengeResponse>, ApiError> {
    let account_id = validate_account(&input.account_id)?;
    enforce_rate_limit(&state, &format!("challenge:{}", account_id), 30).await?;
    if matches!(input.purpose, ChallengePurpose::PayoutUpdate) {
        let merchant = current_merchant(&state, &headers).await?;
        if merchant.account_id != account_id.as_str() {
            return Err(ApiError::forbidden(
                "Only the signed-in merchant can authorize a payout update.",
            ));
        }
        validate_account(input.payout_account_id.as_deref().unwrap_or_default())?;
    }
    if matches!(input.purpose, ChallengePurpose::Onboarding) {
        validate_account(input.payout_account_id.as_deref().unwrap_or_default())?;
        validate_display_name(input.display_name.as_deref().unwrap_or_default())?;
        validate_webhook_url(input.webhook_url.as_deref())?;
        if input.webhook_url.is_some() && state.config.webhook_signing_secret.is_none() {
            return Err(ApiError::unavailable("Webhook signing is not configured."));
        }
    }
    if input.state.is_empty()
        || input.state.len() > 128
        || input.state.chars().any(char::is_control)
    {
        return Err(ApiError::bad_request(
            "state must contain 1 to 128 characters.",
        ));
    }

    let mut nonce = [0u8; 32];
    OsRng.fill_bytes(&mut nonce);
    let expires = Utc::now() + Duration::seconds(state.config.auth_challenge_ttl_seconds);
    let message = challenge_message(
        input.purpose,
        account_id.as_str(),
        input.network_id,
        &input.state,
        input.payout_account_id.as_deref(),
        input.display_name.as_deref(),
        input.webhook_url.as_deref(),
    );
    let intent = json!({
        "payoutAccountId": input.payout_account_id,
        "displayName": input.display_name,
        "webhookUrl": input.webhook_url,
    });
    sqlx::query(
        "INSERT INTO auth_challenges (account_id, state, network_id, purpose, message, nonce, intent, expires_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) \
         ON CONFLICT (account_id, state) DO UPDATE SET network_id = EXCLUDED.network_id, purpose = EXCLUDED.purpose, \
           message = EXCLUDED.message, nonce = EXCLUDED.nonce, intent = EXCLUDED.intent, expires_at = EXCLUDED.expires_at, consumed_at = NULL",
    )
    .bind(account_id.as_str())
    .bind(&input.state)
    .bind(input.network_id.as_str())
    .bind(input.purpose.as_str())
    .bind(&message)
    .bind(nonce.as_slice())
    .bind(intent)
    .bind(expires)
    .execute(&state.pool)
    .await?;

    Ok(Json(ChallengeResponse {
        message,
        nonce: STANDARD.encode(nonce),
        recipient: state.config.auth_recipient.clone(),
        state: input.state,
        network_id: input.network_id,
        expires_at_seconds: expires.timestamp(),
        purpose: input.purpose,
    }))
}

pub async fn login(
    State(state): State<AppState>,
    Json(input): Json<LoginRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let account_id = validate_account(&input.account_id)?;
    let nonce = decode_nonce(&input.nonce)?;
    consume_proof(
        &state,
        input.network_id,
        &account_id,
        &input.state,
        ChallengePurpose::Login,
        &input.message,
        nonce,
        &input.public_key,
        &input.signature,
        None,
    )
    .await?;

    let row = sqlx::query("SELECT * FROM merchants WHERE account_id = ?")
        .bind(account_id.as_str())
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| ApiError::not_found("Merchant account is not onboarded."))?;
    let merchant = merchant_from_row(&row);
    let (session, expires_at_ms) = create_session(&state, &merchant.merchant_id).await?;
    let mut headers = HeaderMap::new();
    headers.insert(
        header::SET_COOKIE,
        session_cookie(&state, &session, expires_at_ms)?,
    );
    Ok((
        headers,
        Json(AuthSessionDto {
            merchant,
            expires_at_ms,
        }),
    ))
}

pub async fn onboard(
    State(state): State<AppState>,
    Json(input): Json<OnboardingRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let account_id = validate_account(&input.account_id)?;
    let payout_id = validate_account(&input.payout_account_id)?;
    validate_display_name(&input.display_name)?;
    validate_webhook_url(input.webhook_url.as_deref())?;
    if input.webhook_url.is_some() && state.config.webhook_signing_secret.is_none() {
        return Err(ApiError::unavailable("Webhook signing is not configured."));
    }
    let nonce = decode_nonce(&input.proof.nonce)?;
    consume_proof(
        &state,
        input.network_id,
        &account_id,
        &input.proof.state,
        ChallengePurpose::Onboarding,
        &input.proof.message,
        nonce,
        &input.proof.public_key,
        &input.proof.signature,
        Some(json!({
            "payoutAccountId": input.payout_account_id,
            "displayName": input.display_name,
            "webhookUrl": input.webhook_url,
        })),
    )
    .await?;

    let merchant_id = format!("mch_{}", Uuid::new_v4().simple());
    sqlx::query(
        "INSERT IGNORE INTO merchants (merchant_id, account_id, payout_account_id, display_name, webhook_url) \
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&merchant_id)
    .bind(account_id.as_str())
    .bind(payout_id.as_str())
    .bind(input.display_name.trim())
    .bind(input.webhook_url.as_deref())
    .execute(&state.pool)
    .await?;
    let row = sqlx::query("SELECT * FROM merchants WHERE account_id = ?")
        .bind(account_id.as_str())
        .fetch_one(&state.pool)
        .await?;
    let merchant = merchant_from_row(&row);
    let (session, expires_at_ms) = create_session(&state, &merchant.merchant_id).await?;
    let mut headers = HeaderMap::new();
    headers.insert(
        header::SET_COOKIE,
        session_cookie(&state, &session, expires_at_ms)?,
    );
    Ok((
        headers,
        Json(AuthSessionDto {
            merchant,
            expires_at_ms,
        }),
    ))
}

pub async fn logout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, ApiError> {
    if let Some(token) = cookie_value(&headers, &state.config.session_cookie_name) {
        sqlx::query("DELETE FROM merchant_sessions WHERE token_hash = ?")
            .bind(hash_token(token).as_slice())
            .execute(&state.pool)
            .await?;
    }
    let mut headers = HeaderMap::new();
    headers.insert(
        header::SET_COOKIE,
        HeaderValue::from_str(&format!(
            "{}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0{}",
            state.config.session_cookie_name,
            if state.config.session_cookie_secure {
                "; Secure"
            } else {
                ""
            }
        ))
        .map_err(|_| ApiError::internal())?,
    );
    Ok((headers, StatusCode::NO_CONTENT))
}

pub async fn me(state: &AppState, headers: &HeaderMap) -> Result<MerchantProfile, ApiError> {
    current_merchant(state, headers).await
}

pub async fn update_profile(
    state: &AppState,
    headers: &HeaderMap,
    display_name: Option<String>,
    webhook_url: Option<Option<String>>,
) -> Result<MerchantProfile, ApiError> {
    let merchant = current_merchant(state, headers).await?;
    if let Some(name) = display_name.as_deref() {
        validate_display_name(name)?;
    }
    if let Some(url) = webhook_url.as_ref() {
        validate_webhook_url(url.as_deref())?;
        if url.is_some() && state.config.webhook_signing_secret.is_none() {
            return Err(ApiError::unavailable("Webhook signing is not configured."));
        }
    }
    let set_webhook = webhook_url.is_some();
    let webhook_value = webhook_url.flatten();
    sqlx::query(
        "UPDATE merchants SET display_name = COALESCE(?, display_name), \
         webhook_url = CASE WHEN ? THEN ? ELSE webhook_url END, updated_at = UTC_TIMESTAMP(6) \
         WHERE merchant_id = ?",
    )
    .bind(display_name.map(|value| value.trim().to_owned()))
    .bind(set_webhook)
    .bind(webhook_value)
    .bind(&merchant.merchant_id)
    .execute(&state.pool)
    .await?;
    let row = sqlx::query("SELECT * FROM merchants WHERE merchant_id = ?")
        .bind(&merchant.merchant_id)
        .fetch_one(&state.pool)
        .await?;
    Ok(merchant_from_row(&row))
}

pub async fn update_payout(
    state: &AppState,
    headers: &HeaderMap,
    input: PayoutUpdateRequest,
) -> Result<MerchantProfile, ApiError> {
    let merchant = current_merchant(state, headers).await?;
    let account_id = validate_account(&input.proof.account_id)?;
    let payout_id = validate_account(&input.payout_account_id)?;
    if account_id.as_str() != merchant.account_id {
        return Err(ApiError::forbidden(
            "Only the signed-in merchant can authorize this payout update.",
        ));
    }
    let nonce = decode_nonce(&input.proof.nonce)?;
    consume_proof(
        state,
        input.network_id,
        &account_id,
        &input.proof.state,
        ChallengePurpose::PayoutUpdate,
        &input.proof.message,
        nonce,
        &input.proof.public_key,
        &input.proof.signature,
        Some(json!({ "payoutAccountId": payout_id.as_str() })),
    )
    .await?;
    sqlx::query("UPDATE merchants SET payout_account_id = ?, updated_at = UTC_TIMESTAMP(6) WHERE merchant_id = ?")
        .bind(payout_id.as_str())
        .bind(&merchant.merchant_id)
        .execute(&state.pool)
        .await?;
    let row = sqlx::query("SELECT * FROM merchants WHERE account_id = ?")
        .bind(account_id.as_str())
        .fetch_one(&state.pool)
        .await?;
    Ok(merchant_from_row(&row))
}

pub async fn current_merchant(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<MerchantProfile, ApiError> {
    let token = cookie_value(headers, &state.config.session_cookie_name)
        .ok_or_else(ApiError::unauthorized)?;
    let row = sqlx::query(
        "SELECT m.* FROM merchant_sessions s JOIN merchants m USING (merchant_id) \
         WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP(6)",
    )
    .bind(hash_token(token).as_slice())
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(ApiError::unauthorized)?;
    Ok(merchant_from_row(&row))
}

pub async fn consume_proof(
    state: &AppState,
    network_id: NetworkId,
    account_id: &AccountId,
    challenge_state: &str,
    purpose: ChallengePurpose,
    message: &str,
    nonce: [u8; 32],
    public_key: &str,
    signature_b64: &str,
    expected_intent: Option<Value>,
) -> Result<(), ApiError> {
    enforce_rate_limit(state, &format!("verify:{}", account_id), 20).await?;
    let mut tx = state.pool.begin().await?;
    let row = sqlx::query(
        "SELECT message, nonce, purpose, network_id, intent FROM auth_challenges \
         WHERE account_id = ? AND state = ? AND expires_at > UTC_TIMESTAMP(6) AND consumed_at IS NULL FOR UPDATE",
    )
    .bind(account_id.as_str())
    .bind(challenge_state)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| ApiError::unauthorized())?;
    let expected_message: String = row.try_get("message")?;
    let expected_nonce: Vec<u8> = row.try_get("nonce")?;
    let expected_purpose: String = row.try_get("purpose")?;
    let expected_network: String = row.try_get("network_id")?;
    if expected_message != message
        || expected_nonce.as_slice() != nonce
        || expected_purpose != purpose.as_str()
        || expected_network != network_id.as_str()
    {
        return Err(ApiError::unauthorized());
    }
    let intent: Value = row.try_get("intent")?;
    verify_nep413(
        state,
        network_id,
        account_id,
        message,
        nonce,
        public_key,
        signature_b64,
    )
    .await?;
    verify_challenge_intent(purpose, &intent, message)?;
    if expected_intent
        .as_ref()
        .is_some_and(|expected| !request_intent_matches(purpose, &intent, expected))
    {
        return Err(ApiError::unauthorized());
    }
    sqlx::query("UPDATE auth_challenges SET consumed_at = UTC_TIMESTAMP(6) WHERE account_id = ? AND state = ? AND consumed_at IS NULL")
        .bind(account_id.as_str())
        .bind(challenge_state)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(())
}

async fn enforce_rate_limit(
    state: &AppState,
    subject: &str,
    max_attempts: i32,
) -> Result<(), ApiError> {
    sqlx::query(
        "INSERT INTO auth_rate_limits (subject, window_started_at, attempts) VALUES (?, UTC_TIMESTAMP(6), 1) \
         ON CONFLICT (subject) DO UPDATE SET \
           attempts = CASE WHEN auth_rate_limits.window_started_at < UTC_TIMESTAMP(6) - INTERVAL '15 minutes' THEN 1 ELSE auth_rate_limits.attempts + 1 END, \
           window_started_at = CASE WHEN auth_rate_limits.window_started_at < UTC_TIMESTAMP(6) - INTERVAL '15 minutes' THEN UTC_TIMESTAMP(6) ELSE auth_rate_limits.window_started_at END",
    )
    .bind(subject)
    .execute(&state.pool)
    .await?;
    let row = sqlx::query("SELECT attempts FROM auth_rate_limits WHERE subject = ?")
        .bind(subject)
        .fetch_one(&state.pool)
        .await?;
    if row.try_get::<i32, _>("attempts")? > max_attempts {
        return Err(ApiError::rate_limited());
    }
    Ok(())
}

async fn verify_nep413(
    state: &AppState,
    network_id: NetworkId,
    account_id: &AccountId,
    message: &str,
    nonce: [u8; 32],
    public_key: &str,
    signature_b64: &str,
) -> Result<(), ApiError> {
    let encoded_key = public_key
        .strip_prefix("ed25519:")
        .ok_or_else(ApiError::unauthorized)?;
    let public_key_bytes: [u8; 32] = bs58::decode(encoded_key)
        .into_vec()
        .map_err(|_| ApiError::unauthorized())?
        .try_into()
        .map_err(|_| ApiError::unauthorized())?;
    let signature_bytes: [u8; 64] = STANDARD
        .decode(signature_b64)
        .map_err(|_| ApiError::unauthorized())?
        .try_into()
        .map_err(|_| ApiError::unauthorized())?;
    let digest = nep413_digest(message, nonce, &state.config.auth_recipient)?;
    let key = VerifyingKey::from_bytes(&public_key_bytes).map_err(|_| ApiError::unauthorized())?;
    let signature = Signature::from_bytes(&signature_bytes);
    key.verify(&digest, &signature)
        .map_err(|_| ApiError::unauthorized())?;
    near_rpc::verify_full_access_key(state, network_id, account_id.as_str(), public_key).await?;
    Ok(())
}

fn nep413_digest(message: &str, nonce: [u8; 32], recipient: &str) -> Result<[u8; 32], ApiError> {
    let payload = Nep413Payload {
        message: message.to_owned(),
        nonce,
        recipient: recipient.to_owned(),
        callback_url: None,
    };
    let mut bytes = 2_147_484_061u32.to_le_bytes().to_vec();
    bytes.extend(borsh::to_vec(&payload).map_err(|_| ApiError::internal())?);
    Ok(Sha256::digest(bytes).into())
}

fn verify_challenge_intent(
    purpose: ChallengePurpose,
    intent: &Value,
    message: &str,
) -> Result<(), ApiError> {
    match purpose {
        ChallengePurpose::Login => Ok(()),
        ChallengePurpose::Onboarding | ChallengePurpose::PayoutUpdate => {
            let payout = intent
                .get("payoutAccountId")
                .and_then(Value::as_str)
                .unwrap_or_default();
            if !message.contains(&format!("Payout: {payout}")) {
                return Err(ApiError::unauthorized());
            }
            if matches!(purpose, ChallengePurpose::Onboarding) {
                let display = intent
                    .get("displayName")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                if !message.contains(&format!("Display name: {display}")) {
                    return Err(ApiError::unauthorized());
                }
                let webhook = intent
                    .get("webhookUrl")
                    .and_then(Value::as_str)
                    .unwrap_or("none");
                if !message.contains(&format!("Webhook: {webhook}")) {
                    return Err(ApiError::unauthorized());
                }
            }
            Ok(())
        }
    }
}

fn request_intent_matches(purpose: ChallengePurpose, issued: &Value, requested: &Value) -> bool {
    let keys: &[&str] = match purpose {
        ChallengePurpose::Onboarding => &["payoutAccountId", "displayName", "webhookUrl"],
        ChallengePurpose::PayoutUpdate => &["payoutAccountId"],
        ChallengePurpose::Login => &[],
    };
    keys.iter().all(|key| issued.get(key) == requested.get(key))
}

fn challenge_message(
    purpose: ChallengePurpose,
    account_id: &str,
    network_id: NetworkId,
    state: &str,
    payout_account_id: Option<&str>,
    display_name: Option<&str>,
    webhook_url: Option<&str>,
) -> String {
    let mut lines = vec![
        "WorldzPayments NEAR authentication".to_owned(),
        format!("Purpose: {}", purpose.as_str()),
        format!("Account: {account_id}"),
        format!("Network: {}", network_id.as_str()),
        format!("State: {state}"),
    ];
    if matches!(
        purpose,
        ChallengePurpose::Onboarding | ChallengePurpose::PayoutUpdate
    ) {
        lines.push(format!("Payout: {}", payout_account_id.unwrap_or_default()));
    }
    if matches!(purpose, ChallengePurpose::Onboarding) {
        lines.push(format!(
            "Display name: {}",
            display_name.unwrap_or_default()
        ));
        lines.push(format!("Webhook: {}", webhook_url.unwrap_or("none")));
    }
    lines.join("\n")
}

fn decode_nonce(encoded: &str) -> Result<[u8; 32], ApiError> {
    STANDARD
        .decode(encoded)
        .map_err(|_| ApiError::bad_request("nonce must be base64"))?
        .try_into()
        .map_err(|_| ApiError::bad_request("nonce must decode to 32 bytes"))
}

fn validate_account(value: &str) -> Result<AccountId, ApiError> {
    value
        .parse::<AccountId>()
        .map_err(|_| ApiError::bad_request("Invalid NEAR account ID."))
}

fn validate_display_name(value: &str) -> Result<(), ApiError> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > 80 || value.chars().any(char::is_control) {
        return Err(ApiError::bad_request(
            "Display name must contain 1 to 80 characters.",
        ));
    }
    Ok(())
}

fn validate_webhook_url(value: Option<&str>) -> Result<(), ApiError> {
    let Some(value) = value.filter(|value| !value.is_empty()) else {
        return Ok(());
    };
    let url =
        url::Url::parse(value).map_err(|_| ApiError::bad_request("Webhook URL must be valid."))?;
    if url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(ApiError::bad_request(
            "Webhook URL must use HTTPS and cannot include credentials.",
        ));
    }
    Ok(())
}

async fn create_session(state: &AppState, merchant_id: &str) -> Result<(String, i64), ApiError> {
    let mut token = [0u8; 32];
    OsRng.fill_bytes(&mut token);
    let token = URL_SAFE_NO_PAD.encode(token);
    let expires = Utc::now() + Duration::hours(state.config.session_ttl_hours);
    sqlx::query(
        "INSERT INTO merchant_sessions (token_hash, merchant_id, expires_at) VALUES (?, ?, ?)",
    )
    .bind(hash_token(&token).as_slice())
    .bind(merchant_id)
    .bind(expires)
    .execute(&state.pool)
    .await?;
    Ok((token, expires.timestamp_millis()))
}

fn session_cookie(
    state: &AppState,
    token: &str,
    expires_at_ms: i64,
) -> Result<HeaderValue, ApiError> {
    let max_age = ((expires_at_ms - Utc::now().timestamp_millis()) / 1000).max(0);
    HeaderValue::from_str(&format!(
        "{}={}; Path=/; HttpOnly; SameSite=Lax; Max-Age={}{}",
        state.config.session_cookie_name,
        token,
        max_age,
        if state.config.session_cookie_secure {
            "; Secure"
        } else {
            ""
        }
    ))
    .map_err(|_| ApiError::internal())
}

fn cookie_value<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers
        .get(header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .filter_map(|part| part.trim().split_once('='))
        .find_map(|(key, value)| (key == name).then_some(value))
}

fn hash_token(token: &str) -> [u8; 32] {
    Sha256::digest(token.as_bytes()).into()
}

fn merchant_from_row(row: &PgRow) -> MerchantProfile {
    MerchantProfile {
        merchant_id: row.get("merchant_id"),
        account_id: row.get("account_id"),
        payout_account_id: row.get("payout_account_id"),
        display_name: row.get("display_name"),
        webhook_url: row.get("webhook_url"),
        created_at_ms: row
            .get::<chrono::DateTime<Utc>, _>("created_at")
            .timestamp_millis(),
    }
}

#[cfg(test)]
mod tests {
    use ed25519_dalek::{Signer, SigningKey, Verifier};
    use serde_json::json;

    use super::{
        challenge_message, nep413_digest, request_intent_matches, ChallengePurpose, NetworkId,
    };

    #[test]
    fn nep413_signing_binds_message_nonce_and_recipient() {
        let key = SigningKey::from_bytes(&[31; 32]);
        let nonce = [7; 32];
        let digest = nep413_digest("login challenge", nonce, "payments.example").unwrap();
        let signature = key.sign(&digest);
        key.verifying_key().verify(&digest, &signature).unwrap();

        let changed_nonce = nep413_digest("login challenge", [8; 32], "payments.example").unwrap();
        let changed_recipient = nep413_digest("login challenge", nonce, "other.example").unwrap();
        assert!(key
            .verifying_key()
            .verify(&changed_nonce, &signature)
            .is_err());
        assert!(key
            .verifying_key()
            .verify(&changed_recipient, &signature)
            .is_err());
    }

    #[test]
    fn onboarding_proof_cannot_be_replayed_with_changed_payout_or_profile() {
        let issued = json!({
            "payoutAccountId": "shop.near",
            "displayName": "Shop",
            "webhookUrl": null,
        });
        let message = challenge_message(
            ChallengePurpose::Onboarding,
            "merchant.near",
            NetworkId::Testnet,
            "state-1",
            Some("shop.near"),
            Some("Shop"),
            None,
        );
        assert!(verify_challenge_intent_for_test(&issued, &message));
        assert!(request_intent_matches(
            ChallengePurpose::Onboarding,
            &issued,
            &issued
        ));
        let changed = json!({
            "payoutAccountId": "attacker.near",
            "displayName": "Shop",
            "webhookUrl": null,
        });
        assert!(!request_intent_matches(
            ChallengePurpose::Onboarding,
            &issued,
            &changed
        ));
    }

    fn verify_challenge_intent_for_test(intent: &serde_json::Value, message: &str) -> bool {
        super::verify_challenge_intent(ChallengePurpose::Onboarding, intent, message).is_ok()
    }
}

use axum::http::StatusCode;
