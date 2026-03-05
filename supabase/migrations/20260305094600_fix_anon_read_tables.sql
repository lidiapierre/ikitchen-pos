-- HUMAN REVIEW REQUIRED: ensures unauthenticated read access on tables.
--
-- The allow_anon_read policy on tables was created in
-- 20260305000000_anon_read_tables_orders.sql, but a series of failing
-- migrations (20260305090300 duplicate orders policy) may have left the
-- live database without this policy, causing /tables to return [] for
-- anonymous callers even when rows exist.
--
-- This migration is idempotent: it is a no-op if the policy already exists.
--
-- Rollback: DROP POLICY IF EXISTS "allow_anon_read" ON tables;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'tables'
      AND policyname = 'allow_anon_read'
  ) THEN
    EXECUTE 'CREATE POLICY "allow_anon_read" ON tables FOR SELECT TO anon USING (true)';
  END IF;
END
$$;
