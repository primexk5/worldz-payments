# Payment link signer mismatch and recovery

The failed testnet payments on 7 November 2026 were signed by the live API using
`worldz-testnet-1`, but the router had a different public key registered under that
ID. The failed authorization verifies with the API's public key and fails with
the router's public key. The router code matches the locally tested WASM byte for
byte; native and NEP-141 sandbox settlement tests pass with matching signer keys.

The testnet admin approved and applied the signer update in transaction
[`5XezVfYaRFhgsoP6bQVnufkP7VL7e4koSHjwEaVi9Qbf`](https://testnet.nearblocks.io/txns/5XezVfYaRFhgsoP6bQVnufkP7VL7e4koSHjwEaVi9Qbf).
It attached zero NEAR and cost 0.0000314019964375 NEAR in gas. The frontend/backend
checkout changes still require deployment to their respective hosts.

## Repair the live configuration

Run the read-only checker, which fetches current public configuration and prints
the exact repair command when the keys differ:

```sh
node backend/scripts/check-payment-router.mjs
```

The printed command calls `set_signer_key` on `router.newking.testnet`, signed by
its admin, `newking.testnet`. It attaches zero NEAR; the admin pays transaction
gas. Review and authorize it using the admin wallet/keychain. The script does
not send transactions or read private keys. If the configured server seed was
changed unintentionally, restore the original server seed instead of changing
the registered public key. Do not generate a new signer seed during redeploys.

Run the checker again and require `signerMatches: true`. Deploy the backend and
frontend changes together: the updated frontend uses `/payment-readiness`, which
also requires the backend's fee rate and recipient to match `get_config` on the router.
New claims check the finalized router signer before consuming a link claim;
wallet submissions also check readiness, including retries of existing claims.
The storage query uses the deployed v1 router's Borsh `signer_keys` LookupMap.
Update the checker and readiness function if the contract storage layout changes.

## Recover an existing failed checkout

The website proxy preserves successful HTTP 204 responses with a null body.
Attaching even an empty buffer to a 204 response throws in the Fetch API and
previously displayed a false "NEAR merchant API is unreachable" error for both
name saves and payment readiness checks. Regression tests cover these responses.

The checkout saves the customer name before a wallet redirect and lets the
customer edit it while checking a payment's status. The name is saved as part of
creating or reusing the order, and later edits save automatically with background
retries. There is no separate receipt-name save button. Wallet callback hashes are
restored automatically. If the wallet returned an error without a hash, copy the
transaction hash from wallet history into **Wallet transaction hash** and select
**Check payment status**. For the latest observed failed payment, the hash is:

```text
8cHVPKJCAmW96P6Jih7JgZNBb4ktduTqbWfAiFaXNPYZ
```

The API validates the signer, receiver, signed authorization, signature, method,
and amount. It permits retry only after a finalized failure with no stored router
order. Pending or partial payouts remain locked. A failed receipt can consume gas
even though the attached payment is returned. The observed transaction returned
the attached 0.2 NEAR to the payer; gas was charged separately.

An authorization expires after 15 minutes. Claiming the link again requires a wallet ownership proof bound to that link.
An active unpaid reservation keeps its replay key; a capped reservation cannot
be extended indefinitely. An expired capped reservation is released only after
finalized chain time has passed its authorization deadline and the router has no
order. A fresh reservation can then be issued. Verified settlements consume the
redemption counter. Apply the included backend migration and deploy the updated
frontend and backend together.

Fee or signer rotation does not rewrite an existing order's authorization or
financial terms, even if its database state is still `OPEN`. The payment may
already have executed and be waiting for indexing. An unpaid authorization with
outdated configuration must expire before the finalized no-order check permits
a new order. Reconcile an executed payment against its original authorization.

## Validation

```sh
cargo test -p worldz-near-api --bin worldz-near-api
cargo test -p worldz-near-router --lib
cargo test -p worldz-near-router --test sandbox
cd frontend
npx tsc --noEmit
npm run test:near
npx eslint 'src/app/pay/[slug]/page.tsx' src/lib/near/payment.ts src/lib/near/api.ts
```
