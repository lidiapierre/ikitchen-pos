-- HUMAN REVIEW REQUIRED
-- Grants anon SELECT on shifts so the ShiftsClient (which uses the anon key)
-- can query the current open shift. Writes remain restricted to authenticated users.
CREATE POLICY "allow_anon_read" ON shifts
  FOR SELECT TO anon USING (true);
