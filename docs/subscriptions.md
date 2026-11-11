# Bills and subscriptions

The dashboard at `/dashboard/services` supports Nigerian airtime, data bundles,
electricity and one-time TV package purchases. The provider is pinned to the
VTpass sandbox and payments require NEAR testnet. No real service is delivered
and there are no automatic recurring charges.

## Purchase flow

1. Load the provider catalog and package prices. Verify the meter or TV smartcard.
2. Request a ten-minute NGN/USD/token quote. Native NEAR uses market pricing;
   enabled USD stable tokens include USDC, USDC.e, USDT, USDT.e and DAI.
3. Create a single-use payment link and consume the quote once. Recipient details
   are encrypted before storage.
4. The customer connects their wallet, reviews the amount and signs the payment.
5. Fulfillment requires a settled testnet order with verified payout evidence.
6. Submit one provider request. Pending or ambiguous responses are requeried using
   the same request ID; retries never submit another provider payment.
7. Display the service receipt after confirmation. Refreshing restores progress.

DStv and GOtv catalog-package purchases use `subscription_type=change` and one
viewing month. This differs from renewing the current bouquet at a special
account-specific renewal price, which is not implemented. See the official
[DStv](https://vtpass.com/documentation/dstv-subscription-api/) and
[GOtv](https://vtpass.com/documentation/gotv-subscription-api/) API documentation.

## Verification

Use a **disposable** PostgreSQL server and run:

```sh
SECURITY_TEST_DATABASE_URL=postgres://user:password@localhost/test_db \
  cargo test -p worldz-near-api -- --include-ignored
```

`subscription_http_lifecycle_and_fulfill_once` exercises real API handlers and
migrations in an isolated database schema, with an HTTP provider fixture. It
covers all four categories, quote conversion and reuse, authentication, invalid
packages, unpaid fulfillment rejection, encrypted-recipient submission,
pending/ambiguous-response recovery, repeat fulfillment and terminal-state
protection. The TV fixture checks the MultiChoice subscription fields.

The fixture supplies settlement evidence; it does not sign a real wallet
transaction or verify delivery by the external VTpass sandbox. Those require a
configured sandbox account and a testnet wallet. Do not treat fixture success as
live service delivery verification.

Cross-chain homepage promotion describes enabled mainnet checkout routes; it
does not enable cross-chain payments for bills and subscriptions.
