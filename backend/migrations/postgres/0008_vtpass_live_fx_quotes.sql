CREATE TABLE vtpass_fx_quotes (
    quote_id VARCHAR(64) PRIMARY KEY,
    amount_ngn VARCHAR(32) NOT NULL,
    amount_usd VARCHAR(32) NOT NULL,
    rate_ngn_per_usd VARCHAR(32) NOT NULL,
    token_decimals SMALLINT NOT NULL CHECK (token_decimals BETWEEN 0 AND 24),
    token_amount_base_units VARCHAR(39) NOT NULL,
    fx_source VARCHAR(128) NOT NULL,
    fx_source_updated_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT vtpass_fx_quote_amounts_ck CHECK (
        amount_ngn ~ '^[0-9]+([.][0-9]{1,2})?$'
        AND amount_usd ~ '^[0-9]+([.][0-9]{1,6})?$'
        AND rate_ngn_per_usd ~ '^[0-9]+([.][0-9]{1,6})?$'
        AND token_amount_base_units ~ '^[0-9]+$'
    )
);

CREATE INDEX vtpass_fx_quotes_expiry_idx ON vtpass_fx_quotes (expires_at);

ALTER TABLE vtpass_service_purchases
    ADD COLUMN quote_id VARCHAR(64) UNIQUE REFERENCES vtpass_fx_quotes (quote_id),
    ADD COLUMN rate_ngn_per_usd VARCHAR(32),
    ADD COLUMN fx_source VARCHAR(128),
    ADD COLUMN fx_source_updated_at TIMESTAMPTZ;
