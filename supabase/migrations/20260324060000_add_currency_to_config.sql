-- Add default currency configuration for all restaurants
-- rollback: DELETE FROM config WHERE key IN ('currency_code', 'currency_symbol');

INSERT INTO config (restaurant_id, key, value)
SELECT id, 'currency_code', 'BDT'
FROM restaurants
ON CONFLICT (restaurant_id, key) DO NOTHING;

INSERT INTO config (restaurant_id, key, value)
SELECT id, 'currency_symbol', '৳'
FROM restaurants
ON CONFLICT (restaurant_id, key) DO NOTHING;
