use serde::{Deserialize, Serialize};
use serde_json::Value;
use worldz_near_protocol::{NetworkId, OrderState};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum AssetDto {
    Native {
        symbol: String,
        decimals: u8,
    },
    Nep141 {
        #[serde(rename = "contractId")]
        contract_id: String,
        symbol: String,
        decimals: u8,
    },
}

impl AssetDto {
    pub fn protocol_asset(&self) -> worldz_near_protocol::Asset {
        match self {
            Self::Native { .. } => worldz_near_protocol::Asset::Native,
            Self::Nep141 { contract_id, .. } => worldz_near_protocol::Asset::Nep141 {
                contract_id: contract_id.clone(),
            },
        }
    }

    pub fn token_contract_id(&self) -> Option<&str> {
        match self {
            Self::Native { .. } => None,
            Self::Nep141 { contract_id, .. } => Some(contract_id),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MerchantProfile {
    pub merchant_id: String,
    pub account_id: String,
    pub payout_account_id: String,
    pub display_name: String,
    pub webhook_url: Option<String>,
    pub created_at_ms: i64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentLink {
    pub slug: String,
    pub merchant_id: String,
    pub display_name: String,
    pub payout_account_id: String,
    pub network_id: NetworkId,
    pub asset: AssetDto,
    pub amount: String,
    pub amount_display: String,
    pub expires_at_seconds: Option<i64>,
    pub multi_pay: bool,
    pub max_redemptions: Option<i32>,
    pub created_at_ms: i64,
    pub claims_used: i32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderStatusDto {
    pub payment_description: Option<String>,
    pub customer_name: Option<String>,
    pub merchant_name: Option<String>,
    pub merchant_reference: Option<String>,
    pub order_id: String,
    pub merchant_id: String,
    pub network_id: NetworkId,
    pub contract_id: String,
    pub state: OrderState,
    pub asset: AssetDto,
    pub amount: String,
    pub fee: String,
    pub net: String,
    pub payer_account_id: String,
    pub merchant_account_id: String,
    pub payout_account_id: String,
    pub transaction_hash: Option<String>,
    pub settlement_receipt_id: Option<String>,
    pub updated_at_ms: i64,
    pub failure_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub authorization: Option<Value>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentEventDto {
    pub id: String,
    pub network_id: NetworkId,
    pub contract_id: String,
    pub receipt_id: String,
    pub settlement_receipt_id: Option<String>,
    pub transaction_hash: String,
    pub order_id: String,
    pub merchant_id: String,
    pub payer_account_id: String,
    pub payout_account_id: String,
    pub asset: AssetDto,
    pub amount: String,
    pub fee: String,
    pub net: String,
    pub state: OrderState,
    pub timestamp_ms: i64,
    pub merchant_reference: Option<String>,
    pub source: Option<String>,
    pub webhook: Option<WebhookDeliveryDto>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebhookDeliveryDto {
    pub id: String,
    pub event_id: String,
    pub state: String,
    pub attempts: i32,
    pub last_error: Option<String>,
    pub updated_at_ms: i64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChallengeRequest {
    pub account_id: String,
    pub network_id: NetworkId,
    pub state: String,
    pub purpose: ChallengePurpose,
    pub payout_account_id: Option<String>,
    pub display_name: Option<String>,
    pub webhook_url: Option<String>,
    pub checkout_slug: Option<String>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ChallengePurpose {
    Login,
    Onboarding,
    PayoutUpdate,
    Checkout,
}

impl ChallengePurpose {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Login => "login",
            Self::Onboarding => "onboarding",
            Self::PayoutUpdate => "payout_update",
            Self::Checkout => "checkout",
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChallengeResponse {
    pub message: String,
    pub nonce: String,
    pub recipient: String,
    pub state: String,
    pub network_id: NetworkId,
    pub expires_at_seconds: i64,
    pub purpose: ChallengePurpose,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WalletProof {
    pub message: String,
    pub nonce: String,
    pub state: String,
    pub public_key: String,
    pub signature: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginRequest {
    pub account_id: String,
    pub network_id: NetworkId,
    pub public_key: String,
    pub signature: String,
    pub message: String,
    pub nonce: String,
    pub state: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OnboardingRequest {
    pub account_id: String,
    pub payout_account_id: String,
    pub display_name: String,
    pub webhook_url: Option<String>,
    pub network_id: NetworkId,
    pub proof: WalletProof,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PayoutUpdateRequest {
    pub payout_account_id: String,
    pub network_id: NetworkId,
    pub proof: PayoutProof,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PayoutProof {
    pub account_id: String,
    pub message: String,
    pub nonce: String,
    pub state: String,
    pub public_key: String,
    pub signature: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileUpdateRequest {
    pub display_name: Option<String>,
    pub webhook_url: Option<Option<String>>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateLinkRequest {
    pub network_id: NetworkId,
    pub asset: AssetDto,
    pub amount: String,
    pub amount_display: String,
    pub display_name: String,
    pub expires_at_seconds: Option<i64>,
    pub multi_pay: bool,
    pub max_redemptions: Option<i32>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaimLinkRequest {
    pub payer_account_id: String,
    pub network_id: NetworkId,
    pub customer_name: Option<String>,
    /// Wallet signature proof is required — not optional at the type level.
    pub proof: WalletProof,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentMetaRequest {
    pub edit_token: Option<String>,
    pub network_id: NetworkId,
    pub customer_name: Option<String>,
    pub slug: Option<String>,
    pub transaction_hash: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateApiKeyRequest {
    pub label: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiKeyDto {
    pub key_ref: String,
    pub label: String,
    pub created_at_ms: i64,
    pub last_used_at_ms: Option<i64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewApiKeyDto {
    #[serde(flatten)]
    pub key: ApiKeyDto,
    pub secret: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthSessionDto {
    pub merchant: MerchantProfile,
    pub expires_at_ms: i64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkClaimDto {
    pub edit_token: String,
    pub order_id: String,
    pub merchant_id: String,
    pub payer_account_id: String,
    pub authorization: Value,
}
