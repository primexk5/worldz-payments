CREATE TABLE vtpass_service_purchases (
    purchase_id VARCHAR(64) PRIMARY KEY,
    merchant_id VARCHAR(64) NOT NULL REFERENCES merchants (merchant_id) ON DELETE CASCADE,
    link_slug VARCHAR(32) NOT NULL UNIQUE REFERENCES payment_links (slug) ON DELETE CASCADE,
    category VARCHAR(32) NOT NULL,
    service_id VARCHAR(64) NOT NULL,
    variation_code VARCHAR(128),
    amount_ngn VARCHAR(32) NOT NULL,
    amount_usd VARCHAR(32) NOT NULL,
    quote_expires_at TIMESTAMPTZ NOT NULL,
    recipient_ciphertext BYTEA NOT NULL,
    recipient_nonce BYTEA NOT NULL CHECK (octet_length(recipient_nonce) = 12),
    request_id VARCHAR(80) UNIQUE,
    provider_transaction_id VARCHAR(128),
    state VARCHAR(32) NOT NULL DEFAULT 'AWAITING_PAYMENT',
    provider_response JSONB,
    failure_reason VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT vtpass_purchase_category_ck CHECK (category IN ('airtime','data','electricity','tv')),
    CONSTRAINT vtpass_purchase_state_ck CHECK (state IN ('AWAITING_PAYMENT','SUBMITTING','FULFILLMENT_PENDING','SUBMITTED','FULFILLED','FAILED','RECONCILIATION_REQUIRED')),
    CONSTRAINT vtpass_purchase_amounts_ck CHECK (amount_ngn ~ '^[0-9]+([.][0-9]{1,2})?$' AND amount_usd ~ '^[0-9]+([.][0-9]{1,6})?$')
);

CREATE INDEX vtpass_purchases_merchant_idx ON vtpass_service_purchases (merchant_id, created_at DESC);
