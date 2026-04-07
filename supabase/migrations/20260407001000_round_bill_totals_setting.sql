-- Migration: add round_bill_totals restaurant config setting (issue #371)
--
-- Inserts the setting as 'true' for all existing restaurants so that
-- Lahore by iKitchen (and any other restaurant already provisioned) gets
-- whole-number bill display enabled by default.
--
-- New restaurants receive this value via provision_restaurant (also updated in
-- this migration's PR). The ON CONFLICT DO NOTHING guard below ensures this
-- migration is idempotent.

INSERT INTO config (restaurant_id, key, value)
SELECT id, 'round_bill_totals', 'true'
FROM restaurants
ON CONFLICT (restaurant_id, key) DO NOTHING;

-- Rollback: DELETE FROM config WHERE key = 'round_bill_totals';
