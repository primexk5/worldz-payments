# Deploy WorldzPayments to Render with Supabase PostgreSQL

The Render Blueprint deploys the Rust API. The Next.js frontend is hosted separately on Vercel.

- `worldz-near-api`: Rust API in the repository-root Dockerfile.

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

In Render, create or sync a Blueprint from this repository and review `render.yaml`. It creates the API service. Set the listed values in its Environment page before deploying.

### Render API service: `worldz-near-api`

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Rotated Supabase session-pooler URL, including `sslmode=require` |
| `AUTH_RECIPIENT` | The public Vercel frontend origin, `https://worldz-payments.vercel.app` |
| `NEAR_TESTNET_ROUTER_ID` | Deployed Worldz router account |
| `NEAR_TESTNET_FEE_RECIPIENT` | Configured Testnet fee-recipient account |
| `NEAR_TESTNET_SIGNER_SEED_BASE64` | Backend-only 32-byte signing seed, standard Base64 |
| `NEAR_TESTNET_INDEXER_START_HEIGHT` | Router deployment block height, or `0` to start at the current finalized tip |
| `NEAR_TESTNET_FT_ALLOWLIST` | Comma-separated Testnet FT contract IDs enabled in the router |
| `WEBHOOK_SIGNING_SECRET` | Required for merchant webhooks; the Blueprint generates a strong value when one does not already exist |

If the optional Vercel sample receiver at `/webhooks/worldz` is used, copy the
Render service's `WEBHOOK_SIGNING_SECRET` into the Vercel project's server-side
environment variables with the same name, then redeploy the frontend. Both sides
must use the same secret. Do not expose it through a `NEXT_PUBLIC_` variable.

The Blueprint sets `APP_HOST=0.0.0.0`, `APP_PORT=10000`, and `SESSION_COOKIE_SECURE=true` for Render.

## Vercel frontend environment

Copy values from [`frontend/.env.vercel.example`](../frontend/.env.vercel.example) to the Vercel project's Production environment. Set `NEAR_BACKEND_URL` to the actual public URL of the Render API service; the sample uses `https://worldz-near-api.onrender.com`.

| Variable | Value |
| --- | --- |
| `NEAR_BACKEND_URL` | Public HTTPS Render API service URL |
| `NEXT_PUBLIC_NEAR_NETWORK_ID` | `testnet` until a separate Mainnet deployment is configured |
| `NEXT_PUBLIC_NEAR_RPC_URL` | Testnet NEAR RPC endpoint |
| `NEXT_PUBLIC_NEAR_EXPLORER_URL` | Testnet explorer origin |
| `NEXT_PUBLIC_NEAR_CONTRACT_ID` | The deployed Testnet router account |
| `NEXT_PUBLIC_APP_URL` | `https://worldz-payments.vercel.app`; use the same canonical origin in Production and Preview to keep shared links off protected preview URLs |

After changing Vercel environment values, redeploy the frontend. If you change its hostname or add a custom domain, update Render's `AUTH_RECIPIENT` to the matching Vercel origin and redeploy the API.

## 3. Confirm deployment

- The API health check is `https://<api-host>/healthz`; readiness is `/readyz` and requires a successful Supabase connection.
- Open the frontend and complete a Testnet wallet sign-in.
- Check `/api/v1/network-config?networkId=testnet` through the frontend and verify the router, fee recipient and allowed tokens match the deployed router.
- Complete a small Testnet payment and wait for a verified settlement before relying on receipts or Shopify order sync.

## Shopify (optional)

Shopify settings are optional. To enable them later, add `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, `SHOPIFY_CHECKOUT_URL`, and a dedicated 32-byte `SHOPIFY_TOKEN_ENCRYPTION_KEY_BASE64` to the API service's Render environment. See [`../backend/SHOPIFY.md`](../backend/SHOPIFY.md) for app callback, proxy, scope and theme setup.

Never put database credentials, NEAR signer seeds, Shopify secrets or token-encryption keys in frontend `NEXT_PUBLIC_*` variables.
