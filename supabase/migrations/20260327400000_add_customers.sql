-- Migration: add customers table for CRM / repeat customer tracking (issue #172)

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  mobile TEXT NOT NULL,
  name TEXT,
  notes TEXT,
  visit_count INT NOT NULL DEFAULT 0,
  total_spend_cents BIGINT NOT NULL DEFAULT 0,
  last_visit_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, mobile)
);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "restaurant staff can manage customers"
  ON customers FOR ALL
  USING (restaurant_id IN (SELECT restaurant_id FROM users WHERE id = auth.uid()));

-- RPC: atomically upsert a customer visit (insert or increment)
CREATE OR REPLACE FUNCTION upsert_customer_visit(
  p_restaurant_id UUID,
  p_mobile TEXT,
  p_name TEXT DEFAULT NULL,
  p_spend_cents BIGINT DEFAULT 0
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO customers (restaurant_id, mobile, name, visit_count, total_spend_cents, last_visit_at)
  VALUES (p_restaurant_id, p_mobile, p_name, 1, p_spend_cents, now())
  ON CONFLICT (restaurant_id, mobile) DO UPDATE
    SET visit_count = customers.visit_count + 1,
        total_spend_cents = customers.total_spend_cents + EXCLUDED.total_spend_cents,
        last_visit_at = now(),
        name = COALESCE(EXCLUDED.name, customers.name);
END;
$$;
