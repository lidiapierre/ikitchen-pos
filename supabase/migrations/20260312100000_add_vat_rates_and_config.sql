-- Add vat_rates and config tables for the Pricing & VAT admin screen
--
-- vat_rates: named VAT rates optionally assigned to a menu category (menu_id).
-- config: key-value store for restaurant-level settings (e.g. tax_inclusive).
--
-- HUMAN REVIEW REQUIRED: these policies grant unauthenticated access.
-- They are appropriate for the current demo / development stage but must be
-- replaced with authenticated admin-only policies before production rollout.
--
-- Rollback:
--   DROP TABLE IF EXISTS config;
--   DROP TABLE IF EXISTS vat_rates;

-- vat_rates
CREATE TABLE vat_rates (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  label         text NOT NULL,
  percentage    numeric(5,2) NOT NULL,
  menu_id       uuid REFERENCES menus(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vat_rates_restaurant_id ON vat_rates(restaurant_id);
CREATE INDEX idx_vat_rates_menu_id ON vat_rates(menu_id);

ALTER TABLE vat_rates ENABLE ROW LEVEL SECURITY;

-- HUMAN REVIEW REQUIRED
CREATE POLICY "allow_all_authenticated" ON vat_rates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- HUMAN REVIEW REQUIRED: anon write for demo/dev stage
CREATE POLICY "allow_anon_all" ON vat_rates
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- config
CREATE TABLE config (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  key           text NOT NULL,
  value         text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(restaurant_id, key)
);

CREATE INDEX idx_config_restaurant_id ON config(restaurant_id);

ALTER TABLE config ENABLE ROW LEVEL SECURITY;

-- HUMAN REVIEW REQUIRED
CREATE POLICY "allow_all_authenticated" ON config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- HUMAN REVIEW REQUIRED: anon write for demo/dev stage
CREATE POLICY "allow_anon_all" ON config
  FOR ALL TO anon USING (true) WITH CHECK (true);
