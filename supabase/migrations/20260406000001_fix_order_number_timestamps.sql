-- Migration: Fix daily_order_counters — add timestamps, update functions (issue #349 follow-up)
--
-- Addresses review feedback:
--   • Add created_at / updated_at to daily_order_counters (required by repo convention)
--   • Update next_daily_order_number() to also update updated_at on counter increment
--   • Simplify set_order_number() trigger: use CURRENT_DATE directly (NEW.created_at
--     is always NULL in a BEFORE INSERT trigger before DEFAULTs are applied)

ALTER TABLE daily_order_counters
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- HUMAN REVIEW REQUIRED: SECURITY DEFINER function — runs with elevated privileges
-- Needed so the BEFORE INSERT trigger can write to daily_order_counters regardless
-- of the calling user's row-level security context.
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
    SET last_number = daily_order_counters.last_number + 1,
        updated_at  = now()
  RETURNING last_number INTO v_next;

  RETURN v_next;
END;
$$;

-- HUMAN REVIEW REQUIRED: SECURITY DEFINER trigger function — runs with elevated privileges
-- Needed so the trigger can call next_daily_order_number() during INSERT, before RLS
-- is evaluated on the new row.
CREATE OR REPLACE FUNCTION set_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only assign when restaurant_id is set and order_number not already provided.
  -- Use CURRENT_DATE directly: in a BEFORE INSERT trigger, column DEFAULTs (incl.
  -- created_at) have not been applied yet, so NEW.created_at is always NULL here.
  IF NEW.restaurant_id IS NOT NULL AND NEW.order_number IS NULL THEN
    NEW.order_number := next_daily_order_number(NEW.restaurant_id, CURRENT_DATE);
  END IF;
  RETURN NEW;
END;
$$;
