-- Add vat_cents to orders so close_order can persist the calculated VAT amount.
-- Mirrors the existing service_charge_cents column pattern.
-- Issue #146 — Apply VAT rates in payment total and bill (regression fix).

ALTER TABLE orders ADD COLUMN IF NOT EXISTS vat_cents INTEGER DEFAULT 0;

-- Rollback: ALTER TABLE orders DROP COLUMN vat_cents;
