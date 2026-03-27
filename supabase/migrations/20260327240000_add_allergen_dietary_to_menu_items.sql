-- Add allergen and dietary info columns to menu_items
-- Backward compatible: existing items default to empty arrays / 'none'

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS allergens text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS dietary_badges text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS spicy_level text NOT NULL DEFAULT 'none';

-- Ensure spicy_level only accepts valid values
ALTER TABLE menu_items
  ADD CONSTRAINT menu_items_spicy_level_check
    CHECK (spicy_level IN ('none', 'mild', 'medium', 'hot'));
