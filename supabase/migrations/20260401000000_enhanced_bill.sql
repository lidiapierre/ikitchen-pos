-- Issue #261: Enhanced bill/receipt format
--
-- 1. bill_sequences — atomic sequential bill counter per restaurant.
-- 2. orders.bill_number — formatted reference generated on close_order (e.g. RN0001234).
-- 3. orders.customer_mobile — optional mobile number for delivery/takeaway orders.
--
-- Config keys added via application upsert (no DDL):
--   bin_number       — VAT registration number displayed on bill
--   register_name    — terminal/device identifier displayed on bill
--   restaurant_address — physical address displayed below restaurant name on bill
--
-- Rollback:
--   DROP TABLE IF EXISTS bill_sequences;
--   ALTER TABLE orders DROP COLUMN IF EXISTS bill_number;
--   ALTER TABLE orders DROP COLUMN IF EXISTS customer_mobile;

-- Atomic bill sequence counter per restaurant
CREATE TABLE IF NOT EXISTS bill_sequences (
  restaurant_id uuid PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
  last_value    integer NOT NULL DEFAULT 0
);

ALTER TABLE bill_sequences ENABLE ROW LEVEL SECURITY;

-- Authenticated users (server role via service key) can read/update sequences
CREATE POLICY "allow_all_authenticated" ON bill_sequences
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Anon access for dev/demo (matches pattern used by config, vat_rates)
-- HUMAN REVIEW REQUIRED
CREATE POLICY "allow_anon_all" ON bill_sequences
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- bill_number stored on order after generation
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS bill_number text,
  ADD COLUMN IF NOT EXISTS customer_mobile text;

-- Index for fast lookup by bill_number (e.g. reprint)
CREATE INDEX IF NOT EXISTS idx_orders_bill_number ON orders(bill_number) WHERE bill_number IS NOT NULL;
