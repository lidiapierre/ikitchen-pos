-- Migration: link reservations → customers, link orders → reservations (issue #277)

-- Part 1: Add customer_id FK to reservations
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS reservations_customer_id_idx ON reservations(customer_id);

-- Part 2: Add reservation_id FK to orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_reservation_id_idx ON orders(reservation_id);
