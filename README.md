# WorldzPayments

**Know which order was paid—and whether the merchant actually received it.**

For independent merchants accepting NEAR wallet payments, a transaction hash is only the start.
WorldzPayments connects a payment link to an authorized order, verifies the required merchant and fee payouts, and produces a receipt and reconciliation record.
The prototype supports native NEAR and configured NEP-141 tokens on **NEAR testnet**.

[Live testnet app](https://worldz-payments.vercel.app) · [Watch the 60-second product video](https://worldz-payments.vercel.app/checkout/demo) · [Verified storefront payment](https://testnet.nearblocks.io/txns/CvsZPAg47KKaNKyHayJuvywG7YukFkyYHcaBHo12afUE) · [Evidence and verification](docs/evidence/README.md) · [Product docs](https://worldz-payments.vercel.app/docs)

[![Merchant dashboard and receipt for the verified 0.03 NEAR storefront payment](docs/evidence/screenshots/storefront-settlement-dashboard.png)](https://testnet.nearblocks.io/txns/CvsZPAg47KKaNKyHayJuvywG7YukFkyYHcaBHo12afUE)

*Merchant-provided receipt for the storefront test: 0.03 testnet NEAR settled, 0.02991 NEAR to the merchant, and 0.00009 NEAR in fees. The exact payment matches the authenticated merchant API and finalized router state. Screenshot published unchanged at the user's request; webhook delivery has a separate status below.*

## Why use it?

A plain wallet transfer leaves the seller to match an amount and address to an order.
WorldzPayments keeps the order, exact payment terms, merchant payout, receipt, and signed webhook together. It is a crypto checkout workflow for customers who already use NEAR wallets; it does not offer card acquiring, bank settlement, or a replacement for Stripe or Paystack's fiat services.

The core demonstration is **one merchant → one payment link → one verified settlement → one receipt**. Nigeria-focused services are an optional sandbox experiment, not the settlement rail for merchant payments.

## Verify the submission

WorldzPayments is submitted to the **NEAR Hackathon Real-World Money** track.

| Evidence | What it establishes | Where to check |
| --- | --- | --- |
| Product video | A walkthrough of the intended experience | [Watch](https://worldz-payments.vercel.app/checkout/demo) |
| Native and token sandbox tests | Actual local blockchain payout receipts, replay rejection, and upgrade compatibility | [Tests](contracts/router/tests/sandbox.rs) |
| Fee-rotation recovery regression | An already-paid order still reconciles against its original terms after configuration changes | [Run and inspect the report](docs/evidence/README.md#reproduce-the-recovery-case) |
| Storefront product checkout | User-identified product-page initiation; the 0.03 NEAR payment matches the supplied receipt, authenticated merchant API, finalized settlement event and router state | [Storefront evidence](docs/evidence/README.md#storefront-product-checkout) · [Exact record](docs/evidence/storefront-payment.json) |
| Storefront webhook observation | The user reported working webhooks; the final sender observation at 09:12:39 UTC on 14 November 2026 was failed after 10 attempts, with HTTP 404 from the receiver. Receiver acceptance/signature evidence was not captured | [Delivery observation and limits](docs/evidence/README.md#storefront-webhook-status) |
| Public on-chain settlement | A 1.5 testnet NEAR payment has matching finalized settlement evidence and succeeded payout legs | [Transaction](https://testnet.nearblocks.io/txns/9Wufap1bjNXDjMjbikHBT6Uj9gNxARJitoobxjW8mwfN) · [Exact identifiers](docs/evidence/public-settlement.json) |
| Earlier 1.5 NEAR dashboard/receipt | The earlier published merchant dashboard and receipt match that verified public transaction, settlement reference, and amounts. Webhook delivery is not included in that evidence | [Evidence status](docs/evidence/README.md#public-testnet-checkout) |

The earlier manual run does not validate a later deployment. Public evidence must be refreshed after upgrading the router or changing the signer, fee configuration, indexer, backend, or checkout.

### Storefront acceptance run

On **14 November 2026**, the merchant tested the **Pay with NEAR** button for
**1 × SecureKey Hardware Wallet** from the
[standalone example storefront](https://github.com/primexk5/Shopify). The supplied
product-page and receipt screenshots identify the flow. Read-only merchant API
and public RPC checks independently matched the resulting payment:

| Field | Observed value |
| --- | --- |
| Network / settled receipt block time | NEAR testnet / 14 November 2026, 08:53:16 UTC |
| Gross / fee / merchant net | 0.03 / 0.00009 / 0.02991 NEAR |
| Merchant payout | `luckytag417.testnet` |
| Order | `ord_e46c0409e04e4f52ae295e988dbd4d28` |
| Public transaction | [CvsZPAg47…](https://testnet.nearblocks.io/txns/CvsZPAg47KKaNKyHayJuvywG7YukFkyYHcaBHo12afUE) |
| Settlement / router result | `SETTLED`; merchant and fee legs `succeeded` |
| Webhook | Sender status `failed`, 10 attempts, receiver HTTP 404; receiver acceptance/signature evidence not captured |

![User-identified storefront with product Pay with NEAR buttons](docs/evidence/screenshots/storefront-product-page.png)

The repository is named Shopify, but this acceptance run covers a standalone
storefront handing off to hosted WorldzPayments checkout. It does not establish
native Shopify order synchronization or goods fulfilment. This is a testnet
payment, not a mainnet or real-money acceptance run. The
[redacted evidence record](docs/evidence/storefront-payment.json) includes exact
event/settlement IDs, source revisions inspected, RPC queries and screenshot hashes.

### Try the native testnet flow

Use the [hosted app](https://worldz-payments.vercel.app); no local database or provider keys are needed to try it. Bring a compatible **NEAR testnet wallet** (for example Meteor or Nightly) and a small testnet balance for payment and gas. Recipient token-storage registration may be needed for NEP-141; use native NEAR for the shortest path.

1. Sign in as a merchant and create a small native-NEAR link in **Dashboard → Payment links**.
2. Open its `/pay/{slug}` URL as the payer. Review the amount, payout account, platform fee, and merchant net amount.
3. Approve the wallet transaction, then wait for **Payment settled**.
4. Open the receipt. Require a non-empty settlement reference and the same `SETTLED` order in the merchant dashboard.
5. Follow the transaction link and inspect the completed merchant and fee payout legs.

If wallet/RPC/hosted services are unavailable, use the video for the product walkthrough and the local sandbox/recovery checks for engineering evidence. Neither substitutes for a fresh successful hosted checkout. Local service requirements are documented below.

## How settlement becomes a receipt

```mermaid
flowchart LR
    L[Merchant payment link] --> A[API signs payer-bound order]
    A --> W[Customer approves in wallet]
    W --> R[NEAR router reserves replay key]
    R --> M[Merchant payout leg]
    R --> F[Fee payout leg]
    M --> C[Router callbacks track results]
    F --> C
    C --> E[Finalized settlement event]
    E --> I[Indexer and backend reconciliation]
    R -. Finalized router state .-> I
    I --> P[SETTLED order and receipt]
    P --> H[Signed merchant webhook]
```

Checkout and the backend distinguish transaction submission from verified settlement. Required payout legs must succeed, and reconciliation must match the finalized event against router state and the original authorized financial terms. The backend trusts its configured RPC providers; this is not a light-client proof.

## Security model

- **Signer trust:** the backend signer authorizes payment terms. Compromise can authorize malicious orders within router rules; merchant and payer wallet keys stay in their wallets.
- **Custody window:** the router holds funds while asynchronous payouts or recovery remain unresolved. A failed callback may require operator investigation.
- **Recovery:** confirmed failed legs can be retried. Full refunds are restricted when any payout succeeded; ambiguous callbacks are not blindly resent. Fee/signer rotation never rewrites an existing order's terms.
- **Admin trust:** the admin controls fees, signers, token allowlists, recovery actions, and upgrades. The contract upgrade entrypoint has a minimum 48-hour delay; account-level FullAccess keys can bypass that entrypoint.
- **Limits:** unaudited, testnet prototype; test assets have no monetary value. See the [threat model and recovery limits](docs/router-security.md) and [observed upgrade review](docs/router-upgrade-review.md). These documents distinguish reviewed source from deployed bytecode.

## Integrations and sandbox validation

| Flow | Boundary |
| --- | --- |
| Shopify product-page bridge | Starts hosted NEAR checkout and synchronizes an order after settlement. It is not a payment method inside Shopify's native checkout. |
| Nigeria bills and service purchases | VTpass sandbox only: airtime, data, electricity, and one-time TV purchases. No real service delivery or crypto-to-NGN conversion; no automatic renewals. [Details](docs/subscriptions.md) |
| Cross-chain pay-in | The cross-chain simulation exercises checkout and order processing without spending real funds. Live 1Click settlement uses mainnet and requires real assets; a funded live acceptance run has not been recorded here. [Details](docs/cross-chain.md) |

Walletless card/bank checkout and a native Shopify payment app remain planned. Secondary integration credentials are unnecessary for the core native checkout.

## Repository structure

| Path | Purpose |
| --- | --- |
| [`frontend/`](frontend/) | Next.js, React, and TypeScript website, checkout, dashboard, and API proxy |
| [`backend/`](backend/) | Rust/Axum API, PostgreSQL persistence, authentication, reconciliation, indexing, and webhooks |
| [`contracts/router/`](contracts/router/) | NEAR signed-order payment router and payout/recovery logic |
| [`contracts/mock-ft/`](contracts/mock-ft/) | Fungible-token contract used by sandbox tests |
| [`crates/near-protocol/`](crates/near-protocol/) | Shared authorization encoding, signatures, and payment states |
| [`shopify/`](shopify/) | Shopify app configuration and theme extension |
| [`docs/`](docs/) | Deployment documentation, API schema, and protocol reference |
| [`render.yaml`](render.yaml) | Render backend deployment blueprint |
| [`Dockerfile`](Dockerfile) | Backend production container build |

The website demo uses a single published MP4 in `frontend/public/media/`. Local video production folders and generated render projects are not part of the application setup.

## Local development

### Requirements

- Node.js **22.18+** and npm; the development checks have also been run with Node.js 24.
- Rust **1.95+** and Cargo.
- PostgreSQL with permission to run the application’s schema migrations.
- A NEAR testnet wallet, RPC access, and a deployed and initialized router for real testnet payments.
- The `wasm32-unknown-unknown` Rust target to build contracts.

```sh
git clone https://github.com/primexk5/worldz-payments.git
cd worldz-payments
rustup target add wasm32-unknown-unknown
```

### 1. Configure the backend

```sh
cp backend/.env.example backend/.env
```

Fill in the settings in `backend/.env`:

| Setting | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection URL; the legacy MySQL schema is not used by the current API |
| `AUTH_RECIPIENT` | Application identity included in wallet sign-in messages; use the intended local or deployed site |
| `AUTH_NETWORK_ID` | Network used to authenticate merchant identities; defaults to `testnet` |
| `NEAR_TESTNET_ROUTER_ID` | Initialized payment router account |
| `NEAR_TESTNET_FEE_RECIPIENT` | Platform fee recipient account |
| `NEAR_TESTNET_SIGNER_KEY_ID` | Identifier for the backend’s order-signing key |
| `NEAR_TESTNET_SIGNER_SEED_BASE64` | Backend-only, base64-encoded 32-byte Ed25519 signing seed |
| `NEAR_TESTNET_INDEXER_START_HEIGHT` | Router deployment height for indexing historical transactions; `0` starts near the current finalized tip |
| `NEAR_TESTNET_FT_ALLOWLIST` | Token contracts enabled for checkout; align these with the router’s allowlist |
| Optional: `VTPASS_API_KEY`, `VTPASS_PUBLIC_KEY`, `VTPASS_SECRET_KEY` | VTpass **sandbox** credentials; keep them in the backend environment only |
| Optional: `VTPASS_DATA_ENCRYPTION_KEY_BASE64` | Separate random 32-byte key used to encrypt phone/meter/subscriber details at rest; generate with `openssl rand -base64 32` |
| Optional: `ONECLICK_ENABLED`, `ONECLICK_MODE` | Cross-chain pay-in switch and mode; `mock` runs a simulation without spending funds, `live` uses the 1Click API on mainnet (see [docs/cross-chain.md](docs/cross-chain.md)) |
| `SESSION_COOKIE_SECURE` | Use `false` for local HTTP and `true` for deployed HTTPS |
| Optional: `WEBHOOK_SIGNING_SECRET` | Sending backend's HMAC secret; provide the identical value to each receiving integration through a secure channel |

To initialize a local testnet signing seed, the helper below writes a seed only if one is not already configured and prints its public key:

```sh
cargo run -p worldz-near-api --bin generate_testnet_signer
```

Register the matching **public key** on the router using its admin account. The API and router must agree on the signer key ID, public key, network, and contract account. Keep existing signing seeds stable across deployments.

For the **optional VTpass sandbox flow** (skip this for native checkout), register at the [VTpass sandbox](https://sandbox.vtpass.com/register), create its API keys under **Account Settings → API Keys**, and set the four `VTPASS_*` credentials/encryption values in `backend/.env`. Use sandbox keys only. Quotes fetch the latest daily-updated USD-base/NGN reference rate from [open.er-api.com](https://open.er-api.com/v6/latest/USD). Native NEAR quotes fetch a live NEAR/USD reference price from [CoinGecko](https://www.coingecko.com/en/coins/near), falling back to [CoinPaprika](https://coinpaprika.com/coin/near-near-protocol/) if CoinGecko is unavailable. Both prices are stored with the 10-minute quote; unavailable or stale pricing stops new quotes. USD stable test tokens use a 1:1 USD assumption, not an actual swap. The hackathon flow does not execute a crypto-to-fiat conversion. The service checkout is at `/dashboard/services` and requires a signed-in workspace and a NEAR testnet wallet.

Start the API from the repository root:

```sh
cargo run -p worldz-near-api --bin worldz-near-api
```

The API defaults to `http://localhost:8080` and applies migrations from `backend/migrations/postgres/` during startup. It does not create or deploy the router contract for you.

### 2. Configure and start the frontend

In another terminal:

```sh
cd frontend
cp .env.example .env.local
npm ci
npm run dev
```

Set `NEXT_PUBLIC_NEAR_CONTRACT_ID` to the same router account as the backend. Match `NEXT_PUBLIC_NEAR_NETWORK_ID` to the checkout network and set `NEAR_BACKEND_URL=http://localhost:8080` for local development.

Open **http://localhost:3000**. Browser API requests use `/api/v1/*`; the Next.js server proxies them to the Rust service’s `/v1/*` endpoints so merchant cookies stay on the frontend origin.

Real `.env` files, database passwords, signing seeds, wallet keys, and webhook secrets must remain outside Git. Only `NEXT_PUBLIC_*` values are intended to be included in the browser bundle.

### 3. External storefront developer configuration

To connect an existing website's product button, follow the
[developer configuration guide](docs/storefront-integration.md) or
[website docs](https://worldz-payments.vercel.app/docs#storefront-configuration).
The [example storefront source](https://github.com/primexk5/Shopify) shows the
server-side link creation and receiving route.

Configure these **in the external storefront's server environment**, using
`.env.local` for the Next.js example and hosting environment variables for a
deployment:

```dotenv
WORLDZ_API_BASE=https://worldz-payments.vercel.app/api/v1
WORLDZ_CHECKOUT_ORIGIN=https://worldz-payments.vercel.app
WORLDZ_API_KEY=YOUR_MERCHANT_API_KEY
WORLDZ_MERCHANT_ID=mch_YOUR_WORKSPACE_ID
WORLDZ_PAYOUT_ACCOUNT_ID=YOUR_PAYOUT_ACCOUNT.testnet
WORLDZ_WEBHOOK_SIGNING_SECRET=YOUR_BACKEND_WEBHOOK_SIGNING_SECRET
```

Find Merchant ID with **Settings → Merchant profile → Copy ID**, the payout
account under **Payout destination**, and the API key under **API keys**. Obtain
the existing backend's `WEBHOOK_SIGNING_SECRET` from its operator; the receiving
secret must match it exactly. Keep credentials server-side and out of Git.

Save `https://YOUR_STOREFRONT_HOST/api/webhooks/worldz` in the WorldzPayments
merchant's **Webhook URL** field before starting a new checkout. The example
receiver persists verified receipts through the authenticated WorldzPayments
API in PostgreSQL, so Vercel instances do not depend on local disk. Deploy the
backend migration/API before the updated receiver. Verify settlement and webhook
delivery independently; the API base, hosted checkout origin and receiving URL
have different purposes.

For the separate signature-verification demo built into the WorldzPayments
website, configure **`WEBHOOK_SIGNING_SECRET` on that frontend** to match the
backend, redeploy, and use `https://YOUR_WORLDZ_FRONTEND_HOST/webhooks/worldz`.
That sample logs a verified event and returns 204; it has no durable event
storage, deduplication or fulfilment. The external storefront receiver instead
uses `WORLDZ_WEBHOOK_SIGNING_SECRET` and `/api/webhooks/worldz`.

### 4. Optional Shopify setup

Configure the `SHOPIFY_*` settings described in [`backend/.env.example`](backend/.env.example), use [`shopify/shopify.app.toml.example`](shopify/shopify.app.toml.example) as the app configuration reference, and connect a development store before testing checkout.

Product variants need the `worldz.payment` JSON metafield used by the integration. Checkout validates the selected asset and token metadata, calculates the total for the requested quantity, and requires buyer details before payment authorization. A completed NEAR payment is synchronized to Shopify only after verified settlement.

### 5. Optional cross-chain pay-in demo

Seed the demo merchant and cross-chain-enabled payment links, then enable mock mode:

```sh
psql "$DATABASE_URL" -f scripts/seed-demo.sql
# in backend/.env:
# ONECLICK_ENABLED=true
# ONECLICK_MODE=mock
```

This is a **cross-chain sandbox demonstration** of checkout and order processing, requiring no real funds. Open `/pay/demo-cc`, choose **Pay with another chain**, connect Phantom or an EIP-6963 wallet, and press **Simulate deposit**. The backend worker settles the order through the same verified-receipt pipeline used by native payments. Mock deposits and settlement are simulated; pricing may still use the public 1Click token feed. Live operation uses `ONECLICK_MODE=live` with separately configured mainnet assets, recipients, RPC, and a funded acceptance run.

## Checks and contract builds

See [router security assumptions and recovery limits](docs/router-security.md)
and the [pending upgrade review](docs/router-upgrade-review.md).

Run Rust unit tests from the repository root:

```sh
cargo test --workspace --lib --bins
```

Run frontend checks:

```sh
cd frontend
npm run test
npx next typegen
npx tsc --noEmit
npm run lint
npm run build
```

The production frontend build downloads its configured Google Fonts and therefore needs network access. Export the downloadable product guide after changing its source content:

```sh
cd frontend
npm run docs:export
```

Build the router using the compact contract profile:

```sh
cargo build -p worldz-near-router --target wasm32-unknown-unknown --profile contract
```

The artifact is written to `target/wasm32-unknown-unknown/contract/worldz_near_router.wasm`. To run the blockchain sandbox tests, pass its absolute path:

```sh
WORLDZ_ROUTER_WASM="$PWD/target/wasm32-unknown-unknown/contract/worldz_near_router.wasm" \
  cargo test -p worldz-near-router --test sandbox -- --nocapture
```

Sandbox tests need permission to open local sockets. The API and its background workers also require PostgreSQL and network access to the configured RPC services.

To exercise the native sandbox upgrade from an earlier router binary, also set
`WORLDZ_PREVIOUS_ROUTER_WASM` to that verified artifact. The test preserves an
existing settlement and replay marker, checks cancellation authentication on the
candidate, and settles a new payment after replacement. It uses direct sandbox
deployment to test compatibility; upgrade authorization and timing have separate
unit tests.

The ordinary Rust checks do not need a database or live RPC. Database integration
tests are ignored by default and create isolated schemas in an explicitly supplied
**disposable** PostgreSQL database. To run the fee-rotation/delayed-reconciliation
regression, which uses a local fake finalized RPC:

```sh
SECURITY_TEST_DATABASE_URL=postgres://USER:PASSWORD@localhost/DISPOSABLE_DB \
  cargo test -p worldz-near-api orders_db_tests -- --ignored
```

## Deployment

- **Frontend:** deploy `frontend/` to Vercel with the frontend environment settings in [`docs/render-supabase.md`](docs/render-supabase.md).
- **Backend:** deploy the Dockerfile and Render blueprint, or run the same container on your preferred host with PostgreSQL access.
- **Contracts:** deploy and initialize contracts separately on the intended NEAR network. Configure the router’s signer public key, recipients, token allowlist, and sponsored storage reserve.

Coordinate frontend and backend releases when API request formats change. Back up and review database migrations before deployment; migrations may invalidate existing merchant sessions. Router upgrades are separate on-chain operations and the router’s admin-governed upgrade process includes a minimum 48-hour delay.

Useful service checks:

| Endpoint | Purpose |
| --- | --- |
| Backend `/healthz` | Process liveness |
| Backend `/readyz` | PostgreSQL readiness |
| `/api/v1/network-config?networkId=testnet` | Public router, signer, and asset configuration through the frontend |
| `/api/v1/payment-readiness?networkId=testnet` | Check that the configured signer, fee rate, and fee recipient match the router before paying |

Source changes in this repository do not automatically prove that a deployed contract is running the same bytecode. Verify the intended network, deployed version, and settlement behavior as part of a release.

## Documentation

- [Product guide and API examples](frontend/public/docs/worldzpayments-guide.md)
- [Developer storefront and webhook configuration](docs/storefront-integration.md)
- [Backend setup and settlement model](backend/README.md)
- [Render and Supabase deployment](docs/render-supabase.md)
- [Signed-order protocol](docs/near-signed-order-v1.md)
- [API data schema](docs/near-api.schema.json)
- [Payment-link troubleshooting](docs/payment-link-recovery.md)
- [Cross-chain pay-in (NEAR Intents)](docs/cross-chain.md)
- [Terms and rules of use](https://worldz-payments.vercel.app/terms)
- [Privacy and cookies](https://worldz-payments.vercel.app/privacy)

## Contributing

Keep changes focused, update the relevant documentation, and run the checks for the components you change. Payment or authentication changes should include regression tests for failure and recovery paths. Use testnet or an isolated test environment for integration work, and share sensitive security reports through a private project contact rather than public issues.
