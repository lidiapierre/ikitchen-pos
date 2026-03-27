-- Issue #253: Takeaway & delivery order types with table-free ordering
-- Adds order_type, customer_name, delivery_note columns to orders table.
-- table_id was already nullable — no change required.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_type text NOT NULL DEFAULT 'dine_in'
    CHECK (order_type IN ('dine_in', 'takeaway', 'delivery')),
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS delivery_note text;

-- Index to efficiently query active takeaway/delivery orders for the queue view
CREATE INDEX IF NOT EXISTS idx_orders_order_type
  ON orders(order_type)
  WHERE order_type IN ('takeaway', 'delivery');
