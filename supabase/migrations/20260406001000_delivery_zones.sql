-- Migration: Delivery charge zones (issue #353)
--
-- Adds a `delivery_zones` table for configurable delivery fees by area/zone.
-- Admins create zones (e.g. "Zone A – 50 BDT") in admin settings.
-- Staff select a zone when creating a delivery order; the charge is recorded
-- as `delivery_charge` on the order and printed as a line item on the receipt.

-- ── delivery_zones table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_zones (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  UUID        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name           TEXT        NOT NULL,
  charge_amount  INTEGER     NOT NULL DEFAULT 0,  -- in cents (BDT paise)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  delivery_zones IS 'Configurable delivery fee zones per restaurant (issue #353).';
COMMENT ON COLUMN delivery_zones.charge_amount IS 'Delivery fee in cents (e.g. 5000 = ৳50.00).';

-- Index for fast lookup by restaurant
CREATE INDEX IF NOT EXISTS idx_delivery_zones_restaurant_id
  ON delivery_zones(restaurant_id);

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;

-- Allow restaurant members to read their own zones
CREATE POLICY delivery_zones_select ON delivery_zones
  FOR SELECT
  USING (
    restaurant_id IN (
      SELECT restaurant_id FROM users WHERE id = auth.uid()
    )
  );

-- Only owners/managers can insert/update/delete
CREATE POLICY delivery_zones_insert ON delivery_zones
  FOR INSERT
  WITH CHECK (
    restaurant_id IN (
      SELECT restaurant_id FROM users
      WHERE id = auth.uid()
        AND role IN ('owner', 'manager')
    )
  );

CREATE POLICY delivery_zones_update ON delivery_zones
  FOR UPDATE
  USING (
    restaurant_id IN (
      SELECT restaurant_id FROM users
      WHERE id = auth.uid()
        AND role IN ('owner', 'manager')
    )
  );

CREATE POLICY delivery_zones_delete ON delivery_zones
  FOR DELETE
  USING (
    restaurant_id IN (
      SELECT restaurant_id FROM users
      WHERE id = auth.uid()
        AND role IN ('owner', 'manager')
    )
  );

-- ── Add columns to orders ───────────────────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_zone_id UUID REFERENCES delivery_zones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_charge  INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN orders.delivery_zone_id IS 'Selected delivery zone for this delivery order (issue #353).';
COMMENT ON COLUMN orders.delivery_charge  IS 'Delivery charge in cents at time of order (issue #353). Snapshot so zone changes do not affect historical orders.';

-- Rollback (order matters — FK must be dropped before the referenced table):
--   ALTER TABLE orders DROP COLUMN IF EXISTS delivery_zone_id;
--   ALTER TABLE orders DROP COLUMN IF EXISTS delivery_charge;
--   DROP TABLE IF EXISTS delivery_zones;
