# WorldzPayments NEAR API

Axum API for merchant auth, payment links, payment reconciliation, API keys, and merchant webhooks. The frontend's `/api/v1/*` route proxies to this service's `/v1/*` routes.

## Local run

1. Create a PostgreSQL database (Supabase is supported) and use its direct or session-pooler connection URL with SSL enabled. The database user needs privileges to create tables and indexes for startup migrations.
2. Copy `.env.example` to `.env` and set `DATABASE_URL` to the PostgreSQL connection URL, plus `AUTH_RECIPIENT` and the TestNet router, fee recipient, and signer settings. Set `NEAR_TESTNET_INDEXER_START_HEIGHT` to the router deployment block height so finalized events are indexed from contract creation.
3. Run `cargo run -p worldz-near-api --bin worldz-near-api` from the workspace root. SQL migrations are applied at startup.
4. Read `/v1/network-config?networkId=testnet` and configure its `signerKeyId`/`signerPublicKeyBase64` on the router with the router admin account. The endpoint returns only the public key. The server's `NEAR_TESTNET_SIGNER_SEED_BASE64` must be the corresponding 32-byte Ed25519 seed, standard-base64 encoded.
5. Configure allowlisted FT contract IDs in `NEAR_TESTNET_FT_ALLOWLIST`; the API reads each token's `ft_metadata` from NEAR RPC.

The API now uses PostgreSQL. The SQL files directly under `migrations/` are the legacy MySQL schema; startup applies the PostgreSQL schema from `migrations/postgres/`. Existing MySQL data is not copied automatically.

## Render and Supabase

The repository includes a Render Blueprint (`render.yaml`) and backend Dockerfile. See [`../docs/render-supabase.md`](../docs/render-supabase.md) for the Render environment variables, Supabase pooler URL format and initial deployment steps. Do not commit the Supabase connection URL or any signing key.

`/healthz` checks process liveness. `/readyz` checks PostgreSQL readiness. Keep `SESSION_COOKIE_SECURE=false` only for local HTTP development. Real `.env` files and signing seeds must never be committed. For production, inject secrets through a secret manager and use a KMS-backed signer rather than a static environment seed.

## Settlement model

Wallet transaction hashes are submission hints, not payment evidence. The reconciliation worker checks NEAR transaction/receipt results, parses `EVENT_JSON` from the configured router, then verifies the finalized router `get_order` view and both payout legs before persisting `SETTLED` and issuing the settlement receipt ID. Unverified or partial orders remain non-settled and are not webhooked as confirmed payments.

The service requires a database and NEAR JSON-RPC but does not deploy or initialize contracts. Router IDs, fee recipients, signer public keys, and FT allowlists must be provisioned separately on the correct network. If no indexer start height is configured, the worker begins at the current finalized tip and does not backfill earlier blocks.
