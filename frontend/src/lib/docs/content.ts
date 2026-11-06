export type DocBlock =
  | { type: "paragraph"; text: string }
  | { type: "steps"; items: { title: string; text: string }[] }
  | { type: "list"; items: string[] }
  | { type: "callout"; title: string; text: string }
  | { type: "code"; title: string; language: string; code: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "links"; items: { label: string; href: string }[] };
export interface DocSection {
  id: string;
  group: "Get started" | "Accept payments" | "Build an integration" | "Manage & troubleshoot";
  title: string;
  description: string;
  keywords: string;
  blocks: DocBlock[];
}

export const docsSections: DocSection[] = [
  {
    id: "quickstart", group: "Get started", title: "Your first payment", description: "From a NEAR wallet to a shareable payment link.", keywords: "start setup tutorial beginner merchant account onboarding",
    blocks: [
      { type: "paragraph", text: "WorldzPayments helps merchants accept native NEAR and enabled NEP-141 tokens through payment links and checkout. You keep your wallet keys. The merchant service tracks each order and verifies its payouts before calling it settled." },
      { type: "steps", items: [
        { title: "Create your workspace", text: "Open Create account, connect a NEAR wallet, enter your business name and choose your payout account. Approve the one-time wallet message to verify account ownership." },
        { title: "Create a payment link", text: "In Dashboard → Payment links, choose an asset, set an amount and describe what the customer is paying for. Choose an expiry and whether multiple customers may use the link." },
        { title: "Share the link", text: "Copy the generated URL and send it by message, email, on social media or from your website. Your customer reviews the details and pays with a NEAR wallet." },
        { title: "Check settlement and keep the receipt", text: "Follow the payment in Dashboard → Payments. Once settlement is verified, open the payment and download its receipt." },
      ] },
      { type: "links", items: [{ label: "Create your workspace", href: "/onboarding" }, { label: "Try the interactive checkout demo", href: "/checkout/demo" }] },
      { type: "callout", title: "Start on the right network", text: "Testnet and mainnet use different accounts, balances and deployments. Check the network shown in the app and your wallet before connecting. Code examples in this guide use testnet." },
    ],
  },
  {
    id: "wallet-and-account", group: "Get started", title: "Wallets & merchant accounts", description: "Understand your login identity and the wallet that receives payments.", keywords: "signup sign in connect NEP-413 password payout wallet keys",
    blocks: [
      { type: "paragraph", text: "Sign-in uses a one-time NEP-413 message signed by your wallet. Connecting a wallet chooses an account; signing the message creates the authenticated merchant session. A sign-in message does not submit a payment transaction." },
      { type: "table", headers: ["Account", "What it does"], rows: [["Merchant identity", "The wallet account used to create and sign in to your workspace."], ["Payout account", "The NEAR account that receives merchant payouts. It can differ from the login account."], ["Payer account", "The customer’s wallet account that signs a payment transaction."]] },
      { type: "paragraph", text: "Use the wallet that owns your existing merchant account when you return. If your session expires, sign in again. Signing out ends the merchant session; wallet connection and merchant authentication are separate states." },
      { type: "callout", title: "Your keys stay with you", text: "Review messages and transactions in your selected wallet. WorldzPayments does not need your recovery phrase or private key." },
      { type: "links", items: [{ label: "Sign in", href: "/login" }, { label: "Manage account settings", href: "/dashboard/settings" }] },
    ],
  },
  {
    id: "networks-and-assets", group: "Get started", title: "Networks, assets & amounts", description: "Choose the correct network and preserve token precision.", keywords: "testnet mainnet NEAR token NEP141 decimals base units storage gas currency",
    blocks: [
      { type: "paragraph", text: "Native NEAR uses 24 decimal places. NEP-141 tokens use the decimals reported by their token contract. Only tokens enabled for the configured network are offered in checkout. Supporting a token on testnet does not imply it is enabled on mainnet." },
      { type: "table", headers: ["Example", "Display amount", "Base-unit amount"], rows: [["Native NEAR · 24 decimals", "25 NEAR", "25000000000000000000000000"], ["Example token · 6 decimals", "24.125 tokens", "24125000"]] },
      { type: "paragraph", text: "API amounts are integer strings in base units. Keep them as strings or BigInt values in code. Never convert payment amounts through floating-point Number arithmetic. The amountDisplay field is the human-readable decimal amount and must agree with amount." },
      { type: "code", title: "Read enabled tokens", language: "JavaScript", code: `const response = await fetch("/api/v1/assets?networkId=testnet");
if (!response.ok) throw new Error("Could not load payment assets");
const { tokens } = await response.json();
// Native NEAR is supported separately; tokens lists enabled NEP-141 assets.` },
      { type: "callout", title: "Gas and token storage are separate", text: "The signing wallet needs native NEAR for gas. A token payment may also require recipient storage registration. Checkout identifies required token storage before payment; a token balance alone does not cover these costs." },
    ],
  },
  {
    id: "payment-links", group: "Accept payments", title: "Create & share payment links", description: "Accept a fixed payment without building a checkout.", keywords: "link create share expiry repeat reusable redemption product service item social invoice",
    blocks: [
      { type: "steps", items: [
        { title: "Choose the payment asset and amount", text: "Open Dashboard → Payment links. Select NEAR or an enabled token, then enter the exact amount customers should pay." },
        { title: "Describe the item or service", text: "Fill in “What is this payment for?” with a clear description, such as “Website design deposit” or “Watch”. The description appears at checkout and on the receipt. The current limit is 80 characters." },
        { title: "Choose expiry and reuse", text: "Use Never or a timed expiry. Enable Allow repeated payments for a link that multiple customers can claim, then choose a redemption limit or Unlimited." },
        { title: "Create, copy and share", text: "Select Create payment link. Use Copy to share the full URL, or Open to review the checkout page. Payments appear in your merchant history after the service records the payment event." },
        { title: "Delete a link you no longer need", text: "In Dashboard → Payment links, select the trash button beside an active link and confirm. The old URL stops accepting new claims; existing payment records remain in your history." },
      ] },
      { type: "table", headers: ["Option", "Behavior"], rows: [["Single-use", "One order claim; maxRedemptions is 1."], ["Repeated, limited", "Each claim creates a separate order until the configured claim limit is reached."], ["Repeated, unlimited", "Use multiPay: true and maxRedemptions: 0, or null, in the API."], ["Expiry", "New claims stop when the link expires. Signed order authorizations also have their own deadline."]] },
      { type: "callout", title: "Limits count claims", text: "A customer claim reserves an order and consumes a redemption. It is not a count of successful payments. Use a repeated link when several customers need separate orders." },
      { type: "links", items: [{ label: "Create a payment link", href: "/dashboard/links" }, { label: "See the API example", href: "#create-link-api" }] },
    ],
  },
  {
    id: "shopify", group: "Accept payments", title: "Shopify product checkout", description: "Connect a Shopify store and add Pay with NEAR to product pages.", keywords: "Shopify integration app install theme extension block product page variant metafield token price crypto wallet checkout shipping address order paid API credentials",
    blocks: [
      { type: "paragraph", text: "The Shopify integration adds a Pay with NEAR theme app block to product pages. It hands the selected product variant and quantity to WorldzPayments, then redirects the buyer to hosted NEAR checkout. This is a product-page integration, not a payment method inside Shopify's native cart or checkout." },
      { type: "steps", items: [
        { title: "Configure your Shopify app", text: "A Shopify Partner app is required. Copy shopify/shopify.app.toml.example into the Shopify CLI app root, set the app client ID and public origins, and configure the documented read_products, read_orders and write_orders scopes, callback URL and app proxy. Set backend SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_APP_URL, SHOPIFY_CHECKOUT_URL and a dedicated 32-byte SHOPIFY_TOKEN_ENCRYPTION_KEY_BASE64. Keep these secrets on the backend only." },
        { title: "Connect the store", text: "In WorldzPayments Dashboard → Settings → Shopify integration, enter the store's *.myshopify.com domain and approve the Shopify authorization. The connection appears in Settings when OAuth completes." },
        { title: "Set a fixed token price", text: "Create a JSON metafield definition on product variants with namespace worldz, key payment and type JSON. Set the token amount, asset and network independently for each variant. WorldzPayments verifies the token against enabled network metadata." },
        { title: "Add the storefront button", text: "In Shopify's theme editor, open a product template, add the Pay with NEAR app block to the product information section, and save. The block uses the selected variant and quantity." },
        { title: "Complete payment and fulfillment", text: "The buyer enters email and, for shippable variants, a shipping address, then pays from a NEAR wallet. After finalized settlement, WorldzPayments creates a Shopify order marked paid. Shipping and taxes are handled by the merchant afterward." },
      ] },
      { type: "code", title: "Variant metafield · testnet USDC.e", language: "JSON", code: `{
  "networkId": "testnet",
  "asset": {
    "type": "nep141",
    "contractId": "usdc.fakes.testnet",
    "symbol": "USDC.e",
    "decimals": 6
  },
  "amount": "3.25"
}` },
      { type: "list", items: ["Set amount as a positive decimal string with no currency conversion; this is the fixed token price the buyer pays." , "Physical product orders include the buyer's shipping address, but shipping charges and taxes are not quoted in the NEAR checkout. Arrange them after payment." , "Buyer email and shipping details are encrypted at rest and removed from WorldzPayments after the Shopify order sync succeeds." , "The Shopify Admin API token and encryption key stay server-side; never put them in storefront JavaScript or commit them to source control."] },
      { type: "callout", title: "Test before enabling on a live store", text: "Use a Shopify development store and a configured NEAR testnet merchant first. Verify app proxy signing, variant metafields, the hosted wallet payment, the paid Shopify order and the recorded settlement reference." },
      { type: "links", items: [{ label: "Connect a Shopify store", href: "/dashboard/settings" }] },
    ],
  },
  {
    id: "customer-checkout", group: "Accept payments", title: "The customer checkout", description: "What your customer sees, signs and receives.", keywords: "customer pay payment checkout name wallet approve confirmation retry",
    blocks: [
      { type: "steps", items: [
        { title: "Review the request", text: "The payment page shows the item or service, amount, asset, network and payout destination. Review these before signing." },
        { title: "Connect and add a receipt name", text: "The customer selects a NEAR wallet and can enter a name for the receipt. The name is saved before the payment transaction. Their wallet account is recorded separately." },
        { title: "Approve the transaction", text: "Checkout requests an order bound to the payer account, checks any token storage requirements, then asks the customer’s wallet to sign the payment." },
        { title: "Wait for verified settlement", text: "A submitted transaction moves into processing. The receipt becomes available after successful payout receipts are verified." },
      ] },
      { type: "paragraph", text: "A hosted payment-link checkout uses /pay/{slug}. A direct checkout uses /checkout/{merchantId}/{orderId} for an existing authorized order. Opening a direct checkout URL does not create a new order." },
      { type: "callout", title: "Do not pay a pending order again", text: "If a payment is processing or needs payout recovery, check its current status and the submitted transaction. Reopening the checkout in the same browser can restore saved progress. Do not submit another payment to resolve a pending payout." },
      { type: "links", items: [{ label: "Preview checkout without sending a transaction", href: "/checkout/demo" }, { label: "Understand payment states", href: "#settlement" }] },
    ],
  },
  {
    id: "receipts", group: "Accept payments", title: "Receipts & payer details", description: "The same payment details on screen and in your PDF.", keywords: "receipt PDF download print customer payer name item product service paid for invoice",
    blocks: [
      { type: "paragraph", text: "After verified settlement, customers can download a receipt directly from checkout. Merchants can open a settled payment in Dashboard → Payments and select Download receipt. The displayed receipt and PDF use the same shared detail list." },
      { type: "table", headers: ["Receipt detail", "Where it comes from"], rows: [["Payment for", "The item or service entered when the merchant creates the payment link."], ["Payer name", "The optional name entered by the customer. This is customer-supplied information, not verified legal identity."], ["Payer wallet", "The NEAR payer account associated with the order."], ["Merchant and reference", "The merchant name and any recorded merchant reference, when available."], ["Payment and verification", "Amount, network, payout destination, transaction hash and settlement receipt ID."]] },
      { type: "paragraph", text: "Dates use UTC in both versions. Older payments without an item description or customer name show “Not provided”. Customer receipts omit merchant net, platform fee and the internal order reference. Merchant financial figures remain available in the dashboard." },
      { type: "links", items: [{ label: "Open your payment history", href: "/dashboard/payments" }] },
    ],
  },
  {
    id: "invoice-requests", group: "Accept payments", title: "Invoice-style payment requests", description: "Use a descriptive payment link for a client or a fixed invoice amount.", keywords: "invoices invoice bill billing recurring subscription invoice reference",
    blocks: [
      { type: "paragraph", text: "For a client invoice, create a fixed-amount payment link and describe the invoice or service in the payment description. Share the link with your invoice document. After the client pays, use the payment receipt as the settlement record." },
      { type: "steps", items: [{ title: "Use a specific description", text: "For example, “INV-204 · Brand design balance”. Add the exact amount and choose a single-use link for that customer." }, { title: "Share and reconcile", text: "Send the link with the invoice, then match the settled payment and payer account to your records in the dashboard." }] },
      { type: "callout", title: "Current billing scope", text: "This release provides fixed-amount links and checkout. A standalone invoice builder, subscription schedules, automatic recurring charges and accounting exports are not included." },
    ],
  },
  {
    id: "settlement", group: "Accept payments", title: "Settlement & payment states", description: "Know when to fulfil an order and when to wait.", keywords: "settled processing confirmed failure partial retry refund expired cancelled reconciliation webhook",
    blocks: [
      { type: "paragraph", text: "NEAR payouts execute asynchronously. During processing, order funds may remain in the routing contract while merchant and fee transfers complete. A transaction hash is a submission reference, not proof of merchant settlement." },
      { type: "table", headers: ["State", "Meaning / next step"], rows: [["OPEN", "An order is ready for the payer to review and submit before its authorization expires."], ["PROCESSING", "A payment is being executed or reconciled. Wait and check status."], ["SETTLED", "Fulfil only when the state is SETTLED and settlementReceiptId is present."], ["PAYOUT_RETRYABLE", "A payout needs recovery. Do not ask the customer to pay again."], ["PARTIAL_PAYOUT", "Some payout legs need recovery. Reconcile the existing order."], ["RECONCILIATION_REQUIRED", "Manual review is needed. Preserve the order and transaction references."], ["REFUND_PENDING", "The order is in a refund flow. Wait for verified completion."], ["REFUNDED", "The service reports a completed refund. Check the payer wallet and transaction."], ["EXPIRED / CANCELLED", "The order cannot be treated as a completed payment."]] },
      { type: "code", title: "Settlement guard", language: "TypeScript", code: `const isSettled =
  order.state === "SETTLED" && Boolean(order.settlementReceiptId);

if (isSettled) {
  // Use a trusted server-side confirmation before fulfilling goods.
}` },
      { type: "paragraph", text: "Refund-related states describe the order lifecycle. The current dashboard does not provide a general-purpose refund button. Follow your deployment’s recovery process for payouts and refunds." },
    ],
  },
  {
    id: "typescript-client", group: "Build an integration", title: "SDK & TypeScript client", description: "Use the source client that powers the platform.", keywords: "SDK javascript typescript react next npm integration nearApi library wallet functions",
    blocks: [
      { type: "paragraph", text: "This release includes an in-project TypeScript API client at src/lib/near/api.ts, plus wallet, authentication, amount and payment helpers. The examples below run inside this frontend project; @/ is its source alias. This repository does not include a separately packaged npm SDK." },
      { type: "table", headers: ["Module", "Responsibility"], rows: [["@/lib/near/api", "nearApi: profiles, payment links, order status, receipt metadata and settings."], ["@/lib/near/wallet", "connectNearWallet: connect a supported NEAR wallet and read the selected account."], ["@/lib/near/auth", "signInWithNearWallet and onboardWithNearWallet: obtain and sign a one-time challenge."], ["@/lib/near/amounts", "parseUnitsExact, calculateFee and calculateNet: exact amount arithmetic."], ["@/lib/near/payment", "submitAuthorizedPayment, waitForVerifiedSettlement and isVerifiedSettlement: checkout and recovery helpers."]] },
      { type: "code", title: "Connect and sign in", language: "TypeScript", code: `import { connectNearWallet } from "@/lib/near/wallet";
import { signInWithNearWallet } from "@/lib/near/auth";

// Run in a browser event handler after the merchant chooses Sign in.
const { wallet, accountId } = await connectNearWallet();
const session = await signInWithNearWallet(wallet, accountId);
console.log(session.merchant.displayName);` },
      { type: "code", title: "Create a link with the source client", language: "TypeScript", code: `import { nearApi } from "@/lib/near/api";
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
const paymentUrl = new URL("/pay/" + link.slug, window.location.origin);
console.log(paymentUrl.toString());` },
      { type: "paragraph", text: "For another application, use the REST contracts below and your deployment’s configured origin. The /api/v1 prefix is this site’s same-origin proxy. Calling a different origin also requires compatible CORS and session-cookie configuration." },
    ],
  },
  {
    id: "authentication", group: "Build an integration", title: "API authentication", description: "Use the current wallet-authenticated session contract.", keywords: "API key auth cookie session NEP413 bearer challenge nonce proof login secret",
    blocks: [
      { type: "paragraph", text: "Merchant API endpoints currently authenticate using the HTTP session cookie created by wallet sign-in. Browser requests to this site use credentials: include. Connecting a wallet by itself does not authenticate those requests." },
      { type: "steps", items: [{ title: "Request a challenge", text: "POST /api/v1/auth/challenge with accountId, networkId, a fresh state value and purpose: login. Onboarding and payout changes use their own purposes and bound profile fields." }, { title: "Sign the returned message", text: "Use the returned message, recipient and decoded nonce in the selected wallet’s NEP-413 signMessage call. Preserve the exact state and network; reject mismatches." }, { title: "Exchange the proof", text: "POST /api/v1/auth/login with accountId, networkId, publicKey, signature, message, nonce and state. The backend verifies the proof and creates the session cookie. Use the project’s authentication helpers to perform this flow." }] },
      { type: "code", title: "Read your merchant profile", language: "JavaScript", code: `const response = await fetch("/api/v1/me", {
  credentials: "include",
});
if (response.status === 401) {
  throw new Error("Sign in with your merchant wallet first");
}
if (!response.ok) throw new Error("Could not load merchant profile");
const merchant = await response.json();` },
      { type: "callout", title: "API keys in this release", text: "Settings supports issuing and revoking keys, and displays each secret once. The merchant routes currently validate session cookies; Bearer/API-key authentication is not implemented for those routes. Do not replace the session flow with an Authorization header in the examples below." },
    ],
  },
  {
    id: "api-reference", group: "Build an integration", title: "REST API reference", description: "The endpoints exposed by this site’s /api/v1 proxy.", keywords: "API endpoints routes REST GET POST PATCH PUT DELETE response http base URL",
    blocks: [
      { type: "paragraph", text: "Requests and responses use JSON with camelCase field names. The frontend proxy forwards /api/v1/* to the backend’s /v1/* routes. Use the networkId query or request field where indicated. Merchant endpoints require a valid session." },
       { type: "table", headers: ["Method", "Path", "Access / purpose"], rows: [["POST", "/auth/challenge", "Public · request a one-time wallet challenge."], ["POST", "/auth/login", "Public · exchange the wallet proof for a session."], ["POST", "/onboarding", "Wallet proof · create a merchant profile."], ["POST", "/auth/logout", "End the merchant session."], ["GET / PATCH", "/me", "Session · read or update business name and webhook URL."], ["PUT", "/me/payouts", "Session + fresh wallet proof · change payout account."], ["GET", "/assets?networkId=testnet", "Public · enabled NEP-141 token metadata."], ["GET", "/network-config?networkId=testnet", "Public · network, router and signer configuration."], ["GET / POST", "/links", "Session · list or create active merchant payment links."], ["GET", "/links/{slug}", "Public · read an active payment link."], ["DELETE", "/links/{slug}", "Session · deactivate a link and stop new claims; payment records remain."], ["POST", "/links/{slug}/claim", "Public · create a payer-bound authorized order."], ["GET", "/orders/{merchantId}/{orderId}?networkId=testnet", "Public · read and reconcile order status."], ["POST", "/orders/{merchantId}/{orderId}/meta", "Record payer name or a validated submission hash."], ["GET", "/me/deliveries", "Session · recent finalized payment events and webhook state."], ["GET / POST", "/me/apikeys", "Session · list or issue keys."], ["DELETE", "/me/apikeys/{keyRef}", "Session · revoke a key."]] },
      { type: "callout", title: "Order creation starts with a claim", text: "There is no POST /orders endpoint in this release. Create a payment link, then claim it for a payer account to obtain an order and its signed authorization." },
    ],
  },
  {
    id: "create-link-api", group: "Build an integration", title: "Create a payment link via API", description: "A complete request and the URL to share with your customer.", keywords: "create link API example fetch JSON body fields expiry multiPay maxRedemptions",
    blocks: [
      { type: "code", title: "POST /api/v1/links · signed-in browser", language: "JavaScript", code: `const response = await fetch("/api/v1/links", {
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
const paymentUrl = new URL("/pay/" + link.slug, window.location.origin);
console.log(paymentUrl.toString());` },
      { type: "table", headers: ["Field", "Required value / meaning"], rows: [["networkId", "testnet or mainnet, matching the configured deployment."], ["asset", "Native NEAR: type native, symbol NEAR, decimals 24. For NEP-141 include the allowed contractId, symbol and decimals."], ["amount", "Positive base-unit integer string, within the supported u128 range."], ["amountDisplay", "Matching decimal string, e.g. 25. No scientific notation or silent rounding."], ["displayName", "Item/service description, up to 80 characters. An empty string is allowed."], ["expiresAtSeconds", "A future Unix timestamp in seconds, or null for no link expiry."], ["multiPay", "false for one claim; true for repeated claims."], ["maxRedemptions", "1 for a single-use link; a positive count for a limited repeated link; 0 or null for unlimited repeated claims."]] },
      { type: "paragraph", text: "The response includes slug, merchantId, payoutAccountId, asset, amount, displayName, expiry and claim counts. Construct the hosted payment URL from the returned slug; a checkoutUrl field is not returned." },
    ],
  },
  {
    id: "custom-checkout", group: "Build an integration", title: "Custom checkout & status", description: "Claim an order, submit it with a wallet and follow settlement.", keywords: "custom checkout SDK integration wallet signing claim authorization polling status fulfil fulfill idempotent",
    blocks: [
      { type: "paragraph", text: "The simplest website integration is a link to /pay/{slug}. For a custom experience inside this project, use the payment helpers so token preflight, signed order terms, submission metadata and recovery stay consistent with hosted checkout." },
      { type: "code", title: "Source-client checkout example · browser", language: "TypeScript", code: `import { nearApi } from "@/lib/near/api";
import { connectNearWallet } from "@/lib/near/wallet";
import {
  submitAuthorizedPayment,
  waitForVerifiedSettlement,
  isVerifiedSettlement,
} from "@/lib/near/payment";

// slug is the payment link slug returned by the API.
const { wallet, accountId } = await connectNearWallet();
const claim = await nearApi.claimLink(slug, accountId);
// Optional; save the customer-supplied name before requesting payment.
await nearApi.submitPaymentMeta(
  claim.merchantId, claim.orderId, "Ada Okafor", slug
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
}` },
      { type: "code", title: "Read order status", language: "JavaScript", code: `const url = new URL(
  "/api/v1/orders/" + encodeURIComponent(merchantId) +
  "/" + encodeURIComponent(orderId),
  window.location.origin
);
url.searchParams.set("networkId", "testnet");
const response = await fetch(url);
if (!response.ok) throw new Error("Could not read order status");
const order = await response.json();
const settled = order.state === "SETTLED" && !!order.settlementReceiptId;` },
      { type: "paragraph", text: "An order response includes state, amount, fee, net, asset, payerAccountId, payoutAccountId, transactionHash, settlementReceiptId and updatedAtMs. Recorded paymentDescription, customerName and merchantName support receipts; older orders can have null values. A transactionHash query parameter can be supplied to help reconcile a submitted transaction; the service validates it against the order and payer." },
      { type: "callout", title: "Handle storage and pending payments", text: "A custom checkout must handle TokenStorageRequiredError and registerFungibleTokenRecipients when token recipients need storage. Keep the submitted order/transaction reference if polling times out. A timeout is not proof of failure; read the existing order before any retry." },
    ],
  },
  {
    id: "webhooks", group: "Build an integration", title: "Webhooks & fulfilment", description: "Receive signed notifications after verified settlement.", keywords: "webhook callback HMAC SHA256 signature event idempotency replay retry notification fulfilment",
    blocks: [
      { type: "paragraph", text: "Add a publicly reachable HTTPS webhook URL in Settings. Payments can settle without a webhook; notifications are optional. The current delivery event is payment.confirmed, created after verified settlement. Do not fulfil orders based only on a browser redirect or wallet transaction hash." },
      { type: "table", headers: ["Header / behavior", "Contract"], rows: [["x-worldz-event-id", "Stable event ID. Use it to deduplicate deliveries."], ["x-worldz-signature", "sha256= followed by the hex HMAC-SHA256 of the raw request body."], ["Successful response", "Return a 2xx response after safely accepting the event."], ["Retries", "Up to 10 delivery attempts with exponential backoff. An event can arrive more than once."], ["Endpoint", "Public HTTPS endpoint; localhost, private and internal addresses are blocked."]] },
      { type: "code", title: "Example webhook envelope · illustrative values", language: "JSON", code: `{
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
}` },
      { type: "code", title: "Verify the raw body · Node.js", language: "JavaScript", code: `import { createHmac, timingSafeEqual } from "node:crypto";

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
// Verify first, then parse JSON and process the event idempotently.` },
      { type: "paragraph", text: "The deployment operator configures WEBHOOK_SIGNING_SECRET and must provide it to the receiving integration through a secure channel. The merchant Settings page does not reveal this secret. Verify the signature, match merchantId and orderId to your own order, require verified settlement, and record the event ID before fulfilling once." },
      { type: "paragraph", text: "Delivery metadata and last errors are available in GET /api/v1/me/deliveries. Receipt enrichment adds payer names and descriptions to merchant history; do not assume those off-chain fields are included in the original webhook event payload." },
    ],
  },
  {
    id: "dashboard", group: "Manage & troubleshoot", title: "Your merchant dashboard", description: "Keep track of activity, balances and settled payments.", keywords: "overview dashboard analytics balances search ledger history filters reporting",
    blocks: [
      { type: "table", headers: ["Area", "Use it for"], rows: [["Overview", "Settled and processing counts, payment activity, recent payments and settled net separated by asset."], ["Wallet balances", "Read the connected wallet’s native NEAR and configured token balances. Use Refresh for a new reading."], ["Payment links", "Create and copy links; review each link’s reuse settings."], ["Payments", "Search item, payer, order or reference; filter by state; expand a payment for financial details and its receipt."], ["Analytics", "Review settled volume for each asset, daily activity and completion statistics."], ["Settings", "Update your business profile and payout, connect Shopify, manage API keys and configure webhooks."]] },
      { type: "paragraph", text: "A connected wallet balance is an on-chain account reading, not a pooled WorldzPayments balance. Amounts in different assets stay separate; the dashboard does not combine token base units or promise a fiat exchange value." },
      { type: "links", items: [{ label: "Open dashboard", href: "/dashboard" }, { label: "Open analytics", href: "/dashboard/analytics" }] },
    ],
  },
  {
    id: "settings-and-fees", group: "Manage & troubleshoot", title: "Settings, payouts & fees", description: "Keep your business profile and payment destination current.", keywords: "fees fee gas payout settings business name profile change account API keys rate basis points",
    blocks: [
      { type: "steps", items: [{ title: "Edit your merchant profile", text: "In Settings, update your business name and optional webhook URL, then select Save profile." }, { title: "Authorize payout account changes", text: "Enter the destination account and select Sign to change payout. Connect the wallet for your signed-in merchant identity and approve a fresh NEP-413 proof. The receiving account is checked before it is saved." }, { title: "Review each order’s payment terms", text: "The default platform fee is 30 basis points (0.30%). The signed order authorization locks its fee rate, capped by the protocol at 500 basis points (5%). Wallet gas and token storage are separate costs." }] },
      { type: "paragraph", text: "A new payout setting does not rewrite an already signed order authorization. Review the payout destination on each checkout. The customer receipt shows payment details; merchant fees and net amounts remain in the dashboard’s expanded payment details." },
      { type: "links", items: [{ label: "Manage settings", href: "/dashboard/settings" }, { label: "Read about API authentication", href: "#authentication" }] },
    ],
  },
  {
    id: "troubleshooting", group: "Manage & troubleshoot", title: "Troubleshooting", description: "Find the cause before retrying a payment.", keywords: "error failed 400 401 404 409 500 502 503 wallet pending timeout storage token receipt missing",
    blocks: [
      { type: "table", headers: ["Issue", "What to check"], rows: [["Wallet connects but dashboard redirects to login", "Connect and approve the sign-in message. A wallet connection alone is not a merchant session."], ["Different account or network", "Select the original merchant wallet for sign-in. Match the network shown in checkout and wallet."], ["Insufficient balance", "Check the payment asset balance and native NEAR for gas or required token storage."], ["Token is unavailable", "Read /assets for the current network. Arbitrary token contracts cannot be used as enabled assets."], ["Link expired or claim limit reached", "Ask the merchant for a new link. A used claim can consume a limit even before settlement."], ["Payment remains processing", "Keep the existing order and transaction hash. Refresh status or inspect NEAR Explorer. Do not pay again."], ["Receipt is unavailable", "Require SETTLED plus a settlement receipt ID. A pending payment does not have a final receipt."], ["Payer name or item is missing", "Older records can lack those fields. Enter the item when creating new links and the payer name before payment."], ["Webhook is not arriving", "Check the saved HTTPS endpoint, public DNS, signing-secret configuration, response status and delivery lastError."]] },
      { type: "code", title: "Handle an API error", language: "JavaScript", code: `const response = await fetch("/api/v1/me", { credentials: "include" });
if (!response.ok) {
  const problem = await response.json().catch(() => ({}));
  const message = problem.error ?? "Request failed (" + response.status + ")";
  // Show the message and keep any existing payment/order reference.
  console.error(message);
}` },
      { type: "table", headers: ["HTTP status", "Typical cause"], rows: [["400", "Invalid amount, account, network, token metadata or request fields."], ["401", "A valid merchant session or wallet proof is missing."], ["404", "The requested link, order or key was not found."], ["409", "A link expired, a claim limit was reached or another state conflict occurred."], ["502 / 503", "The backend, router or network configuration is unavailable; preserve payment progress and retry status checks later."]] },
    ],
  },
  {
    id: "product-roadmap", group: "Manage & troubleshoot", title: "Product roadmap", description: "Planned merchant integrations, checkout expansion and mobile app.", keywords: "roadmap Shopify checkout payment app fiat walletless card bank mobile iOS Android notifications future planned integration approvals timeline",
    blocks: [
      { type: "paragraph", text: "The current Shopify integration is a product-page theme app block that hands off to hosted NEAR checkout. It requires a NEAR wallet. The roadmap includes a native Shopify checkout payment method, walletless card/bank checkout and a merchant mobile app." },
      { type: "table", headers: ["Planned feature", "Intended experience", "Timing & dependencies"], rows: [["Native Shopify checkout payment app", "NEAR appears as a payment method inside Shopify's native cart and checkout.", "Requires a separate Shopify payments app integration and Shopify partner review/approval."], ["Walletless card/bank checkout", "The buyer pays with fiat and never connects a NEAR wallet.", "Several more weeks, depending on the payment provider, custody/settlement model and approvals."], ["Mobile app (iOS & Android)", "Merchants create and share links, track payment history and receipts, and receive payment notifications.", "Scope and timeline to be defined after discovery of NEAR wallet connectivity, notifications and platform release requirements."]] },
      { type: "callout", title: "Planning estimates", text: "These estimates are not committed launch dates. Shopify partner access, review and approval add external lead time. Walletless checkout requires provider selection and agreement on custody, settlement and approval requirements." },
      { type: "paragraph", text: "Existing roadmap priorities remain: validate merchant pilots, harden reconciliation, package the TypeScript SDK, complete authenticated server integrations and expand invoice, fulfilment and reporting tools." },
    ],
  },
  {
    id: "launch-checklist", group: "Manage & troubleshoot", title: "Test & launch checklist", description: "Validate the full journey before taking live payments.", keywords: "launch production deployment testing checklist testnet mainnet go live setup",
    blocks: [
      { type: "list", items: [
        "Confirm the selected network, router account, signer configuration and enabled assets with your deployment operator. Mainnet availability requires a separately configured mainnet deployment.",
        "Create a test merchant, verify its payout account and sign in again with the original merchant wallet.",
        "Create a small payment link with an item description; test expiry and single-use or repeated-claim settings.",
        "Complete a test payment, wait for verified settlement and confirm the funds at the payout destination.",
        "Open and download the receipt. Check item, payer name, wallet, amount, UTC date and verification references.",
        "If using webhooks, verify the raw-body signature, return 2xx and confirm duplicate events cannot fulfil an order twice.",
        "Test wallet rejection, insufficient gas, an expired link, a pending payment and token storage requirements. A failed status check must not trigger another payment.",
        "For live deployment, use HTTPS, secure session cookies, the correct public origin and an agreed support/reconciliation process.",
      ] },
      { type: "links", items: [{ label: "Create a payment link", href: "/dashboard/links" }, { label: "Review service terms", href: "/terms" }, { label: "Try the demo", href: "/checkout/demo" }] },
    ],
  },
];
