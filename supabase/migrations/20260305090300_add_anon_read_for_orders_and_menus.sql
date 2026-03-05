-- Rollback: DROP POLICY "allow_anon_read" ON orders;
--           DROP POLICY "allow_anon_read" ON menus;
--
-- Allow the anon role to read orders and menus so that the
-- Add Items screen (which uses the publishable/anon key with no auth session)
-- can look up the restaurant_id from an order and then fetch its menus.
--
-- fetchMenuCategories in menuData.ts queries orders first to resolve
-- restaurant_id, then queries menus joined with menu_items.
-- menu_items is already covered by migration 20260305084600.
--
-- HUMAN REVIEW REQUIRED: these policies grant unauthenticated read access.
-- They are appropriate for the current demo / development stage where there
-- is no login flow, but should be tightened before a production rollout.

CREATE POLICY "allow_anon_read" ON orders
  FOR SELECT TO anon USING (true);

CREATE POLICY "allow_anon_read" ON menus
  FOR SELECT TO anon USING (true);
