-- Basic stock / inventory tracking
-- Issue #170

-- ingredients: master list of ingredients per restaurant
CREATE TABLE IF NOT EXISTS ingredients (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id       UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  unit                TEXT NOT NULL CHECK (unit IN ('g', 'kg', 'L', 'ml', 'pcs')),
  current_stock       NUMERIC(12, 3) NOT NULL DEFAULT 0,
  low_stock_threshold NUMERIC(12, 3) NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read ingredients"
  ON ingredients FOR SELECT
  USING (true);

CREATE POLICY "Owners can manage ingredients"
  ON ingredients FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('owner', 'admin'))
  );

-- recipe_items: how much of each ingredient is used per portion of a menu item
CREATE TABLE IF NOT EXISTS recipe_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id    UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  ingredient_id   UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  quantity_used   NUMERIC(12, 3) NOT NULL CHECK (quantity_used > 0),
  UNIQUE (menu_item_id, ingredient_id)
);

ALTER TABLE recipe_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read recipe_items"
  ON recipe_items FOR SELECT
  USING (true);

CREATE POLICY "Owners can manage recipe_items"
  ON recipe_items FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('owner', 'admin'))
  );

-- stock_adjustments: audit trail for every stock change
CREATE TABLE IF NOT EXISTS stock_adjustments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  ingredient_id   UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  quantity_delta  NUMERIC(12, 3) NOT NULL,   -- positive = added, negative = deducted
  reason          TEXT NOT NULL CHECK (reason IN ('sale', 'delivery', 'wastage', 'manual')),
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE stock_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read stock_adjustments"
  ON stock_adjustments FOR SELECT
  USING (true);

CREATE POLICY "Owners can manage stock_adjustments"
  ON stock_adjustments FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('owner', 'admin'))
  );

-- Allow service role to insert stock adjustments (used by close_order edge fn)
CREATE POLICY "Service role can insert stock_adjustments"
  ON stock_adjustments FOR INSERT
  WITH CHECK (true);

-- Atomic decrement helper used by close_order edge function
CREATE OR REPLACE FUNCTION decrement_ingredient_stock(
  p_ingredient_id UUID,
  p_amount        NUMERIC
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE ingredients
  SET current_stock = current_stock - p_amount
  WHERE id = p_ingredient_id;
END;
$$;
