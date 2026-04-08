-- Migration: add tendered_amount_cents to payments for cash reconciliation (issue #351)
--
-- tendered_amount_cents records the physical amount handed over by the customer.
-- For cash payments this may exceed amount_cents (the bill portion) when change is given.
-- For card/mobile payments it equals amount_cents (no change involved).
-- Nullable for backward-compat; existing rows are backfilled to amount_cents as best-effort.
--
-- Rollback: ALTER TABLE payments DROP COLUMN IF EXISTS tendered_amount_cents;

ALTER TABLE payments ADD COLUMN tendered_amount_cents integer;

-- Backfill existing rows: we don't know historical tendered vs bill split,
-- so default to amount_cents (no change given — safe conservative assumption).
UPDATE payments SET tendered_amount_cents = amount_cents WHERE tendered_amount_cents IS NULL;
