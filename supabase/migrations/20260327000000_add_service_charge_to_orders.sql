-- #229 Optional service charge on bill
-- Stores the service charge amount calculated at time of order close
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS service_charge_cents INTEGER DEFAULT 0;
