-- Add modifier_ids array to order_items to store selected modifiers per order item.
-- Also adds anon read policy for modifiers so the frontend (using the publishable
-- anon key) can fetch available modifiers for a menu item.
--
-- HUMAN REVIEW REQUIRED: grants unauthenticated read access to modifiers.
-- Appropriate for the current demo / development stage; tighten before production.

ALTER TABLE order_items
  ADD COLUMN modifier_ids uuid[] NOT NULL DEFAULT '{}';

-- Allow the anon role to read modifiers (mirrors the pattern used for menu_items).
CREATE POLICY "allow_anon_read" ON modifiers
  FOR SELECT TO anon USING (true);
