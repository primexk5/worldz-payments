# WorldzPayments NEAR API

Axum API for merchant auth, payment links, payment reconciliation, API keys, and merchant webhooks. The frontend's `/api/v1/*` route proxies to this service's `/v1/*` routes.

## Local run

1. Start MySQL 8.0.16+ and use the existing `worldz_payments` database with a restricted application user that has migration privileges.
2. Copy `.env.example` to `.env` and set `DATABASE_URL` to that user's local connection, plus `AUTH_RECIPIENT` and the TestNet router, fee recipient, and signer settings. Set `NEAR_TESTNET_INDEXER_START_HEIGHT` to the router deployment block height so finalized events are indexed from contract creation.
3. Run `cargo run -p worldz-near-api --bin worldz-near-api` from the workspace root. SQL migrations are applied at startup.
4. Read `/v1/network-config?networkId=testnet` and configure its `signerKeyId`/`signerPublicKeyBase64` on the router with the router admin account. The endpoint returns only the public key. The server's `NEAR_TESTNET_SIGNER_SEED_BASE64` must be the corresponding 32-byte Ed25519 seed, standard-base64 encoded.
5. Configure allowlisted FT contract IDs in `NEAR_TESTNET_FT_ALLOWLIST`; the API reads each token's `ft_metadata` from NEAR RPC.

`/healthz` checks process liveness. `/readyz` checks MySQL readiness. Keep `SESSION_COOKIE_SECURE=false` only for local HTTP development. Real `.env` files and signing seeds must never be committed. For production, inject secrets through a secret manager and use a KMS-backed signer rather than a static environment seed.

## Settlement model

Wallet transaction hashes are submission hints, not payment evidence. The reconciliation worker checks NEAR transaction/receipt results, parses `EVENT_JSON` from the configured router, then verifies the finalized router `get_order` view and both payout legs before persisting `SETTLED` and issuing the settlement receipt ID. Unverified or partial orders remain non-settled and are not webhooked as confirmed payments.

The service requires a database and NEAR JSON-RPC but does not deploy or initialize contracts. Router IDs, fee recipients, signer public keys, and FT allowlists must be provisioned separately on the correct network. If no indexer start height is configured, the worker begins at the current finalized tip and does not backfill earlier blocks.
