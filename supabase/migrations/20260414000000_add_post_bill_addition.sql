-- Add post-bill addition tracking (issue #394)
-- post_bill_addition: marks individual order items added after the bill was generated.
-- post_bill_mode: flags an order that has been reopened for post-bill additions,
--   so that add_item_to_order can automatically mark new items as post_bill_addition.

ALTER TABLE order_items ADD COLUMN post_bill_addition boolean NOT NULL DEFAULT false;

ALTER TABLE orders ADD COLUMN post_bill_mode boolean NOT NULL DEFAULT false;

-- Rollback:
-- ALTER TABLE order_items DROP COLUMN post_bill_addition;
-- ALTER TABLE orders DROP COLUMN post_bill_mode;
