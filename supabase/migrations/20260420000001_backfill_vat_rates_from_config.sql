-- Backfill vat_rates from config.vat_percentage
--
-- Issue: provision_restaurant seeds VAT into config (key=vat_percentage) but
-- fetchVatConfig reads from the vat_rates table (added later in migration
-- 20260312100000_add_vat_rates_and_config.sql). Restaurants provisioned before
-- that migration have their VAT stored only in config.vat_percentage and have
-- no row in vat_rates, causing fetchVatConfig to always return vatPercent: 0.
--
-- This migration backfills one "Standard" vat_rates row for every restaurant
-- that has vat_percentage > 0 in config but no existing vat_rates row.
--
-- Also adds a UNIQUE constraint on (restaurant_id, menu_id) so that:
--   a) duplicate Standard rows can't be inserted,
--   b) PostgREST's `Prefer: resolution=ignore-duplicates` is honoured when
--      provision_restaurant inserts the initial vat_rates row.
--
-- Rollback:
--   ALTER TABLE vat_rates DROP CONSTRAINT IF EXISTS uq_vat_rates_restaurant_menu;
--   DELETE FROM vat_rates
--   WHERE label = 'Standard'
--     AND menu_id IS NULL
--     AND restaurant_id IN (
--       SELECT restaurant_id FROM config
--       WHERE key = 'vat_percentage' AND value::numeric > 0
--     );

-- 1. Add unique constraint so (restaurant_id, menu_id) pairs are unique.
--    NULL == NULL is treated as equal by this constraint (PostgreSQL NULLS NOT DISTINCT).
ALTER TABLE vat_rates
  ADD CONSTRAINT uq_vat_rates_restaurant_menu
  UNIQUE NULLS NOT DISTINCT (restaurant_id, menu_id);

-- 2. Backfill: insert a 'Standard' catch-all row for restaurants that have
--    vat_percentage > 0 in config but no restaurant-level (menu_id IS NULL) row.
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
      AND  v.menu_id IS NULL          -- only skip if a catch-all row already exists
  )
ON CONFLICT ON CONSTRAINT uq_vat_rates_restaurant_menu DO NOTHING;
