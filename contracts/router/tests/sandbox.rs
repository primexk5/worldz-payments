use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use ed25519_dalek::{Signer, SigningKey};
use near_sdk::NearToken;
use near_workspaces::types::Gas;
use serde_json::{json, Value};
use std::time::Duration;
use worldz_near_protocol::{
    Asset, AuthorizationPayload, NetworkId, AUTH_PROTOCOL_VERSION, DEFAULT_FEE_BPS,
};

const YOCTO: u128 = 1_000_000_000_000_000_000_000_000;

fn wasm(path_env: &str, fallback: &str) -> anyhow::Result<Vec<u8>> {
    let path = std::env::var(path_env).unwrap_or_else(|_| fallback.to_string());
    Ok(std::fs::read(path)?)
}

fn auth(
    router: &str,
    merchant: &str,
    payout: &str,
    payer: &str,
    fee_account: &str,
    order_id: &str,
    asset: Asset,
    amount: u128,
    nonce: u8,
) -> AuthorizationPayload {
    AuthorizationPayload {
        protocol_version: AUTH_PROTOCOL_VERSION,
        signer_key_id: "sandbox-key".into(),
        network_id: NetworkId::Testnet,
        contract_id: router.into(),
        merchant_id: "mch_sandbox_001".into(),
        merchant_account_id: merchant.into(),
        payout_account_id: payout.into(),
        order_id: order_id.into(),
        asset,
        amount,
        expires_at_seconds: 0,
        fee_bps: DEFAULT_FEE_BPS,
        fee_recipient_account_id: fee_account.into(),
        expected_payer_account_id: Some(payer.into()),
        nonce: [nonce; 32],
    }
}

fn signature(payload: &AuthorizationPayload, key: &SigningKey) -> String {
    BASE64.encode(key.sign(&payload.signing_digest().unwrap()).to_bytes())
}

async fn wait_settled(router: &near_workspaces::Contract, key: &str) -> anyhow::Result<Value> {
    for _ in 0..40 {
        let view: Value = router
            .view("get_order")
            .args_json(json!({ "order_key": key }))
            .await?
            .json()?;
        if view["state"] == "SETTLED"
            || view["state"] == "PAYOUT_RETRYABLE"
            || view["state"] == "PARTIAL_PAYOUT"
        {
            return Ok(view);
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
    anyhow::bail!("order did not reach a settled or explicit recovery state in sandbox")
}

async fn init_router(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
    router_wasm: &[u8],
    admin: &near_workspaces::Account,
    guardian: &near_workspaces::Account,
    fee: &near_workspaces::Account,
    token_ids: Vec<String>,
) -> anyhow::Result<near_workspaces::Contract> {
    let router = worker.dev_deploy(router_wasm).await?;
    router
        .call("new")
        .args_json(json!({
            "admin_id": admin.id(),
            "pause_guardian_id": guardian.id(),
            "fee_recipient_account_id": fee.id(),
            "fee_bps": DEFAULT_FEE_BPS,
            "network_id": "testnet",
            "allowed_token_ids": token_ids,
        }))
        .deposit(NearToken::from_near(2))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    let key = SigningKey::from_bytes(&[42; 32]);
    admin.call(router.id(), "set_signer_key")
        .args_json(json!({ "key_id": "sandbox-key", "public_key_base64": BASE64.encode(key.verifying_key().to_bytes()), "enabled": true }))
        .max_gas().transact().await?.into_result()?;
    Ok(router)
}

#[tokio::test]
async fn sandbox_native_exact_payment_snapshots_fee_and_survives_router_redeploy(
) -> anyhow::Result<()> {
    let router_default = format!(
        "{}/../../target/wasm32-unknown-unknown/release/worldz_near_router.wasm",
        env!("CARGO_MANIFEST_DIR")
    );
    let router_wasm = wasm("WORLDZ_ROUTER_WASM", &router_default)?;
    let worker = near_workspaces::sandbox().await?;
    let admin = worker.dev_create_account().await?;
    let guardian = worker.dev_create_account().await?;
    let merchant_identity = worker.dev_create_account().await?;
    let payout = worker.dev_create_account().await?;
    let payer = worker.dev_create_account().await?;
    let fee = worker.dev_create_account().await?;
    let router = init_router(&worker, &router_wasm, &admin, &guardian, &fee, vec![]).await?;

    let gross = 25 * YOCTO;
    let payload = auth(
        router.id().as_str(),
        merchant_identity.id().as_str(),
        payout.id().as_str(),
        payer.id().as_str(),
        fee.id().as_str(),
        "ord_sandbox_native_1",
        Asset::Native,
        gross,
        1,
    );
    let signature = signature(&payload, &SigningKey::from_bytes(&[42; 32]));
    let order_key = hex::encode(payload.replay_key()?);
    let payout_before = payout.view_account().await?.balance.as_yoctonear();
    let fee_before = fee.view_account().await?.balance.as_yoctonear();
    let before_attack: Value = router.view("get_config").await?.json()?;
    let mut forged = payload.clone();
    forged.merchant_account_id = payer.id().to_string();
    let attack = payer
        .call(router.id(), "cancel_authorization")
        .args_json(json!({"authorization":forged,"signature":signature.clone()}))
        .max_gas()
        .transact()
        .await?;
    assert!(
        attack.into_result().is_err(),
        "forged merchant must not cancel a valid payment"
    );
    let after_attack: Value = router.view("get_config").await?.json()?;
    assert_eq!(
        before_attack["storageReserveYocto"],
        after_attack["storageReserveYocto"]
    );
    payer
        .call(router.id(), "pay_native")
        .args_json(json!({ "authorization": payload.clone(), "signature": signature.clone() }))
        .deposit(NearToken::from_yoctonear(gross))
        .gas(Gas::from_tgas(180))
        .transact()
        .await?
        .into_result()?;

    let settled = wait_settled(&router, &order_key).await?;
    assert_eq!(settled["state"], "SETTLED");
    assert_eq!(
        settled["merchantAccountId"],
        merchant_identity.id().as_str()
    );
    assert_eq!(settled["payoutAccountId"], payout.id().as_str());
    assert_eq!(settled["amount"], gross.to_string());
    assert_eq!(
        settled["fee"],
        (gross * u128::from(DEFAULT_FEE_BPS) / 10_000).to_string()
    );

    let fee_amount = gross * u128::from(DEFAULT_FEE_BPS) / 10_000;
    assert_eq!(
        payout.view_account().await?.balance.as_yoctonear(),
        payout_before + gross - fee_amount
    );
    assert_eq!(
        fee.view_account().await?.balance.as_yoctonear(),
        fee_before + fee_amount
    );
    assert_eq!(
        router
            .view("get_liability")
            .args_json(json!({ "asset": { "type": "native" } }))
            .await?
            .json::<String>()?,
        "0"
    );

    // Simulate an upgrade by redeploying the same state-compatible WASM to the same account.
    router
        .as_account()
        .deploy(&router_wasm)
        .await?
        .into_result()?;
    assert_eq!(
        router
            .view("get_order")
            .args_json(json!({ "order_key": order_key }))
            .await?
            .json::<Value>()?["state"],
        "SETTLED"
    );
    Ok(())
}

#[tokio::test]
async fn sandbox_nep141_transfer_call_returns_only_after_verified_router_payouts(
) -> anyhow::Result<()> {
    let router_default = format!(
        "{}/../../target/wasm32-unknown-unknown/release/worldz_near_router.wasm",
        env!("CARGO_MANIFEST_DIR")
    );
    let ft_default = format!(
        "{}/../../target/wasm32-unknown-unknown/release/worldz_mock_nep141.wasm",
        env!("CARGO_MANIFEST_DIR")
    );
    let router_wasm = wasm("WORLDZ_ROUTER_WASM", &router_default)?;
    let ft_wasm = wasm("WORLDZ_MOCK_FT_WASM", &ft_default)?;
    let worker = near_workspaces::sandbox().await?;
    let admin = worker.dev_create_account().await?;
    let guardian = worker.dev_create_account().await?;
    let merchant_identity = worker.dev_create_account().await?;
    let payout = worker.dev_create_account().await?;
    let payer = worker.dev_create_account().await?;
    let fee = worker.dev_create_account().await?;
    let token = worker.dev_deploy(&ft_wasm).await?;
    token.call("new")
        .args_json(json!({ "owner_id": admin.id(), "total_supply": "0", "name": "Sandbox USD", "symbol": "sUSD", "decimals": 6 }))
        .max_gas().transact().await?.into_result()?;
    let router = init_router(
        &worker,
        &router_wasm,
        &admin,
        &guardian,
        &fee,
        vec![token.id().to_string()],
    )
    .await?;

    let storage_bounds: Value = token.view("storage_balance_bounds").await?.json()?;
    let storage_min = storage_bounds["min"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("FT storage minimum must be a decimal string"))?
        .parse::<u128>()?;
    for account in [&payer, &router.as_account().clone(), &payout, &fee] {
        token
            .call("storage_deposit")
            .args_json(json!({ "account_id": account.id(), "registration_only": true }))
            .deposit(NearToken::from_yoctonear(storage_min))
            .max_gas()
            .transact()
            .await?
            .into_result()?;
    }
    let amount = 50_000_000u128;
    admin
        .call(token.id(), "mint_for_test")
        .args_json(json!({ "receiver_id": payer.id(), "amount": amount.to_string() }))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    let payload = auth(
        router.id().as_str(),
        merchant_identity.id().as_str(),
        payout.id().as_str(),
        payer.id().as_str(),
        fee.id().as_str(),
        "ord_sandbox_ft_1",
        Asset::Nep141 {
            contract_id: token.id().to_string(),
        },
        amount,
        2,
    );
    let signature = signature(&payload, &SigningKey::from_bytes(&[42; 32]));
    let order_key = hex::encode(payload.replay_key()?);
    let payout_before: String = token
        .view("ft_balance_of")
        .args_json(json!({ "account_id": payout.id() }))
        .await?
        .json()?;
    let fee_before: String = token
        .view("ft_balance_of")
        .args_json(json!({ "account_id": fee.id() }))
        .await?
        .json()?;
    let payer_before: String = token
        .view("ft_balance_of")
        .args_json(json!({ "account_id": payer.id() }))
        .await?
        .json()?;

    payer.call(token.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": router.id(),
            "amount": amount.to_string(),
            "memo": null,
            "msg": serde_json::to_string(&json!({ "action": "pay", "authorization": payload, "signature": signature }))?,
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(240))
        .transact().await?.into_result()?;

    let settled = wait_settled(&router, &order_key).await?;
    assert_eq!(settled["state"], "SETTLED");
    let fee_amount = amount * u128::from(DEFAULT_FEE_BPS) / 10_000;
    let net_amount = amount - fee_amount;
    let payout_after: String = token
        .view("ft_balance_of")
        .args_json(json!({ "account_id": payout.id() }))
        .await?
        .json()?;
    let fee_after: String = token
        .view("ft_balance_of")
        .args_json(json!({ "account_id": fee.id() }))
        .await?
        .json()?;
    let payer_after: String = token
        .view("ft_balance_of")
        .args_json(json!({ "account_id": payer.id() }))
        .await?
        .json()?;
    assert_eq!(
        payout_after.parse::<u128>()?,
        payout_before.parse::<u128>()? + net_amount
    );
    assert_eq!(
        fee_after.parse::<u128>()?,
        fee_before.parse::<u128>()? + fee_amount
    );
    assert_eq!(
        payer_after.parse::<u128>()?,
        payer_before.parse::<u128>()? - amount
    );
    Ok(())
}
