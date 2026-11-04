use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use borsh::{BorshDeserialize, BorshSerialize};
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use sha2::{Digest, Sha256};

pub const AUTH_PROTOCOL_VERSION: u8 = 1;
pub const AUTH_DOMAIN_PREFIX: &[u8] = b"worldz.near.order-auth/v1\0";
pub const EVENT_STANDARD: &str = "worldz-payments";
pub const EVENT_VERSION: &str = "1.0.0";
pub const DEFAULT_FEE_BPS: u16 = 30;
pub const MAX_FEE_BPS: u16 = 500;

#[derive(Clone, Copy, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NetworkId {
    Testnet,
    Mainnet,
}

impl NetworkId {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Testnet => "testnet",
            Self::Mainnet => "mainnet",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase", rename_all_fields = "camelCase")]
pub enum Asset {
    Native,
    Nep141 { #[serde(rename = "contractId")] contract_id: String },
}

impl Asset {
    pub fn token_contract_id(&self) -> Option<&str> {
        match self {
            Self::Native => None,
            Self::Nep141 { contract_id } => Some(contract_id),
        }
    }
}

pub mod amount_u128 {
    use super::*;

    pub fn serialize<S: Serializer>(value: &u128, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&value.to_string())
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(deserializer: D) -> Result<u128, D::Error> {
        let raw = <String as Deserialize>::deserialize(deserializer)?;
        raw.parse().map_err(serde::de::Error::custom)
    }
}

pub mod nonce_base64 {
    use super::*;

    pub fn serialize<S: Serializer>(value: &[u8; 32], serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&BASE64.encode(value))
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(deserializer: D) -> Result<[u8; 32], D::Error> {
        let encoded = <String as Deserialize>::deserialize(deserializer)?;
        let decoded = BASE64.decode(encoded).map_err(serde::de::Error::custom)?;
        decoded.try_into().map_err(|_| serde::de::Error::custom("nonce must decode to exactly 32 bytes"))
    }
}

/// Canonical order authorization. Field declaration order is the signed Borsh wire order.
/// `amount` is JSON decimal text, but Borsh encodes the value as little-endian u128.
#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthorizationPayload {
    pub protocol_version: u8,
    pub signer_key_id: String,
    pub network_id: NetworkId,
    pub contract_id: String,
    pub merchant_id: String,
    pub merchant_account_id: String,
    pub payout_account_id: String,
    pub order_id: String,
    pub asset: Asset,
    #[serde(with = "amount_u128")]
    pub amount: u128,
    pub expires_at_seconds: u64,
    pub fee_bps: u16,
    pub fee_recipient_account_id: String,
    pub expected_payer_account_id: Option<String>,
    #[serde(with = "nonce_base64")]
    pub nonce: [u8; 32],
}

impl AuthorizationPayload {
    pub fn canonical_bytes(&self) -> Result<Vec<u8>, borsh::io::Error> {
        borsh::to_vec(self)
    }

    pub fn signing_message(&self) -> Result<Vec<u8>, borsh::io::Error> {
        let canonical = self.canonical_bytes()?;
        let mut message = Vec::with_capacity(AUTH_DOMAIN_PREFIX.len() + canonical.len());
        message.extend_from_slice(AUTH_DOMAIN_PREFIX);
        message.extend_from_slice(&canonical);
        Ok(message)
    }

    pub fn signing_digest(&self) -> Result<[u8; 32], borsh::io::Error> {
        let message = self.signing_message()?;
        Ok(Sha256::digest(message).into())
    }

    pub fn replay_key(&self) -> Result<[u8; 32], borsh::io::Error> {
        #[derive(BorshSerialize)]
        struct ReplayDomain<'a> {
            protocol_version: u8,
            network_id: NetworkId,
            contract_id: &'a str,
            merchant_id: &'a str,
            order_id: &'a str,
            nonce: [u8; 32],
        }
        let domain = ReplayDomain {
            protocol_version: self.protocol_version,
            network_id: self.network_id,
            contract_id: &self.contract_id,
            merchant_id: &self.merchant_id,
            order_id: &self.order_id,
            nonce: self.nonce,
        };
        let mut bytes = b"worldz.near.order-replay/v1\0".to_vec();
        bytes.extend_from_slice(&borsh::to_vec(&domain)?);
        Ok(Sha256::digest(bytes).into())
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignedAuthorization {
    #[serde(flatten)]
    pub payload: AuthorizationPayload,
    /// Base64 Ed25519 signature over SHA-256(domain-prefix || Borsh(payload)).
    pub signature: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OrderState {
    Open,
    Processing,
    PayoutRetryable,
    PartialPayout,
    RefundPending,
    Refunded,
    Settled,
    Expired,
    Cancelled,
    ReconciliationRequired,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderStatus {
    pub order_id: String,
    pub merchant_id: String,
    pub network_id: NetworkId,
    pub contract_id: String,
    pub state: OrderState,
    pub asset: Asset,
    #[serde(with = "amount_u128")]
    pub amount: u128,
    #[serde(with = "amount_u128")]
    pub fee: u128,
    #[serde(with = "amount_u128")]
    pub net: u128,
    pub payer_account_id: String,
    pub merchant_account_id: String,
    pub payout_account_id: String,
    pub transaction_hash: Option<String>,
    pub settlement_receipt_id: Option<String>,
    pub updated_at_ms: u64,
    pub failure_reason: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentEvent {
    pub id: String,
    pub network_id: NetworkId,
    pub contract_id: String,
    pub receipt_id: String,
    pub transaction_hash: String,
    pub order_id: String,
    pub merchant_id: String,
    pub payer_account_id: String,
    pub payout_account_id: String,
    pub asset: Asset,
    #[serde(with = "amount_u128")]
    pub amount: u128,
    #[serde(with = "amount_u128")]
    pub fee: u128,
    #[serde(with = "amount_u128")]
    pub net: u128,
    pub state: OrderState,
    pub timestamp_ms: u64,
    pub merchant_reference: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct EventEnvelope<T> {
    pub standard: String,
    pub version: String,
    pub event: String,
    pub data: Vec<T>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebhookPayload {
    pub id: String,
    #[serde(rename = "type")]
    pub event_type: String,
    pub created: u64,
    pub data: PaymentEvent,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiError {
    pub error: String,
    pub code: Option<String>,
    pub details: Option<serde_json::Value>,
}

pub fn event_envelope<T>(event: impl Into<String>, data: Vec<T>) -> EventEnvelope<T> {
    EventEnvelope {
        standard: EVENT_STANDARD.to_string(),
        version: EVENT_VERSION.to_string(),
        event: event.into(),
        data,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn example_payload() -> AuthorizationPayload {
        AuthorizationPayload {
            protocol_version: AUTH_PROTOCOL_VERSION,
            signer_key_id: "platform-2026-01".to_string(),
            network_id: NetworkId::Testnet,
            contract_id: "router.worldz.testnet".to_string(),
            merchant_id: "mch_test_01".to_string(),
            merchant_account_id: "merchant.worldz.testnet".to_string(),
            payout_account_id: "payout.worldz.testnet".to_string(),
            order_id: "ord_01HZX3W2Q6".to_string(),
            asset: Asset::Native,
            amount: 25_000_000_000_000_000_000_000_000,
            expires_at_seconds: 1_800_000_000,
            fee_bps: DEFAULT_FEE_BPS,
            fee_recipient_account_id: "fees.worldz.testnet".to_string(),
            expected_payer_account_id: Some("payer.worldz.testnet".to_string()),
            nonce: [7u8; 32],
        }
    }

    #[test]
    fn amount_is_a_decimal_string_on_json_boundary() {
        let json = serde_json::to_value(example_payload()).unwrap();
        assert_eq!(json["amount"], "25000000000000000000000000");
        let decoded: AuthorizationPayload = serde_json::from_value(json).unwrap();
        assert_eq!(decoded.amount, 25_000_000_000_000_000_000_000_000);
    }

    #[test]
    fn nonce_is_a_fixed_32_byte_base64_value_on_json_boundary() {
        let payload = example_payload();
        let json = serde_json::to_value(&payload).unwrap();
        let encoded = json["nonce"].as_str().unwrap();
        assert_eq!(BASE64.decode(encoded).unwrap(), vec![7u8; 32]);
        assert_eq!(serde_json::from_value::<AuthorizationPayload>(json).unwrap(), payload);
    }

    #[test]
    fn signature_domain_commits_to_network_contract_and_payload() {
        let payload = example_payload();
        let base = payload.signing_digest().unwrap();
        let mut other = payload.clone();
        other.network_id = NetworkId::Mainnet;
        assert_ne!(base, other.signing_digest().unwrap());
        other = payload.clone();
        other.contract_id = "other.worldz.testnet".to_string();
        assert_ne!(base, other.signing_digest().unwrap());
        other = payload.clone();
        other.amount += 1;
        assert_ne!(base, other.signing_digest().unwrap());
    }

    #[test]
    fn replay_key_is_order_nonce_bound_and_stable() {
        let payload = example_payload();
        assert_eq!(payload.replay_key().unwrap(), payload.replay_key().unwrap());
        let mut other = payload.clone();
        other.nonce[0] = 8;
        assert_ne!(payload.replay_key().unwrap(), other.replay_key().unwrap());
    }
}
