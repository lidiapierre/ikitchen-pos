-- Add seat_count column to tables so the admin screen can record seating capacity.
-- Writes are performed via the create_table / update_table / delete_table Edge Functions
-- using the service role key, which bypasses RLS — no additional write policy is needed.
-- Rollback:
--   ALTER TABLE tables DROP COLUMN seat_count;

ALTER TABLE tables ADD COLUMN seat_count integer NOT NULL DEFAULT 0;
