-- Migration: table merging & splitting (issue #274)
--
-- Allows staff to merge two or more tables into a single combined order,
-- and later split (un-merge) them back.
--
-- Rollback:
--   ALTER TABLE orders DROP COLUMN IF EXISTS merge_label;
--   ALTER TABLE tables DROP COLUMN IF EXISTS locked_by_order_id;

-- Add merge_label to orders.
-- Stored on the PRIMARY order of a merge (e.g. "Table 3 + Table 4").
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS merge_label text;

-- Add locked_by_order_id to tables.
-- Set on SECONDARY tables when merged; NULL when independent.
-- ON DELETE SET NULL so the lock is automatically released if the primary order is deleted.
ALTER TABLE tables
  ADD COLUMN IF NOT EXISTS locked_by_order_id uuid REFERENCES orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tables_locked_by_order_id ON tables(locked_by_order_id);
