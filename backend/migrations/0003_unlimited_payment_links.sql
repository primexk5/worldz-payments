ALTER TABLE payment_links DROP CHECK payment_links_redemptions_ck;

ALTER TABLE payment_links
    ADD CONSTRAINT payment_links_redemptions_ck CHECK (
        (multi_pay AND (max_redemptions IS NULL OR max_redemptions > 0)) OR
        (NOT multi_pay AND (max_redemptions IS NULL OR max_redemptions = 1))
    );
