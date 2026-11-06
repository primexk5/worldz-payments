# Shopify integration foundation

The backend supports merchant-authenticated Shopify OAuth installation, signed app-proxy checkout handoff, and a retryable Shopify order sync after verified NEAR settlement. It validates Shopify's callback HMAC and a one-time, ten-minute state value bound to the signed-in WorldzPayments merchant. Offline Admin API tokens are encrypted at rest using AES-256-GCM.

## App setup

1. Create a Shopify Partner app and configure its OAuth callback URL as `https://<backend-public-origin>/v1/shopify/callback`.
2. Copy `shopify/shopify.app.toml.example` to `shopify.app.toml` at the Shopify CLI app root and fill in the client ID, frontend origin, and backend origin. It requests `read_products`, `read_orders`, and `write_orders`, and configures the proxy prefix `apps`, subpath `worldz-payments`, and target `https://<backend-public-origin>/v1/shopify/proxy`.
3. Configure the app proxy and OAuth callback URLs. Set backend `SHOPIFY_APP_URL` to the backend public origin and `SHOPIFY_CHECKOUT_URL` to the public WorldzPayments frontend origin.
4. Generate an independent 32-byte token encryption key with `openssl rand -base64 32`; store it in `SHOPIFY_TOKEN_ENCRYPTION_KEY_BASE64` using a secret manager.
5. Sign in to WorldzPayments and use Settings → Shopify to connect the store. OAuth approval persists the encrypted offline token.
6. Add the **Pay with NEAR** theme app block to product pages using Shopify's theme editor.
7. Set a JSON metafield definition on product variants: namespace `worldz`, key `payment`, type `json`. For each variant, specify its fixed token price and NEAR network, for example:

   ```json
   {"networkId":"testnet","asset":{"type":"nep141","contractId":"usdc.fakes.testnet","symbol":"USDC.e","decimals":6},"amount":"3.25"}
   ```

   Native NEAR uses `{"type":"native","symbol":"NEAR","decimals":24}` as the asset. Token contract, symbol, and decimals are checked against the enabled token metadata before checkout.

The proxy verifies Shopify's signature, fetches the selected variant and its configured token price from Shopify Admin GraphQL, and creates a single-use payment link. The hosted checkout collects customer email and, for shippable products, a shipping address; this buyer data is encrypted at rest. Only after Worldz verifies finalized NEAR settlement does the retry worker create a Shopify order with `financialStatus: PAID`. The order records the Shopify variant's catalog price/currency and a Worldz settlement reference. As selected for this MVP, shipping charges and taxes are not quoted or collected before crypto payment; merchants arrange those after the paid order is created. Reconciliation retries are idempotent by a Worldz tag lookup before creating an order.

Shop connections are stored per merchant. Reinstalling a store replaces its prior connection. OAuth state expires after ten minutes and is single use. Test app-proxy signing, Shopify API version/scopes, and paid-order creation on a development store before enabling the block on a live storefront.

Never commit actual app credentials or the encryption key. Rotating the encryption key requires decrypting and re-encrypting every stored Shopify token before replacing the configured key.
