-- Multi-location / multi-branch support
-- Issue #179
--
-- Changes:
--   1. Add branch_name to restaurants (for labelling individual branches)
--   2. Add parent_restaurant_id to restaurants (to group branches under a brand)
--   3. Add user_restaurants junction table for many-to-many user-branch access
--
-- Rollback:
--   DROP TABLE IF EXISTS user_restaurants;
--   ALTER TABLE restaurants DROP COLUMN IF EXISTS branch_name;
--   ALTER TABLE restaurants DROP COLUMN IF EXISTS parent_restaurant_id;

-- 1. Branch label column (e.g. "Gulshan Branch", "Dhanmondi Branch")
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS branch_name TEXT;

-- 2. Parent restaurant pointer — allows grouping multiple branches under one brand
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS parent_restaurant_id UUID REFERENCES restaurants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_restaurants_parent_id ON restaurants(parent_restaurant_id);

-- 3. Many-to-many: which users can access which restaurants, with what role
CREATE TABLE IF NOT EXISTS user_restaurants (
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'staff'
                  CHECK (role IN ('owner', 'manager', 'staff')),
  PRIMARY KEY (user_id, restaurant_id)
);

ALTER TABLE user_restaurants ENABLE ROW LEVEL SECURITY;

-- Users can see their own access rows
CREATE POLICY "users can see their own restaurant access"
  ON user_restaurants FOR SELECT
  USING (user_id = auth.uid());

-- Super-admins (is_super_admin = true in users table) can manage all access rows
CREATE POLICY "super admins can manage all restaurant access"
  ON user_restaurants FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.is_super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.is_super_admin = true
    )
  );
