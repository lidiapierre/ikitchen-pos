-- #181 Kitchen Display Screen (KDS)
-- Adds kitchen_done_at to orders (mark order as kitchen-complete)
-- and a kds_settings table for PIN + refresh interval per restaurant.
--
-- Rollback:
--   ALTER TABLE orders DROP COLUMN IF EXISTS kitchen_done_at;
--   DROP TABLE IF EXISTS kds_settings;

-- orders: track when kitchen marked an order as done
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS kitchen_done_at timestamptz;

-- kds_settings: per-restaurant KDS configuration
CREATE TABLE IF NOT EXISTS kds_settings (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id            uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  pin_enabled              boolean NOT NULL DEFAULT false,
  pin                      text,            -- 4-digit PIN; NULL when pin_enabled = false
  refresh_interval_seconds integer NOT NULL DEFAULT 15,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id)
);

ALTER TABLE kds_settings ENABLE ROW LEVEL SECURITY;

-- KDS devices read settings anonymously (needed for PIN check on /kitchen page)
CREATE POLICY "anon_read_kds_settings"
  ON kds_settings FOR SELECT TO anon, authenticated
  USING (true);

-- Only authenticated owners/managers can write settings
CREATE POLICY "staff_write_kds_settings"
  ON kds_settings FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND role IN ('owner', 'manager', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND role IN ('owner', 'manager', 'admin')
    )
  );
