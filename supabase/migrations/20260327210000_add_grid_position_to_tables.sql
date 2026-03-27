-- Add optional grid position columns to tables for the floor plan view.
-- NULL = auto-positioned by the frontend grid layout.
-- Non-null x/y = admin-configured position (future drag-and-drop in admin settings).

ALTER TABLE tables
  ADD COLUMN IF NOT EXISTS grid_x integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS grid_y integer DEFAULT NULL;

-- Rollback:
-- ALTER TABLE tables DROP COLUMN IF EXISTS grid_x;
-- ALTER TABLE tables DROP COLUMN IF EXISTS grid_y;
