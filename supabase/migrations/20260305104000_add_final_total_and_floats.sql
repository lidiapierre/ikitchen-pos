-- Add final_total_cents to orders so close_order can persist the calculated total
-- Add opening_float_cents/closing_float_cents to shifts for float tracking
ALTER TABLE orders ADD COLUMN final_total_cents integer;
ALTER TABLE shifts ADD COLUMN opening_float_cents integer;
ALTER TABLE shifts ADD COLUMN closing_float_cents integer;

-- Rollback:
-- ALTER TABLE orders DROP COLUMN final_total_cents;
-- ALTER TABLE shifts DROP COLUMN opening_float_cents;
-- ALTER TABLE shifts DROP COLUMN closing_float_cents;
