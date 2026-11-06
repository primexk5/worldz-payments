ALTER TABLE shopify_checkout_sessions
    ADD COLUMN requires_shipping BOOLEAN NOT NULL DEFAULT true AFTER currency_code,
    ADD COLUMN buyer_data_ciphertext VARBINARY(2048) NULL AFTER requires_shipping,
    ADD COLUMN buyer_data_nonce BINARY(12) NULL AFTER buyer_data_ciphertext;
