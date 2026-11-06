CREATE TABLE shopify_oauth_states (
    state CHAR(36) COLLATE "C" PRIMARY KEY,
    merchant_id VARCHAR(64) NOT NULL REFERENCES merchants (merchant_id) ON DELETE CASCADE,
    shop_domain VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX shopify_oauth_expiry_idx ON shopify_oauth_states (expires_at);

CREATE TABLE shopify_shops (
    shop_domain VARCHAR(255) PRIMARY KEY,
    merchant_id VARCHAR(64) NOT NULL REFERENCES merchants (merchant_id) ON DELETE CASCADE,
    access_token_ciphertext BYTEA NOT NULL,
    access_token_nonce BYTEA NOT NULL CHECK (octet_length(access_token_nonce) = 12),
    scopes VARCHAR(512) NOT NULL,
    installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX shopify_shops_merchant_idx ON shopify_shops (merchant_id);

CREATE TABLE shopify_checkout_sessions (
    slug VARCHAR(32) COLLATE "C" PRIMARY KEY REFERENCES payment_links (slug) ON DELETE CASCADE,
    shop_domain VARCHAR(255) NOT NULL REFERENCES shopify_shops (shop_domain) ON DELETE CASCADE,
    variant_id VARCHAR(32) COLLATE "C" NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 99),
    product_title VARCHAR(255) NOT NULL,
    variant_title VARCHAR(255) NOT NULL,
    unit_price VARCHAR(64) NOT NULL,
    currency_code CHAR(3) COLLATE "C" NOT NULL,
    requires_shipping BOOLEAN NOT NULL DEFAULT TRUE,
    buyer_data_ciphertext BYTEA,
    buyer_data_nonce BYTEA CHECK (buyer_data_nonce IS NULL OR octet_length(buyer_data_nonce) = 12),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((buyer_data_ciphertext IS NULL) = (buyer_data_nonce IS NULL))
);
CREATE INDEX shopify_checkout_shop_idx ON shopify_checkout_sessions (shop_domain, created_at DESC);

CREATE TABLE shopify_order_sync (
    slug VARCHAR(32) COLLATE "C" PRIMARY KEY REFERENCES shopify_checkout_sessions (slug) ON DELETE CASCADE,
    state VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'processing', 'delivered', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error VARCHAR(400),
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    shopify_order_id VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX shopify_sync_due_idx ON shopify_order_sync (state, next_attempt_at);
