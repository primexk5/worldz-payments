ALTER TABLE vtpass_fx_quotes
    ADD COLUMN payment_asset JSONB,
    ADD COLUMN token_usd_price VARCHAR(32),
    ADD COLUMN token_price_source VARCHAR(128),
    ADD COLUMN token_price_updated_at TIMESTAMPTZ;

ALTER TABLE vtpass_service_purchases
    ADD COLUMN token_usd_price VARCHAR(32),
    ADD COLUMN token_price_source VARCHAR(128),
    ADD COLUMN token_price_updated_at TIMESTAMPTZ;
