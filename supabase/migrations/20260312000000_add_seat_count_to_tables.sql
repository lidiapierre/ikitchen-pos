-- Add seat_count column to tables so the admin screen can record seating capacity.
-- Rollback:
--   ALTER TABLE tables DROP COLUMN seat_count;
--   DROP POLICY "allow_anon_write" ON tables;

ALTER TABLE tables ADD COLUMN seat_count integer NOT NULL DEFAULT 0;

-- Allow the anon role to write to tables so the admin table-management screen
-- (which uses the publishable/anon key with no auth session) can perform CRUD.
-- HUMAN REVIEW REQUIRED: grants unauthenticated write access.
-- Replace with an authenticated admin-only policy before production rollout.
CREATE POLICY "allow_anon_write" ON tables
  FOR ALL TO anon USING (true) WITH CHECK (true);
