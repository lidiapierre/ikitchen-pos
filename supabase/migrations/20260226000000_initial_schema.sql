-- Initial schema for iKitchen POS
-- HUMAN REVIEW REQUIRED: RLS policies are permissive stubs for early development

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- restaurants
CREATE TABLE restaurants (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
-- HUMAN REVIEW REQUIRED
CREATE POLICY "allow_all_authenticated" ON restaurants
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- roles
CREATE TABLE roles (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
-- HUMAN REVIEW REQUIRED
CREATE POLICY "allow_all_authenticated" ON roles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- users
CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id   uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  email           text NOT NULL UNIQUE,
  role            text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_restaurant_id ON users(restaurant_id);
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- HUMAN REVIEW REQUIRED
CREATE POLICY "allow_all_authenticated" ON users
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- tables
CREATE TABLE tables (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id   uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  label           text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tables_restaurant_id ON tables(restaurant_id);
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
-- HUMAN REVIEW REQUIRED
CREATE POLICY "allow_all_authenticated" ON tables
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- menus
CREATE TABLE menus (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id   uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name            text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_menus_restaurant_id ON menus(restaurant_id);
ALTER TABLE menus ENABLE ROW LEVEL SECURITY;
-- HUMAN REVIEW REQUIRED
CREATE POLICY "allow_all_authenticated" ON menus
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- menu_items
CREATE TABLE menu_items (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  menu_id         uuid NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
  name            text NOT NULL,
  price_cents     integer NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_menu_items_menu_id ON menu_items(menu_id);
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
-- HUMAN REVIEW REQUIRED
CREATE POLICY "allow_all_authenticated" ON menu_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- modifiers
CREATE TABLE modifiers (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  menu_item_id        uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name                text NOT NULL,
  price_delta_cents   integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_modifiers_menu_item_id ON modifiers(menu_item_id);
ALTER TABLE modifiers ENABLE ROW LEVEL SECURITY;
-- HUMAN REVIEW REQUIRED
CREATE POLICY "allow_all_authenticated" ON modifiers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- orders
CREATE TABLE orders (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id   uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  table_id        uuid REFERENCES tables(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_restaurant_id ON orders(restaurant_id);
CREATE INDEX idx_orders_table_id ON orders(table_id);
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
-- HUMAN REVIEW REQUIRED
CREATE POLICY "allow_all_authenticated" ON orders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- order_items
CREATE TABLE order_items (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id            uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id        uuid NOT NULL REFERENCES menu_items(id),
  quantity            integer NOT NULL DEFAULT 1,
  unit_price_cents    integer NOT NULL,
  voided              boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
-- HUMAN REVIEW REQUIRED
CREATE POLICY "allow_all_authenticated" ON order_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- payments
CREATE TABLE payments (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id        uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  method          text NOT NULL CHECK (method IN ('cash', 'card', 'other')),
  amount_cents    integer NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_order_id ON payments(order_id);
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
-- HUMAN REVIEW REQUIRED
CREATE POLICY "allow_all_authenticated" ON payments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- shifts
CREATE TABLE shifts (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id   uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opened_at       timestamptz NOT NULL DEFAULT now(),
  closed_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_shifts_restaurant_id ON shifts(restaurant_id);
CREATE INDEX idx_shifts_user_id ON shifts(user_id);
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
-- HUMAN REVIEW REQUIRED
CREATE POLICY "allow_all_authenticated" ON shifts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- audit_log (append-only)
-- HUMAN REVIEW REQUIRED: audit log insert policy intentionally allows no updates/deletes
CREATE TABLE audit_log (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id   uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL,
  action          text NOT NULL,
  entity_type     text NOT NULL,
  entity_id       uuid NOT NULL,
  payload         jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_log_restaurant_id ON audit_log(restaurant_id);
CREATE INDEX idx_audit_log_entity_id ON audit_log(entity_id);
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
-- HUMAN REVIEW REQUIRED: audit_log allows insert only — no update or delete
CREATE POLICY "allow_insert_authenticated" ON audit_log
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "allow_select_authenticated" ON audit_log
  FOR SELECT TO authenticated USING (true);
