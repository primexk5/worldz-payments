use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::collections::{LookupMap, LookupSet};
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{env, near, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue};
use serde_json::json;
use sha2::{Digest, Sha256};
use worldz_near_protocol::{
    Asset, AuthorizationPayload, NetworkId, OrderState, AUTH_PROTOCOL_VERSION, DEFAULT_FEE_BPS,
    MAX_FEE_BPS,
};

const CALLBACK_GAS: Gas = Gas::from_tgas(25);
const NEP141_TRANSFER_GAS: Gas = Gas::from_tgas(35);
const MAX_PROMISE_RESULT_BYTES: usize = 1024;
const STORAGE_FLOOR: u128 = 1_000_000_000_000_000_000_000_000; // 0.001 NEAR; operational reserve is funded separately.
const MIN_UPGRADE_DELAY_SECONDS: u64 = 48 * 60 * 60;

#[derive(
    Clone, Copy, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize, Serialize, Deserialize,
)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(rename_all = "snake_case")]
pub enum LegKind {
    Merchant,
    Fee,
    Refund,
}

#[derive(
    Clone, Copy, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize, Serialize, Deserialize,
)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(rename_all = "snake_case")]
pub enum LegState {
    Ready,
    Pending,
    Succeeded,
    Failed,
    NotRequired,
}

#[derive(Clone, Debug, BorshSerialize, BorshDeserialize)]
#[borsh(crate = "near_sdk::borsh")]
struct PayoutLeg {
    recipient: AccountId,
    amount: u128,
    state: LegState,
    attempt_id: u64,
}

#[derive(Clone, Debug, BorshSerialize, BorshDeserialize)]
#[borsh(crate = "near_sdk::borsh")]
struct StoredOrder {
    authorization: AuthorizationPayload,
    payer_account_id: AccountId,
    fee: u128,
    net: u128,
    state: OrderState,
    merchant_leg: PayoutLeg,
    fee_leg: PayoutLeg,
    refund_leg: PayoutLeg,
    created_at_seconds: u64,
    updated_at_seconds: u64,
}

#[derive(Clone, Debug, BorshSerialize, BorshDeserialize)]
#[borsh(crate = "near_sdk::borsh")]
struct UpgradeProposal {
    code_hash: [u8; 32],
    executable_at_seconds: u64,
}

#[derive(Clone, Debug, BorshSerialize, BorshDeserialize, Deserialize)]
#[borsh(crate = "near_sdk::borsh")]
struct FtPaymentMessage {
    action: String,
    authorization: AuthorizationPayload,
    signature: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderView {
    order_key: String,
    order_id: String,
    merchant_id: String,
    merchant_account_id: String,
    payout_account_id: String,
    payer_account_id: String,
    network_id: NetworkId,
    contract_id: String,
    asset: Asset,
    amount: U128,
    fee: U128,
    net: U128,
    fee_bps: u16,
    fee_recipient_account_id: String,
    state: OrderState,
    merchant_leg: LegView,
    fee_leg: LegView,
    refund_leg: LegView,
    created_at_seconds: u64,
    updated_at_seconds: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegView {
    recipient_account_id: String,
    amount: U128,
    state: LegState,
    attempt_id: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RouterConfigView {
    network_id: NetworkId,
    contract_id: String,
    admin_id: String,
    pause_guardian_id: String,
    fee_recipient_account_id: String,
    fee_bps: u16,
    max_fee_bps: u16,
    paused: bool,
    storage_reserve_yocto: U128,
    state_version: u8,
}

#[near(contract_state, serializers = [borsh])]
#[derive(PanicOnDefault)]
pub struct Router {
    admin_id: AccountId,
    pause_guardian_id: AccountId,
    network_id: NetworkId,
    fee_recipient_account_id: AccountId,
    fee_bps: u16,
    paused: bool,
    state_version: u8,
    storage_reserve_yocto: u128,
    attempt_counter: u64,
    pending_upgrade: Option<UpgradeProposal>,
    allowed_tokens: LookupSet<AccountId>,
    signer_keys: LookupMap<String, Vec<u8>>,
    orders: LookupMap<[u8; 32], StoredOrder>,
    used_orders: LookupSet<[u8; 32]>,
    liabilities: LookupMap<String, u128>,
}

#[near]
impl Router {
    #[init]
    #[payable]
    pub fn new(
        admin_id: AccountId,
        pause_guardian_id: AccountId,
        fee_recipient_account_id: AccountId,
        fee_bps: Option<u16>,
        network_id: NetworkId,
        allowed_token_ids: Vec<AccountId>,
    ) -> Self {
        let fee_bps = fee_bps.unwrap_or(DEFAULT_FEE_BPS);
        assert!(fee_bps <= MAX_FEE_BPS, "fee exceeds the 500 bps cap");
        assert_ne!(
            admin_id,
            env::current_account_id(),
            "admin cannot be the router account"
        );
        assert_ne!(
            fee_recipient_account_id,
            env::current_account_id(),
            "fee recipient cannot be the router account"
        );
        assert!(
            env::attached_deposit().as_yoctonear() >= STORAGE_FLOOR,
            "attach at least 0.001 NEAR as the storage/gas sponsor reserve"
        );

        let mut allowed_tokens = LookupSet::new(b"allowed_tokens".to_vec());
        for token_id in allowed_token_ids {
            allowed_tokens.insert(&token_id);
        }

        Self {
            admin_id,
            pause_guardian_id,
            network_id,
            fee_recipient_account_id,
            fee_bps,
            paused: false,
            state_version: 1,
            storage_reserve_yocto: env::attached_deposit().as_yoctonear(),
            attempt_counter: 0,
            pending_upgrade: None,
            allowed_tokens,
            signer_keys: LookupMap::new(b"signer_keys".to_vec()),
            orders: LookupMap::new(b"orders".to_vec()),
            used_orders: LookupSet::new(b"used_orders".to_vec()),
            liabilities: LookupMap::new(b"liabilities".to_vec()),
        }
    }

    pub fn get_config(&self) -> RouterConfigView {
        RouterConfigView {
            network_id: self.network_id,
            contract_id: env::current_account_id().to_string(),
            admin_id: self.admin_id.to_string(),
            pause_guardian_id: self.pause_guardian_id.to_string(),
            fee_recipient_account_id: self.fee_recipient_account_id.to_string(),
            fee_bps: self.fee_bps,
            max_fee_bps: MAX_FEE_BPS,
            paused: self.paused,
            storage_reserve_yocto: U128(self.storage_reserve_yocto),
            state_version: self.state_version,
        }
    }

    pub fn get_order(&self, order_key: String) -> Option<OrderView> {
        let key = decode_order_key(&order_key);
        self.orders
            .get(&key)
            .map(|order| self.order_view(key, order))
    }

    pub fn is_settled(&self, order_key: String) -> bool {
        let key = decode_order_key(&order_key);
        self.orders
            .get(&key)
            .map(|order| order.state == OrderState::Settled)
            .unwrap_or(false)
    }

    pub fn get_liability(&self, asset: Asset) -> U128 {
        U128(self.liabilities.get(&asset_key(&asset)).unwrap_or(0))
    }

    #[payable]
    pub fn fund_storage(&mut self) {
        let deposit = env::attached_deposit().as_yoctonear();
        assert!(deposit > 0, "storage sponsor deposit must be positive");
        self.storage_reserve_yocto = self
            .storage_reserve_yocto
            .checked_add(deposit)
            .expect("storage reserve overflow");
    }

    #[payable]
    pub fn pay_native(&mut self, authorization: AuthorizationPayload, signature: String) {
        assert!(!self.paused, "router is paused");
        let payer = env::predecessor_account_id();
        self.validate_authorization(&authorization, &signature, &payer)
            .unwrap_or_else(|reason| env::panic_str(&reason));
        assert!(
            matches!(authorization.asset, Asset::Native),
            "authorization asset is not native NEAR"
        );
        let attached = env::attached_deposit().as_yoctonear();
        assert_eq!(
            attached, authorization.amount,
            "attached NEAR must equal the signed gross amount exactly"
        );
        self.reserve_and_schedule(authorization, payer)
    }

    #[payable]
    pub fn cancel_authorization(&mut self, authorization: AuthorizationPayload, signature: String) {
        self.validate_signed_terms(&authorization, &signature)
            .unwrap_or_else(|reason| env::panic_str(&reason));
        let merchant = account_id(&authorization.merchant_account_id)
            .unwrap_or_else(|_| env::panic_str("invalid merchant account ID"));
        assert_eq!(
            env::predecessor_account_id(),
            merchant,
            "only the authenticated merchant identity can cancel"
        );
        let key = authorization
            .replay_key()
            .expect("replay key encoding failed");
        assert!(
            !self.used_orders.contains(&key),
            "authorization already used or cancelled"
        );
        let before = env::storage_usage();
        self.used_orders.insert(&key);
        self.charge_storage(before);
        emit_event(
            "order_cancelled",
            json!({
                "orderId": authorization.order_id,
                "merchantId": authorization.merchant_id,
                "merchantAccountId": authorization.merchant_account_id,
                "networkId": authorization.network_id,
                "contractId": authorization.contract_id,
            }),
        );
    }

    pub fn retry_payout(&mut self, order_key: String, leg: LegKind) -> Promise {
        self.assert_admin();
        let key = decode_order_key(&order_key);
        let order = self
            .orders
            .get(&key)
            .unwrap_or_else(|| env::panic_str("order not found"));
        assert!(
            matches!(
                order.state,
                OrderState::PayoutRetryable | OrderState::PartialPayout
            ),
            "order is not eligible for payout retry"
        );
        let current = self.get_leg(&order, leg);
        assert_eq!(
            current.state,
            LegState::Failed,
            "only a confirmed failed payout leg may be retried"
        );
        assert!(
            current.amount > 0,
            "zero-value payout leg cannot be retried"
        );
        self.schedule_leg(key, leg)
    }

    pub fn refund_order(&mut self, order_key: String) -> Promise {
        let key = decode_order_key(&order_key);
        let mut order = self
            .orders
            .get(&key)
            .unwrap_or_else(|| env::panic_str("order not found"));
        let caller = env::predecessor_account_id();
        let payer = order.payer_account_id.clone();
        assert!(
            caller == payer || caller == self.admin_id,
            "only the payer or admin can request a refund"
        );
        assert_eq!(
            order.state,
            OrderState::PayoutRetryable,
            "full refund is only allowed when no payout leg succeeded"
        );
        assert!(
            order.merchant_leg.state != LegState::Pending
                && order.fee_leg.state != LegState::Pending,
            "wait for payout receipts before refund"
        );
        assert!(
            order.merchant_leg.state != LegState::Succeeded
                && order.fee_leg.state != LegState::Succeeded,
            "partial payout cannot be fully refunded"
        );
        order.state = OrderState::RefundPending;
        order.updated_at_seconds = now_seconds();
        let before = env::storage_usage();
        self.orders.insert(&key, &order);
        self.charge_storage(before);
        self.emit_order_event("refund_pending", &order);
        self.schedule_leg(key, LegKind::Refund)
    }

    pub fn retry_refund(&mut self, order_key: String) -> Promise {
        let key = decode_order_key(&order_key);
        let order = self
            .orders
            .get(&key)
            .unwrap_or_else(|| env::panic_str("order not found"));
        assert_eq!(
            order.state,
            OrderState::RefundPending,
            "order has no pending refund"
        );
        assert_eq!(
            order.refund_leg.state,
            LegState::Failed,
            "only a confirmed failed refund can be retried"
        );
        let caller = env::predecessor_account_id();
        assert!(
            caller == order.payer_account_id || caller == self.admin_id,
            "only payer or admin can retry refund"
        );
        self.schedule_leg(key, LegKind::Refund)
    }

    /// Callback failure leaves the attempt Pending; retries remain blocked until an operator
    /// reconciles the final receipt externally. This method deliberately moves to a no-transfer
    /// state and never attempts to infer or resend a missing promise.
    pub fn flag_reconciliation(&mut self, order_key: String, reason_code: String) {
        self.assert_admin();
        let key = decode_order_key(&order_key);
        let mut order = self
            .orders
            .get(&key)
            .unwrap_or_else(|| env::panic_str("order not found"));
        assert!(
            [
                order.merchant_leg.state,
                order.fee_leg.state,
                order.refund_leg.state
            ]
            .contains(&LegState::Pending),
            "order has no callback result requiring reconciliation"
        );
        order.state = OrderState::ReconciliationRequired;
        order.updated_at_seconds = now_seconds();
        let before = env::storage_usage();
        self.orders.insert(&key, &order);
        self.charge_storage(before);
        emit_event(
            "reconciliation_required",
            json!({ "orderId": order.authorization.order_id, "merchantId": order.authorization.merchant_id, "reasonCode": reason_code }),
        );
    }

    #[payable]
    pub fn pause(&mut self) {
        let caller = env::predecessor_account_id();
        assert!(
            caller == self.admin_id || caller == self.pause_guardian_id,
            "only admin or pause guardian can pause"
        );
        self.paused = true;
        emit_event(
            "router_paused",
            json!({ "by": caller.to_string(), "networkId": self.network_id }),
        );
    }

    #[payable]
    pub fn unpause(&mut self) {
        self.assert_admin();
        self.paused = false;
        emit_event(
            "router_unpaused",
            json!({ "by": env::predecessor_account_id().to_string(), "networkId": self.network_id }),
        );
    }

    pub fn set_token_allowed(&mut self, contract_id: AccountId, allowed: bool) {
        self.assert_admin();
        assert_ne!(
            contract_id,
            env::current_account_id(),
            "router account cannot be an FT contract"
        );
        let before = env::storage_usage();
        if allowed {
            self.allowed_tokens.insert(&contract_id);
        } else {
            self.allowed_tokens.remove(&contract_id);
        }
        self.charge_storage(before);
        emit_event(
            "token_allowlist_updated",
            json!({ "contractId": contract_id.to_string(), "allowed": allowed }),
        );
    }

    pub fn set_fee_config(&mut self, fee_bps: u16, fee_recipient_account_id: AccountId) {
        self.assert_admin();
        assert!(fee_bps <= MAX_FEE_BPS, "fee exceeds the 500 bps cap");
        assert_ne!(
            fee_recipient_account_id,
            env::current_account_id(),
            "fee recipient cannot be router"
        );
        self.fee_bps = fee_bps;
        self.fee_recipient_account_id = fee_recipient_account_id.clone();
        emit_event(
            "fee_config_updated",
            json!({ "feeBps": fee_bps, "feeRecipientAccountId": fee_recipient_account_id.to_string() }),
        );
    }

    pub fn set_pause_guardian(&mut self, guardian_account_id: AccountId) {
        self.assert_admin();
        self.pause_guardian_id = guardian_account_id.clone();
        emit_event(
            "pause_guardian_updated",
            json!({ "accountId": guardian_account_id.to_string() }),
        );
    }

    pub fn set_signer_key(&mut self, key_id: String, public_key_base64: String, enabled: bool) {
        self.assert_admin();
        assert!(
            !key_id.is_empty() && key_id.len() <= 64,
            "invalid signer key id"
        );
        let before = env::storage_usage();
        if enabled {
            let bytes = BASE64
                .decode(public_key_base64)
                .unwrap_or_else(|_| env::panic_str("signer key must be base64"));
            assert_eq!(bytes.len(), 32, "Ed25519 key must be 32 bytes");
            self.signer_keys.insert(&key_id, &bytes);
        } else {
            self.signer_keys.remove(&key_id);
        }
        self.charge_storage(before);
        emit_event(
            "signer_key_updated",
            json!({ "keyId": key_id, "enabled": enabled }),
        );
    }

    pub fn propose_upgrade(&mut self, code_hash_hex: String, delay_seconds: u64) {
        self.assert_admin();
        assert!(
            delay_seconds >= MIN_UPGRADE_DELAY_SECONDS,
            "upgrade delay must be at least 48 hours"
        );
        let hash =
            hex::decode(code_hash_hex).unwrap_or_else(|_| env::panic_str("code hash must be hex"));
        let code_hash: [u8; 32] = hash
            .try_into()
            .unwrap_or_else(|_| env::panic_str("code hash must be 32 bytes"));
        let executable_at_seconds = now_seconds()
            .checked_add(delay_seconds)
            .expect("upgrade time overflow");
        self.pending_upgrade = Some(UpgradeProposal {
            code_hash,
            executable_at_seconds,
        });
        emit_event(
            "upgrade_proposed",
            json!({ "codeHash": hex::encode(code_hash), "executableAtSeconds": executable_at_seconds }),
        );
    }

    pub fn cancel_upgrade(&mut self) {
        self.assert_admin();
        self.pending_upgrade = None;
        emit_event(
            "upgrade_cancelled",
            json!({ "by": env::predecessor_account_id().to_string() }),
        );
    }

    pub fn execute_upgrade(&mut self, code: Vec<u8>) -> Promise {
        self.assert_admin();
        let proposal = self
            .pending_upgrade
            .clone()
            .unwrap_or_else(|| env::panic_str("no upgrade proposal"));
        assert!(
            now_seconds() >= proposal.executable_at_seconds,
            "upgrade timelock has not elapsed"
        );
        let actual: [u8; 32] = Sha256::digest(&code).into();
        assert_eq!(
            actual, proposal.code_hash,
            "WASM code hash does not match the proposal"
        );
        Promise::new(env::current_account_id())
            .deploy_contract(code)
            .then(
                Promise::new(env::current_account_id()).function_call(
                    "post_upgrade".to_string(),
                    serde_json::to_vec(&json!({ "version": self.state_version.saturating_add(1) }))
                        .unwrap(),
                    NearToken::from_yoctonear(0),
                    CALLBACK_GAS,
                ),
            )
    }

    #[private]
    pub fn post_upgrade(&mut self, version: u8) {
        assert!(
            version > self.state_version,
            "migration version must increase"
        );
        self.state_version = version;
        self.pending_upgrade = None;
        emit_event("router_migrated", json!({ "stateVersion": version }));
    }

    #[private]
    pub fn on_payout_result(&mut self, order_key: String, leg: LegKind, attempt_id: u64) -> bool {
        let key = decode_order_key(&order_key);
        let mut order = self
            .orders
            .get(&key)
            .unwrap_or_else(|| env::panic_str("order not found"));
        let succeeded = env::promise_result_checked(0, MAX_PROMISE_RESULT_BYTES).is_ok();
        let old_leg = self.get_leg(&order, leg);
        if old_leg.state != LegState::Pending || old_leg.attempt_id != attempt_id {
            return false;
        }
        let before = env::storage_usage();
        let mut updated_leg = old_leg;
        match succeeded {
            true => {
                updated_leg.state = LegState::Succeeded;
                self.release_liability(&order.authorization.asset, updated_leg.amount);
            }
            false => updated_leg.state = LegState::Failed,
        }
        self.set_leg(&mut order, leg, updated_leg.clone());
        order.updated_at_seconds = now_seconds();
        if succeeded {
            let mut payload = json!({ "leg": leg, "recipientAccountId": updated_leg.recipient.to_string(), "amount": updated_leg.amount.to_string(), "attemptId": attempt_id });
            if leg == LegKind::Fee {
                payload["feeRecipientAccountId"] = json!(updated_leg.recipient.to_string());
            }
            emit_event("payout_succeeded", payload);
        } else {
            order.state = if self.any_paid_leg(&order) {
                OrderState::PartialPayout
            } else {
                OrderState::PayoutRetryable
            };
            emit_event(
                "payout_failed",
                json!({ "orderId": order.authorization.order_id, "merchantId": order.authorization.merchant_id, "leg": leg, "recipientAccountId": updated_leg.recipient.to_string(), "amount": updated_leg.amount.to_string(), "attemptId": attempt_id }),
            );
        }
        let settled = self.is_order_settled(&order);
        if settled {
            order.state = OrderState::Settled;
            self.emit_order_event("payment_settled", &order);
        } else if succeeded {
            order.state = if self.any_paid_leg(&order) {
                OrderState::PartialPayout
            } else {
                OrderState::Processing
            };
            self.emit_order_event("order_processing", &order);
        }
        self.orders.insert(&key, &order);
        self.charge_storage(before);
        settled
    }

    #[private]
    pub fn on_refund_result(&mut self, order_key: String, attempt_id: u64) -> bool {
        let key = decode_order_key(&order_key);
        let mut order = self
            .orders
            .get(&key)
            .unwrap_or_else(|| env::panic_str("order not found"));
        if order.refund_leg.state != LegState::Pending || order.refund_leg.attempt_id != attempt_id
        {
            return false;
        }
        let before = env::storage_usage();
        if env::promise_result_checked(0, MAX_PROMISE_RESULT_BYTES).is_ok() {
            order.refund_leg.state = LegState::Succeeded;
            self.release_liability(&order.authorization.asset, order.refund_leg.amount);
            order.state = OrderState::Refunded;
            self.emit_order_event("payment_refunded", &order);
        } else {
            order.refund_leg.state = LegState::Failed;
            order.state = OrderState::RefundPending;
            self.emit_order_event("refund_pending", &order);
        }
        order.updated_at_seconds = now_seconds();
        self.orders.insert(&key, &order);
        self.charge_storage(before);
        true
    }
}

#[near]
impl FungibleTokenReceiver for Router {
    fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        if self.paused {
            return PromiseOrValue::Value(amount);
        }
        let token_id = env::predecessor_account_id();
        if !self.allowed_tokens.contains(&token_id) {
            return PromiseOrValue::Value(amount);
        }
        let message: FtPaymentMessage = match serde_json::from_str::<FtPaymentMessage>(&msg) {
            Ok(message) if message.action == "pay" => message,
            _ => return PromiseOrValue::Value(amount),
        };
        let authorization = message.authorization;
        if !matches!(&authorization.asset, Asset::Nep141 { contract_id } if contract_id == token_id.as_str())
        {
            return PromiseOrValue::Value(amount);
        }
        if authorization.amount != amount.0 {
            return PromiseOrValue::Value(amount);
        }
        if self
            .validate_authorization(&authorization, &message.signature, &sender_id)
            .is_err()
        {
            return PromiseOrValue::Value(amount);
        }
        self.reserve_and_schedule(authorization, sender_id);
        PromiseOrValue::Value(U128(0))
    }
}

impl Router {
    fn assert_admin(&self) {
        assert_eq!(env::predecessor_account_id(), self.admin_id, "admin only");
    }

    fn validate_authorization(
        &self,
        payload: &AuthorizationPayload,
        signature_b64: &str,
        payer: &AccountId,
    ) -> Result<(), String> {
        self.validate_terms(payload)?;
        if let Some(expected) = payload.expected_payer_account_id.as_ref() {
            if expected != payer.as_str() {
                return Err("authorization is bound to a different payer".into());
            }
        }
        self.validate_signed_terms(payload, signature_b64)
    }

    fn validate_signed_terms(
        &self,
        payload: &AuthorizationPayload,
        signature_b64: &str,
    ) -> Result<(), String> {
        self.validate_terms(payload)?;
        let public_key = self
            .signer_keys
            .get(&payload.signer_key_id)
            .ok_or_else(|| "signer key is not enabled".to_string())?;
        let public_key: [u8; 32] = public_key
            .as_slice()
            .try_into()
            .map_err(|_| "configured signer key has invalid size".to_string())?;
        let signature = BASE64
            .decode(signature_b64)
            .map_err(|_| "signature must be base64".to_string())?;
        let signature: [u8; 64] = signature
            .as_slice()
            .try_into()
            .map_err(|_| "Ed25519 signature must be 64 bytes".to_string())?;
        let digest = payload
            .signing_digest()
            .map_err(|_| "could not encode authorization".to_string())?;
        if !env::ed25519_verify(&signature, &digest, &public_key) {
            return Err("invalid signed order authorization".into());
        }
        Ok(())
    }

    fn validate_terms(&self, payload: &AuthorizationPayload) -> Result<(), String> {
        if payload.protocol_version != AUTH_PROTOCOL_VERSION {
            return Err("unsupported authorization protocol version".into());
        }
        if payload.network_id != self.network_id {
            return Err("authorization network mismatch".into());
        }
        if payload.contract_id != env::current_account_id().as_str() {
            return Err("authorization contract mismatch".into());
        }
        if payload.amount == 0 {
            return Err("amount must be greater than zero".into());
        }
        if payload.fee_bps > MAX_FEE_BPS {
            return Err("fee exceeds the 500 bps cap".into());
        }
        if payload.expires_at_seconds > 0 && now_seconds() >= payload.expires_at_seconds {
            return Err("authorization expired".into());
        }
        account_id(&payload.merchant_account_id)
            .map_err(|_| "invalid merchant account ID".to_string())?;
        account_id(&payload.payout_account_id)
            .map_err(|_| "invalid payout account ID".to_string())?;
        account_id(&payload.fee_recipient_account_id)
            .map_err(|_| "invalid fee recipient account ID".to_string())?;
        if let Some(expected) = payload.expected_payer_account_id.as_ref() {
            account_id(expected).map_err(|_| "invalid expected payer account ID".to_string())?;
        }
        if let Some(token_id) = payload.asset.token_contract_id() {
            let token = account_id(token_id)
                .map_err(|_| "invalid NEP-141 token contract ID".to_string())?;
            if !self.allowed_tokens.contains(&token) {
                return Err("NEP-141 token is not allowlisted".into());
            }
        }
        Ok(())
    }

    fn reserve_and_schedule(&mut self, authorization: AuthorizationPayload, payer: AccountId) {
        let order_key = authorization
            .replay_key()
            .expect("replay key encoding failed");
        assert!(
            !self.used_orders.contains(&order_key),
            "signed order already used or cancelled"
        );
        let fee = authorization
            .amount
            .checked_mul(u128::from(authorization.fee_bps))
            .expect("fee multiplication overflow")
            / 10_000;
        let net = authorization.amount - fee;
        let merchant_account = account_id(&authorization.payout_account_id)
            .unwrap_or_else(|_| env::panic_str("invalid payout account"));
        let fee_account = account_id(&authorization.fee_recipient_account_id)
            .unwrap_or_else(|_| env::panic_str("invalid fee recipient"));
        let order = StoredOrder {
            authorization: authorization.clone(),
            payer_account_id: payer.clone(),
            fee,
            net,
            state: OrderState::Processing,
            merchant_leg: PayoutLeg {
                recipient: merchant_account,
                amount: net,
                state: LegState::Ready,
                attempt_id: 0,
            },
            fee_leg: PayoutLeg {
                recipient: fee_account,
                amount: fee,
                state: if fee == 0 {
                    LegState::NotRequired
                } else {
                    LegState::Ready
                },
                attempt_id: 0,
            },
            refund_leg: PayoutLeg {
                recipient: payer,
                amount: authorization.amount,
                state: LegState::Ready,
                attempt_id: 0,
            },
            created_at_seconds: now_seconds(),
            updated_at_seconds: now_seconds(),
        };
        let asset_key = asset_key(&authorization.asset);
        let old_liability = self.liabilities.get(&asset_key).unwrap_or(0);
        let new_liability = old_liability
            .checked_add(authorization.amount)
            .expect("asset liability overflow");
        let before = env::storage_usage();
        self.used_orders.insert(&order_key);
        self.liabilities.insert(&asset_key, &new_liability);
        self.orders.insert(&order_key, &order);
        self.charge_storage(before);
        self.emit_order_event("order_processing", &order);

        let merchant_promise = self.schedule_leg(order_key, LegKind::Merchant);
        if fee > 0 {
            merchant_promise
                .and(self.schedule_leg(order_key, LegKind::Fee))
                .detach();
        } else {
            merchant_promise.detach();
        }
    }

    fn schedule_leg(&mut self, order_key: [u8; 32], leg: LegKind) -> Promise {
        let mut order = self
            .orders
            .get(&order_key)
            .unwrap_or_else(|| env::panic_str("order not found"));
        self.attempt_counter = self
            .attempt_counter
            .checked_add(1)
            .expect("attempt counter overflow");
        let attempt = self.attempt_counter;
        let mut payout_leg = self.get_leg(&order, leg);
        payout_leg.state = LegState::Pending;
        payout_leg.attempt_id = attempt;
        self.set_leg(&mut order, leg, payout_leg.clone());
        order.state = match leg {
            LegKind::Refund => OrderState::RefundPending,
            _ => OrderState::Processing,
        };
        order.updated_at_seconds = now_seconds();
        let before = env::storage_usage();
        self.orders.insert(&order_key, &order);
        self.charge_storage(before);

        let transfer = self.transfer_promise(&order, leg, &payout_leg);
        transfer.then(Promise::new(env::current_account_id()).function_call(
            callback_name(leg),
            serde_json::to_vec(&json!({ "order_key": hex::encode(order_key), "leg": leg, "attempt_id": attempt })).unwrap(),
            NearToken::from_yoctonear(0),
            CALLBACK_GAS,
        ))
    }

    fn transfer_promise(&self, order: &StoredOrder, leg: LegKind, payout: &PayoutLeg) -> Promise {
        let asset = &order.authorization.asset;
        match asset {
            Asset::Native => Promise::new(payout.recipient.clone())
                .transfer(NearToken::from_yoctonear(payout.amount)),
            Asset::Nep141 { contract_id } => {
                let token = account_id(contract_id)
                    .unwrap_or_else(|_| env::panic_str("invalid token account"));
                let receiver = match leg {
                    LegKind::Refund => order.payer_account_id.clone(),
                    _ => payout.recipient.clone(),
                };
                let args = json!({ "receiver_id": receiver, "amount": payout.amount.to_string(), "memo": null });
                Promise::new(token).function_call(
                    "ft_transfer".to_string(),
                    serde_json::to_vec(&args).unwrap(),
                    NearToken::from_yoctonear(1),
                    NEP141_TRANSFER_GAS,
                )
            }
        }
    }

    fn get_leg(&self, order: &StoredOrder, leg: LegKind) -> PayoutLeg {
        match leg {
            LegKind::Merchant => order.merchant_leg.clone(),
            LegKind::Fee => order.fee_leg.clone(),
            LegKind::Refund => order.refund_leg.clone(),
        }
    }

    fn set_leg(&self, order: &mut StoredOrder, leg: LegKind, value: PayoutLeg) {
        match leg {
            LegKind::Merchant => order.merchant_leg = value,
            LegKind::Fee => order.fee_leg = value,
            LegKind::Refund => order.refund_leg = value,
        }
    }

    fn any_paid_leg(&self, order: &StoredOrder) -> bool {
        (order.merchant_leg.amount > 0 && order.merchant_leg.state == LegState::Succeeded)
            || (order.fee_leg.amount > 0 && order.fee_leg.state == LegState::Succeeded)
    }

    fn is_order_settled(&self, order: &StoredOrder) -> bool {
        order.merchant_leg.state == LegState::Succeeded
            && (order.fee_leg.amount == 0 || order.fee_leg.state == LegState::Succeeded)
    }

    fn release_liability(&mut self, asset: &Asset, amount: u128) {
        if amount == 0 {
            return;
        }
        let key = asset_key(asset);
        let current = self.liabilities.get(&key).unwrap_or(0);
        assert!(current >= amount, "liability ledger underflow");
        self.liabilities.insert(&key, &(current - amount));
    }

    fn charge_storage(&mut self, before: u64) {
        let added_bytes = env::storage_usage().saturating_sub(before);
        let cost = u128::from(added_bytes)
            .checked_mul(env::storage_byte_cost().as_yoctonear())
            .expect("storage cost overflow");
        assert!(
            self.storage_reserve_yocto >= cost,
            "storage sponsor reserve exhausted; call fund_storage"
        );
        self.storage_reserve_yocto -= cost;
    }

    fn order_view(&self, key: [u8; 32], order: StoredOrder) -> OrderView {
        OrderView {
            order_key: hex::encode(key),
            order_id: order.authorization.order_id.clone(),
            merchant_id: order.authorization.merchant_id.clone(),
            merchant_account_id: order.authorization.merchant_account_id.clone(),
            payout_account_id: order.authorization.payout_account_id.clone(),
            payer_account_id: order.payer_account_id.to_string(),
            network_id: order.authorization.network_id,
            contract_id: order.authorization.contract_id.clone(),
            asset: order.authorization.asset.clone(),
            amount: U128(order.authorization.amount),
            fee: U128(order.fee),
            net: U128(order.net),
            fee_bps: order.authorization.fee_bps,
            fee_recipient_account_id: order.authorization.fee_recipient_account_id.clone(),
            state: order.state,
            merchant_leg: leg_view(&order.merchant_leg),
            fee_leg: leg_view(&order.fee_leg),
            refund_leg: leg_view(&order.refund_leg),
            created_at_seconds: order.created_at_seconds,
            updated_at_seconds: order.updated_at_seconds,
        }
    }

    fn emit_order_event(&self, event: &str, order: &StoredOrder) {
        let auth = &order.authorization;
        emit_event(
            event,
            json!({
                "orderId": auth.order_id,
                "merchantId": auth.merchant_id,
                "merchantAccountId": auth.merchant_account_id,
                "payoutAccountId": auth.payout_account_id,
                "payerAccountId": order.payer_account_id,
                "networkId": auth.network_id,
                "contractId": auth.contract_id,
                "asset": auth.asset,
                "amount": auth.amount.to_string(),
                "fee": order.fee.to_string(),
                "net": order.net.to_string(),
                "feeBps": auth.fee_bps,
                "feeRecipientAccountId": auth.fee_recipient_account_id,
                "state": order.state,
                "createdAtSeconds": order.created_at_seconds,
                "updatedAtSeconds": order.updated_at_seconds,
                "merchantLeg": leg_view(&order.merchant_leg),
                "feeLeg": leg_view(&order.fee_leg),
                "refundLeg": leg_view(&order.refund_leg),
            }),
        );
    }
}

fn account_id(value: &str) -> Result<AccountId, near_account_id::ParseAccountError> {
    value.parse::<AccountId>()
}

fn now_seconds() -> u64 {
    env::block_timestamp() / 1_000_000_000
}

fn asset_key(asset: &Asset) -> String {
    match asset {
        Asset::Native => "native:NEAR".to_string(),
        Asset::Nep141 { contract_id } => format!("nep141:{contract_id}"),
    }
}

fn decode_order_key(hex_key: &str) -> [u8; 32] {
    let bytes = hex::decode(hex_key).unwrap_or_else(|_| env::panic_str("order key must be hex"));
    bytes
        .try_into()
        .unwrap_or_else(|_| env::panic_str("order key must be 32 bytes"))
}

fn callback_name(leg: LegKind) -> String {
    match leg {
        LegKind::Refund => "on_refund_result".to_string(),
        _ => "on_payout_result".to_string(),
    }
}

fn leg_view(leg: &PayoutLeg) -> LegView {
    LegView {
        recipient_account_id: leg.recipient.to_string(),
        amount: U128(leg.amount),
        state: leg.state,
        attempt_id: leg.attempt_id,
    }
}

fn emit_event(event: &str, data: serde_json::Value) {
    let envelope = json!({ "standard": "worldz-payments", "version": "1.0.0", "event": event, "data": [data] });
    env::log_str(&format!("EVENT_JSON:{}", envelope));
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    use near_sdk::test_utils::{testing_env_with_promise_results, VMContextBuilder};
    use near_sdk::{testing_env, NearToken, PromiseResult, VMContext};

    const ONE_NEAR: u128 = 1_000_000_000_000_000_000_000_000;
    const GROSS: u128 = 10 * ONE_NEAR;

    fn id(value: &str) -> AccountId {
        value.parse().unwrap()
    }

    fn context(
        current: &AccountId,
        predecessor: &AccountId,
        deposit: u128,
        seconds: u64,
    ) -> VMContext {
        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id(current.clone())
            .signer_account_id(predecessor.clone())
            .predecessor_account_id(predecessor.clone())
            .account_balance(NearToken::from_yoctonear(100 * ONE_NEAR))
            .attached_deposit(NearToken::from_yoctonear(deposit))
            .block_timestamp(seconds * 1_000_000_000);
        builder.build()
    }

    fn payload() -> AuthorizationPayload {
        AuthorizationPayload {
            protocol_version: AUTH_PROTOCOL_VERSION,
            signer_key_id: "hackathon-key-1".into(),
            network_id: NetworkId::Testnet,
            contract_id: "router.worldz.testnet".into(),
            merchant_id: "mch_test_001".into(),
            merchant_account_id: "merchant.worldz.testnet".into(),
            payout_account_id: "payout.worldz.testnet".into(),
            order_id: "ord_hackathon_0001".into(),
            asset: Asset::Native,
            amount: GROSS,
            expires_at_seconds: 1_900_000_100,
            fee_bps: DEFAULT_FEE_BPS,
            fee_recipient_account_id: "fees.worldz.testnet".into(),
            expected_payer_account_id: Some("payer.worldz.testnet".into()),
            nonce: [9; 32],
        }
    }

    fn deployment() -> (
        Router,
        SigningKey,
        AccountId,
        AccountId,
        AccountId,
        AccountId,
    ) {
        let router_id = id("router.worldz.testnet");
        let admin = id("admin.worldz.testnet");
        let guardian = id("guardian.worldz.testnet");
        let fee = id("fees.worldz.testnet");
        let payer = id("payer.worldz.testnet");
        let signing_key = SigningKey::from_bytes(&[42; 32]);
        testing_env!(context(&router_id, &admin, ONE_NEAR, 1_900_000_000));
        let mut router = Router::new(
            admin.clone(),
            guardian,
            fee.clone(),
            None,
            NetworkId::Testnet,
            vec![],
        );
        testing_env!(context(&router_id, &admin, 0, 1_900_000_000));
        router.set_signer_key(
            "hackathon-key-1".into(),
            BASE64.encode(signing_key.verifying_key().to_bytes()),
            true,
        );
        (router, signing_key, router_id, admin, payer, fee)
    }

    fn sign(payload: &AuthorizationPayload, signing_key: &SigningKey) -> String {
        BASE64.encode(
            signing_key
                .sign(&payload.signing_digest().unwrap())
                .to_bytes(),
        )
    }

    #[test]
    fn native_payment_is_processing_until_both_payout_receipts_succeed() {
        let (mut router, signing_key, router_id, _admin, payer, _fee) = deployment();
        let authorization = payload();
        let signature = sign(&authorization, &signing_key);
        let order_key = hex::encode(authorization.replay_key().unwrap());
        testing_env!(context(&router_id, &payer, GROSS, 1_900_000_001));
        let _payout_promise = router.pay_native(authorization, signature);

        let processing = router.get_order(order_key.clone()).unwrap();
        assert_eq!(processing.state, OrderState::Processing);
        assert_eq!(router.get_liability(Asset::Native).0, GROSS);
        assert_eq!(processing.fee.0, GROSS * 30 / 10_000);
        assert_eq!(processing.net.0 + processing.fee.0, GROSS);

        let merchant_attempt = processing.merchant_leg.attempt_id;
        testing_env_with_promise_results(
            context(&router_id, &router_id, 0, 1_900_000_002),
            PromiseResult::Successful(vec![]),
        );
        assert!(!router.on_payout_result(order_key.clone(), LegKind::Merchant, merchant_attempt));
        let partial = router.get_order(order_key.clone()).unwrap();
        assert_eq!(partial.state, OrderState::PartialPayout);
        assert_eq!(router.get_liability(Asset::Native).0, partial.fee.0);

        let fee_attempt = partial.fee_leg.attempt_id;
        testing_env_with_promise_results(
            context(&router_id, &router_id, 0, 1_900_000_003),
            PromiseResult::Successful(vec![]),
        );
        assert!(router.on_payout_result(order_key.clone(), LegKind::Fee, fee_attempt));
        assert_eq!(
            router.get_order(order_key.clone()).unwrap().state,
            OrderState::Settled
        );
        assert_eq!(router.get_liability(Asset::Native).0, 0);

        testing_env_with_promise_results(
            context(&router_id, &router_id, 0, 1_900_000_004),
            PromiseResult::Successful(vec![]),
        );
        assert!(
            !router.on_payout_result(order_key, LegKind::Fee, fee_attempt),
            "duplicate callback must be ignored"
        );
    }

    #[test]
    fn failed_payouts_keep_liability_and_a_failed_refund_is_safely_retryable() {
        let (mut router, signing_key, router_id, _admin, payer, _fee) = deployment();
        let authorization = payload();
        let signature = sign(&authorization, &signing_key);
        let order_key = hex::encode(authorization.replay_key().unwrap());
        testing_env!(context(&router_id, &payer, GROSS, 1_900_000_001));
        let _payout_promise = router.pay_native(authorization, signature);

        let processing = router.get_order(order_key.clone()).unwrap();
        testing_env_with_promise_results(
            context(&router_id, &router_id, 0, 1_900_000_002),
            PromiseResult::Failed,
        );
        assert!(!router.on_payout_result(
            order_key.clone(),
            LegKind::Merchant,
            processing.merchant_leg.attempt_id
        ));
        let after_merchant = router.get_order(order_key.clone()).unwrap();
        testing_env_with_promise_results(
            context(&router_id, &router_id, 0, 1_900_000_003),
            PromiseResult::Failed,
        );
        assert!(!router.on_payout_result(
            order_key.clone(),
            LegKind::Fee,
            after_merchant.fee_leg.attempt_id
        ));
        assert_eq!(
            router.get_order(order_key.clone()).unwrap().state,
            OrderState::PayoutRetryable
        );
        assert_eq!(router.get_liability(Asset::Native).0, GROSS);

        testing_env!(context(&router_id, &payer, 0, 1_900_000_004));
        let _refund_promise = router.refund_order(order_key.clone());
        let refund_pending = router.get_order(order_key.clone()).unwrap();
        let first_refund_attempt = refund_pending.refund_leg.attempt_id;
        testing_env_with_promise_results(
            context(&router_id, &router_id, 0, 1_900_000_005),
            PromiseResult::Failed,
        );
        router.on_refund_result(order_key.clone(), first_refund_attempt);
        assert_eq!(
            router.get_order(order_key.clone()).unwrap().state,
            OrderState::RefundPending
        );
        assert_eq!(router.get_liability(Asset::Native).0, GROSS);

        testing_env!(context(&router_id, &payer, 0, 1_900_000_006));
        let _refund_retry = router.retry_refund(order_key.clone());
        let retry_attempt = router
            .get_order(order_key.clone())
            .unwrap()
            .refund_leg
            .attempt_id;
        assert_ne!(first_refund_attempt, retry_attempt);
        testing_env_with_promise_results(
            context(&router_id, &router_id, 0, 1_900_000_007),
            PromiseResult::Successful(vec![]),
        );
        router.on_refund_result(order_key.clone(), retry_attempt);
        assert_eq!(
            router.get_order(order_key).unwrap().state,
            OrderState::Refunded
        );
        assert_eq!(router.get_liability(Asset::Native).0, 0);
    }

    #[test]
    #[should_panic(expected = "signed order already used or cancelled")]
    fn cancellation_marker_permanently_blocks_later_signed_payment() {
        let (mut router, signing_key, router_id, _admin, payer, _fee) = deployment();
        let authorization = payload();
        let signature = sign(&authorization, &signing_key);
        let merchant_identity = id(&authorization.merchant_account_id);
        testing_env!(context(&router_id, &merchant_identity, 0, 1_900_000_001));
        router.cancel_authorization(authorization.clone(), signature.clone());
        testing_env!(context(&router_id, &payer, GROSS, 1_900_000_002));
        let _should_not_schedule = router.pay_native(authorization, signature);
    }

    #[test]
    fn forged_merchant_cannot_cancel_or_consume_sponsored_storage() {
        let (mut router, signing_key, router_id, _, _, _) = deployment();
        let original = payload();
        let signature = sign(&original, &signing_key);
        let mut forged = original.clone();
        forged.merchant_account_id = "attacker.testnet".into();
        assert_eq!(original.replay_key().unwrap(), forged.replay_key().unwrap());
        let reserve = router.storage_reserve_yocto;
        testing_env!(context(
            &router_id,
            &id("attacker.testnet"),
            0,
            1_900_000_001
        ));
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            router.cancel_authorization(forged, signature)
        }));
        assert!(result.is_err());
        assert_eq!(router.storage_reserve_yocto, reserve);
        assert!(!router.used_orders.contains(&original.replay_key().unwrap()));
    }

    #[test]
    fn fabricated_authorization_cannot_write_a_cancellation_marker() {
        let (mut router, _, router_id, _, _, _) = deployment();
        let authorization = payload();
        testing_env!(context(
            &router_id,
            &id(&authorization.merchant_account_id),
            0,
            1_900_000_001
        ));
        let reserve = router.storage_reserve_yocto;
        let key = authorization.replay_key().unwrap();
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            router.cancel_authorization(authorization, BASE64.encode([0u8; 64]))
        }));
        assert!(result.is_err());
        assert_eq!(router.storage_reserve_yocto, reserve);
        assert!(!router.used_orders.contains(&key));
    }
}
