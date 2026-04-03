-- Migration: link reservations → customers, link orders → reservations (issue #277)
--
-- Rollback:
--   DROP INDEX IF EXISTS idx_orders_reservation_id;
--   ALTER TABLE orders DROP COLUMN IF EXISTS reservation_id;
--   DROP INDEX IF EXISTS idx_reservations_customer_id;
--   ALTER TABLE reservations DROP COLUMN IF EXISTS customer_id;

-- Part 1: Add customer_id FK to reservations
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_customer_id ON reservations(customer_id);

-- Part 2: Add reservation_id FK to orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_reservation_id ON orders(reservation_id);
