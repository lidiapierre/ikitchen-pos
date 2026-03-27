-- Multi-printer routing: printers table + printer_type on menus
-- Issue #187

-- Create printers table for named printer profiles per restaurant
CREATE TABLE IF NOT EXISTS printers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  ip_address      TEXT NOT NULL,
  port            INTEGER NOT NULL DEFAULT 9100,
  type            TEXT NOT NULL CHECK (type IN ('kitchen', 'cashier', 'bar')),
  enabled         BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE printers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read printers"
  ON printers FOR SELECT
  USING (true);

CREATE POLICY "Owners can manage printers"
  ON printers FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('owner', 'admin'))
  );

-- Add printer_type to menus (menus serve as categories in this system)
-- Allows per-menu routing: e.g. a "Bar" menu routes KOT to the bar printer
ALTER TABLE menus
  ADD COLUMN IF NOT EXISTS printer_type TEXT NOT NULL DEFAULT 'kitchen'
  CHECK (printer_type IN ('kitchen', 'cashier', 'bar'));
