ALTER TABLE orders DROP FOREIGN KEY orders_link_fk;
ALTER TABLE webhook_deliveries DROP FOREIGN KEY webhook_deliveries_event_fk;

ALTER TABLE payment_links
    MODIFY slug VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_cs NOT NULL;

ALTER TABLE orders
    MODIFY order_key CHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_cs NOT NULL,
    MODIFY transaction_hash VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_cs NULL,
    MODIFY settlement_receipt_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_cs NULL,
    MODIFY link_slug VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_cs NULL;

ALTER TABLE orders
    ADD CONSTRAINT orders_link_fk FOREIGN KEY (link_slug) REFERENCES payment_links (slug);

ALTER TABLE order_submissions
    MODIFY transaction_hash VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_cs NOT NULL;

ALTER TABLE payment_events
    MODIFY event_id VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_cs NOT NULL,
    MODIFY receipt_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_cs NOT NULL,
    MODIFY transaction_hash VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_cs NOT NULL;

ALTER TABLE webhook_deliveries
    MODIFY event_id VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_cs NOT NULL;

ALTER TABLE webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_event_fk FOREIGN KEY (event_id) REFERENCES payment_events (event_id) ON DELETE CASCADE;
