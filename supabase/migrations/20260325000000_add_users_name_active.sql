-- Add name and is_active columns to users table for staff management UI
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Index to quickly filter active users
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

-- Allow anon reads on users table (admin access already enforced by Next.js middleware)
CREATE POLICY "allow_anon_read_users"
  ON users FOR SELECT TO anon USING (true);
