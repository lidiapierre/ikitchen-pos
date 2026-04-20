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
-- Rollback:
--   DELETE FROM vat_rates
--   WHERE label = 'Standard'
--     AND menu_id IS NULL
--     AND id IN (
--       -- re-identify rows inserted by this migration
--       SELECT vr.id FROM vat_rates vr
--       JOIN config c ON c.restaurant_id = vr.restaurant_id
--       WHERE c.key = 'vat_percentage'
--         AND c.value::numeric > 0
--     );

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
  );
