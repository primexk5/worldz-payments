# Worldz NEAR signed-order protocol v1

This is the shared frontend/backend/router authorization encoding. It is an application protocol, not NEP-413 and not EIP-712.

## Canonical authorization bytes

1. Serialize `AuthorizationPayload` as canonical Borsh using the exact field order below.
2. Prefix the bytes with UTF-8 `worldz.near.order-auth/v1\0`.
3. Compute SHA-256 over the prefixed bytes.
4. Sign the digest with the configured Ed25519 platform key. The signature and 32-byte nonce are base64-encoded at JSON boundaries.

| Order | Field | Canonical Borsh type | JSON representation |
|---:|---|---|---|
| 1 | `protocolVersion` | `u8` | integer, currently `1` |
| 2 | `signerKeyId` | `String` | string |
| 3 | `networkId` | enum (`Testnet=0`, `Mainnet=1`) | `testnet` / `mainnet` |
| 4 | `contractId` | `String` | NEAR account ID |
| 5 | `merchantId` | `String` | platform merchant identity |
| 6 | `merchantAccountId` | `String` | login identity account |
| 7 | `payoutAccountId` | `String` | merchant payout account |
| 8 | `orderId` | `String` | cryptographically random id |
| 9 | `asset` | enum (`Native=0`, `Nep141(String)=1`) | tagged asset object |
| 10 | `amount` | `u128` | decimal string of base units |
| 11 | `expiresAtSeconds` | `u64` | Unix seconds |
| 12 | `feeBps` | `u16` | integer, 0..500 |
| 13 | `feeRecipientAccountId` | `String` | NEAR account ID |
| 14 | `expectedPayerAccountId` | `Option<String>` | account ID or `null` |
| 15 | `nonce` | `[u8; 32]` | base64 string |

Native NEAR uses 24 decimals. NEP-141 decimals come from `ft_metadata`; no EVM address or decimal assumptions are used.

## Replay key

Permanent replay prevention hashes the separate Borsh tuple `(protocolVersion, networkId, contractId, merchantId, orderId, nonce)` with prefix `worldz.near.order-replay/v1\0`. Orders and cancellations must retain this marker across archival and upgrades.

## Settlement truth

Wallet transaction success only means order processing began. `SETTLED` requires a successful merchant payout leg, a successful non-zero fee leg, matching order/attempt IDs, and a finalized indexed `payment_settled` event corroborated against router state. A callback failure leaves the order blocked for reconciliation, never blindly retried.

## Test vectors

`crates/near-protocol` tests pin decimal-string serialization, nonce size, domain/network/contract separation, and replay-key stability. A fixed-key signature vector will be added after the canonical crate tests run on the selected Rust toolchain.
