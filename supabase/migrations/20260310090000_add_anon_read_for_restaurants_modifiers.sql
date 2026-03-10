-- Allow the anon role to read restaurants and modifiers so that the
-- admin menu management screen (which uses the publishable/anon key with
-- no auth session) can:
--   - resolve the restaurant_id needed to create new menus
--   - load modifier data nested inside menu_items queries
--
-- HUMAN REVIEW REQUIRED: these policies grant unauthenticated read access.
-- They are appropriate for the current demo / development stage where there
-- is no login flow, but should be tightened before a production rollout.
--
-- Rollback: DROP POLICY "allow_anon_read" ON restaurants;
--           DROP POLICY "allow_anon_read" ON modifiers;

CREATE POLICY "allow_anon_read" ON restaurants
  FOR SELECT TO anon USING (true);

CREATE POLICY "allow_anon_read" ON modifiers
  FOR SELECT TO anon USING (true);
