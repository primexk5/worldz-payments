CREATE TABLE shopify_oauth_states (
    state CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    merchant_id VARCHAR(64) NOT NULL,
    shop_domain VARCHAR(255) NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    PRIMARY KEY (state),
    KEY shopify_oauth_expiry_idx (expires_at),
    CONSTRAINT shopify_oauth_merchant_fk FOREIGN KEY (merchant_id) REFERENCES merchants (merchant_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE shopify_shops (
    shop_domain VARCHAR(255) NOT NULL,
    merchant_id VARCHAR(64) NOT NULL,
    access_token_ciphertext VARBINARY(512) NOT NULL,
    access_token_nonce BINARY(12) NOT NULL,
    scopes VARCHAR(512) NOT NULL,
    installed_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (shop_domain),
    KEY shopify_shops_merchant_idx (merchant_id),
    CONSTRAINT shopify_shops_merchant_fk FOREIGN KEY (merchant_id) REFERENCES merchants (merchant_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
