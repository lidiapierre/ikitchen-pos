-- Allow anonymous reads on tables and orders for the demo/preview environment
-- HUMAN REVIEW REQUIRED: These policies permit unauthenticated reads.
-- Replace with auth-scoped policies once Supabase Auth is implemented.

-- Rollback: DROP POLICY "allow_anon_read" ON tables;
--           DROP POLICY "allow_anon_read" ON orders;

CREATE POLICY "allow_anon_read" ON tables
  FOR SELECT TO anon USING (true);

CREATE POLICY "allow_anon_read" ON orders
  FOR SELECT TO anon USING (true);
