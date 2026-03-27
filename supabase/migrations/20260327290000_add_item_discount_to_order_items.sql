-- #254 Per-item discounts on order_items
-- item_discount_type: 'percent' | 'fixed' | NULL
-- item_discount_value:
--   for 'percent' → percent * 100  (e.g. 10% → 1000)
--   for 'fixed'   → amount in cents (e.g. ৳50 → 5000)
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS item_discount_type TEXT CHECK (item_discount_type IN ('percent', 'fixed')),
  ADD COLUMN IF NOT EXISTS item_discount_value INTEGER;
