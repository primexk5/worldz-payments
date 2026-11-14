# Evidence and verification

Use this index to distinguish product illustrations, local tests, and public
testnet settlement evidence. No successful public checkout identifiers are
invented or inferred from a configuration transaction.

## Public testnet checkout

**Status: native testnet settlement verified on-chain and correlated with the published merchant dashboard and receipt screenshot.**

Read-only finalized RPC checks on 14 November 2026 confirmed these native-NEAR
payments on `router.newking.testnet`:

| Settled at (UTC) | Gross testnet NEAR | Public transaction |
| --- | --- | --- |
| 14 November 2026, 00:36:33 | 1.5 | [9Wufap1b…](https://testnet.nearblocks.io/txns/9Wufap1bjNXDjMjbikHBT6Uj9gNxARJitoobxjW8mwfN) |
| 11 November 2026, 23:31:30 | 0.062792247015098551706964 | [GrChhggG…](https://testnet.nearblocks.io/txns/GrChhggG57VG4gxfrBPEj3ZXeW44KkrR2vzrTiGxEr9S) |
| 11 November 2026, 14:25:21 | 3 | [A1paVm9o…](https://testnet.nearblocks.io/txns/A1paVm9oyNyyC3yjcgJhwx98gBHYWnRHedHJnVijERXP) |

For each, the finalized transaction's `pay_native` action, deposit, authorization,
router-emitted successful `payment_settled` receipt, calculated fee/net, and latest
finalized `get_order` view agreed. Both merchant and fee legs were `succeeded`,
and the router reported `SETTLED`. The replay key was recomputed from the original
authorization to select the order view. These checks trust the configured RPC;
they are not light-client proofs or verification of historical deployed code.

[The latest payment's exact identifiers and base-unit amounts](public-settlement.json)
are captured for inspection. It paid **1.4955 NEAR** to `luckytag417.testnet` and
**0.0045 NEAR** in fees. Its order is `ord_ea591c08e47340e59b3a6f6af4022dc3`;
its settlement receipt is `2Rj5TZibpcvyFxTnnUu4Ce4onC8TqZTGiqLEdWvBRRcj`.

To reproduce the finalized order lookup, POST this JSON to the RPC endpoint above:

```json
{"jsonrpc":"2.0","id":"evidence","method":"query","params":{"request_type":"call_function","finality":"final","account_id":"router.newking.testnet","method_name":"get_order","args_base64":"eyJvcmRlcl9rZXkiOiI0OGE5NjM2Y2NkNzY5NGEyYmI3ZWIzN2Q3MDBhMjU5ZjZhYTIxZTMxYzM5ZmFlNjYxM2ViZTA5YmRhMWI1NGYyIn0="}}
```

A hosted run was separately recorded manually on 12 November 2026. The checks
above do not establish which browser/release initiated each payment or prove that
the backend indexed it, generated a receipt page, or delivered a webhook. A supplied 1901 × 923 dashboard screenshot shows the matching transaction hash,
settlement reference, payer/payout wallets, 1.5 NEAR gross, 0.0045 NEAR fee, and
1.4955 NEAR net. This correlates the displayed receipt with the verified chain
settlement. The order ID is outside the visible area; its association comes from
the on-chain event matching that exact transaction and settlement receipt. The
capture timestamp and browser URL are not visible. The original screenshot is published unchanged with the user’s permission below. See the
[manual record](../../frontend/NEAR_INTEGRATION_STATUS.md). The
[video](https://worldz-payments.vercel.app/checkout/demo) is a product walkthrough.

The [matching browser capture checklist](browser-capture.md) provides exact
dashboard/receipt links and acceptance values for the verified 1.5 NEAR payment.
The hosted order API returned 401 without a merchant session or checkout token;
the supplied screenshot provides the authorized merchant-side view. The reviewer did not independently access that authenticated API or verify webhook delivery.

![Merchant dashboard and matching native NEAR settlement receipt](screenshots/native-settlement-dashboard.png)

*Merchant-provided screenshot, published unchanged with permission. Its SHA-256
and matched fields are recorded in [the settlement record](public-settlement.json).*

To publish a fresh evidence package, use disposable test accounts and a small
native-NEAR checkout through the [hosted app](https://worldz-payments.vercel.app).
Record the following together after finalization:

| Required evidence | Acceptance check |
| --- | --- |
| Date/time and network | UTC timestamp; NEAR testnet |
| Router and release | Router account, deployed code hash, frontend/backend commit IDs if known |
| Successful payment transaction | Genuine public explorer URL; payment action and authorized amount match |
| Order and settlement receipt | Order ID and settlement receipt ID match the finalized router event |
| Merchant and fee payout legs | Required transfers succeeded; router state is `SETTLED` |
| Browser screenshots or recording | Checkout and merchant dashboard show the same settled order |
| Signed webhook, if claimed | Delivery corresponds to the same finalized event; redact secrets and customer data |

Publish only receipt links safe to share: checkout capabilities may expose names,
customer details, or edit access. Never publish checkout/edit tokens, sessions,
signer seeds, private keys, provider credentials, or a webhook signing secret.
Use screenshots with synthetic test customer names and redact unrelated activity.

The signer-update and failed-payment transactions in the recovery documentation
are useful diagnostics; neither is a successful checkout proof. The router upgrade
snapshot likewise establishes proposal state, not completed merchant settlement.

## Storefront product checkout

**Status: the 0.03 NEAR testnet payment is verified against the authenticated
merchant API, finalized router event/state and the merchant-provided receipt.
The merchant identified the standalone storefront as the initiating website.**

The user supplied both screenshots below and requested publication as evidence.
They are copied unchanged, with dimensions and SHA-256 hashes recorded in
[`storefront-payment.json`](storefront-payment.json). The receipt's transaction,
settlement reference, network, gross, fee, net and payer/payout accounts match
the independently read records. The product-page screenshot shows the
**SecureKey Hardware Wallet** and its **Pay with NEAR** button; the user stated
that this was where the payment was tested. The original browser session and
wallet approval were not independently observed.

| Field | Exact observation |
| --- | --- |
| Product | 1 × SecureKey Hardware Wallet |
| Network / router | Testnet / `router.newking.testnet` |
| Settlement receipt block | 277634878 · 14 November 2026, 08:53:16.623902 UTC |
| Gross | 0.03 NEAR · `30000000000000000000000` yoctoNEAR |
| Fee | 0.00009 NEAR · `90000000000000000000` yoctoNEAR |
| Merchant net | 0.02991 NEAR · `29910000000000000000000` yoctoNEAR |
| Payer / payout account | `drytea4617.testnet` / `luckytag417.testnet` |
| Fee recipient | `newking.testnet` |
| Order ID | `ord_e46c0409e04e4f52ae295e988dbd4d28` |
| Transaction | [CvsZPAg47KKaNKyHayJuvywG7YukFkyYHcaBHo12afUE](https://testnet.nearblocks.io/txns/CvsZPAg47KKaNKyHayJuvywG7YukFkyYHcaBHo12afUE) |
| Settlement receipt | `5BkicR6RqDZtpguRcUZ7jADxZQepxFXqvJB8kWCr78wo` |
| Event ID | `testnet:router.newking.testnet:5BkicR6RqDZtpguRcUZ7jADxZQepxFXqvJB8kWCr78wo:1` |
| Router result | `SETTLED`; merchant and fee legs `succeeded` |

The authenticated `GET /api/v1/me/deliveries` observation at 08:59:40 UTC
matched the exact order, transaction, settlement receipt and amounts, with
`state: SETTLED`. Customer name and unrelated merchant activity were omitted
from the published API extract. No API key, signed webhook body, signature,
session cookie or checkout capability is included.

Public read-only verification used
`https://archival-rpc.testnet.fastnear.com`. The finalized transaction's
`pay_native` action, attached deposit, signed payment terms and successful
router `payment_settled` event matched the API record. The order replay key was
recomputed from the original authorization using the protocol's Borsh replay
domain. A finalized `get_order` query at block 277635774 returned the same
`SETTLED` order and succeeded merchant/fee legs. The query parameters and
verification time are in the JSON record for reproduction. This trusts the
configured RPC; it is not a light-client proof or a check of deployed bytecode.

![Standalone storefront identified by the merchant as the source of the payment](screenshots/storefront-product-page.png)

![Merchant receipt for the matching 0.03 NEAR storefront payment](screenshots/storefront-settlement-dashboard.png)

### Storefront webhook status

The user reported **“webhook payments works.”** The first captured sender
observations for that exact event on **14 November 2026** show:

| Observed at (UTC) | Sender state | Attempts | Last error |
| --- | --- | --- | --- |
| 08:59:40 | `pending` | 8 | Not captured in this initial extract |
| 09:12:39 | `failed` | 10 | Receiver returned HTTP 404 |

The original callback URL omitted the required `/api` path segment, so the sender
received HTTP 404. After correcting the URL, the public storefront domain still
served an older receiver deployment; a signed probe to that build returned HTTP
503 because its local-file evidence storage was unavailable. The updated Shopify
receiver was deployed, and the existing public storefront domain was aliased to
that deployment. The callback URL stayed the same; no merchant secret or new
payment was needed.

After the alias change, the Worldz sender retried the existing settled event.
The receiver recorded its durable receipt at 13:03:36 UTC, and the sender marked
the delivery `delivered` after one attempt, less than a second later. An
authenticated read returned that matching receipt and raw-body SHA-256. A later
signed replay of the same event returned HTTP 200 with `result: duplicate` and
`signatureVerified: true`, confirming idempotent acknowledgement. The current
evidence therefore establishes successful receiver acceptance and sender
delivery. The initial pending/failed observations remain in the JSON record for
history. See the [developer configuration guide](../storefront-integration.md).

Additional receiver checks returned HTTP 400 for a correctly signed unsupported
event and HTTP 401 after tampering with the signed raw body. Neither probe
created a payment or a receipt. The deployment inspected through Vercel CLI was
ready, and its source commit was `b3f4808` in the
[Shopify-named repository](https://github.com/primexk5/Shopify). This verifies
webhook delivery only; it does not establish native Shopify order
synchronization or inventory fulfilment. The screenshots are supplied evidence;
their capture UTC timestamps are unknown.

## Cross-chain sandbox evidence

Cross-chain checkout has a simulation mode so wallet selection, quotes, attempt
progression, recovery, and settlement bookkeeping can be exercised without
spending real assets. This is valid test evidence for those behaviors. It is
separate from the real native-NEAR testnet transaction and screenshot above.

Live 1Click settlement operates on mainnet and requires real funds. A funded
cross-chain acceptance transaction is not included in this submission evidence.
That reflects the tested environment; it does not mean the sandbox demonstration
is fabricated or unusable. Mainnet configuration/deployment and a funded live
acceptance run remain the release-validation steps. See [the cross-chain guide](../cross-chain.md).

## Reproduce the recovery case

This case is for a merchant whose customer paid before a fee-recipient rotation,
while the backend still records the order as `OPEN`. Reclaiming the link must
preserve the original authorization so the genuine old-fee settlement can be
reconciled. An expired reservation can be replaced only when finalized chain time
and the subsequent router lookup establish that no order started.

Run from the repository root with Rust, Python 3, and a disposable PostgreSQL
database. No wallet, VTpass, Shopify credentials, or public RPC is needed. The
test creates and removes an isolated schema, and starts a local fake finalized RPC.

```sh
SECURITY_TEST_DATABASE_URL=postgres://USER:PASSWORD@localhost/DISPOSABLE_DB \
  scripts/check-recovery.sh
cat target/evidence/recovery.json
```

The test and script must exit successfully. The report includes source digests,
the base commit, a UTC timestamp, and these asserted scenarios:

| Scenario | Required result |
| --- | --- |
| Active, unsubmitted order | Original authorization, amounts, and deadline remain unchanged |
| Expired, processing on-chain | Existing order retains its original terms despite configuration rotation |
| Settled on-chain, still `OPEN` in database | Original fee recipient remains intact; reconciliation records `SETTLED`, a receipt, and exactly one redemption |
| Expired with finalized no-order evidence | Old reservation expires; new order has current fee/signer terms and a new nonce |

A [captured local run](recovery-example.json) is checked in for inspection. Its
`baseCommit` identifies the starting commit, while `sourceSha256` pins the actual
files tested, including local edits. Compare those digests before treating it as
evidence for a different revision. Fresh runs and CI artifacts are authoritative
for their own source revisions.

The JSON explicitly identifies its fake-RPC environment. The `paid-tx` and
`paid-receipt` fixtures in the test are synthetic local inputs, never explorer
identifiers. This regression proves application behavior under controlled inputs;
it does not prove public indexing, wallet interaction, or live RPC truth.

## Continuous checks and blockchain sandbox

[The Checks workflow](../../.github/workflows/checks.yml) runs backend/protocol/router
unit checks, the database recovery case, actual native/token sandbox transactions,
frontend tests, type checking, lint, and a production build. Its Rust job uploads
the recovery JSON and test log as the `recovery-evidence` artifact. A workflow
definition is not a passing run: inspect the run for the relevant commit on the
repository's **Actions** tab.

Sandbox tests use a local blockchain and compiled WASM, not the public testnet.
See the [build instructions](../../README.md#checks-and-contract-builds) and
[upgrade review](../router-upgrade-review.md) for the source/artifact match and
live-predecessor compatibility result. No public contract execution follows from
a passing sandbox test.
