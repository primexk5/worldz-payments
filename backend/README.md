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

Order status and metadata require the owning merchant's session/API key, or the private checkout token returned after wallet verification. Customer clients send that token in `x-checkout-token`; receipt-name edits also include `editToken` in the JSON body. Keep the token out of URLs and logs. Settled receipts are immutable. Status GET requests perform no reconciliation and processing/terminal responses omit the signed authorization. Submit transaction hashes through POST `/v1/orders/{merchantId}/{orderId}/meta`; the background worker verifies settlement.

Merchant API requests accept `Authorization: Bearer wzp_...`. Revoked keys immediately stop working. Keys inherit merchant access, so store them only in trusted server environments. Payout changes additionally require a fresh wallet signature.

The Next.js proxy uses the same origin. Direct browser clients need an origin in `CORS_ORIGINS`. Root trailing slashes, hostname case and default ports are normalized. Entries with wildcards, paths, query strings, fragments or credentials grant no cross-origin access and are ignored with a warning; they do not prevent the API from starting. CORS is not authentication.

Public API traffic has bounded in-memory request budgets and a 32-request concurrency cap per process. Limits use the transport peer, never untrusted forwarded headers. Configure additional distributed limits at your trusted ingress for multiple replicas or proxies that share one transport address. HTTP reserves eight database connections; background workers share two. Worker failures back off up to five minutes and emit structured error logs with retry counts; connect those logs to your deployment's alerting service.

Wallet transaction hashes are submission hints, not payment evidence. The reconciliation worker checks NEAR transaction/receipt results, parses `EVENT_JSON` from the configured router, then verifies the finalized router `get_order` view and both payout legs before persisting `SETTLED` and issuing the settlement receipt ID. Unverified or partial orders remain non-settled and are not webhooked as confirmed payments.

The service requires a database and NEAR JSON-RPC but does not deploy or initialize contracts. Router IDs, fee recipients, signer public keys, and FT allowlists must be provisioned separately on the correct network. If no indexer start height is configured, the worker begins at the current finalized tip and does not backfill earlier blocks.

## Verification and signer rotation

Run `cargo test -p worldz-near-api`. To exercise real PostgreSQL permissions, API-key revocation, idempotent deletes and concurrent rate limits, point `SECURITY_TEST_DATABASE_URL` at a disposable PostgreSQL server, then run:

```sh
cargo test -p worldz-near-api postgres_checkout_access_api_keys_and_atomic_limits -- --ignored
```

The test creates a unique schema and removes it afterward. It never reads the application's `.env`.

If a signing seed is exposed, prepare a replacement with `cargo run -p worldz-near-api --bin generate_testnet_signer -- --prepare-rotation`. This writes an ignored, permission-restricted `backend/.env.signer-rotation` file and prints only the public key. It does not switch the active signer. Enable the replacement public key on the router, update both private signer variables in the hosting environment, verify readiness, and disable the compromised key on the router. Never paste the seed into a chat or commit it. Database credentials require a separate provider-side rotation if exposed.
