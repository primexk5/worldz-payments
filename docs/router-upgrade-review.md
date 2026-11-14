# Testnet router upgrade record

## Deployment result

The reviewed candidate was deployed successfully on 14 November 2026. The
upgrade transaction finalized, emitted `router_migrated` with `stateVersion: 2`,
and cleared the pending proposal. A subsequent finalized state read confirmed
that the router remained unpaused and retained its existing administration, fee,
storage reserve, and attempt counter.

| Field | Finalized value |
| --- | --- |
| Router | `router.newking.testnet` |
| Admin | `newking.testnet` |
| Transaction | [`5vCnDPNPU2EswmpmWMyJvoaxS3NKjqA7qyB8iuP3B6TF`](https://testnet.nearblocks.io/txns/5vCnDPNPU2EswmpmWMyJvoaxS3NKjqA7qyB8iuP3B6TF) |
| Migration event block | [`277660151`](https://testnet.nearblocks.io/blocks/6ZMzwm1ZJyLVunasRaMWZiGUQ9rMq46XVo1t7TBvGSuk) |
| Migration event time | 14 November 2026, 12:59:54 UTC / 13:59:54 Lagos |
| Deployed SHA-256 | `69f1b416c4fa479c82bbf6d25ffedabfd0e102bee85e042ad26d17ec247a04a8` |
| State version | `2` |
| Paused | `false` |
| Pending upgrade | none |

Finalized inspection at block `277660199` matched the deployed bytecode to the
reviewed artifact. Raw finalized state at block `277660212` independently
confirmed state version 2 and an empty pending-upgrade field. This proves the
reviewed bytecode deployment and migration; it does not replace a fresh hosted
checkout, payout, receipt, dashboard, and webhook acceptance run.

## Original proposal

Before execution, read-only finalized state inspection on 14 November 2026
(Lagos time) found:

| Field | Value |
| --- | --- |
| Router | `router.newking.testnet` |
| Admin | `newking.testnet` |
| Finalized block | [`277580237`](https://testnet.nearblocks.io/blocks/277580237) |
| Block timestamp | 13 November 2026, 23:53:52 UTC |
| Earliest execution | 14 November 2026, 10:34:33 UTC / 11:34:33 Lagos |
| Proposed SHA-256 | `69f1b416c4fa479c82bbf6d25ffedabfd0e102bee85e042ad26d17ec247a04a8` |

This table is the historical pre-execution snapshot. The hosted
network-configuration request timed out; the account was taken from the repository's
recovery documentation. No proposal, cancellation, or execution transaction was
sent during that review step.

A subsequent finalized check at block `277582158` found the same proposal. The
live code at block `277582164` had NEAR code hash
`3vvthJyppPLxUGLWA5QG93RWjR7um21euDGwdbmHDxwq` (SHA-256 hex
`2b8817810f7ba6d3c9d0a182190252d0846f3e5befd1540aeeb758e1bd1e2c08`).
Its public WASM was downloaded and verified against that hash for compatibility
testing; it differs from the proposed artifact.

## Artifact contents

A local artifact at
`/home/newking/Desktop/Global/projects/worldz-payment/target/wasm32-unknown-unknown/contract/worldz_near_router.wasm`
has exactly the proposed SHA-256. It is a compiled WebAssembly binary, not a text
proposal. Its exported methods include payment, cancellation, payout/refund recovery,
configuration, and upgrade entrypoints. Its embedded validation messages include
both configured fee-rate and configured fee-recipient mismatch rejection.

The source checkout alongside that artifact was clean at commit
`d5625c4644b873465160fc9d0457d5e6977ac439` (`Enforce router fee configuration`).
The router production-code diff in that commit adds two acceptance checks:

1. The authorization's fee basis points must equal the router's configured rate.
2. Its fee recipient must equal the router's configured recipient.

The deployed candidate also includes the earlier cancellation authentication fix from
commit `80b44b2`: `cancel_authorization` verifies the signed terms before accepting
the caller's claimed merchant identity. This is material when comparing with the
actual deployed binary, rather than only the immediately preceding source commit.

That diff does not change storage layout, the signing format, replay composition,
or accepted orders' payout snapshots. A fresh build in the review worktree also
reproduced the exact proposed hash, using `rustc 1.96.0-nightly
(3645249d7 2026-03-16)` and the checked-in lockfile:

```sh
cargo build --locked -p worldz-near-router --target wasm32-unknown-unknown --profile contract
sha256sum target/wasm32-unknown-unknown/contract/worldz_near_router.wasm
# 69f1b416c4fa479c82bbf6d25ffedabfd0e102bee85e042ad26d17ec247a04a8
```

This tied the proposed artifact to the reviewed source/build configuration. The
deployment result above subsequently established that the same artifact executed
successfully.

## Release decision before execution

Backend fee-refresh changes, documentation, and Rust tests are delivered separately
from contract WASM. They can accompany the existing proposal in the same release.
Test code under `cfg(test)` is excluded from the deployed contract.

The production contract change could use the proposal only while the final WASM
had exactly the committed hash. Different WASM would have required a replacement
proposal and a new minimum 48-hour delay, even after the existing proposal became
executable. The hash was rechecked immediately before execution and matched. The
11:34 time was the earliest execution time, not an automatic deployment or a
deadline to append changes.

## Validation and deployed-version finding

The following checks passed during this review:

- Backend unit checks: 57 passed; external-service tests remain ignored by default.
- The new PostgreSQL fee-rotation regression passed with a disposable database and
  local fake finalized RPC. It covers active, processing, already-settled-but-OPEN,
  and expired-unstarted reservations, including signer-key ID rotation.
- Router unit checks: 21 passed, including expiry, payer/asset binding, replay,
  callback attempts, partial-refund rejection, fee snapshots, and upgrade restrictions.
- Protocol checks: 6 passed, including binding every replay-domain field.
- Both native and NEP-141 sandbox tests passed with the proposed WASM. The native
  test also passed with the downloaded live WASM as predecessor: an existing
  settlement and replay marker survived replacement, forged cancellation was
  rejected by the candidate, and a fresh payment settled after replacement.
- Formatting and whitespace checks passed; the compact build retained the exact
  proposed SHA-256 after adding tests.

**Pre-upgrade deployed-version finding:** running the forged-merchant cancellation assertion
against the downloaded live WASM failed because that version accepted the forged
cancellation. The same attack is rejected by the candidate. This permits denial of
payment by consuming the replay marker of an observed authorization; it does not
demonstrate theft. The finding was reproduced only in a local blockchain using
publicly downloaded code. No attack was sent to the public testnet router.

The compatibility test used direct deployment on a local sandbox account and did
not itself exercise the public upgrade transaction, full historical production
state, or every in-flight payout state. Timelock, admin, hash, replacement, and
cancellation rules are covered separately by unit tests. The proposal, artifact
hash, and account state were rechecked immediately before the finalized execution
recorded above.
