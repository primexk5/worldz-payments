ALTER TABLE orders ADD COLUMN pay_method VARCHAR(16) NOT NULL DEFAULT 'native_near';
ALTER TABLE orders DROP CONSTRAINT orders_source_ck;
ALTER TABLE orders ADD CONSTRAINT orders_source_ck CHECK (source IN ('link','checkout','gateway','1click'));
ALTER TABLE orders ADD CONSTRAINT orders_pay_method_ck CHECK (pay_method IN ('native_near','cross_chain'));

CREATE TABLE one_click_attempts (
    attempt_id VARCHAR(64) PRIMARY KEY,
    network_id VARCHAR(8) NOT NULL,
    contract_id VARCHAR(64) NOT NULL,
    order_id VARCHAR(64) NOT NULL,
    merchant_id VARCHAR(64) NOT NULL,
    link_slug VARCHAR(32) NOT NULL,
    origin_asset VARCHAR(128) NOT NULL,
    destination_asset VARCHAR(128) NOT NULL,
    amount_out VARCHAR(39) NOT NULL,
    amount_in VARCHAR(39),
    slippage_bps INT NOT NULL,
    refund_to VARCHAR(255) NOT NULL,
    refund_chain VARCHAR(32) NOT NULL,
    deposit_address VARCHAR(255) UNIQUE,
    deposit_memo VARCHAR(255),
    deadline TIMESTAMPTZ NOT NULL,
    tx_hash VARCHAR(255),
    status VARCHAR(32) NOT NULL DEFAULT 'AWAITING_DEPOSIT',
    provider_response JSONB,
    failure_reason VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT one_click_attempts_order_fk FOREIGN KEY (network_id, contract_id, order_id) REFERENCES orders (network_id, contract_id, order_id) ON DELETE CASCADE,
    CONSTRAINT one_click_attempts_status_ck CHECK (status IN ('AWAITING_DEPOSIT','PENDING_DEPOSIT','PROCESSING','SETTLED','REFUNDED','FAILED','INCOMPLETE_DEPOSIT','EXPIRED','RECONCILIATION_REQUIRED')),
    CONSTRAINT one_click_attempts_amounts_ck CHECK (amount_out ~ '^[0-9]+$' AND (amount_in IS NULL OR amount_in ~ '^[0-9]+$')),
    CONSTRAINT one_click_attempts_slippage_ck CHECK (slippage_bps >= 0 AND slippage_bps <= 1000)
);

CREATE INDEX one_click_attempts_open_idx ON one_click_attempts (status, deadline);
