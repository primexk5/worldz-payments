-- Demo merchant and payment links for exercising cross-chain pay-in in mock
-- mode (ONECLICK_ENABLED=true, ONECLICK_MODE=mock). The receive asset matches
-- the 1Click mock token fixture (wrap.near NEP-141 intents asset).
-- Run against the same PostgreSQL database the backend uses:
--   psql "$DATABASE_URL" -f scripts/seed-demo.sql
-- Idempotent: re-running replaces the demo rows.

BEGIN;

INSERT INTO merchants (merchant_id, account_id, payout_account_id, display_name)
VALUES ('demo', 'worldz-demo.testnet', 'worldz-demo.testnet', 'Worldz Demo Merchant')
ON CONFLICT (merchant_id) DO UPDATE
SET account_id = EXCLUDED.account_id,
    payout_account_id = EXCLUDED.payout_account_id,
    display_name = EXCLUDED.display_name;

INSERT INTO payment_links (slug, merchant_id, network_id, asset, amount, amount_display, display_name, multi_pay)
VALUES
  ('demo-cc', 'demo', 'testnet',
   '{"type":"nep141","contractId":"wrap.near","symbol":"WNEAR","decimals":24}',
   '1000000000000000000000000', '1', 'Demo: pay from another chain', TRUE),
  ('demo-cc-once', 'demo', 'testnet',
   '{"type":"nep141","contractId":"wrap.near","symbol":"WNEAR","decimals":24}',
   '250000000000000000000000', '0.25', 'Demo: single-use cross-chain payment', FALSE)
ON CONFLICT (slug) DO UPDATE
SET merchant_id = EXCLUDED.merchant_id,
    network_id = EXCLUDED.network_id,
    asset = EXCLUDED.asset,
    amount = EXCLUDED.amount,
    amount_display = EXCLUDED.amount_display,
    display_name = EXCLUDED.display_name,
    multi_pay = EXCLUDED.multi_pay,
    active = TRUE,
    expires_at = NULL;

COMMIT;
