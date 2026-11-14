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
4. The customer reviews the final amount and approves the transfer in the
   connected wallet. Deposit addresses stay internal; there are no copy-address
   instructions. The browser switches to the selected EVM chain and requests a
   native ETH transfer or an ERC-20 `transfer` to the token contract, or requests
   a native SOL / SPL `transferChecked` transaction in Phantom, then reports the hash
   (`POST /v1/oneclick/attempts/{id}/deposit`).
5. A backend status worker polls the swap, verifies the on-NEAR payout by
   reading the NEAR transaction receipt (an `ft_transfer` event to the
   merchant's payout account for at least the quoted amount), and settles the
   order through the same atomic latch used by native payments
   (`orders.settlement_receipt_id`). Failed swaps map to `REFUNDED` /
   `FAILED` / `INCOMPLETE_DEPOSIT` and never settle.

## Sandbox simulation and live settlement

| | `ONECLICK_MODE=mock` | `ONECLICK_MODE=live` |
| --- | --- | --- |
| Network | Works on any configured network, incl. testnet | Mainnet only (`ONECLICK_ENABLED=true` required) |
| Quotes/deposits | Current USD prices from 1Click `/v0/tokens`; simulated deposits | Executable 1Click quotes (`/v0/quote`, `/v0/status`) |
| Payment approval | "Confirm simulated payment" posts a synthetic hash; no wallet transaction | Connected wallet approves and sends the transfer automatically |
| Settlement | Verified path with a synthetic NEAR hash | On-NEAR receipt verification via NEAR RPC |

Sandbox simulation is valid evidence for the behaviors it exercises. Live
1Click transfers use mainnet assets and require real funds; no funded live
cross-chain acceptance transaction is recorded in the current evidence package.
Mainnet configuration/deployment and a funded acceptance run remain separate
release steps, rather than prerequisites for testing the sandbox flow.

The mock mode exists so the full UI, attempt lifecycle, deadline expiry,
and settle-once guarantees can be exercised locally without keys. Simulated
quotes convert the configured token amount using fresh origin and destination
USD prices, with integer arithmetic and upward rounding. Prices are cached for
60 seconds and rejected when over 10 minutes old; missing prices block quoting
instead of falling back to a 1:1 rate. Simulation needs public 1Click price data;
unit and DB lifecycle tests inject deterministic prices without external calls. It never
touches the native NEAR checkout. In live mode the backend keeps any
`ONECLICK_API_KEY` server-side; the browser only ever talks to this API.

## Configuration

| Setting | Purpose |
| --- | --- |
| `ONECLICK_ENABLED` | Master switch; `false` hides every cross-chain endpoint |
| `ONECLICK_MODE` | `mock` or `live` (default) |
| `ONECLICK_BASE_URL` | 1Click API base URL; must be HTTPS |
| `ONECLICK_API_KEY` | Optional 1Click JWT sent as `Authorization: Bearer` (server-side only) |
| `ONECLICK_MOCK_OUTCOME` | Mock progression: `success`, `refunded`, `failed`, `incomplete_deposit` |

## Try it locally

1. Enable mock mode in `backend/.env` (`ONECLICK_ENABLED=true`,
   `ONECLICK_MODE=mock`) and run the seed below.
2. Open a seeded link, choose **Pay with another chain**, connect Phantom or
   an EIP-6963 wallet, review the quote, and press **Confirm simulated payment**.
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
