# Developer storefront configuration

Use this setup to add a **Pay with NEAR** button to an existing website. Your
server creates a WorldzPayments payment link, the customer pays in hosted
checkout, and your server receives a signed `payment.confirmed` notification
after verified settlement. The documented acceptance run uses **native NEAR on
testnet**.

The [example storefront](https://github.com/primexk5/Shopify) is a standalone
Next.js shop. Its repository name is Shopify, but this flow does not install a
Shopify app, create Shopify orders or fulfil inventory. For the theme app block
and paid-order synchronization, follow the website's
[Shopify integration guide](https://worldz-payments.vercel.app/docs#shopify).

## Find the merchant settings

In WorldzPayments, open **Dashboard → Settings**:

1. In **Merchant profile**, copy the **Merchant ID** with **Copy ID**. It is the
   unique workspace identifier used by the API and receiver.
2. Copy the saved **Payout destination**. Use the exact account registered to
   the workspace; configuring the receiver does not change that destination.
3. In **API keys**, create a key for the storefront and save the secret shown
   once. The key authorizes merchant API requests from your server.
4. Obtain the current backend webhook signing secret from the deployment
   operator. This prototype uses the backend's `WEBHOOK_SIGNING_SECRET`; it
   does not issue a separate webhook secret in each merchant's Settings page.

Your business name, merchant ID, API key and webhook signing secret each serve
a different purpose. A wallet private key or recovery phrase is never needed
by the storefront server.

## Configure the storefront server

For the example Next.js storefront, copy `frontend/.env.example` to
`frontend/.env.local`, then fill in the values below. Next.js loads `.env.local`;
the example file is a template. Keep real values out of the template and Git.

```dotenv
WORLDZ_API_BASE=https://worldz-payments.vercel.app/api/v1
WORLDZ_CHECKOUT_ORIGIN=https://worldz-payments.vercel.app
WORLDZ_API_KEY=YOUR_MERCHANT_API_KEY
WORLDZ_MERCHANT_ID=mch_YOUR_WORKSPACE_ID
WORLDZ_PAYOUT_ACCOUNT_ID=YOUR_PAYOUT_ACCOUNT.testnet
WORLDZ_WEBHOOK_SIGNING_SECRET=YOUR_BACKEND_WEBHOOK_SIGNING_SECRET
WORLDZ_EVIDENCE_DIR=
```

| Variable | Where it comes from / expected value |
| --- | --- |
| `WORLDZ_API_BASE` | WorldzPayments frontend origin plus `/api/v1`. For a direct backend connection, use the backend origin plus `/v1`. |
| `WORLDZ_CHECKOUT_ORIGIN` | WorldzPayments frontend origin only, with no `/api/v1`, `/pay`, or webhook path. |
| `WORLDZ_API_KEY` | Active key created under Settings → API keys. Sent as `Authorization: Bearer …` by your server. |
| `WORLDZ_MERCHANT_ID` | Settings → Merchant profile → Merchant ID → Copy ID. |
| `WORLDZ_PAYOUT_ACCOUNT_ID` | Exact saved NEAR payout account. The receiver uses it to validate the notification's destination. |
| `WORLDZ_WEBHOOK_SIGNING_SECRET` | Must equal `WEBHOOK_SIGNING_SECRET` in the WorldzPayments backend deployment sending the notifications (at least 32 characters). |
| `WORLDZ_EVIDENCE_DIR` | Optional local receiver directory. Blank uses `.worldz-evidence` inside the storefront's `frontend` working directory. |

These are **server-side variables for the example storefront**, separate from
WorldzPayments' own `NEAR_BACKEND_URL` and `NEXT_PUBLIC_NEAR_*` configuration.
Keep API keys and signing secrets out of `NEXT_PUBLIC_*` variables and browser
code. Add the same server variables to your hosting environment and redeploy;
pushing code does not upload `.env.local`.

Generate a new signing secret only when initializing a backend deployment that
has none. For an existing backend, use its current secret at the receiver so
existing integrations continue to verify. Set matching values in the sending
backend and receiving storefront, then restart or redeploy both services.

## Create checkout on your server

The example's `/api/register-order` route accepts product IDs and quantities.
It looks up catalog prices server-side, calculates integer yoctoNEAR totals and
creates a single-use payment link. Prices and totals submitted by the browser
must not determine the amount charged.

Here is the server-to-server request for the example's 0.03 NEAR product:

```js
// Server-side code. Use your own validated catalog and merchant configuration.
const response = await fetch(`${process.env.WORLDZ_API_BASE}/links`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.WORLDZ_API_KEY}`,
  },
  redirect: "error",
  signal: AbortSignal.timeout(15_000),
  body: JSON.stringify({
    networkId: "testnet",
    asset: { type: "native", symbol: "NEAR", decimals: 24 },
    amount: "30000000000000000000000",
    amountDisplay: "0.03",
    displayName: "1 × SecureKey Hardware Wallet",
    expiresAtSeconds: Math.floor(Date.now() / 1000) + 3600,
    multiPay: false,
    maxRedemptions: 1,
  }),
});
if (!response.ok) throw new Error(`Create link failed: ${response.status}`);
const link = await response.json();
if (
  link.merchantId !== process.env.WORLDZ_MERCHANT_ID ||
  link.payoutAccountId !== process.env.WORLDZ_PAYOUT_ACCOUNT_ID ||
  link.networkId !== "testnet" ||
  link.amount !== "30000000000000000000000" ||
  link.asset?.type !== "native" ||
  link.asset?.symbol !== "NEAR" || link.asset?.decimals !== 24 ||
  typeof link.slug !== "string" || !/^[a-zA-Z0-9_-]+$/.test(link.slug)
) throw new Error("Unexpected payment link terms");
const checkoutUrl = new URL(
  `/pay/${link.slug}`, process.env.WORLDZ_CHECKOUT_ORIGIN
).toString();
// Return checkoutUrl to the browser and navigate there after the button click.
```

The link response contains a `slug`; it does not contain `checkoutUrl`. The
hosted checkout connects the payer wallet and claims the actual order. There is
no `POST /orders` endpoint. Opening checkout or returning to the shop does not
prove payment; retain the actual order and settlement identifiers for matching.

## Configure the receiving URL

In the merchant's WorldzPayments **Settings → Webhook URL**, save your
storefront receiver's public HTTPS address:

```text
https://YOUR_STOREFRONT_HOST/api/webhooks/worldz
```

The example route includes `/api`. The WorldzPayments website URL and the
storefront callback URL point to different services. Save the receiving URL
before creating a new checkout. It must have public DNS, accept direct POSTs
without redirects or interactive login, and return 2xx after safely storing the
event. The sender blocks localhost, private and internal addresses.

For local testing, run the storefront on port 3000 and expose it through a
public HTTPS tunnel. Configure the tunnel's hostname plus
`/api/webhooks/worldz`, keeping the server and tunnel running. A restarted
temporary tunnel may have a different address.

### Optional sample receiver in the WorldzPayments website

The WorldzPayments frontend also includes a separate **signature-verification
demo** at `/webhooks/worldz`. For that sample, copy the sending backend's
`WEBHOOK_SIGNING_SECRET` into the **WorldzPayments frontend hosting environment**
under the same name, then redeploy. Use its frontend hostname followed by
`/webhooks/worldz` in the merchant's Webhook URL. The secret must contain at
least 32 characters.

| Receiving implementation | Server environment variable | Path / result |
| --- | --- | --- |
| External example storefront | `WORLDZ_WEBHOOK_SIGNING_SECRET` | `/api/webhooks/worldz`; validates testnet payment fields and writes local evidence before 200. |
| WorldzPayments website sample | `WEBHOOK_SIGNING_SECRET` | `/webhooks/worldz`; verifies the signature/basic envelope, logs the event ID and returns 204. |

The website sample performs no durable event storage, duplicate suppression,
merchant/order binding or goods fulfilment. A 204 demonstrates signature and
basic-envelope acceptance by that sample; it does not establish safe store
fulfilment. The external storefront's `WORLDZ_EVIDENCE_DIR` does not configure
the website sample. Choose the receiving implementation you actually deployed
and use its matching hostname, route and environment variable.

## Verify and persist the notification

The external example storefront's receiver:

- Computes HMAC-SHA256 over the **untouched HTTP body bytes**, using the
  configured webhook signing secret, and compares the `sha256=…` value in
  `x-worldz-signature` in constant time before parsing.
- Requires `x-worldz-event-id` to equal the envelope's `id`, type
  `payment.confirmed`, a delivery `created` timestamp within five minutes,
  `state: SETTLED`, testnet, native NEAR and matching merchant/payout accounts.
- Checks the order, transaction and settlement references, and requires
  positive gross amount with `fee + net = amount` in integer base units.
- Stores accepted evidence before returning 200 and deduplicates by event ID.
  Backend retries get a new signed `created` timestamp; the payment data for
  that event must remain unchanged. Storage failures return 503 for retry.

The example writes private JSON files to a local disk directory. This is useful
for a single persistent-disk test server. Setting `WORLDZ_EVIDENCE_DIR` does not
make an ephemeral/serverless filesystem durable. For Vercel or multiple server
instances, implement shared durable persistence with a unique event-ID
constraint before acknowledging or performing fulfilment. A temporary directory
cannot establish durable duplicate suppression. The example receiver records
payments; it performs no Shopify order synchronization or goods fulfilment.

The sender attempts delivery up to 10 times with exponential backoff. Repeated
delivery is expected; a receiver-side duplicate must return success without
repeating business actions. A signed notification authenticates the sender
under the shared-secret assumption. Correlate its exact payment references with
the order and verified settlement before fulfilling goods.

## Verify a test without paying twice

1. Complete one small native-NEAR testnet checkout. Keep its transaction hash,
   order ID and settlement receipt.
2. Open Dashboard → Payments and match gross, fee, net, network and recipient
   with the finalized router event and `get_order` state.
3. Inspect `GET /api/v1/me/deliveries` with a merchant session or server-side
   API key. For the same event, require webhook `state: delivered`.
4. Match the receiving server's accepted event and signature-verification
   result. Preserve a redacted evidence record; keep raw deliveries private.
5. Verify a fresh duplicate is acknowledged once and an altered body with the
   original signature is rejected. Record these as separate checks.

If delivery is pending or failed, inspect `attempts`, `lastError`, the receiving
URL, configuration and storage. A settled payment stays settled when its
notification fails. Fix delivery using the existing event and your deployment's
retry process; do not ask the payer to pay again. Automatic retries stop after
the sender's attempt limit.

The recorded storefront acceptance run and its exact evidence boundaries are
in [the evidence index](evidence/README.md#storefront-product-checkout).
