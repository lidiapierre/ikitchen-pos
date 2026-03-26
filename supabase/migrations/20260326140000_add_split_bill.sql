-- Migration: Add split bill support (seat assignment + covers count)
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS seat INTEGER;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS covers INTEGER DEFAULT 1;
