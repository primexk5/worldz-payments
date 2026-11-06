CREATE TABLE merchants (
    merchant_id VARCHAR(64) PRIMARY KEY,
    account_id VARCHAR(64) NOT NULL UNIQUE,
    payout_account_id VARCHAR(64) NOT NULL,
    display_name VARCHAR(80) NOT NULL,
    webhook_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE auth_challenges (
    account_id VARCHAR(64) NOT NULL,
    state VARCHAR(128) NOT NULL,
    network_id VARCHAR(8) NOT NULL,
    purpose VARCHAR(32) NOT NULL,
    message TEXT NOT NULL,
    nonce BYTEA NOT NULL CHECK (octet_length(nonce) = 32),
    intent JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    PRIMARY KEY (account_id, state)
);
CREATE INDEX auth_challenges_expiry_idx ON auth_challenges (expires_at);

CREATE TABLE auth_rate_limits (
    subject VARCHAR(160) PRIMARY KEY,
    window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    attempts INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE merchant_sessions (
    token_hash BYTEA PRIMARY KEY CHECK (octet_length(token_hash) = 32),
    merchant_id VARCHAR(64) NOT NULL REFERENCES merchants (merchant_id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX merchant_sessions_expiry_idx ON merchant_sessions (expires_at);

CREATE TABLE payment_links (
    slug VARCHAR(32) COLLATE "C" PRIMARY KEY,
    merchant_id VARCHAR(64) NOT NULL REFERENCES merchants (merchant_id) ON DELETE CASCADE,
    network_id VARCHAR(8) NOT NULL,
    asset JSONB NOT NULL,
    amount VARCHAR(39) NOT NULL,
    amount_display VARCHAR(64) NOT NULL,
    display_name VARCHAR(80) NOT NULL,
    expires_at TIMESTAMPTZ,
    multi_pay BOOLEAN NOT NULL DEFAULT FALSE,
    max_redemptions INTEGER,
    claims_used INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT payment_links_claims_ck CHECK (claims_used >= 0),
    CONSTRAINT payment_links_redemptions_ck CHECK (
        (multi_pay AND (max_redemptions IS NULL OR max_redemptions > 0)) OR
        (NOT multi_pay AND (max_redemptions IS NULL OR max_redemptions = 1))
    ),
    CONSTRAINT payment_links_amount_ck CHECK (amount ~ '^[0-9]+$')
);
CREATE INDEX payment_links_merchant_idx ON payment_links (merchant_id, created_at DESC);

CREATE TABLE orders (
    order_id VARCHAR(64) NOT NULL,
    merchant_id VARCHAR(64) NOT NULL REFERENCES merchants (merchant_id),
    payer_account_id VARCHAR(64) NOT NULL,
    network_id VARCHAR(8) NOT NULL,
    contract_id VARCHAR(64) NOT NULL,
    order_key CHAR(64) COLLATE "C" NOT NULL,
    "authorization" JSONB NOT NULL,
    asset JSONB NOT NULL,
    amount VARCHAR(39) NOT NULL,
    fee VARCHAR(39) NOT NULL,
    net VARCHAR(39) NOT NULL,
    state VARCHAR(32) NOT NULL DEFAULT 'OPEN',
    transaction_hash VARCHAR(64) COLLATE "C",
    settlement_receipt_id VARCHAR(64) COLLATE "C",
    failure_reason VARCHAR(255),
    source VARCHAR(16) NOT NULL,
    link_slug VARCHAR(32) COLLATE "C" REFERENCES payment_links (slug),
    merchant_reference VARCHAR(255),
    customer_name VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (network_id, contract_id, order_id),
    CONSTRAINT orders_replay_uq UNIQUE (network_id, contract_id, order_key),
    CONSTRAINT orders_amount_ck CHECK (amount ~ '^[0-9]+$'),
    CONSTRAINT orders_fee_ck CHECK (fee ~ '^[0-9]+$'),
    CONSTRAINT orders_net_ck CHECK (net ~ '^[0-9]+$'),
    CONSTRAINT orders_source_ck CHECK (source IN ('link', 'checkout', 'gateway'))
);
CREATE INDEX orders_merchant_idx ON orders (merchant_id, created_at DESC);
CREATE INDEX orders_tx_idx ON orders (network_id, transaction_hash);

CREATE TABLE order_submissions (
    network_id VARCHAR(8) NOT NULL,
    contract_id VARCHAR(64) NOT NULL,
    order_id VARCHAR(64) NOT NULL,
    transaction_hash VARCHAR(64) COLLATE "C" NOT NULL,
    signer_account_id VARCHAR(64) NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (network_id, contract_id, order_id, transaction_hash),
    FOREIGN KEY (network_id, contract_id, order_id)
        REFERENCES orders (network_id, contract_id, order_id) ON DELETE CASCADE
);
CREATE INDEX order_submissions_pending_idx ON order_submissions (submitted_at);

CREATE TABLE near_indexer_cursors (
    network_id VARCHAR(8) NOT NULL,
    contract_id VARCHAR(64) NOT NULL,
    block_height BIGINT NOT NULL CHECK (block_height >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (network_id, contract_id)
);

CREATE TABLE payment_events (
    event_id VARCHAR(255) COLLATE "C" PRIMARY KEY,
    network_id VARCHAR(8) NOT NULL,
    contract_id VARCHAR(64) NOT NULL,
    receipt_id VARCHAR(64) COLLATE "C" NOT NULL,
    transaction_hash VARCHAR(64) COLLATE "C" NOT NULL,
    order_id VARCHAR(64) NOT NULL,
    merchant_id VARCHAR(64) NOT NULL REFERENCES merchants (merchant_id),
    payload JSONB NOT NULL,
    finalized BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT payment_events_receipt_uq UNIQUE (network_id, contract_id, receipt_id, event_id)
);
CREATE INDEX payment_events_merchant_idx ON payment_events (merchant_id, created_at DESC);

CREATE TABLE webhook_deliveries (
    delivery_id UUID PRIMARY KEY,
    event_id VARCHAR(255) COLLATE "C" NOT NULL REFERENCES payment_events (event_id) ON DELETE CASCADE,
    merchant_id VARCHAR(64) NOT NULL REFERENCES merchants (merchant_id) ON DELETE CASCADE,
    state VARCHAR(16) NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error VARCHAR(400),
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT webhook_deliveries_event_merchant_uq UNIQUE (event_id, merchant_id),
    CONSTRAINT webhook_deliveries_state_ck CHECK (state IN ('pending', 'delivered', 'failed', 'skipped'))
);
CREATE INDEX webhook_deliveries_due_idx ON webhook_deliveries (state, next_attempt_at);

CREATE TABLE merchant_api_keys (
    key_ref VARCHAR(64) PRIMARY KEY,
    merchant_id VARCHAR(64) NOT NULL REFERENCES merchants (merchant_id) ON DELETE CASCADE,
    secret_hash BYTEA NOT NULL UNIQUE CHECK (octet_length(secret_hash) = 32),
    label VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);
CREATE INDEX merchant_api_keys_merchant_idx ON merchant_api_keys (merchant_id);
