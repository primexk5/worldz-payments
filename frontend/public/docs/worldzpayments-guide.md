# WorldzPayments documentation

Merchant guide and developer reference · API v1

Code examples use testnet. Relative API paths refer to the frontend origin.

## Contents

- [Your first payment](#quickstart)
- [Wallets & merchant accounts](#wallet-and-account)
- [Networks, assets & amounts](#networks-and-assets)
- [Create & share payment links](#payment-links)
- [Shopify product checkout](#shopify)
- [The customer checkout](#customer-checkout)
- [Pay from another chain](#cross-chain)
- [Nigeria bills & subscriptions](#bills-and-subscriptions)
- [Receipts & payer details](#receipts)
- [Invoice-style payment requests](#invoice-requests)
- [Settlement & payment states](#settlement)
- [SDK & TypeScript client](#typescript-client)
- [API authentication](#authentication)
- [REST API reference](#api-reference)
- [Create a payment link via API](#create-link-api)
- [Custom checkout & status](#custom-checkout)
- [Webhooks & fulfilment](#webhooks)
- [Your merchant dashboard](#dashboard)
- [Settings, payouts & fees](#settings-and-fees)
- [Troubleshooting](#troubleshooting)
- [Product roadmap](#product-roadmap)
- [Test & launch checklist](#launch-checklist)

<a id="quickstart"></a>

## Your first payment

From a NEAR wallet to a shareable payment link.

WorldzPayments helps merchants accept native NEAR and enabled NEP-141 tokens through payment links and checkout. You keep your wallet keys. The merchant service tracks each order and verifies its payouts before calling it settled.

1. **Create your workspace.** Open Create account, connect a NEAR wallet, enter your business name and choose your payout account. Approve the one-time wallet message to verify account ownership.
2. **Create a payment link.** In Dashboard → Payment links, choose an asset, set an amount and describe what the customer is paying for. Choose an expiry and whether multiple customers may use the link.
3. **Share the link.** Copy the generated URL and send it by message, email, on social media or from your website. Your customer reviews the details and pays with a NEAR wallet.
4. **Check settlement and keep the receipt.** Follow the payment in Dashboard → Payments. Once settlement is verified, open the payment and download its receipt.

- [Create your workspace](https://YOUR_PLATFORM_ORIGIN/onboarding)
- [Try the interactive checkout demo](https://YOUR_PLATFORM_ORIGIN/checkout/demo)

> **Start on the right network**
> Testnet and mainnet use different accounts, balances and deployments. Check the network shown in the app and your wallet before connecting. Code examples in this guide use testnet.

<a id="wallet-and-account"></a>

## Wallets & merchant accounts

Understand your login identity and the wallet that receives payments.

Sign-in uses a one-time NEP-413 message signed by your wallet. Connecting a wallet chooses an account; signing the message creates the authenticated merchant session. A sign-in message does not submit a payment transaction.

| Account | What it does |
| --- | --- |
| Merchant identity | The wallet account used to create and sign in to your workspace. |
| Payout account | The NEAR account that receives merchant payouts. It can differ from the login account. |
| Payer account | The customer’s wallet account that signs a payment transaction. |

Use the wallet that owns your existing merchant account when you return. If your session expires, sign in again. Signing out ends the merchant session; wallet connection and merchant authentication are separate states.

> **Your keys stay with you**
> Review messages and transactions in your selected wallet. WorldzPayments does not need your recovery phrase or private key.

- [Sign in](https://YOUR_PLATFORM_ORIGIN/login)
- [Manage account settings](https://YOUR_PLATFORM_ORIGIN/dashboard/settings)

<a id="networks-and-assets"></a>

## Networks, assets & amounts

Choose the correct network and preserve token precision.

Native NEAR uses 24 decimal places. NEP-141 tokens use the decimals reported by their token contract. Only tokens enabled for the configured network are offered in checkout. Supporting a token on testnet does not imply it is enabled on mainnet.

Token and network support depend on the checkout. The Nigeria VTpass preview accepts testnet NEAR and enabled testnet USD stable tokens, including bridged USDC.e and USDT.e and DAI where configured. Stable-token quote pricing assumes 1 USD per token; it is not a swap or a fiat conversion. Read the enabled-asset endpoint and the payment link to confirm the exact token.

| Example | Display amount | Base-unit amount |
| --- | --- | --- |
| Native NEAR · 24 decimals | 25 NEAR | 25000000000000000000000000 |
| Example token · 6 decimals | 24.125 tokens | 24125000 |

API amounts are integer strings in base units. Keep them as strings or BigInt values in code. Never convert payment amounts through floating-point Number arithmetic. The amountDisplay field is the human-readable decimal amount and must agree with amount.

### Read enabled tokens

```js
const response = await fetch("/api/v1/assets?networkId=testnet");
if (!response.ok) throw new Error("Could not load payment assets");
const { tokens } = await response.json();
// Native NEAR is supported separately; tokens lists enabled NEP-141 assets.
```

> **Gas and token storage are separate**
> The signing wallet needs native NEAR for gas. A token payment may also require recipient storage registration. Checkout identifies required token storage before payment; a token balance alone does not cover these costs.

<a id="payment-links"></a>

## Create & share payment links

Accept a fixed payment without building a checkout.

1. **Choose the payment asset and amount.** Open Dashboard → Payment links. Select NEAR or an enabled token, then enter the exact amount customers should pay.
2. **Describe the item or service.** Fill in “What is this payment for?” with a clear description, such as “Website design deposit” or “Watch”. The description appears at checkout and on the receipt. The current limit is 80 characters.
3. **Choose expiry and reuse.** Use Never or a timed expiry. Enable Allow repeated payments for a link that multiple customers can claim, then choose a redemption limit or Unlimited.
4. **Create, copy and share.** Select Create payment link. Use Copy to share the full URL, or Open to review the checkout page. Payments appear in your merchant history after the service records the payment event.
5. **Delete a link you no longer need.** In Dashboard → Payment links, select the trash button beside an active link and confirm. The old URL stops accepting new claims; existing payment records remain in your history.

| Option | Behavior |
| --- | --- |
| Single-use | One order claim; maxRedemptions is 1. |
| Repeated, limited | Each claim creates a separate order until the configured claim limit is reached. |
| Repeated, unlimited | Use multiPay: true and maxRedemptions: 0, or null, in the API. |
| Expiry | New claims stop when the link expires. Signed order authorizations also have their own deadline. |

> **Limits count claims**
> A customer claim reserves an order and consumes a redemption. It is not a count of successful payments. Use a repeated link when several customers need separate orders.

- [Create a payment link](https://YOUR_PLATFORM_ORIGIN/dashboard/links)
- [See the API example](#create-link-api)

<a id="shopify"></a>

## Shopify product checkout

Connect a Shopify store and add Pay with NEAR to product pages.

The Shopify integration adds a Pay with NEAR theme app block to product pages. It hands the selected product variant and quantity to WorldzPayments, then redirects the buyer to hosted NEAR checkout. This is a product-page integration, not a payment method inside Shopify's native cart or checkout.

1. **Configure your Shopify app.** A Shopify Partner app is required. Copy shopify/shopify.app.toml.example into the Shopify CLI app root, set the app client ID and public origins, and configure the documented read_products, read_orders and write_orders scopes, callback URL and app proxy. Set backend SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_APP_URL, SHOPIFY_CHECKOUT_URL and a dedicated 32-byte SHOPIFY_TOKEN_ENCRYPTION_KEY_BASE64. Keep these secrets on the backend only.
2. **Connect the store.** In WorldzPayments Dashboard → Settings → Shopify integration, enter the store's *.myshopify.com domain and approve the Shopify authorization. The connection appears in Settings when OAuth completes.
3. **Set a fixed token price.** Create a JSON metafield definition on product variants with namespace worldz, key payment and type JSON. Set the token amount, asset and network independently for each variant. WorldzPayments verifies the token against enabled network metadata.
4. **Add the storefront button.** In Shopify's theme editor, open a product template, add the Pay with NEAR app block to the product information section, and save. The block uses the selected variant and quantity.
5. **Complete payment and fulfillment.** The buyer enters email and, for shippable variants, a shipping address, then pays from a NEAR wallet. After finalized settlement, WorldzPayments creates a Shopify order marked paid. Shipping and taxes are handled by the merchant afterward.

### Variant metafield · testnet USDC.e

```json
{
  "networkId": "testnet",
  "asset": {
    "type": "nep141",
    "contractId": "usdc.fakes.testnet",
    "symbol": "USDC.e",
    "decimals": 6
  },
  "amount": "3.25"
}
```

- Set amount as a positive decimal string with no currency conversion; this is the fixed token price the buyer pays.
- Physical product orders include the buyer's shipping address, but shipping charges and taxes are not quoted in the NEAR checkout. Arrange them after payment.
- Buyer email and shipping details are encrypted at rest and removed from WorldzPayments after the Shopify order sync succeeds.
- The Shopify Admin API token and encryption key stay server-side; never put them in storefront JavaScript or commit them to source control.

> **Test before enabling on a live store**
> Use a Shopify development store and a configured NEAR testnet merchant first. Verify app proxy signing, variant metafields, the hosted wallet payment, the paid Shopify order and the recorded settlement reference.

- [Connect a Shopify store](https://YOUR_PLATFORM_ORIGIN/dashboard/settings)

<a id="customer-checkout"></a>

## The customer checkout

What your customer sees, signs and receives.

1. **Review the request.** The payment page shows the item or service, amount, asset, network and payout destination. Review these before signing.
2. **Connect and add a receipt name.** The customer selects a NEAR wallet and can enter a name for the receipt. The name is saved before the payment transaction. Their wallet account is recorded separately.
3. **Approve the transaction.** Checkout requests an order bound to the payer account, checks any token storage requirements, then asks the customer’s wallet to sign the payment.
4. **Wait for verified settlement.** A submitted transaction moves into processing. The receipt becomes available after successful payout receipts are verified.

A hosted payment-link checkout uses /pay/{slug}. A direct checkout uses /checkout/{merchantId}/{orderId} for an existing authorized order. Opening a direct checkout URL does not create a new order.

> **Do not pay a pending order again**
> If a payment is processing or needs payout recovery, check its current status and the submitted transaction. Reopening the checkout in the same browser can restore saved progress. Do not submit another payment to resolve a pending payout.

- [Preview checkout without sending a transaction](https://YOUR_PLATFORM_ORIGIN/checkout/demo)
- [Understand payment states](#settlement)

<a id="cross-chain"></a>

## Pay from another chain

How eligible payment links accept supported wallets from other networks.

Eligible payment links can offer a separate Pay with another chain option. The customer selects a supported token on Ethereum, Base, Arbitrum or Solana, reviews a quote, and approves the transfer in the connected source-chain wallet. NEAR Intents converts the payment into the NEP-141 asset configured on the link and routes it to the merchant on NEAR.

1. **Check route availability.** Cross-chain payment is available only when enabled for the deployment, link, destination token and source asset. Live swaps run on mainnet.
2. **Review and approve.** The wallet shows the source asset and amount before signing. The checkout submits the transfer to a single-use deposit address; customers do not need to copy or paste a deposit address.
3. **Wait for settlement.** The backend checks the swap and verifies the merchant payout on NEAR. A submitted source-chain transfer is still processing until that payout is confirmed.

> **Testnet uses simulated payments**
> Testnet cross-chain checkout is for trying the flow. It uses simulated deposits, sends no real funds and does not perform a live swap. Live cross-chain availability depends on mainnet configuration and route support.

<a id="bills-and-subscriptions"></a>

## Nigeria bills & subscriptions

A testnet preview of airtime, data, electricity and TV package purchases.

Dashboard → Subscriptions provides personal-use, one-time Nigeria service purchases through the VTpass sandbox. Customers enter the relevant service details, request a quote and approve payment from a NEAR testnet wallet. After the quote, the app creates a single-use checkout link tied to that service order. This link is generated for the service purchase; it is not a configurable link for requesting a separate payment. Use the separate Payment links feature for standalone payment requests; those links do not purchase or renew a VTpass service.

1. **Choose and verify the service.** Select the provider and package. Electricity and TV purchases require customer-number verification before quoting.
2. **Review the quote.** The quote converts the NGN amount to USD and the selected enabled testnet NEAR asset. It expires after ten minutes. Stable test tokens use a 1:1 USD price assumption; no crypto-to-fiat swap occurs.
3. **Approve once and follow settlement.** Connect a NEAR testnet wallet, check the amount and sign. VTpass fulfillment starts only after verified NEAR payout settlement. Pending or uncertain provider results are reconciled using the same provider request ID.
4. **Keep the receipt.** The checkout preserves purchase progress across a refresh and shows the provider result when available. A testnet receipt does not represent real-world service delivery.

> **Sandbox preview only**
> The provider is pinned to VTpass sandbox and the checkout is restricted to NEAR testnet. No real airtime, data, electricity or television package is delivered. Each purchase is a separate customer-approved payment; automatic renewals are not supported.

The selected DStv or GOtv catalog package uses a package-change purchase for one viewing month. Renewing a customer's existing bouquet at its account-specific renewal price is a separate VTpass flow and is not currently offered. Nigeria is the current preview; more countries and service providers are planned, subject to availability and live validation.

| Endpoint | Use |
| --- | --- |
| GET /vtpass/categories | Read sandbox service categories. |
| GET /vtpass/services?identifier=airtime | Read the available providers for the selected category. |
| GET /vtpass/variations?serviceID=... | Read available data or TV packages. |
| POST /vtpass/verify | Verify an electricity meter or TV smartcard. |
| POST /vtpass/quote | Create a time-limited NGN, USD and testnet-token quote. |
| POST /vtpass/purchases | Create an authenticated merchant purchase tied to one payment link and quote. |
| GET /vtpass/purchases/{id} | Read purchase and provider status. |
| POST /vtpass/purchases/{id}/fulfill | Start or reconcile fulfillment after verified payment settlement. |

<a id="receipts"></a>

## Receipts & payer details

The same payment details on screen and in your PDF.

After verified settlement, customers can download a receipt directly from checkout. Merchants can open a settled payment in Dashboard → Payments and select Download receipt. The displayed receipt and PDF use the same shared detail list.

| Receipt detail | Where it comes from |
| --- | --- |
| Payment for | The item or service entered when the merchant creates the payment link. |
| Payer name | The optional name entered by the customer. This is customer-supplied information, not verified legal identity. |
| Payer wallet | The NEAR payer account associated with the order. |
| Merchant and reference | The merchant name and any recorded merchant reference, when available. |
| Payment and verification | Amount, network, payout destination, transaction hash and settlement receipt ID. |

Dates use UTC in both versions. Older payments without an item description or customer name show “Not provided”. Customer receipts omit merchant net, platform fee and the internal order reference. Merchant financial figures remain available in the dashboard.

- [Open your payment history](https://YOUR_PLATFORM_ORIGIN/dashboard/payments)

<a id="invoice-requests"></a>

## Invoice-style payment requests

Use a descriptive payment link for a client or a fixed invoice amount.

For a client invoice, create a fixed-amount payment link and describe the invoice or service in the payment description. Share the link with your invoice document. After the client pays, use the payment receipt as the settlement record.

1. **Use a specific description.** For example, “INV-204 · Brand design balance”. Add the exact amount and choose a single-use link for that customer.
2. **Share and reconcile.** Send the link with the invoice, then match the settled payment and payer account to your records in the dashboard.

> **Current billing scope**
> This release provides fixed-amount links and checkout. A standalone invoice builder, subscription schedules, automatic recurring charges and accounting exports are not included.

<a id="settlement"></a>

## Settlement & payment states

Know when to fulfil an order and when to wait.

NEAR payouts execute asynchronously. During processing, order funds may remain in the routing contract while merchant and fee transfers complete. A transaction hash is a submission reference, not proof of merchant settlement.

| State | Meaning / next step |
| --- | --- |
| OPEN | An order is ready for the payer to review and submit before its authorization expires. |
| PROCESSING | A payment is being executed or reconciled. Wait and check status. |
| SETTLED | Fulfil only when the state is SETTLED and settlementReceiptId is present. |
| PAYOUT_RETRYABLE | A payout needs recovery. Do not ask the customer to pay again. |
| PARTIAL_PAYOUT | Some payout legs need recovery. Reconcile the existing order. |
| RECONCILIATION_REQUIRED | Manual review is needed. Preserve the order and transaction references. |
| REFUND_PENDING | The order is in a refund flow. Wait for verified completion. |
| REFUNDED | The service reports a completed refund. Check the payer wallet and transaction. |
| EXPIRED / CANCELLED | The order cannot be treated as a completed payment. |

### Settlement guard

```ts
const isSettled =
  order.state === "SETTLED" && Boolean(order.settlementReceiptId);

if (isSettled) {
  // Use a trusted server-side confirmation before fulfilling goods.
}
```

Refund-related states describe the order lifecycle. The current dashboard does not provide a general-purpose refund button. Follow your deployment’s recovery process for payouts and refunds.

<a id="typescript-client"></a>

## SDK & TypeScript client

Use the source client that powers the platform.

This release includes an in-project TypeScript API client at src/lib/near/api.ts, plus wallet, authentication, amount and payment helpers. The examples below run inside this frontend project; @/ is its source alias. This repository does not include a separately packaged npm SDK.

| Module | Responsibility |
| --- | --- |
| @/lib/near/api | nearApi: profiles, payment links, order status, receipt metadata and settings. |
| @/lib/near/wallet | connectNearWallet: connect a supported NEAR wallet and read the selected account. |
| @/lib/near/auth | signInWithNearWallet and onboardWithNearWallet: obtain and sign a one-time challenge. |
| @/lib/near/amounts | parseUnitsExact, calculateFee and calculateNet: exact amount arithmetic. |
| @/lib/near/payment | submitAuthorizedPayment, waitForVerifiedSettlement and isVerifiedSettlement: checkout and recovery helpers. |

### Connect and sign in

```ts
import { connectNearWallet } from "@/lib/near/wallet";
import { signInWithNearWallet } from "@/lib/near/auth";

// Run in a browser event handler after the merchant chooses Sign in.
const { wallet, accountId } = await connectNearWallet();
const session = await signInWithNearWallet(wallet, accountId);
console.log(session.merchant.displayName);
```

### Create a link with the source client

```ts
import { nearApi } from "@/lib/near/api";
import { parseUnitsExact } from "@/lib/near/amounts";
import { NEAR_NETWORK_ID } from "@/lib/near/config";

// Requires an authenticated merchant session.
const link = await nearApi.createLink({
  networkId: NEAR_NETWORK_ID,
  asset: { type: "native", symbol: "NEAR", decimals: 24 },
  amount: parseUnitsExact("25", 24).toString(),
  amountDisplay: "25",
  displayName: "Website design deposit",
  expiresAtSeconds: null,
  multiPay: false,
  maxRedemptions: 1,
});
const paymentUrl = new URL("/pay/" + link.slug, process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin);
console.log(paymentUrl.toString());
```

For another application, use the REST contracts below and your deployment’s configured origin. The /api/v1 prefix is this site’s same-origin proxy. Calling a different origin also requires compatible CORS and session-cookie configuration.

<a id="authentication"></a>

## API authentication

Use the current wallet-authenticated session contract.

Merchant API endpoints currently authenticate using the HTTP session cookie created by wallet sign-in. Browser requests to this site use credentials: include. Connecting a wallet by itself does not authenticate those requests.

1. **Request a challenge.** POST /api/v1/auth/challenge with accountId, networkId, a fresh state value and purpose: login. Onboarding and payout changes use their own purposes and bound profile fields.
2. **Sign the returned message.** Use the returned message, recipient and decoded nonce in the selected wallet’s NEP-413 signMessage call. Preserve the exact state and network; reject mismatches.
3. **Exchange the proof.** POST /api/v1/auth/login with accountId, networkId, publicKey, signature, message, nonce and state. The backend verifies the proof and creates the session cookie. Use the project’s authentication helpers to perform this flow.

### Read your merchant profile

```js
const response = await fetch("/api/v1/me", {
  credentials: "include",
});
if (response.status === 401) {
  throw new Error("Sign in with your merchant wallet first");
}
if (!response.ok) throw new Error("Could not load merchant profile");
const merchant = await response.json();
```

> **API keys in this release**
> Settings supports issuing and revoking keys, and displays each secret once. Merchant routes accept a wallet-authenticated session or Authorization: Bearer wzp_... using an active key. Keys inherit merchant access; keep them on your server. Payout changes still require a fresh wallet proof. Customer order access uses the private checkout token returned after wallet verification.

<a id="api-reference"></a>

## REST API reference

The endpoints exposed by this site’s /api/v1 proxy.

Requests and responses use JSON with camelCase field names. The frontend proxy forwards /api/v1/* to the backend’s /v1/* routes. Use the networkId query or request field where indicated. Merchant endpoints require a valid session.

| Method | Path | Access / purpose |
| --- | --- | --- |
| POST | /auth/challenge | Public · request a one-time wallet challenge. |
| POST | /auth/login | Public · exchange the wallet proof for a session. |
| POST | /onboarding | Wallet proof · create a merchant profile. |
| POST | /auth/logout | End the merchant session. |
| GET / PATCH | /me | Session · read or update business name and webhook URL. |
| PUT | /me/payouts | Session + fresh wallet proof · change payout account. |
| GET | /assets?networkId=testnet | Public · enabled NEP-141 token metadata. |
| GET | /network-config?networkId=testnet | Public · network, router and signer configuration. |
| GET / POST | /links | Session · list or create active merchant payment links. |
| GET | /links/{slug} | Public · read an active payment link. |
| DELETE | /links/{slug} | Session · deactivate a link and stop new claims; payment records remain. |
| POST | /links/{slug}/claim | Public · create a payer-bound authorized order. |
| GET | /orders/{merchantId}/{orderId}?networkId=testnet | Merchant session/API key or private checkout token · read stored order status. |
| POST | /orders/{merchantId}/{orderId}/meta | Authenticated merchant or checkout token · record a name or validated transaction hash. |
| GET | /me/deliveries | Session · recent finalized payment events and webhook state. |
| GET / POST | /me/apikeys | Session · list or issue keys. |
| DELETE | /me/apikeys/{keyRef} | Session · revoke a key. |

> **Order creation starts with a claim**
> There is no POST /orders endpoint in this release. Create a payment link, then claim it for a payer account to obtain an order and its signed authorization.

<a id="create-link-api"></a>

## Create a payment link via API

A complete request and the URL to share with your customer.

### POST /api/v1/links · signed-in browser

```js
const response = await fetch("/api/v1/links", {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    networkId: "testnet",
    asset: { type: "native", symbol: "NEAR", decimals: 24 },
    amount: "25000000000000000000000000",
    amountDisplay: "25",
    displayName: "Website design deposit",
    expiresAtSeconds: null,
    multiPay: false,
    maxRedemptions: 1,
  }),
});
if (!response.ok) {
  const problem = await response.json();
  throw new Error(problem.error ?? "Could not create a payment link");
}
const link = await response.json(); // HTTP 201; PaymentLink object
const paymentUrl = new URL("/pay/" + link.slug, process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin);
console.log(paymentUrl.toString());
```

| Field | Required value / meaning |
| --- | --- |
| networkId | testnet or mainnet, matching the configured deployment. |
| asset | Native NEAR: type native, symbol NEAR, decimals 24. For NEP-141 include the allowed contractId, symbol and decimals. |
| amount | Positive base-unit integer string, within the supported u128 range. |
| amountDisplay | Matching decimal string, e.g. 25. No scientific notation or silent rounding. |
| displayName | Item/service description, up to 80 characters. An empty string is allowed. |
| expiresAtSeconds | A future Unix timestamp in seconds, or null for no link expiry. |
| multiPay | false for one verified payment; true for repeated payments. |
| maxRedemptions | 1 for a single-use link; a positive count for a limited repeated link; 0 or null for unlimited repeated payments. |

The response includes slug, merchantId, payoutAccountId, asset, amount, displayName, expiry and claim counts. Construct the hosted payment URL from the returned slug; a checkoutUrl field is not returned.

<a id="custom-checkout"></a>

## Custom checkout & status

Claim an order, submit it with a wallet and follow settlement.

The simplest website integration is a link to /pay/{slug}. For a custom experience inside this project, use the payment helpers so token preflight, signed order terms, submission metadata and recovery stay consistent with hosted checkout.

### Source-client checkout example · browser

```ts
import { claimPaymentLinkWithNearWallet } from "@/lib/near/auth";
import { connectNearWallet } from "@/lib/near/wallet";
import {
  submitAuthorizedPayment,
  waitForVerifiedSettlement,
  isVerifiedSettlement,
} from "@/lib/near/payment";

// slug is the payment link slug returned by the API.
const { wallet, accountId } = await connectNearWallet();
const claim = await claimPaymentLinkWithNearWallet(
  wallet, accountId, slug, "Ada Okafor"
);
const submitted = await submitAuthorizedPayment({
  wallet, accountId, claim, linkSlug: slug,
});
const order = await waitForVerifiedSettlement(
  claim.merchantId, claim.orderId, () => {},
  180_000, submitted.transactionHash
);
if (isVerifiedSettlement(order)) {
  // Display success. Fulfilment belongs on your trusted server.
}
```

### Read order status

```js
const url = new URL(
  "/api/v1/orders/" + encodeURIComponent(merchantId) +
  "/" + encodeURIComponent(orderId),
  window.location.origin
);
url.searchParams.set("networkId", "testnet");
const response = await fetch(url, {
  headers: { "x-checkout-token": claim.editToken },
  cache: "no-store",
});
if (!response.ok) throw new Error("Could not read order status");
const order = await response.json();
const settled = order.state === "SETTLED" && !!order.settlementReceiptId;
```

An order response includes state, amount, fee, net, asset, payerAccountId, payoutAccountId, transactionHash, settlementReceiptId and updatedAtMs. Recorded paymentDescription, customerName and merchantName support receipts; older orders can have null values. GET requests only read stored status. Submit transactionHash through authenticated POST /orders/{merchantId}/{orderId}/meta; the service validates the exact order and payer before queuing reconciliation. Customer requests include x-checkout-token: claim.editToken; merchant servers can use a session or API key. Authorization is returned only for authenticated OPEN orders and is omitted after processing starts.

> **Handle storage and pending payments**
> A custom checkout must handle TokenStorageRequiredError and registerFungibleTokenRecipients when token recipients need storage. Keep the submitted order/transaction reference if polling times out. A timeout is not proof of failure; read the existing order before any retry.

<a id="webhooks"></a>

## Webhooks & fulfilment

Receive signed notifications after verified settlement.

Add a publicly reachable HTTPS webhook URL in Settings. Payments can settle without a webhook; notifications are optional. The current delivery event is payment.confirmed, created after verified settlement. Do not fulfil orders based only on a browser redirect or wallet transaction hash.

| Header / behavior | Contract |
| --- | --- |
| x-worldz-event-id | Stable event ID. Use it to deduplicate deliveries. |
| x-worldz-signature | sha256= followed by the hex HMAC-SHA256 of the raw request body. |
| Successful response | Return a 2xx response after safely accepting the event. |
| Retries | Up to 10 delivery attempts with exponential backoff. An event can arrive more than once. |
| Endpoint | Public HTTPS endpoint; localhost, private and internal addresses are blocked. |

### Example webhook envelope · illustrative values

```json
{
  "id": "testnet:router.testnet:receipt-id:0",
  "type": "payment.confirmed",
  "created": 1793880000,
  "data": {
    "orderId": "ord_example",
    "merchantId": "merchant_example",
    "state": "SETTLED",
    "settlementReceiptId": "verified-receipt-id",
    "payerAccountId": "customer.testnet",
    "asset": { "type": "native", "symbol": "NEAR", "decimals": 24 },
    "amount": "25000000000000000000000000"
  }
}
```

### Verify the raw body · Node.js

```js
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWorldzWebhook(rawBody, signature, secret) {
  if (!secret || !/^sha256=[a-f0-9]{64}$/i.test(signature ?? "")) {
    return false;
  }
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const received = Buffer.from(signature.slice(7), "hex");
  return expected.length === received.length &&
    timingSafeEqual(expected, received);
}
// Pass the untouched request bytes, not JSON.stringify(parsedBody).
// Verify first, then parse JSON and process the event idempotently.
```

The deployment operator configures WEBHOOK_SIGNING_SECRET and must provide it to the receiving integration through a secure channel. The merchant Settings page does not reveal this secret. Verify the signature, match merchantId and orderId to your own order, require verified settlement, and record the event ID before fulfilling once.

Delivery metadata and last errors are available in GET /api/v1/me/deliveries. Receipt enrichment adds payer names and descriptions to merchant history; do not assume those off-chain fields are included in the original webhook event payload.

<a id="dashboard"></a>

## Your merchant dashboard

Keep track of activity, balances and settled payments.

| Area | Use it for |
| --- | --- |
| Overview | Settled and processing counts, payment activity, recent payments and settled net separated by asset. |
| Wallet balances | Read the connected wallet’s native NEAR and configured token balances. Use Refresh for a new reading. |
| Payment links | Create and copy links; review each link’s reuse settings. |
| Payments | Search item, payer, order or reference; filter by state; expand a payment for financial details and its receipt. |
| Analytics | Review settled volume for each asset, daily activity and completion statistics. |
| Settings | Update your business profile and payout, connect Shopify, manage API keys and configure webhooks. |

A connected wallet balance is an on-chain account reading, not a pooled WorldzPayments balance. Amounts in different assets stay separate; the dashboard does not combine token base units or promise a fiat exchange value.

- [Open dashboard](https://YOUR_PLATFORM_ORIGIN/dashboard)
- [Open analytics](https://YOUR_PLATFORM_ORIGIN/dashboard/analytics)

<a id="settings-and-fees"></a>

## Settings, payouts & fees

Keep your business profile and payment destination current.

1. **Edit your merchant profile.** In Settings, update your business name and optional webhook URL, then select Save profile.
2. **Authorize payout account changes.** Enter the destination account and select Sign to change payout. Connect the wallet for your signed-in merchant identity and approve a fresh NEP-413 proof. The receiving account is checked before it is saved.
3. **Review each order’s payment terms.** The default platform fee is 30 basis points (0.30%). The signed order authorization locks its fee rate, capped by the protocol at 500 basis points (5%). Wallet gas and token storage are separate costs.

A new payout setting does not rewrite an already signed order authorization. Review the payout destination on each checkout. The customer receipt shows payment details; merchant fees and net amounts remain in the dashboard’s expanded payment details.

- [Manage settings](https://YOUR_PLATFORM_ORIGIN/dashboard/settings)
- [Read about API authentication](#authentication)

<a id="troubleshooting"></a>

## Troubleshooting

Find the cause before retrying a payment.

| Issue | What to check |
| --- | --- |
| Wallet connects but dashboard redirects to login | Connect and approve the sign-in message. A wallet connection alone is not a merchant session. |
| Different account or network | Select the original merchant wallet for sign-in. Match the network shown in checkout and wallet. |
| Insufficient balance | Check the payment asset balance and native NEAR for gas or required token storage. |
| Token is unavailable | Read /assets for the current network. Arbitrary token contracts cannot be used as enabled assets. |
| Link expired or claim limit reached | Ask the merchant for a new link. Unpaid reservations expire after finalized network checks; verified payments consume the limit. |
| Payment remains processing | Keep the existing order and transaction hash. Refresh status or inspect NEAR Explorer. Do not pay again. |
| Receipt is unavailable | Require SETTLED plus a settlement receipt ID. A pending payment does not have a final receipt. |
| Payer name or item is missing | Older records can lack those fields. Enter the item when creating new links and the payer name before payment. |
| Webhook is not arriving | Check the saved HTTPS endpoint, public DNS, signing-secret configuration, response status and delivery lastError. |

### Handle an API error

```js
const response = await fetch("/api/v1/me", { credentials: "include" });
if (!response.ok) {
  const problem = await response.json().catch(() => ({}));
  const message = problem.error ?? "Request failed (" + response.status + ")";
  // Show the message and keep any existing payment/order reference.
  console.error(message);
}
```

| HTTP status | Typical cause |
| --- | --- |
| 400 | Invalid amount, account, network, token metadata or request fields. |
| 401 | A valid merchant session or wallet proof is missing. |
| 404 | The requested link, order or key was not found. |
| 409 | A link expired, a claim limit was reached or another state conflict occurred. |
| 502 / 503 | The backend, router or network configuration is unavailable; preserve payment progress and retry status checks later. |

<a id="product-roadmap"></a>

## Product roadmap

Planned merchant integrations, checkout expansion and mobile app.

The current Shopify integration is a product-page theme app block that hands off to hosted NEAR checkout. It requires a NEAR wallet. The roadmap includes a native Shopify checkout payment method, walletless card/bank checkout and a merchant mobile app.

| Planned feature | Intended experience | Timing & dependencies |
| --- | --- | --- |
| Native Shopify checkout payment app | NEAR appears as a payment method inside Shopify's native cart and checkout. | Requires a separate Shopify payments app integration and Shopify partner review/approval. |
| Walletless card/bank checkout | The buyer pays with fiat and never connects a NEAR wallet. | Several more weeks, depending on the payment provider, custody/settlement model and approvals. |
| Mobile app (iOS & Android) | Merchants create and share links, track payment history and receipts, and receive payment notifications. | Scope and timeline to be defined after discovery of NEAR wallet connectivity, notifications and platform release requirements. |

> **Planning estimates**
> These estimates are not committed launch dates. Shopify partner access, review and approval add external lead time. Walletless checkout requires provider selection and agreement on custody, settlement and approval requirements.

Existing roadmap priorities remain: validate merchant pilots, harden reconciliation, package the TypeScript SDK, complete authenticated server integrations and expand invoice, fulfilment and reporting tools.

<a id="launch-checklist"></a>

## Test & launch checklist

Validate the full journey before taking live payments.

- Confirm the selected network, router account, signer configuration and enabled assets with your deployment operator. Mainnet availability requires a separately configured mainnet deployment.
- Create a test merchant, verify its payout account and sign in again with the original merchant wallet.
- Create a small payment link with an item description; test expiry and single-use or repeated-claim settings.
- Complete a test payment, wait for verified settlement and confirm the funds at the payout destination.
- Open and download the receipt. Check item, payer name, wallet, amount, UTC date and verification references.
- If using webhooks, verify the raw-body signature, return 2xx and confirm duplicate events cannot fulfil an order twice.
- Test wallet rejection, insufficient gas, an expired link, a pending payment and token storage requirements. A failed status check must not trigger another payment.
- For live deployment, use HTTPS, secure session cookies, the correct public origin and an agreed support/reconciliation process.

- [Create a payment link](https://YOUR_PLATFORM_ORIGIN/dashboard/links)
- [Review service terms](https://YOUR_PLATFORM_ORIGIN/terms)
- [Watch the demo](https://YOUR_PLATFORM_ORIGIN/checkout/demo)
