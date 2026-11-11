# Cross-chain pay-in (NEAR Intents / 1Click)

Payment links can receive funds from other chains. A customer pays with an
EVM (Ethereum, Base, Arbitrum) or Solana stablecoin/token, a NEAR Intents
swap (via the [1Click API](https://1click.chaindefuser.com)) converts it, and
the merchant's NEAR account is paid in the link's configured NEP-141 token.
Everything settles on NEAR and flows through the same verified-receipt and
webhook pipeline as native payments.

## How it works

1. The customer opens a payment link and chooses **Pay with another chain**.
2. The checkout lists supported origin tokens (`GET /v1/oneclick/tokens`),
   connects an injected EVM wallet (EIP-6963) or Phantom (Solana), and asks
   for a quote (`POST /v1/links/{slug}/oneclick/quote`, `EXACT_OUTPUT`).
3. Starting the payment creates a wet quote with a single-use deposit
   address and records a `one_click_attempts` row alongside an `OPEN` order
   with `source='1click'` and `pay_method='cross_chain'`
   (`POST /v1/links/{slug}/oneclick/attempts`).
4. The customer sends the quoted amount to the deposit address; the browser
   either broadcasts an ERC-20 `transfer` (hand-rolled calldata, no extra
   wallet SDK) or a Solana SPL `transferChecked`, then reports the hash
   (`POST /v1/oneclick/attempts/{id}/deposit`).
5. A backend status worker polls the swap, verifies the on-NEAR payout by
   reading the NEAR transaction receipt (an `ft_transfer` event to the
   merchant's payout account for at least the quoted amount), and settles the
   order through the same atomic latch used by native payments
   (`orders.settlement_receipt_id`). Failed swaps map to `REFUNDED` /
   `FAILED` / `INCOMPLETE_DEPOSIT` and never settle.

## Real vs simulated

| | `ONECLICK_MODE=mock` | `ONECLICK_MODE=live` |
| --- | --- | --- |
| Network | Works on any configured network, incl. testnet | Mainnet only (`ONECLICK_ENABLED=true` required) |
| Quotes/deposits | Local fixture; no external calls | 1Click API (`/v0/quote`, `/v0/status`) |
| Deposit | "Simulate deposit" button posts a synthetic hash | Real wallet transfer to the 1Click deposit address |
| Settlement | Verified path with a synthetic NEAR hash | On-NEAR receipt verification via NEAR RPC |

The mock mode exists so the full UI, attempt lifecycle, deadline expiry,
and settle-once guarantees can be exercised locally without keys. It never
touches the native NEAR checkout. In live mode the backend keeps any
`ONECLICK_API_KEY` server-side; the browser only ever talks to this API.

## Configuration

| Setting | Purpose |
| --- | --- |
| `ONECLICK_ENABLED` | Master switch; `false` hides every cross-chain endpoint |
| `ONECLICK_MODE` | `mock` (default) or `live` |
| `ONECLICK_BASE_URL` | 1Click API base URL; must be HTTPS |
| `ONECLICK_API_KEY` | Optional API key sent as `X-API-Key` (server-side only) |
| `ONECLICK_MOCK_OUTCOME` | Mock progression: `success`, `refunded`, `failed`, `incomplete_deposit` |

## Try it locally

1. Enable mock mode in `backend/.env` (`ONECLICK_ENABLED=true`,
   `ONECLICK_MODE=mock`) and run the seed below.
2. Open a seeded link, choose **Pay with another chain**, connect Phantom or
   an EIP-6963 wallet, and press **Simulate deposit**.
3. The worker settles the order after the mock delay (~15s) and the checkout
   shows the same verified receipt as a native payment.

## Guarantees

- **Settle once:** cross-chain and native payments share one transactional
  latch per order, and single-pay links share one claims budget; a race
  produces exactly one winner and flags the loser `RECONCILIATION_REQUIRED`.
- **Verification before settlement:** in live mode an order only settles
  after the required NEP-141 transfer to the merchant payout account is
  confirmed in a NEAR transaction receipt.
- **Fresh deposit addresses:** every attempt gets a unique deposit address;
  attempts expire at their quote deadline and closed attempts cannot accept
  deposits.

DB-gated race/settle-once tests live in
`backend/src/oneclick_db_tests.rs` and run only when
`SECURITY_TEST_DATABASE_URL` points at a disposable PostgreSQL instance
(the same convention as the other security tests).
