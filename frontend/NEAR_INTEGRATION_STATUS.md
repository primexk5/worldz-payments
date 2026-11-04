# WorldzPayments NEAR frontend integration status

## Network and wallet connector

- Wallet connector: `@hot-labs/near-connect` 0.12.0, loaded only in the browser behind `src/lib/near/wallet.ts`.
- Initial network: `testnet`; network selection is configured with `NEXT_PUBLIC_NEAR_NETWORK_ID` and never represented as an EVM chain ID.
- Connector source: https://github.com/azbang/near-connect
- The official `near/wallet-selector` README recommends exploring HOT Connect during the Wallet Selector transition: https://github.com/near/wallet-selector
- NEP-413 signed login messages are initiated from the connected wallet. The backend must verify the nonce, state, recipient, public key ownership, and FullAccess key at finalized state.

## Candidate wallet capability declarations

Checked the public NEAR Connect manifest on 2026-11-03: https://raw.githubusercontent.com/hot-dao/near-selector/main/repository/manifest.json. These are wallet-published declarations, not manual transaction-test results.

| Wallet | Testnet declared | `signMessage` | `signAndSendTransaction` | Listed platforms |
| --- | --- | --- | --- | --- |
| Meteor Wallet | Yes | Yes | Yes | Web, Chrome, Android, iOS |
| Nightly Wallet | Yes | Yes | Yes | Chrome |
| NEAR Mobile | No | Yes | Yes | Android, iOS |
| HOT Wallet | Not declared in the current manifest entry | Yes | Yes | Chrome, Firefox, Android, iOS |

The connector is configured to require testnet, message signing, and transaction signing, so wallets that do not declare all three capabilities are filtered out. Meteor and Nightly are the initial testnet candidates. No live wallet/browser transaction has been recorded in this workspace yet.

## Integration boundary

The frontend targets the versioned API models in `src/lib/near/types.ts` and the API routes in `src/lib/near/api.ts`. The `worldz-payment/backend` and `worldz-payment/contracts` folders are not implemented in this frontend pass, and `NEXT_PUBLIC_NEAR_CONTRACT_ID` is an example placeholder. Do not treat the dashboard or checkout as a completed testnet integration until the Rust API and router are deployed and browser wallet flows are exercised against them.

Payout account entries are checked through NEAR's `view_account` RPC before the frontend asks the merchant identity wallet to sign the destination update; the backend still performs its own account and signature validation.

The checkout stores a pending order and transaction hash for recovery, but displays `SETTLED` only when the merchant API returns the settled state with a settlement receipt identifier. A transaction submission/hash alone is never presented as settlement evidence.
