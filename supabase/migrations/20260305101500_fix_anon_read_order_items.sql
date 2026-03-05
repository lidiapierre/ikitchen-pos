-- HUMAN REVIEW REQUIRED: ensures unauthenticated read access on order_items.
--
-- The allow_anon_read policy on order_items was created in
-- 20260305084600_add_anon_read_for_order_items.sql, but that migration may
-- not have been applied to production, causing the View Order page to show
-- "No items yet" even after items are successfully added.
--
-- This migration is idempotent: it is a no-op if the policy already exists.
--
-- Rollback: DROP POLICY IF EXISTS "allow_anon_read" ON order_items;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'order_items'
      AND policyname = 'allow_anon_read'
  ) THEN
    EXECUTE 'CREATE POLICY "allow_anon_read" ON order_items FOR SELECT TO anon USING (true)';
  END IF;
END
$$;
