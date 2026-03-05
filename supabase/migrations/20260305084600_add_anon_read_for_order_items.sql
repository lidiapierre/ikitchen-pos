-- Allow the anon role to read order_items and menu_items so that the
-- frontend (which uses the publishable/anon key with no auth session) can
-- display order contents on the "View Order" screen.
--
-- The existing "allow_all_authenticated" policies cover writes from
-- authenticated sessions.  Writes from the Action API use the service-role
-- key and bypass RLS entirely, so no additional write policy is needed here.
--
-- HUMAN REVIEW REQUIRED: these policies grant unauthenticated read access.
-- They are appropriate for the current demo / development stage where there
-- is no login flow, but should be tightened before a production rollout.

CREATE POLICY "allow_anon_read" ON order_items
  FOR SELECT TO anon USING (true);

CREATE POLICY "allow_anon_read" ON menu_items
  FOR SELECT TO anon USING (true);
