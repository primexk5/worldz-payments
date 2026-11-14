CREATE TABLE webhook_receiver_receipts (
    event_id VARCHAR(255) COLLATE "C" PRIMARY KEY REFERENCES payment_events(event_id) ON DELETE CASCADE,
    merchant_id VARCHAR(64) NOT NULL REFERENCES merchants(merchant_id) ON DELETE CASCADE,
    raw_body_sha256 VARCHAR(64) NOT NULL,
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX webhook_receiver_receipts_merchant_idx ON webhook_receiver_receipts(merchant_id, accepted_at DESC);
