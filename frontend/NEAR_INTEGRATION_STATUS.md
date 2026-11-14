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

The connector is configured to require testnet, message signing, and transaction signing, so wallets that do not declare all three capabilities are filtered out. Meteor and Nightly are the initial testnet candidates.

## Manual end-to-end testnet validation

On **12 November 2026**, the deployed browser flow was manually exercised successfully from wallet connection through verified settlement. The acceptance journey covered:

1. merchant wallet sign-in and payment-link creation;
2. payer wallet connection and ownership proof;
3. backend issuance of the payer-bound signed order;
4. browser-wallet approval of the native testnet NEAR payment;
5. router execution of the merchant and platform-fee payout legs;
6. finalized event indexing and reconciliation to `SETTLED`; and
7. display of the verified receipt with a non-empty settlement receipt identifier.

Pass criteria require the merchant dashboard and customer checkout to show the same settled order and require `settlementReceiptId` to be present. A wallet redirect or transaction hash by itself is not a pass. [Public router settlement identifiers](../docs/evidence/public-settlement.json) were subsequently verified independently on 14 November. They establish on-chain payout completion, but have not been correlated with browser/dashboard evidence for this particular manual run. This browser acceptance claim is therefore not independently verified by those transactions alone. See [the public evidence checklist](../docs/evidence/README.md#public-testnet-checkout) for what remains to be captured and verified. Publish only genuine public test-account evidence, with consent for any checkout or receipt link that exposes customer information.

This is a manual acceptance record for the configured hosted testnet deployment, not an automated test or a claim about mainnet. Re-run it after changing the deployed router bytecode, signer, fee configuration, RPC/indexer setup, backend, or checkout transaction construction.

## Integration boundary

The frontend targets the versioned API models in `src/lib/near/types.ts` and the API routes in `src/lib/near/api.ts`. The Rust API, router, and sandbox flows are implemented in the workspace, while the checked-in environment template keeps `NEXT_PUBLIC_NEAR_CONTRACT_ID` as a placeholder. The deployed testnet integration has been exercised as recorded above; a fresh local or redeployed environment must still be validated with its own PostgreSQL, API signer, router, and browser-wallet configuration.

Payout account entries are checked through NEAR's `view_account` RPC before the frontend asks the merchant identity wallet to sign the destination update; the backend still performs its own account and signature validation.

The checkout stores a pending order and transaction hash for recovery, but displays `SETTLED` only when the merchant API returns the settled state with a settlement receipt identifier. A transaction submission/hash alone is never presented as settlement evidence.
