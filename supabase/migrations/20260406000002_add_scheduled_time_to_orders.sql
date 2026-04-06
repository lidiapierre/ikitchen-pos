-- Migration: Add scheduled_time to orders (issue #352)
--
-- Adds an optional scheduled_time column (timestamptz, nullable) to the orders table.
-- Used to capture the required Pickup Time (takeaway) or Delivery Time (delivery)
-- entered by staff when creating the order.
-- The column is nullable so existing dine-in orders are unaffected.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS scheduled_time TIMESTAMPTZ NULL;

COMMENT ON COLUMN orders.scheduled_time IS
  'Optional scheduled pickup or delivery time for takeaway/delivery orders (issue #352).';

-- Rollback: ALTER TABLE orders DROP COLUMN IF EXISTS scheduled_time;
