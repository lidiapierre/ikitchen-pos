-- Add unique constraint on vat_rates(restaurant_id, menu_id)
--
-- Follows 20260420000001_backfill_vat_rates_from_config.sql.
-- Required for two reasons:
--   1. PostgREST's `Prefer: resolution=ignore-duplicates` header is a no-op
--      without a corresponding unique constraint — provision_restaurant relied
--      on this header to prevent duplicate Standard rows, but it wasn't working.
--   2. Without this constraint the NOT EXISTS guard in the backfill was checking
--      for any vat_rates row (not just a catch-all menu_id IS NULL row). Re-running
--      the backfill with ON CONFLICT now correctly handles the edge case where a
--      restaurant has menu-specific rates but no catch-all row.
--
-- NULLS NOT DISTINCT: treats NULL == NULL so (restaurant_id, NULL) is unique.
-- This is PostgreSQL 15+ syntax (Supabase uses PG 15+).
--
-- Rollback:
--   ALTER TABLE vat_rates DROP CONSTRAINT IF EXISTS uq_vat_rates_restaurant_menu;

ALTER TABLE vat_rates
  ADD CONSTRAINT uq_vat_rates_restaurant_menu
  UNIQUE NULLS NOT DISTINCT (restaurant_id, menu_id);

-- Re-run backfill with tightened NOT EXISTS guard (menu_id IS NULL scoped)
-- and ON CONFLICT guard. This is idempotent — existing rows are skipped.
INSERT INTO vat_rates (restaurant_id, label, percentage, menu_id)
SELECT
  c.restaurant_id,
  'Standard'            AS label,
  c.value::numeric(5,2) AS percentage,
  NULL                  AS menu_id
FROM config c
WHERE c.key        = 'vat_percentage'
  AND c.value::numeric > 0
  AND NOT EXISTS (
    SELECT 1
    FROM   vat_rates v
    WHERE  v.restaurant_id = c.restaurant_id
      AND  v.menu_id IS NULL
  )
ON CONFLICT ON CONSTRAINT uq_vat_rates_restaurant_menu DO NOTHING;
