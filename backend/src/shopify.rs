use std::collections::{BTreeMap, HashMap};

use aes_gcm::{aead::Aead, Aes256Gcm, KeyInit, Nonce};
use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::Redirect,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::{Duration, Utc};
use hmac::{Hmac, Mac};
use rand::{rngs::OsRng, RngCore};
use serde::Deserialize;
use serde::Serialize;
use sha2::Sha256;
use sqlx::{postgres::PgRow, Row};
use std::time::Duration as StdDuration;
use uuid::Uuid;

use crate::{auth, db::sqlx, error::ApiError, state::AppState};

use crate::models::AssetDto;

type HmacSha256 = Hmac<Sha256>;
const API_VERSION: &str = "2026-10";

#[derive(Deserialize)]
pub struct InstallQuery {
    shop: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct VariantPayment {
    network_id: String,
    asset: AssetDto,
    amount: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuyerDetails {
    email: String,
    first_name: String,
    last_name: String,
    address1: String,
    address2: Option<String>,
    city: String,
    province: Option<String>,
    postal_code: String,
    country_code: String,
    phone: Option<String>,
}

pub async fn get_checkout(
    State(state): State<AppState>,
    Path(slug): Path<String>,
) -> Result<axum::Json<serde_json::Value>, ApiError> {
    let row = sqlx::query("SELECT c.product_title,c.variant_title,c.requires_shipping,l.network_id,l.asset,l.amount_display FROM shopify_checkout_sessions c JOIN payment_links l USING(slug) WHERE c.slug=? AND l.active=TRUE AND (l.expires_at IS NULL OR l.expires_at>UTC_TIMESTAMP(6))")
        .bind(slug).fetch_optional(&state.pool).await?
        .ok_or_else(|| ApiError::not_found("Shopify checkout not found or expired."))?;
    Ok(axum::Json(serde_json::json!({
        "productTitle": row.try_get::<String, _>("product_title")?,
        "variantTitle": row.try_get::<String, _>("variant_title")?,
        "requiresShipping": row.try_get::<bool, _>("requires_shipping")?,
        "networkId": row.try_get::<String, _>("network_id")?,
        "asset": row.try_get::<serde_json::Value, _>("asset")?,
        "amountDisplay": row.try_get::<String, _>("amount_display")?,
    })))
}

pub async fn save_buyer_details(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    axum::Json(mut details): axum::Json<BuyerDetails>,
) -> Result<StatusCode, ApiError> {
    details.email = details.email.trim().to_owned();
    details.first_name = details.first_name.trim().to_owned();
    details.last_name = details.last_name.trim().to_owned();
    details.country_code.make_ascii_uppercase();
    let requires_shipping: bool = sqlx::query("SELECT c.requires_shipping FROM shopify_checkout_sessions c JOIN payment_links l USING(slug) WHERE c.slug=? AND l.active=TRUE")
        .bind(&slug).fetch_optional(&state.pool).await?
        .ok_or_else(|| ApiError::not_found("Shopify checkout not found."))?.try_get("requires_shipping")?;
    validate_buyer_details(&details, requires_shipping)?;
    let encrypted = serde_json::to_vec(&details).map_err(|_| ApiError::internal())?;
    let key = state
        .config
        .shopify_token_encryption_key
        .as_ref()
        .ok_or_else(not_configured)?;
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| ApiError::internal())?;
    let mut nonce = [0u8; 12];
    OsRng.fill_bytes(&mut nonce);
    let ciphertext = cipher
        .encrypt(&Nonce::from(nonce), encrypted.as_ref())
        .map_err(|_| ApiError::internal())?;
    let mut tx = state.pool.begin().await?;
    let link = sqlx::query(
        "SELECT claims_used,expires_at,active FROM payment_links WHERE slug=? FOR UPDATE",
    )
    .bind(&slug)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| ApiError::not_found("Shopify checkout not found."))?;
    let claims_used: i32 = link.try_get("claims_used")?;
    let expires_at: Option<chrono::DateTime<Utc>> = link.try_get("expires_at")?;
    if !link.try_get::<bool, _>("active")?
        || claims_used != 0
        || expires_at.is_some_and(|value| value <= Utc::now())
    {
        return Err(ApiError::conflict(
            "Buyer details can no longer be changed for this checkout.",
        ));
    }
    let update = sqlx::query("UPDATE shopify_checkout_sessions SET buyer_data_ciphertext=?,buyer_data_nonce=? WHERE slug=?")
        .bind(ciphertext).bind(nonce.as_slice()).bind(&slug).execute(&mut *tx).await?;
    if update.rows_affected() != 1 {
        return Err(ApiError::not_found("Shopify checkout not found."));
    }
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

fn validate_buyer_details(details: &BuyerDetails, requires_shipping: bool) -> Result<(), ApiError> {
    let email = details.email.trim();
    if email.len() > 254 || !email.contains('@') || email.chars().any(char::is_control) {
        return Err(ApiError::bad_request("Enter a valid email address."));
    }
    for (label, value, max) in [
        ("First name", details.first_name.as_str(), 100usize),
        ("Last name", details.last_name.as_str(), 100usize),
    ] {
        if value.trim().is_empty()
            || value.chars().count() > max
            || value.chars().any(char::is_control)
        {
            return Err(ApiError::bad_request(format!(
                "{label} is required and must be no longer than {max} characters."
            )));
        }
    }
    if requires_shipping {
        for (label, value, max) in [
            ("Address", details.address1.as_str(), 255usize),
            ("City", details.city.as_str(), 100usize),
            ("Postal code", details.postal_code.as_str(), 32usize),
        ] {
            if value.trim().is_empty()
                || value.chars().count() > max
                || value.chars().any(char::is_control)
            {
                return Err(ApiError::bad_request(format!(
                    "{label} is required and must be no longer than {max} characters."
                )));
            }
        }
    }
    if requires_shipping
        && (details.country_code.len() != 2
            || !details
                .country_code
                .bytes()
                .all(|value| value.is_ascii_alphabetic()))
    {
        return Err(ApiError::bad_request(
            "Country code must be a two-letter ISO code.",
        ));
    }
    for value in [
        details.address2.as_deref(),
        details.province.as_deref(),
        details.phone.as_deref(),
    ]
    .into_iter()
    .flatten()
    {
        if value.chars().count() > 255 || value.chars().any(char::is_control) {
            return Err(ApiError::bad_request(
                "Shipping details contain an invalid field.",
            ));
        }
    }
    Ok(())
}

pub async fn proxy_checkout(
    State(state): State<AppState>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Redirect, ApiError> {
    let signature = params
        .get("signature")
        .ok_or_else(|| ApiError::forbidden("Shopify app proxy signature is missing."))?;
    verify_proxy_signature(
        &params,
        signature,
        state
            .config
            .shopify_api_secret
            .as_deref()
            .ok_or_else(not_configured)?,
    )?;
    let shop = validate_shop(params.get("shop").map(String::as_str).unwrap_or_default())?;
    let timestamp = params
        .get("timestamp")
        .and_then(|value| value.parse::<i64>().ok())
        .ok_or_else(|| ApiError::forbidden("Shopify app proxy timestamp is invalid."))?;
    if (Utc::now().timestamp() - timestamp).abs() > 86_400 {
        return Err(ApiError::forbidden(
            "Shopify app proxy request has expired.",
        ));
    }
    let variant_number = params
        .get("variant")
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|value| *value > 0)
        .ok_or_else(|| ApiError::bad_request("A valid Shopify product variant is required."))?;
    let quantity = match params.get("quantity") {
        Some(value) => value
            .parse::<u32>()
            .ok()
            .filter(|value| (1..=99).contains(value))
            .ok_or_else(|| ApiError::bad_request("Quantity must be between 1 and 99."))?,
        None => 1,
    };
    let shop_row = sqlx::query("SELECT s.merchant_id, s.access_token_ciphertext, s.access_token_nonce FROM shopify_shops s WHERE s.shop_domain=?")
        .bind(&shop).fetch_optional(&state.pool).await?
        .ok_or_else(|| ApiError::not_found("This Shopify store is not connected to WorldzPayments."))?;
    let merchant_id: String = shop_row.try_get("merchant_id")?;
    let token = decrypt_access_token(&state, &shop_row)?;
    let variant_gid = format!("gid://shopify/ProductVariant/{variant_number}");
    let response = state.http.post(format!("https://{shop}/admin/api/{API_VERSION}/graphql.json"))
        .header("X-Shopify-Access-Token", token)
        .json(&serde_json::json!({"query":"query WorldzVariant($id: ID!) { productVariant(id: $id) { title requiresShipping price { amount currencyCode } product { title } metafield(namespace: \"worldz\", key: \"payment\") { value } } }","variables":{"id":variant_gid}}))
        .send().await.map_err(|_| ApiError::unavailable("Shopify catalog lookup failed."))?;
    if !response.status().is_success() {
        return Err(ApiError::unavailable(
            "Shopify could not verify this product variant.",
        ));
    }
    let catalog: serde_json::Value = response
        .json()
        .await
        .map_err(|_| ApiError::unavailable("Invalid Shopify catalog response."))?;
    if catalog.get("errors").is_some() {
        return Err(ApiError::bad_request(
            "Shopify could not load this product variant.",
        ));
    }
    let variant = catalog
        .pointer("/data/productVariant")
        .filter(|value| !value.is_null())
        .ok_or_else(|| ApiError::not_found("Shopify product variant was not found."))?;
    let payment_json = variant
        .pointer("/metafield/value")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| {
            ApiError::bad_request(
                "Set the worldz.payment JSON metafield on this product variant first.",
            )
        })?;
    let payment: VariantPayment = serde_json::from_str(payment_json).map_err(|_| {
        ApiError::bad_request("worldz.payment must contain networkId, asset, and amount.")
    })?;
    let network_id = match payment.network_id.as_str() {
        "testnet" => worldz_near_protocol::NetworkId::Testnet,
        "mainnet" => worldz_near_protocol::NetworkId::Mainnet,
        _ => {
            return Err(ApiError::bad_request(
                "worldz.payment networkId must be testnet or mainnet.",
            ))
        }
    };
    if state.config.network(network_id).router_id.is_none()
        || state.config.network(network_id).fee_recipient.is_none()
        || state.config.network(network_id).signer.is_none()
    {
        return Err(ApiError::unavailable(
            "NEAR checkout is not configured for this Shopify product's network.",
        ));
    }
    if let AssetDto::Nep141 { contract_id, .. } = &payment.asset {
        if !state
            .config
            .network(network_id)
            .ft_allowlist
            .iter()
            .any(|allowed| allowed == contract_id)
        {
            return Err(ApiError::bad_request(
                "The product payment token is not enabled on this network.",
            ));
        }
        contract_id
            .parse::<near_account_id::AccountId>()
            .map_err(|_| ApiError::bad_request("The product payment token contract is invalid."))?;
        let metadata = crate::near_rpc::ft_metadata(&state, network_id, contract_id).await?;
        let (expected_symbol, expected_decimals) = match &payment.asset {
            AssetDto::Nep141 {
                symbol, decimals, ..
            } => (symbol.as_str(), *decimals),
            AssetDto::Native { .. } => unreachable!(),
        };
        if metadata.get("decimals").and_then(serde_json::Value::as_u64)
            != Some(u64::from(expected_decimals))
            || metadata.get("symbol").and_then(serde_json::Value::as_str) != Some(expected_symbol)
        {
            return Err(ApiError::bad_request(
                "The product payment token metadata does not match the selected asset.",
            ));
        }
    } else if !matches!(&payment.asset, AssetDto::Native { symbol, decimals } if symbol == "NEAR" && *decimals == 24)
    {
        return Err(ApiError::bad_request(
            "Native NEAR must use symbol NEAR and 24 decimals.",
        ));
    }
    let decimals = match &payment.asset {
        AssetDto::Native { decimals, .. } | AssetDto::Nep141 { decimals, .. } => *decimals,
    };
    let amount = crate::api::decimal_to_base_units(&payment.amount, decimals)?;
    if amount == 0 {
        return Err(ApiError::bad_request(
            "Shopify token price must be greater than zero.",
        ));
    }
    if payment.amount.trim().len() > 64 {
        return Err(ApiError::bad_request("Shopify token price is too long."));
    }
    let amount_display = payment.amount.trim();
    let price = variant
        .pointer("/price/amount")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default();
    let currency = variant
        .pointer("/price/currencyCode")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default();
    let title = variant
        .pointer("/product/title")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("Shopify item");
    let variant_title = variant
        .get("title")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("Default");
    let requires_shipping = variant
        .get("requiresShipping")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(true);
    if price.is_empty() || currency.len() != 3 {
        return Err(ApiError::bad_request(
            "Shopify variant pricing is unavailable.",
        ));
    }
    let mut slug = String::with_capacity(24);
    let mut bytes = [0u8; 18];
    OsRng.fill_bytes(&mut bytes);
    slug.push_str(&URL_SAFE_NO_PAD.encode(bytes));
    let display_name: String = format!("{title} — {variant_title}")
        .chars()
        .take(80)
        .collect();
    let asset = serde_json::to_value(&payment.asset).map_err(|_| ApiError::internal())?;
    let mut tx = state.pool.begin().await?;
    sqlx::query("INSERT INTO payment_links (slug,merchant_id,network_id,asset,amount,amount_display,display_name,expires_at,multi_pay,max_redemptions) VALUES (?,?,?,?,?,?,?,?,false,1)")
        .bind(&slug).bind(&merchant_id).bind(network_id.as_str()).bind(asset).bind(amount.to_string()).bind(amount_display).bind(&display_name).bind(Utc::now() + Duration::minutes(30))
        .execute(&mut *tx).await?;
    sqlx::query("INSERT INTO shopify_checkout_sessions (slug,shop_domain,variant_id,quantity,product_title,variant_title,unit_price,currency_code,requires_shipping) VALUES (?,?,?,?,?,?,?,?,?)")
        .bind(&slug).bind(&shop).bind(variant_number.to_string()).bind(quantity as i32).bind(title).bind(variant_title).bind(price).bind(currency).bind(requires_shipping)
        .execute(&mut *tx).await?;
    tx.commit().await?;
    let checkout_base = state
        .config
        .shopify_checkout_url
        .as_deref()
        .ok_or_else(not_configured)?;
    Ok(Redirect::to(&format!(
        "{}/shopify/checkout/{slug}",
        checkout_base.trim_end_matches('/')
    )))
}

fn verify_proxy_signature(
    params: &HashMap<String, String>,
    signature: &str,
    secret: &str,
) -> Result<(), ApiError> {
    let message = params
        .iter()
        .filter(|(key, _)| key.as_str() != "signature")
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect::<BTreeMap<_, _>>()
        .into_iter()
        .map(|(key, value)| format!("{key}={value}"))
        .collect::<Vec<_>>()
        .join("&");
    let mut mac =
        <HmacSha256 as Mac>::new_from_slice(secret.as_bytes()).map_err(|_| ApiError::internal())?;
    mac.update(message.as_bytes());
    let expected = hex::encode(mac.finalize().into_bytes());
    if expected.len() != signature.len()
        || !expected
            .as_bytes()
            .iter()
            .zip(signature.as_bytes())
            .fold(0u8, |diff, (a, b)| diff | (a ^ b))
            .eq(&0)
    {
        return Err(ApiError::forbidden(
            "Shopify app proxy signature is invalid.",
        ));
    }
    Ok(())
}

fn decrypt_access_token(state: &AppState, row: &PgRow) -> Result<String, ApiError> {
    let key = state
        .config
        .shopify_token_encryption_key
        .as_ref()
        .ok_or_else(not_configured)?;
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| ApiError::internal())?;
    let ciphertext: Vec<u8> = row.try_get("access_token_ciphertext")?;
    let nonce: Vec<u8> = row.try_get("access_token_nonce")?;
    let nonce: [u8; 12] = nonce.try_into().map_err(|_| ApiError::internal())?;
    let plaintext = cipher
        .decrypt(&Nonce::from(nonce), ciphertext.as_ref())
        .map_err(|_| ApiError::internal())?;
    String::from_utf8(plaintext).map_err(|_| ApiError::internal())
}

fn decrypt_private_json<T: serde::de::DeserializeOwned>(
    state: &AppState,
    ciphertext: &[u8],
    nonce: &[u8],
) -> Result<T, ApiError> {
    let key = state
        .config
        .shopify_token_encryption_key
        .as_ref()
        .ok_or_else(not_configured)?;
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| ApiError::internal())?;
    let nonce: [u8; 12] = nonce.try_into().map_err(|_| ApiError::internal())?;
    let plaintext = cipher
        .decrypt(&Nonce::from(nonce), ciphertext)
        .map_err(|_| ApiError::internal())?;
    serde_json::from_slice(&plaintext).map_err(|_| ApiError::internal())
}

pub fn spawn_order_sync_worker(state: AppState) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(StdDuration::from_secs(15));
        loop {
            interval.tick().await;
            if let Err(error) = sqlx::query("UPDATE shopify_order_sync SET state='pending', next_attempt_at=UTC_TIMESTAMP(6) WHERE state='processing' AND updated_at < UTC_TIMESTAMP(6) - INTERVAL '5 minutes'")
                .execute(&state.pool).await {
                tracing::warn!(%error, "could not recover stale Shopify order sync jobs");
            }
            let rows = match sqlx::query("SELECT s.slug FROM shopify_order_sync s WHERE s.state='pending' AND s.next_attempt_at<=UTC_TIMESTAMP(6) ORDER BY s.created_at LIMIT 1")
                .fetch_all(&state.pool).await {
                Ok(rows) => rows,
                Err(error) => { tracing::error!(%error, "could not load Shopify order sync queue"); continue; }
            };
            for row in rows {
                let slug: String = match row.try_get("slug") {
                    Ok(slug) => slug,
                    Err(error) => {
                        tracing::error!(%error, "invalid Shopify sync row");
                        continue;
                    }
                };
                let claimed = match sqlx::query("UPDATE shopify_order_sync SET state='processing', attempts=attempts+1, updated_at=UTC_TIMESTAMP(6) WHERE slug=? AND state='pending'")
                    .bind(&slug).execute(&state.pool).await {
                    Ok(result) => result.rows_affected() == 1,
                    Err(error) => { tracing::warn!(%error, %slug, "could not claim Shopify order sync"); false }
                };
                if !claimed {
                    continue;
                }
                match sync_shopify_order(&state, &slug).await {
                    Ok(shopify_order_id) => {
                        if let Err(error) = sqlx::query("UPDATE shopify_order_sync SET state='delivered', shopify_order_id=?, last_error=NULL, updated_at=UTC_TIMESTAMP(6) WHERE slug=?")
                            .bind(shopify_order_id).bind(&slug).execute(&state.pool).await {
                            tracing::error!(%error, %slug, "could not persist Shopify order sync result");
                        } else if let Err(error) = sqlx::query("UPDATE shopify_checkout_sessions SET buyer_data_ciphertext=NULL,buyer_data_nonce=NULL WHERE slug=?")
                            .bind(&slug).execute(&state.pool).await {
                            tracing::warn!(%error, %slug, "could not clear copied Shopify checkout details");
                        }
                    }
                    Err(error) => {
                        let message: String = error.to_string().chars().take(400).collect();
                        let _ = sqlx::query("UPDATE shopify_order_sync SET state=CASE WHEN attempts>=12 THEN 'failed' ELSE 'pending' END, last_error=?, next_attempt_at=UTC_TIMESTAMP(6) + (LEAST(POWER(2,LEAST(attempts,10)),3600) * INTERVAL '1 second'), updated_at=UTC_TIMESTAMP(6) WHERE slug=?")
                            .bind(message).bind(&slug).execute(&state.pool).await;
                        tracing::warn!(%slug, error = %error, "Shopify order creation deferred");
                    }
                }
            }
        }
    });
}

async fn sync_shopify_order(state: &AppState, slug: &str) -> Result<String, ApiError> {
    let row = sqlx::query("SELECT c.shop_domain,c.variant_id,c.quantity,c.product_title,c.variant_title,c.unit_price,c.currency_code,c.requires_shipping,c.buyer_data_ciphertext,c.buyer_data_nonce,s.access_token_ciphertext,s.access_token_nonce,o.order_id,o.network_id,o.amount,o.transaction_hash,o.settlement_receipt_id FROM shopify_checkout_sessions c JOIN shopify_shops s USING(shop_domain) JOIN orders o ON o.link_slug=c.slug WHERE c.slug=? AND o.state='SETTLED' AND o.settlement_receipt_id IS NOT NULL ORDER BY o.updated_at DESC LIMIT 1")
        .bind(slug).fetch_optional(&state.pool).await?
        .ok_or_else(|| ApiError::conflict("Shopify checkout has no verified settled NEAR order."))?;
    let shop: String = row.try_get("shop_domain")?;
    let access_token = decrypt_access_token(state, &row)?;
    let order_id: String = row.try_get("order_id")?;
    let tag = format!("worldz-{slug}");
    let lookup = state.http.post(format!("https://{shop}/admin/api/{API_VERSION}/graphql.json"))
        .header("X-Shopify-Access-Token", &access_token)
        .json(&serde_json::json!({"query":"query WorldzFindOrder($query: String!) { orders(first: 1, query: $query) { nodes { id } } }","variables":{"query":format!("tag:{tag}")}}))
        .send().await.map_err(|_| ApiError::unavailable("Shopify order lookup failed."))?;
    if !lookup.status().is_success() {
        return Err(ApiError::unavailable("Shopify rejected the order lookup."));
    }
    let found: serde_json::Value = lookup
        .json()
        .await
        .map_err(|_| ApiError::unavailable("Invalid Shopify order lookup response."))?;
    if let Some(id) = found
        .pointer("/data/orders/nodes/0/id")
        .and_then(serde_json::Value::as_str)
    {
        return Ok(id.to_owned());
    }
    if found.get("errors").is_some() {
        return Err(ApiError::unavailable(
            "Shopify order lookup returned errors.",
        ));
    }

    let variant_id: String = row.try_get("variant_id")?;
    let quantity: i32 = row.try_get("quantity")?;
    let unit_price: String = row.try_get("unit_price")?;
    let currency: String = row.try_get("currency_code")?;
    let product_title: String = row.try_get("product_title")?;
    let variant_title: String = row.try_get("variant_title")?;
    let requires_shipping: bool = row.try_get("requires_shipping")?;
    let buyer_ciphertext: Option<Vec<u8>> = row.try_get("buyer_data_ciphertext")?;
    let buyer_nonce: Option<Vec<u8>> = row.try_get("buyer_data_nonce")?;
    let (buyer_ciphertext, buyer_nonce) = buyer_ciphertext
        .zip(buyer_nonce)
        .ok_or_else(|| ApiError::conflict("Shopify checkout is missing buyer details."))?;
    let buyer = decrypt_private_json::<BuyerDetails>(state, &buyer_ciphertext, &buyer_nonce)?;
    let network_id: String = row.try_get("network_id")?;
    let payment_amount: String = row.try_get("amount")?;
    let transaction_hash: String = row.try_get("transaction_hash")?;
    let settlement_receipt: String = row.try_get("settlement_receipt_id")?;
    let input = serde_json::json!({
        "variantId": format!("gid://shopify/ProductVariant/{variant_id}"),
        "quantity": quantity,
        "priceSet": {"shopMoney": {"amount": unit_price, "currencyCode": currency}},
    });
    let mut order_input = serde_json::json!({
        "lineItems":[input],"financialStatus":"PAID","sourceName":"WorldzPayments",
        "email":buyer.email,
        "tags":["worldzpayments",tag],
        "note":format!("{product_title} — {variant_title}. Worldz NEAR order {order_id}; network {network_id}; paid {payment_amount} base units; transaction {transaction_hash}; settlement receipt {settlement_receipt}. Shipping and tax are merchant-managed."),
    });
    if requires_shipping {
        order_input["shippingAddress"] = serde_json::json!({
            "firstName":buyer.first_name,"lastName":buyer.last_name,"address1":buyer.address1,
            "address2":buyer.address2,"city":buyer.city,"province":buyer.province,
            "zip":buyer.postal_code,"countryCode":buyer.country_code,"phone":buyer.phone,
        });
    }
    let mutation = "mutation WorldzCreatePaidOrder($order: OrderCreateOrderInput!) { orderCreate(order: $order) { order { id } userErrors { field message } } }";
    let response = state
        .http
        .post(format!(
            "https://{shop}/admin/api/{API_VERSION}/graphql.json"
        ))
        .header("X-Shopify-Access-Token", &access_token)
        .json(&serde_json::json!({"query":mutation,"variables":{"order":order_input}}))
        .send()
        .await
        .map_err(|_| ApiError::unavailable("Shopify order creation failed."))?;
    if !response.status().is_success() {
        return Err(ApiError::unavailable("Shopify rejected the paid order."));
    }
    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|_| ApiError::unavailable("Invalid Shopify order creation response."))?;
    if body.get("errors").is_some()
        || body
            .pointer("/data/orderCreate/userErrors")
            .and_then(serde_json::Value::as_array)
            .is_some_and(|errors| !errors.is_empty())
    {
        let reason = body
            .pointer("/data/orderCreate/userErrors/0/message")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("Shopify order creation returned errors.");
        return Err(ApiError::unavailable(reason.to_owned()));
    }
    body.pointer("/data/orderCreate/order/id")
        .and_then(serde_json::Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| ApiError::unavailable("Shopify did not return a created order ID."))
}

pub async fn connection(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<axum::Json<serde_json::Value>, ApiError> {
    let merchant = auth::current_merchant(&state, &headers).await?;
    let rows = sqlx::query("SELECT shop_domain, scopes, installed_at FROM shopify_shops WHERE merchant_id=? ORDER BY installed_at DESC")
        .bind(merchant.merchant_id).fetch_all(&state.pool).await?;
    let shops = rows.iter().map(|row| Ok(serde_json::json!({
        "shopDomain": row.try_get::<String, _>("shop_domain")?,
        "scopes": row.try_get::<String, _>("scopes")?,
        "installedAtMs": row.try_get::<chrono::DateTime<Utc>, _>("installed_at")?.timestamp_millis(),
    }))).collect::<Result<Vec<_>, sqlx::Error>>()?;
    Ok(axum::Json(serde_json::json!({"shops": shops})))
}

#[derive(Deserialize)]
pub struct CallbackQuery {
    shop: String,
    code: String,
    state: String,
    hmac: String,
    timestamp: String,
    #[serde(flatten)]
    extra: BTreeMap<String, String>,
}

pub async fn install(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<InstallQuery>,
) -> Result<Redirect, ApiError> {
    let merchant = auth::current_merchant(&state, &headers).await?;
    let shop = validate_shop(&query.shop)?;
    let api_key = state
        .config
        .shopify_api_key
        .as_deref()
        .ok_or_else(not_configured)?;
    state
        .config
        .shopify_api_secret
        .as_deref()
        .ok_or_else(not_configured)?;
    let app_url = state
        .config
        .shopify_app_url
        .as_deref()
        .ok_or_else(not_configured)?;
    let nonce = Uuid::new_v4().to_string();
    sqlx::query("DELETE FROM shopify_oauth_states WHERE expires_at < UTC_TIMESTAMP(6)")
        .execute(&state.pool)
        .await?;
    sqlx::query("INSERT INTO shopify_oauth_states (state, merchant_id, shop_domain, expires_at) VALUES (?,?,?,?)")
        .bind(&nonce).bind(&merchant.merchant_id).bind(&shop).bind(Utc::now() + Duration::minutes(10))
        .execute(&state.pool).await?;
    let redirect_uri = format!("{}/v1/shopify/callback", app_url.trim_end_matches('/'));
    let mut authorize = url::Url::parse(&format!("https://{shop}/admin/oauth/authorize"))
        .map_err(|_| ApiError::internal())?;
    authorize
        .query_pairs_mut()
        .append_pair("client_id", api_key)
        .append_pair("scope", "read_products,read_orders,write_orders")
        .append_pair("redirect_uri", &redirect_uri)
        .append_pair("state", &nonce);
    Ok(Redirect::to(authorize.as_str()))
}

pub async fn callback(
    State(state): State<AppState>,
    Query(query): Query<CallbackQuery>,
) -> Result<(StatusCode, String), ApiError> {
    let secret = state
        .config
        .shopify_api_secret
        .as_deref()
        .ok_or_else(not_configured)?;
    let shop = validate_shop(&query.shop)?;
    verify_hmac(&query, secret)?;
    let state_row = sqlx::query("SELECT merchant_id, shop_domain FROM shopify_oauth_states WHERE state=? AND expires_at > UTC_TIMESTAMP(6)")
        .bind(&query.state).fetch_optional(&state.pool).await?
        .ok_or_else(|| ApiError::forbidden("Shopify OAuth state is missing or expired."))?;
    if state_row.try_get::<String, _>("shop_domain")? != shop {
        return Err(ApiError::forbidden(
            "Shopify OAuth shop does not match the install request.",
        ));
    }
    let consumed = sqlx::query("DELETE FROM shopify_oauth_states WHERE state=?")
        .bind(&query.state)
        .execute(&state.pool)
        .await?;
    if consumed.rows_affected() != 1 {
        return Err(ApiError::forbidden("Shopify OAuth state was already used."));
    }

    let api_key = state
        .config
        .shopify_api_key
        .as_deref()
        .ok_or_else(not_configured)?;
    let response = state
        .http
        .post(format!("https://{shop}/admin/oauth/access_token"))
        .json(
            &serde_json::json!({"client_id": api_key, "client_secret": secret, "code": query.code}),
        )
        .send()
        .await
        .map_err(|_| ApiError::unavailable("Could not exchange Shopify OAuth code."))?;
    if !response.status().is_success() {
        return Err(ApiError::forbidden(
            "Shopify rejected the OAuth authorization.",
        ));
    }
    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|_| ApiError::unavailable("Invalid Shopify OAuth response."))?;
    let access_token = body
        .get("access_token")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| ApiError::unavailable("Shopify OAuth response omitted its access token."))?;
    let scopes = body
        .get("scope")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default();
    let key = state
        .config
        .shopify_token_encryption_key
        .ok_or_else(not_configured)?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|_| ApiError::internal())?;
    let mut nonce = [0u8; 12];
    OsRng.fill_bytes(&mut nonce);
    let nonce_value = Nonce::from(nonce);
    let ciphertext = cipher
        .encrypt(&nonce_value, access_token.as_bytes())
        .map_err(|_| ApiError::internal())?;
    let merchant_id: String = state_row.try_get("merchant_id")?;
    sqlx::query("INSERT INTO shopify_shops (shop_domain, merchant_id, access_token_ciphertext, access_token_nonce, scopes) VALUES (?,?,?,?,?) ON CONFLICT (shop_domain) DO UPDATE SET merchant_id=EXCLUDED.merchant_id, access_token_ciphertext=EXCLUDED.access_token_ciphertext, access_token_nonce=EXCLUDED.access_token_nonce, scopes=EXCLUDED.scopes, updated_at=UTC_TIMESTAMP(6)")
        .bind(&shop).bind(merchant_id).bind(ciphertext).bind(nonce.as_slice()).bind(scopes)
        .execute(&state.pool).await?;
    Ok((
        StatusCode::OK,
        "Shopify store connected. You may close this tab and return to WorldzPayments.".to_owned(),
    ))
}

fn validate_shop(shop: &str) -> Result<String, ApiError> {
    let shop = shop.trim().to_ascii_lowercase();
    let valid = shop.strip_suffix(".myshopify.com").is_some_and(|prefix| {
        !prefix.is_empty()
            && prefix.len() <= 100
            && prefix
                .bytes()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
            && !prefix.starts_with('-')
            && !prefix.ends_with('-')
    });
    if !valid {
        return Err(ApiError::bad_request(
            "shop must be a valid *.myshopify.com domain.",
        ));
    }
    Ok(shop)
}

fn verify_hmac(query: &CallbackQuery, secret: &str) -> Result<(), ApiError> {
    let timestamp = query
        .timestamp
        .parse::<i64>()
        .map_err(|_| ApiError::forbidden("Shopify OAuth timestamp is invalid."))?;
    if (Utc::now().timestamp() - timestamp).abs() > 86_400 {
        return Err(ApiError::forbidden("Shopify OAuth request has expired."));
    }
    let mut params = query.extra.clone();
    params.insert("code".to_owned(), query.code.clone());
    params.insert("shop".to_owned(), query.shop.clone());
    params.insert("state".to_owned(), query.state.clone());
    params.insert("timestamp".to_owned(), query.timestamp.clone());
    let message = params
        .into_iter()
        .map(|(key, value)| format!("{key}={value}"))
        .collect::<Vec<_>>()
        .join("&");
    let mut mac =
        <HmacSha256 as Mac>::new_from_slice(secret.as_bytes()).map_err(|_| ApiError::internal())?;
    mac.update(message.as_bytes());
    let expected = hex::encode(mac.finalize().into_bytes());
    if expected.as_bytes().len() != query.hmac.as_bytes().len()
        || !expected
            .as_bytes()
            .iter()
            .zip(query.hmac.as_bytes())
            .fold(0u8, |diff, (a, b)| diff | (a ^ b))
            .eq(&0)
    {
        return Err(ApiError::forbidden("Shopify OAuth signature is invalid."));
    }
    Ok(())
}

fn not_configured() -> ApiError {
    ApiError::unavailable("Shopify integration is not configured.")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shop_domain_must_be_a_shopify_host() {
        assert_eq!(
            validate_shop("Demo-Shop.myshopify.com").unwrap(),
            "demo-shop.myshopify.com"
        );
        assert!(validate_shop("demo-shop.myshopify.com.attacker.test").is_err());
        assert!(validate_shop("-demo.myshopify.com").is_err());
    }

    #[test]
    fn shipping_address_is_required_only_for_physical_variants() {
        let details = BuyerDetails {
            email: "buyer@example.com".to_owned(),
            first_name: "Ada".to_owned(),
            last_name: "Lovelace".to_owned(),
            address1: String::new(),
            address2: None,
            city: String::new(),
            province: None,
            postal_code: String::new(),
            country_code: String::new(),
            phone: None,
        };
        assert!(validate_buyer_details(&details, false).is_ok());
        assert!(validate_buyer_details(&details, true).is_err());
    }

    #[test]
    fn oauth_hmac_covers_all_query_parameters_and_fresh_timestamp() {
        let secret = "app-secret";
        let mut query = CallbackQuery {
            shop: "demo.myshopify.com".to_owned(),
            code: "authorization-code".to_owned(),
            state: Uuid::new_v4().to_string(),
            hmac: String::new(),
            timestamp: Utc::now().timestamp().to_string(),
            extra: BTreeMap::from([("host".to_owned(), "admin-host".to_owned())]),
        };
        let mut params = query.extra.clone();
        params.insert("code".to_owned(), query.code.clone());
        params.insert("shop".to_owned(), query.shop.clone());
        params.insert("state".to_owned(), query.state.clone());
        params.insert("timestamp".to_owned(), query.timestamp.clone());
        let message = params
            .into_iter()
            .map(|(key, value)| format!("{key}={value}"))
            .collect::<Vec<_>>()
            .join("&");
        let mut mac = <HmacSha256 as Mac>::new_from_slice(secret.as_bytes()).unwrap();
        mac.update(message.as_bytes());
        query.hmac = hex::encode(mac.finalize().into_bytes());
        assert!(verify_hmac(&query, secret).is_ok());
        query.extra.insert("host".to_owned(), "tampered".to_owned());
        assert!(verify_hmac(&query, secret).is_err());
    }

    #[test]
    fn app_proxy_signature_authenticates_variant_and_store_parameters() {
        let secret = "app-secret";
        let mut params = HashMap::from([
            ("shop".to_owned(), "demo.myshopify.com".to_owned()),
            ("variant".to_owned(), "12345".to_owned()),
            ("quantity".to_owned(), "2".to_owned()),
        ]);
        let message = params
            .iter()
            .map(|(key, value)| (key.clone(), value.clone()))
            .collect::<BTreeMap<_, _>>()
            .into_iter()
            .map(|(key, value)| format!("{key}={value}"))
            .collect::<Vec<_>>()
            .join("&");
        let mut mac = <HmacSha256 as Mac>::new_from_slice(secret.as_bytes()).unwrap();
        mac.update(message.as_bytes());
        let signature = hex::encode(mac.finalize().into_bytes());
        assert!(verify_proxy_signature(&params, &signature, secret).is_ok());
        params.insert("variant".to_owned(), "99999".to_owned());
        assert!(verify_proxy_signature(&params, &signature, secret).is_err());
    }
}
