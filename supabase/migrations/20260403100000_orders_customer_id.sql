-- Migration: add customer_id FK to orders, update upsert_customer_visit to return UUID (issue #276)
--
-- Rollback:
--   DROP INDEX IF EXISTS idx_orders_customer_id;
--   ALTER TABLE orders DROP COLUMN IF EXISTS customer_id;
--   Restore upsert_customer_visit to RETURNS VOID.

-- Part 1: Add customer_id FK to orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);

-- Part 2: Replace upsert_customer_visit to return the customer's UUID
-- (so close_order can immediately PATCH orders.customer_id)
CREATE OR REPLACE FUNCTION upsert_customer_visit(
  p_restaurant_id UUID,
  p_mobile TEXT,
  p_name TEXT DEFAULT NULL,
  p_spend_cents BIGINT DEFAULT 0
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_customer_id UUID;
BEGIN
  INSERT INTO customers (restaurant_id, mobile, name, visit_count, total_spend_cents, last_visit_at)
  VALUES (p_restaurant_id, p_mobile, p_name, 1, p_spend_cents, now())
  ON CONFLICT (restaurant_id, mobile) DO UPDATE
    SET visit_count       = customers.visit_count + 1,
        total_spend_cents = customers.total_spend_cents + EXCLUDED.total_spend_cents,
        last_visit_at     = now(),
        name              = COALESCE(EXCLUDED.name, customers.name)
  RETURNING id INTO v_customer_id;

  RETURN v_customer_id;
END;
$$;
