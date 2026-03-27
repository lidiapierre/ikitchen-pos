-- API Keys table for public REST API access
-- Issue #224 — Public REST API for external system integrations
--
-- Rollback:
--   DROP TABLE IF EXISTS api_keys;

CREATE TABLE api_keys (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id   uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  label           text NOT NULL,
  key_hash        text NOT NULL UNIQUE,          -- SHA-256 hex of the actual key
  key_prefix      text NOT NULL,                 -- first 8 chars of actual key (display only)
  permissions     text NOT NULL DEFAULT 'read' CHECK (permissions IN ('read', 'write')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_used_at    timestamptz,
  revoked_at      timestamptz
);

CREATE INDEX idx_api_keys_restaurant_id ON api_keys(restaurant_id);
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Only authenticated users can manage api_keys (owner-level enforced in edge functions)
CREATE POLICY "allow_all_authenticated" ON api_keys
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Allow service_role full access (used by edge functions with service key)
CREATE POLICY "allow_service_role" ON api_keys
  FOR ALL TO service_role USING (true) WITH CHECK (true);
