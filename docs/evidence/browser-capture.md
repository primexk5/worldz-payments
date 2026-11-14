# Capture the matching hosted receipt

Status: a user-provided dashboard screenshot includes a matching displayed receipt.
Its transaction hash, settlement reference, amounts, network, and payer/payout
accounts match the verified chain record. The [original screenshot](screenshots/native-settlement-dashboard.png) is published
unchanged with the user’s explicit permission. The capture time and browser URL are unknown;
the order ID is not visible, so correlation uses the transaction and settlement
reference instead. This is supplied UI evidence, not independently controlled
browser/API verification. A read-only request to
the hosted order endpoint without credentials returned HTTP 401. No merchant
session, checkout capability, backend receipt, or webhook result was obtained.
Do not remove access controls or manufacture browser state to create this evidence.

## Exact payment to match

- Network: NEAR testnet
- Merchant ID: `mch_4917f5de961546c495ecd87ba381a124`
- Order ID: `ord_ea591c08e47340e59b3a6f6af4022dc3`
- Gross: 1.5 NEAR; fee: 0.0045 NEAR; merchant net: 1.4955 NEAR
- Settlement receipt: `2Rj5TZibpcvyFxTnnUu4Ce4onC8TqZTGiqLEdWvBRRcj`
- [Verified public transaction](https://testnet.nearblocks.io/txns/9Wufap1bjNXDjMjbikHBT6Uj9gNxARJitoobxjW8mwfN)

These are publicly verified chain identifiers. They do not establish that the
hosted database contains the corresponding order or has reconciled it.

## Capture in your signed-in merchant browser

1. Sign in to WorldzPayments with the merchant account that owns this order.
2. Open [Dashboard → Payments](https://worldz-payments.vercel.app/dashboard/payments?order=ord_ea591c08e47340e59b3a6f6af4022dc3).
   Search for the full order ID and expand **Details**; the query parameter alone
   does not guarantee the ledger filters or expands that row.
3. Capture the row and expanded details showing the order ID, `SETTLED`, gross,
   fee, merchant net, and settlement reference. Suggested file: `merchant-order.png`.
4. In the same authorized browser, open the
   [direct order receipt](https://worldz-payments.vercel.app/checkout/mch_4917f5de961546c495ecd87ba381a124/ord_ea591c08e47340e59b3a6f6af4022dc3).
   Capture **Payment settled**, the amount, order ID, transaction link, and
   settlement reference; use multiple frames if needed. Suggested file: `receipt.png`.
5. Optionally download the actual receipt PDF from that page. Check its order and
   reference before sharing it. Do not construct a receipt PDF from the chain JSON.
6. Record the capture date/time and timezone, whether a refresh retained the result,
   and any missing or mismatching field. Do not send a new payment just to reopen
   this already-paid order.

Use only the correct merchant's session or the original payer checkout session.
If access is denied, or the order is missing, capture the error privately and
report it as an unresolved integration result. Never inject a checkout token or
mock an API response to force the UI to display a receipt.

## Privacy and acceptance

Crop or redact customer names, unrelated orders, balances, browser extensions,
and account information unrelated to the public test payment. Keep the relevant
order, amount, status, and reference visible. Never share cookies, session exports,
edit/checkout tokens, API keys, wallet recovery phrases, or signing keys.

The evidence gap closes only when the actual hosted ledger and receipt match
the public transaction and settlement receipt above. Screenshots establish the
observed UI result; they do not retroactively prove every step of the original
wallet interaction. A complete new end-to-end recording is a separate acceptance run.

Webhook delivery is optional and unverified. Do not claim it succeeded unless
the same event has a recorded delivery result and recipient-side confirmation.
If it was not configured, record that fact; do not configure a new endpoint merely
to make historical evidence look complete.
