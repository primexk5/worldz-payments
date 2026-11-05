CREATE TABLE merchants (
    merchant_id VARCHAR(64) NOT NULL,
    account_id VARCHAR(64) NOT NULL,
    payout_account_id VARCHAR(64) NOT NULL,
    display_name VARCHAR(80) NOT NULL,
    webhook_url TEXT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (merchant_id),
    UNIQUE KEY merchants_account_id_uq (account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE auth_challenges (
    account_id VARCHAR(64) NOT NULL,
    state VARCHAR(128) NOT NULL,
    network_id VARCHAR(8) NOT NULL,
    purpose VARCHAR(32) NOT NULL,
    message TEXT NOT NULL,
    nonce BINARY(32) NOT NULL,
    intent JSON NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    consumed_at DATETIME(6) NULL,
    PRIMARY KEY (account_id, state),
    KEY auth_challenges_expiry_idx (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE auth_rate_limits (
    subject VARCHAR(160) NOT NULL,
    window_started_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    attempts INT NOT NULL DEFAULT 0,
    PRIMARY KEY (subject)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE merchant_sessions (
    token_hash BINARY(32) NOT NULL,
    merchant_id VARCHAR(64) NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (token_hash),
    KEY merchant_sessions_expiry_idx (expires_at),
    CONSTRAINT merchant_sessions_merchant_fk FOREIGN KEY (merchant_id) REFERENCES merchants (merchant_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payment_links (
    slug VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    merchant_id VARCHAR(64) NOT NULL,
    network_id VARCHAR(8) NOT NULL,
    asset JSON NOT NULL,
    amount VARCHAR(39) NOT NULL,
    amount_display VARCHAR(64) NOT NULL,
    display_name VARCHAR(80) NOT NULL,
    expires_at DATETIME(6) NULL,
    multi_pay BOOLEAN NOT NULL DEFAULT false,
    max_redemptions INT NULL,
    claims_used INT NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (slug),
    KEY payment_links_merchant_idx (merchant_id, created_at),
    CONSTRAINT payment_links_merchant_fk FOREIGN KEY (merchant_id) REFERENCES merchants (merchant_id) ON DELETE CASCADE,
    CONSTRAINT payment_links_claims_ck CHECK (claims_used >= 0),
    CONSTRAINT payment_links_redemptions_ck CHECK (
        (multi_pay AND max_redemptions IS NOT NULL AND max_redemptions > 0) OR
        (NOT multi_pay AND (max_redemptions IS NULL OR max_redemptions = 1))
    ),
    CONSTRAINT payment_links_amount_ck CHECK (amount REGEXP '^[0-9]+$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE orders (
    order_id VARCHAR(64) NOT NULL,
    merchant_id VARCHAR(64) NOT NULL,
    payer_account_id VARCHAR(64) NOT NULL,
    network_id VARCHAR(8) NOT NULL,
    contract_id VARCHAR(64) NOT NULL,
    order_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    authorization JSON NOT NULL,
    asset JSON NOT NULL,
    amount VARCHAR(39) NOT NULL,
    fee VARCHAR(39) NOT NULL,
    net VARCHAR(39) NOT NULL,
    state VARCHAR(32) NOT NULL DEFAULT 'OPEN',
    transaction_hash VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    settlement_receipt_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    failure_reason VARCHAR(255) NULL,
    source VARCHAR(16) NOT NULL,
    link_slug VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
    merchant_reference VARCHAR(255) NULL,
    customer_name VARCHAR(255) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (network_id, contract_id, order_id),
    UNIQUE KEY orders_replay_uq (network_id, contract_id, order_key),
    KEY orders_merchant_idx (merchant_id, created_at),
    KEY orders_tx_idx (network_id, transaction_hash),
    CONSTRAINT orders_merchant_fk FOREIGN KEY (merchant_id) REFERENCES merchants (merchant_id),
    CONSTRAINT orders_link_fk FOREIGN KEY (link_slug) REFERENCES payment_links (slug),
    CONSTRAINT orders_amount_ck CHECK (amount REGEXP '^[0-9]+$'),
    CONSTRAINT orders_fee_ck CHECK (fee REGEXP '^[0-9]+$'),
    CONSTRAINT orders_net_ck CHECK (net REGEXP '^[0-9]+$'),
    CONSTRAINT orders_source_ck CHECK (source IN ('link', 'checkout', 'gateway'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE order_submissions (
    network_id VARCHAR(8) NOT NULL,
    contract_id VARCHAR(64) NOT NULL,
    order_id VARCHAR(64) NOT NULL,
    transaction_hash VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    signer_account_id VARCHAR(64) NOT NULL,
    submitted_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (network_id, contract_id, order_id, transaction_hash),
    KEY order_submissions_pending_idx (submitted_at),
    CONSTRAINT order_submissions_order_fk FOREIGN KEY (network_id, contract_id, order_id)
        REFERENCES orders (network_id, contract_id, order_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE near_indexer_cursors (
    network_id VARCHAR(8) NOT NULL,
    contract_id VARCHAR(64) NOT NULL,
    block_height BIGINT NOT NULL,
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (network_id, contract_id),
    CONSTRAINT near_indexer_height_ck CHECK (block_height >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payment_events (
    event_id VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    network_id VARCHAR(8) NOT NULL,
    contract_id VARCHAR(64) NOT NULL,
    receipt_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    transaction_hash VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    order_id VARCHAR(64) NOT NULL,
    merchant_id VARCHAR(64) NOT NULL,
    payload JSON NOT NULL,
    finalized BOOLEAN NOT NULL DEFAULT false,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (event_id),
    UNIQUE KEY payment_events_receipt_uq (network_id, contract_id, receipt_id, event_id),
    KEY payment_events_merchant_idx (merchant_id, created_at),
    CONSTRAINT payment_events_merchant_fk FOREIGN KEY (merchant_id) REFERENCES merchants (merchant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE webhook_deliveries (
    delivery_id BINARY(16) NOT NULL,
    event_id VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    merchant_id VARCHAR(64) NOT NULL,
    state VARCHAR(16) NOT NULL DEFAULT 'pending',
    attempts INT NOT NULL DEFAULT 0,
    last_error VARCHAR(400) NULL,
    next_attempt_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    delivered_at DATETIME(6) NULL,
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (delivery_id),
    UNIQUE KEY webhook_deliveries_event_merchant_uq (event_id, merchant_id),
    KEY webhook_deliveries_due_idx (state, next_attempt_at),
    CONSTRAINT webhook_deliveries_event_fk FOREIGN KEY (event_id) REFERENCES payment_events (event_id) ON DELETE CASCADE,
    CONSTRAINT webhook_deliveries_merchant_fk FOREIGN KEY (merchant_id) REFERENCES merchants (merchant_id) ON DELETE CASCADE,
    CONSTRAINT webhook_deliveries_state_ck CHECK (state IN ('pending', 'delivered', 'failed', 'skipped'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE merchant_api_keys (
    key_ref VARCHAR(64) NOT NULL,
    merchant_id VARCHAR(64) NOT NULL,
    secret_hash BINARY(32) NOT NULL,
    label VARCHAR(64) NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    last_used_at DATETIME(6) NULL,
    revoked_at DATETIME(6) NULL,
    PRIMARY KEY (key_ref),
    UNIQUE KEY merchant_api_keys_secret_uq (secret_hash),
    KEY merchant_api_keys_merchant_idx (merchant_id),
    CONSTRAINT merchant_api_keys_merchant_fk FOREIGN KEY (merchant_id) REFERENCES merchants (merchant_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
