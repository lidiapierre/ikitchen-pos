-- #168 Discount on bill
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS discount_type TEXT CHECK (discount_type IN ('percent', 'flat')),
  ADD COLUMN IF NOT EXISTS discount_value NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS discount_amount_cents INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_applied_by UUID REFERENCES auth.users(id);
