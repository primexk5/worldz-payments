# WorldzPayments

**Payments for your business. Straight to your wallet.**

WorldzPayments is a NEAR payment platform for merchants and their customers. It brings wallet-signed checkout, shareable payment links, receipts, merchant reporting, and Shopify product-page integration into one workspace.

[Website](https://worldz-payments.vercel.app) · [Watch the demo](https://worldz-payments.vercel.app/checkout/demo) · [Product documentation](https://worldz-payments.vercel.app/docs)

## NEAR Hackathon — Real-World Money

WorldzPayments is submitted to the **Real-World Money** track. It addresses a practical merchant problem: accepting a wallet payment is only the first step; sellers also need a payment request tied to an order, a payout they can verify, a receipt, and a record they can reconcile. NEAR provides the customer and merchant identities, signed wallet approval, low-cost settlement, native NEAR and NEP-141 assets, and the public transaction and receipt evidence used by the application.

### Judge-ready testnet journey

The hosted product is at [worldz-payments.vercel.app](https://worldz-payments.vercel.app). To reproduce the native payment journey with a small amount of testnet NEAR:

1. Connect a compatible **NEAR testnet** wallet and sign in as a merchant.
2. In **Dashboard → Payment links**, create a link with native NEAR, a small test amount, and a description, then open the generated `/pay/{slug}` URL.
3. Connect the payer's testnet wallet, review the gross amount, 0.30% platform fee, merchant net amount, and payout account, then approve the wallet transaction.
4. Wait for checkout to move beyond transaction submission to **Payment settled**. Open the receipt and confirm it contains a non-empty settlement reference; the merchant dashboard should show the same `SETTLED` order.
5. Use the receipt's transaction link to inspect the testnet transaction. The successful result is the router's completed merchant and fee payout legs, not merely the initial wallet transaction hash.

This browser-to-settlement journey was manually exercised successfully against the deployed testnet stack on **12 November 2026**, including wallet authentication, order authorization, wallet approval, indexed payout reconciliation, the `SETTLED` status, and receipt generation. The repeatable acceptance record and limitations are maintained in [`frontend/NEAR_INTEGRATION_STATUS.md`](frontend/NEAR_INTEGRATION_STATUS.md).

This is a testnet prototype: testnet assets have no monetary value, the contracts are not represented as audited, and mainnet needs a separate deployment and operational review. The Nigeria bill-payment experience uses the VTpass sandbox and does not deliver real services. Testnet cross-chain mode is simulated; a judge verifying the live wallet flow should use native testnet NEAR as described above.

## What you can do

- **Accept wallet payments:** native NEAR and configured NEP-141 fungible tokens.
- **Share payment links:** set an amount, description, expiry, and payment limit, or allow repeated payments.
- **Give customers clear checkout details:** show the payment asset, payout destination, fee, and merchant net amount before approval.
- **Issue verified receipts:** show completion after the service verifies the required on-chain payouts.
- **Manage merchant activity:** view payments, balances, analytics, payout settings, and webhook deliveries.
- **Connect a Shopify store:** start hosted NEAR checkout from a product-page app block and synchronize a paid order after verified settlement.
- **Build custom integrations:** use the Rust API and the frontend wallet, authorization, and recovery helpers.

The default configuration targets **NEAR testnet**. Mainnet requires its own contracts, accounts, signer configuration, and supported-token setup. The Shopify integration is a product-page checkout bridge, not a payment method inside Shopify’s native checkout. The native Shopify checkout payment app and walletless card or bank checkout remain planned.

The dashboard includes **Subscription services** for Nigeria VTpass sandbox airtime, data, electricity, and one-time TV package purchases; more countries and local service providers are planned. Buyers approve each purchase with a NEAR testnet wallet and can pay in native NEAR or an enabled testnet stable token, including USDC.e and USDT.e where configured. TV packages are purchases; automatic renewals are not supported. Provider fulfillment starts only after verified NEAR testnet settlement. The VTpass host is pinned to `sandbox.vtpass.com`; test tokens are not converted to NGN and the preview does not deliver real services. See [Bills and subscriptions](docs/subscriptions.md).

Eligible payment links can also offer **cross-chain payments** from supported Ethereum, Base, Arbitrum and Solana assets. Live swaps require the configured mainnet route and settle the link’s selected token on NEAR through NEAR Intents. Testnet cross-chain payments are simulated and send no real funds. See [Cross-chain pay-in](docs/cross-chain.md).

## How a payment works

1. A merchant signs in with a wallet and creates a payment link.
2. The customer opens the link and verifies wallet ownership to prepare checkout.
3. The API issues an order authorization signed for the configured network, router, asset, amount, and payer.
4. The customer reviews and approves the transaction in their wallet.
5. The router processes merchant and platform-fee payout legs.
6. The API reconciles finalized transaction receipts with router state before marking the order `SETTLED` and issuing a verified receipt.

Wallet keys remain in the user’s wallet. During execution, the routing contract can hold funds while payouts complete. A wallet approval or transaction hash alone is not evidence of completed merchant settlement. Network gas and token storage registration are separate from the displayed platform fee.

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
| `VTPASS_API_KEY`, `VTPASS_PUBLIC_KEY`, `VTPASS_SECRET_KEY` | VTpass **sandbox** credentials; keep them in the backend environment only |
| `VTPASS_DATA_ENCRYPTION_KEY_BASE64` | Separate random 32-byte key used to encrypt phone/meter/subscriber details at rest; generate with `openssl rand -base64 32` |
| `ONECLICK_ENABLED`, `ONECLICK_MODE` | Cross-chain pay-in switch and mode; `mock` runs locally with fake money, `live` uses the 1Click API on mainnet (see [docs/cross-chain.md](docs/cross-chain.md)) |
| `SESSION_COOKIE_SECURE` | Use `false` for local HTTP and `true` for deployed HTTPS |

To initialize a local testnet signing seed, the helper below writes a seed only if one is not already configured and prints its public key:

```sh
cargo run -p worldz-near-api --bin generate_testnet_signer
```

Register the matching **public key** on the router using its admin account. The API and router must agree on the signer key ID, public key, network, and contract account. Keep existing signing seeds stable across deployments.

For the VTpass flow, register at the [VTpass sandbox](https://sandbox.vtpass.com/register), create its API keys under **Account Settings → API Keys**, and set the four `VTPASS_*` credentials/encryption values in `backend/.env`. Use sandbox keys only. Quotes fetch the latest daily-updated USD-base/NGN reference rate from [open.er-api.com](https://open.er-api.com/v6/latest/USD). Native NEAR quotes fetch a live NEAR/USD reference price from [CoinGecko](https://www.coingecko.com/en/coins/near), falling back to [CoinPaprika](https://coinpaprika.com/coin/near-near-protocol/) if CoinGecko is unavailable. Both prices are stored with the 10-minute quote; unavailable or stale pricing stops new quotes. USD stable test tokens use a 1:1 USD assumption, not an actual swap. The hackathon flow does not execute a crypto-to-fiat conversion. The service checkout is at `/dashboard/services` and requires a signed-in workspace and a NEAR testnet wallet.

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

### 3. Optional Shopify setup

Configure the `SHOPIFY_*` settings described in [`backend/.env.example`](backend/.env.example), use [`shopify/shopify.app.toml.example`](shopify/shopify.app.toml.example) as the app configuration reference, and connect a development store before testing checkout.

Product variants need the `worldz.payment` JSON metafield used by the integration. Checkout validates the selected asset and token metadata, calculates the total for the requested quantity, and requires buyer details before payment authorization. A completed NEAR payment is synchronized to Shopify only after verified settlement.

### 4. Optional cross-chain pay-in demo

Seed the demo merchant and cross-chain-enabled payment links, then enable mock mode:

```sh
psql "$DATABASE_URL" -f scripts/seed-demo.sql
# in backend/.env:
# ONECLICK_ENABLED=true
# ONECLICK_MODE=mock
```

Open `/pay/demo-cc`, choose **Pay with another chain**, connect Phantom or an EIP-6963 wallet, and press **Simulate deposit**. The backend worker settles the order through the same verified-receipt pipeline used by native payments. In `mock` mode no external API is called; set `ONECLICK_MODE=live` to route real mainnet swaps through 1Click.

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
