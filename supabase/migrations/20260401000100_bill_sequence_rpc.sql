-- Issue #261: Atomic bill sequence RPC
-- next_bill_sequence(p_restaurant_id) — atomically increments and returns the next bill number.
-- Uses INSERT ... ON CONFLICT DO UPDATE to ensure atomicity without a separate lock.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS next_bill_sequence(uuid);

CREATE OR REPLACE FUNCTION next_bill_sequence(p_restaurant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_next integer;
BEGIN
  INSERT INTO bill_sequences (restaurant_id, last_value)
  VALUES (p_restaurant_id, 1)
  ON CONFLICT (restaurant_id) DO UPDATE
    SET last_value = bill_sequences.last_value + 1
  RETURNING last_value INTO v_next;

  RETURN v_next;
END;
$$;

-- Grant execute to anon and authenticated (matches existing pattern)
GRANT EXECUTE ON FUNCTION next_bill_sequence(uuid) TO anon, authenticated;
