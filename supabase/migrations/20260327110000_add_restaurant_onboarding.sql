-- Restaurant onboarding: add slug + timezone to restaurants, is_super_admin to users
-- Related: issue #195 — admin-provisioned restaurant accounts
--
-- Rollback:
--   ALTER TABLE restaurants DROP COLUMN IF EXISTS slug;
--   ALTER TABLE restaurants DROP COLUMN IF EXISTS timezone;
--   ALTER TABLE users DROP COLUMN IF EXISTS is_super_admin;

-- restaurants: add slug (unique, URL-safe identifier) and timezone
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS slug text UNIQUE,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Dhaka';

CREATE INDEX IF NOT EXISTS idx_restaurants_slug ON restaurants(slug);

-- users: super-admin flag — separate from per-restaurant owner/manager roles
-- Only iKitchen ops accounts should have this set to true.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;
