-- Migration: Sequential numeric order numbers (issue #349)
--
-- Each order gets a short human-readable number (e.g. #001) that resets daily
-- per restaurant.  UUIDs remain the internal primary key.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_set_order_number ON orders;
--   DROP FUNCTION IF EXISTS set_order_number();
--   DROP FUNCTION IF EXISTS next_daily_order_number(UUID, DATE);
--   DROP TABLE IF EXISTS daily_order_counters;
--   ALTER TABLE orders DROP COLUMN IF EXISTS order_number;

-- 1. Per-restaurant, per-day counter table
CREATE TABLE IF NOT EXISTS daily_order_counters (
  restaurant_id UUID    NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  counter_date  DATE    NOT NULL,
  last_number   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (restaurant_id, counter_date)
);

-- Row-level security: staff can only read their own restaurant's counters
ALTER TABLE daily_order_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "restaurant_isolation"
  ON daily_order_counters FOR ALL
  TO authenticated
  USING (restaurant_id = public.get_user_restaurant_id())
  WITH CHECK (restaurant_id = public.get_user_restaurant_id());

-- 2. Add order_number column to orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_number INTEGER;

CREATE INDEX IF NOT EXISTS idx_orders_order_number
  ON orders (restaurant_id, order_number, created_at);

-- 3. Atomic increment function (SECURITY DEFINER so trigger can write counters)
CREATE OR REPLACE FUNCTION next_daily_order_number(
  p_restaurant_id UUID,
  p_date          DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_next INTEGER;
BEGIN
  INSERT INTO daily_order_counters (restaurant_id, counter_date, last_number)
  VALUES (p_restaurant_id, p_date, 1)
  ON CONFLICT (restaurant_id, counter_date) DO UPDATE
    SET last_number = daily_order_counters.last_number + 1
  RETURNING last_number INTO v_next;

  RETURN v_next;
END;
$$;

-- 4. Trigger function: assign order_number on INSERT when restaurant_id is known
CREATE OR REPLACE FUNCTION set_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only assign when restaurant_id is set and order_number not already provided
  IF NEW.restaurant_id IS NOT NULL AND NEW.order_number IS NULL THEN
    NEW.order_number := next_daily_order_number(
      NEW.restaurant_id,
      COALESCE(CAST(NEW.created_at AS DATE), CURRENT_DATE)
    );
  END IF;
  RETURN NEW;
END;
$$;

-- 5. Attach trigger
DROP TRIGGER IF EXISTS trg_set_order_number ON orders;

CREATE TRIGGER trg_set_order_number
  BEFORE INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION set_order_number();
