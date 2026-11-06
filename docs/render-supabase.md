# Deploy WorldzPayments to Render with Supabase PostgreSQL

The Render Blueprint deploys two services:

- `worldz-near-api`: Rust API in the repository-root Dockerfile.
- `worldz-payments`: Next.js frontend in `frontend/`, with its `/api/v1` proxy connected to the backend service.

The backend applies its PostgreSQL schema from `backend/migrations/postgres/` on startup. Existing MySQL data is not migrated or copied by this deployment.

## 1. Rotate and prepare the database URL

The Supabase database password was shared in a chat message. Rotate it in Supabase before using the database for deployment, then create a new connection URL. Do not add that URL to Git, `.env.example`, or this document.

Use Supabase's **session pooler** connection on port `5432` for the long-running Render API. The format is:

```text
postgresql://<pooler-user>:<new-password>@<pooler-host>:5432/postgres?sslmode=require
```

URL-encode reserved characters in the username or password before putting them in the connection URL.

The database role must be allowed to create and alter tables and indexes because SQLx migrations run automatically at backend startup.

## 2. Create the Render Blueprint

In Render, create a Blueprint from this repository and review `render.yaml`. It creates the API and frontend services. Set the following values in each service's Environment page before the first deploy.

### `worldz-near-api`

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Rotated Supabase session-pooler URL, including `sslmode=require` |
| `AUTH_RECIPIENT` | The public frontend origin, currently `https://worldz-payments.onrender.com` |
| `NEAR_TESTNET_ROUTER_ID` | Deployed Worldz router account |
| `NEAR_TESTNET_FEE_RECIPIENT` | Configured Testnet fee-recipient account |
| `NEAR_TESTNET_SIGNER_SEED_BASE64` | Backend-only 32-byte signing seed, standard Base64 |
| `NEAR_TESTNET_INDEXER_START_HEIGHT` | Router deployment block height, or `0` to start at the current finalized tip |
| `NEAR_TESTNET_FT_ALLOWLIST` | Comma-separated Testnet FT contract IDs enabled in the router |
| `WEBHOOK_SIGNING_SECRET` | Optional; omit unless merchant webhook signing is configured |

The Blueprint sets `APP_HOST=0.0.0.0`, `APP_PORT=10000`, and `SESSION_COOKIE_SECURE=true` for Render.

### `worldz-payments`

Frontend values are also collected in [`frontend/.env.render.example`](../frontend/.env.render.example).

| Variable | Value |
| --- | --- |
| `NEAR_BACKEND_URL` | Blueprint links this to the API service host; the frontend proxy upgrades the host to HTTPS |
| `NEXT_PUBLIC_NEAR_NETWORK_ID` | `testnet` until a separate Mainnet deployment is configured |
| `NEXT_PUBLIC_NEAR_CONTRACT_ID` | The deployed Testnet router account |

If you change the frontend hostname or add a custom domain, update `AUTH_RECIPIENT` to match the final public frontend origin and redeploy the API.

## 3. Confirm deployment

- The API health check is `https://<api-host>/healthz`; readiness is `/readyz` and requires a successful Supabase connection.
- Open the frontend and complete a Testnet wallet sign-in.
- Check `/api/v1/network-config?networkId=testnet` through the frontend and verify the router, fee recipient and allowed tokens match the deployed router.
- Complete a small Testnet payment and wait for a verified settlement before relying on receipts or Shopify order sync.

## Shopify (optional)

Shopify settings are optional. To enable them later, add `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, `SHOPIFY_CHECKOUT_URL`, and a dedicated 32-byte `SHOPIFY_TOKEN_ENCRYPTION_KEY_BASE64` to the API service's Render environment. See [`../backend/SHOPIFY.md`](../backend/SHOPIFY.md) for app callback, proxy, scope and theme setup.

Never put database credentials, NEAR signer seeds, Shopify secrets or token-encryption keys in frontend `NEXT_PUBLIC_*` variables.
