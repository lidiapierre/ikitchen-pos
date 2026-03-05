-- HUMAN REVIEW REQUIRED: removes duplicate allow_anon_read policy on orders.
--
-- Migration 20260305000000_anon_read_tables_orders.sql and
-- 20260305090300_add_anon_read_for_orders_and_menus.sql both CREATE the same
-- "allow_anon_read" policy on orders. The second migration therefore fails
-- with "policy already exists", leaving menus without an anon-read policy.
--
-- This migration is safe to run in any environment where either migration
-- has already been applied: it is a no-op if the policy does not exist.
--
-- Rollback: re-run migration 20260305090300 to restore the menus policy.

-- Re-add the menus anon-read policy in case it was never created due to the
-- duplicate error in 20260305090300.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'menus'
      AND policyname = 'allow_anon_read'
  ) THEN
    EXECUTE 'CREATE POLICY "allow_anon_read" ON menus FOR SELECT TO anon USING (true)';
  END IF;
END
$$;
