-- Allow the anon role to perform write operations (INSERT, UPDATE, DELETE) on
-- menus, menu_items, and modifiers so that the admin menu management screen
-- (which uses the publishable/anon key with no auth session) can perform CRUD.
--
-- HUMAN REVIEW REQUIRED: these policies grant unauthenticated write access.
-- They are appropriate for the current demo / development stage where there
-- is no login flow, but must be replaced with authenticated admin-only policies
-- before production rollout.
--
-- Rollback:
--   DROP POLICY "allow_anon_write" ON menus;
--   DROP POLICY "allow_anon_write" ON menu_items;
--   DROP POLICY "allow_anon_write" ON modifiers;

CREATE POLICY "allow_anon_write" ON menus
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "allow_anon_write" ON menu_items
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "allow_anon_write" ON modifiers
  FOR ALL TO anon USING (true) WITH CHECK (true);
