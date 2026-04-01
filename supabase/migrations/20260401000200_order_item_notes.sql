-- Add notes column to order_items
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS notes TEXT;
-- Rollback: ALTER TABLE order_items DROP COLUMN IF EXISTS notes;
