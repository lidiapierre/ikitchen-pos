-- HUMAN REVIEW REQUIRED
-- Adds anon SELECT policy on payments so the shift close summary
-- can query revenue totals from the frontend using the anon key.
-- Pattern is consistent with orders, order_items, and menu_items.
-- Writes and mutations remain restricted to authenticated users only.
CREATE POLICY "allow_anon_read" ON payments
  FOR SELECT TO anon USING (true);
