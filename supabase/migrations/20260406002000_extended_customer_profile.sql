-- Migration: extended customer profile fields (issue #356)
-- Adds: date_of_birth, email, delivery_address, loyalty_points, membership_status
--
-- Rollback:
--   ALTER TABLE customers
--     DROP COLUMN IF EXISTS date_of_birth,
--     DROP COLUMN IF EXISTS email,
--     DROP COLUMN IF EXISTS delivery_address,
--     DROP COLUMN IF EXISTS loyalty_points,
--     DROP COLUMN IF EXISTS membership_status;
--   DROP FUNCTION IF EXISTS award_loyalty_points(UUID, INTEGER);

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS delivery_address TEXT,
  ADD COLUMN IF NOT EXISTS loyalty_points INTEGER NOT NULL DEFAULT 0 CHECK (loyalty_points >= 0),
  ADD COLUMN IF NOT EXISTS membership_status TEXT NOT NULL DEFAULT 'regular'
    CHECK (membership_status IN ('regular', 'silver', 'gold'));

-- RPC: atomically award loyalty points to a customer and auto-upgrade membership status.
-- Thresholds: regular → silver (≥100 pts) → gold (≥500 pts)
CREATE OR REPLACE FUNCTION award_loyalty_points(
  p_customer_id UUID,
  p_points INTEGER
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_points INTEGER;
  v_new_status TEXT;
BEGIN
  UPDATE customers
  SET loyalty_points = loyalty_points + p_points
  WHERE id = p_customer_id
  RETURNING loyalty_points INTO v_new_points;

  IF v_new_points IS NULL THEN
    RETURN; -- customer not found; silently exit
  END IF;

  IF v_new_points >= 500 THEN
    v_new_status := 'gold';
  ELSIF v_new_points >= 100 THEN
    v_new_status := 'silver';
  ELSE
    v_new_status := 'regular';
  END IF;

  UPDATE customers
  SET membership_status = v_new_status
  WHERE id = p_customer_id;
END;
$$;

-- Restrict direct RPC invocation to service_role only.
-- The function is called exclusively from the record_payment edge function
-- which runs with the service role key.
REVOKE EXECUTE ON FUNCTION award_loyalty_points(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION award_loyalty_points(UUID, INTEGER) TO service_role;
