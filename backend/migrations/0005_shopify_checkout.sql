CREATE TABLE shopify_checkout_sessions (
    slug VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_cs NOT NULL,
    shop_domain VARCHAR(255) NOT NULL,
    variant_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    quantity INT UNSIGNED NOT NULL,
    product_title VARCHAR(255) NOT NULL,
    variant_title VARCHAR(255) NOT NULL,
    unit_price VARCHAR(64) NOT NULL,
    currency_code CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (slug),
    KEY shopify_checkout_shop_idx (shop_domain, created_at),
    CONSTRAINT shopify_checkout_link_fk FOREIGN KEY (slug) REFERENCES payment_links (slug) ON DELETE CASCADE,
    CONSTRAINT shopify_checkout_shop_fk FOREIGN KEY (shop_domain) REFERENCES shopify_shops (shop_domain) ON DELETE CASCADE,
    CONSTRAINT shopify_checkout_quantity_ck CHECK (quantity BETWEEN 1 AND 99)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE shopify_order_sync (
    slug VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_cs NOT NULL,
    state VARCHAR(16) NOT NULL DEFAULT 'pending',
    attempts INT NOT NULL DEFAULT 0,
    last_error VARCHAR(400) NULL,
    next_attempt_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    shopify_order_id VARCHAR(64) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (slug),
    KEY shopify_sync_due_idx (state, next_attempt_at),
    CONSTRAINT shopify_sync_checkout_fk FOREIGN KEY (slug) REFERENCES shopify_checkout_sessions (slug) ON DELETE CASCADE,
    CONSTRAINT shopify_sync_state_ck CHECK (state IN ('pending', 'processing', 'delivered', 'failed'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
