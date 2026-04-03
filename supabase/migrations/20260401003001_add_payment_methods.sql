-- Migration: extend payments.method check constraint to include mobile payments (bKash, Nagad, etc.)
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE payments ADD CONSTRAINT payments_method_check
  CHECK (method IN ('cash', 'card', 'mobile', 'other'));
