# Router security assumptions and recovery limits

This repository is unaudited and intended for testnet demonstration. Source
inspection and regression tests do not establish production safety or prove that
deployed WASM matches the reviewed source.

## Authorization and configuration trust

The platform signer authorizes the merchant identity, payout address, payer when
specified, asset, gross amount, expiry, and fee terms. Protect the signer key:
compromise permits forged authorizations within router validation rules. The
router checks the network, contract, enabled signer, asset, and current configured
fee terms. Replay markers are permanent and must survive upgrades.

The admin controls signer keys, token allowlisting, fee configuration, payout
retries, reconciliation flags, and upgrades. The guardian or admin can pause;
only the admin can unpause. Configuration changes affect acceptance of future
payments immediately. Already accepted orders snapshot their recipients and
amounts. Backend records must preserve these terms across configuration rotation.

## Asynchronous transfers and recovery

Submission is not settlement. Merchant and fee transfers run as separate receipts;
successful required legs establish router settlement. The backend additionally
requires a matching finalized settlement event and router state before recording
its receipt. Duplicate or stale callback attempts are ignored.

Only confirmed failed payout legs may be retried by the admin. The payer or admin
can request a full refund only when no payout leg succeeded and no payout receipt
is pending. A confirmed failed refund may be retried. Partial payouts cannot be
fully refunded through this method. Missing callback results remain ambiguous:
`flag_reconciliation` records the need for external receipt investigation and
does not resend transfers or provide an automatic resolution mechanism.

The storage sponsor reserve must remain funded. Insufficient storage funding or
an arithmetic overflow can fail execution. Assertions are normal contract rejection
paths; changing panic handling or fee arithmetic requires separate review of NEAR
receipt rollback and token-refund behavior, not a mechanical unwrap replacement.

## Upgrade trust

The contract's upgrade entrypoint requires an admin proposal, a SHA-256 commitment
to the exact WASM, and at least 48 hours before execution. A replacement proposal
starts a new minimum delay. Execution is a separate admin transaction, not an
automatic timer. Verify deployed account access keys: a FullAccess key can deploy
code at the account level without using the contract's upgrade entrypoint.

Before execution, verify the current proposal, exact artifact hash, source/build
provenance, state compatibility, and sandbox results. Preserve order records,
liabilities, replay markers, and storage prefixes. The current `post_upgrade`
callback increments a version and clears the proposal; it is not a general state
layout migration. A deployment and its later callback are separate receipts.
