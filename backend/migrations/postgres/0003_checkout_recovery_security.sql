-- Existing deployment identities were registered on testnet; never infer ownership from a new network.
ALTER TABLE merchants ADD COLUMN auth_network_id VARCHAR(8) NOT NULL DEFAULT 'testnet' CHECK (auth_network_id IN ('testnet','mainnet'));
-- New checkout capabilities are never derived from public order identifiers.
ALTER TABLE orders ADD COLUMN edit_token_hash BYTEA;
ALTER TABLE orders ADD COLUMN reserved_until TIMESTAMPTZ;
ALTER TABLE order_submissions ADD COLUMN next_reconcile_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE order_submissions ADD COLUMN reconcile_complete BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX order_submissions_due_idx ON order_submissions (reconcile_complete, next_reconcile_at);
UPDATE orders SET reserved_until = to_timestamp(("authorization"->>'expiresAtSeconds')::double precision) WHERE state = 'OPEN';
-- The counter now means verified payments, rather than anonymous claim requests.
UPDATE payment_links l SET claims_used = (SELECT count(*) FROM orders o WHERE o.link_slug=l.slug AND o.state='SETTLED' AND o.settlement_receipt_id IS NOT NULL);
-- Invalidate sessions established before the authentication network boundary fix.
DELETE FROM merchant_sessions;

CREATE INDEX orders_link_reservation_idx ON orders (link_slug, state, reserved_until);
UPDATE payment_links SET max_redemptions=1 WHERE NOT multi_pay AND max_redemptions IS NULL;

CREATE INDEX auth_rate_limits_window_idx ON auth_rate_limits (window_started_at);

-- Historical multi-unit checkout links may contain the old single-unit charge.
ALTER TABLE shopify_checkout_sessions ADD COLUMN quantity_priced BOOLEAN NOT NULL DEFAULT FALSE;
