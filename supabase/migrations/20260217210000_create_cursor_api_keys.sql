-- =====================================================
-- Migration: Create cursor_api_keys table
-- Created: 2026-02-17T21:00:00.000Z
-- Tables: cursor_api_keys
-- Purpose: Store per-user Cursor API keys (encrypted)
--          for per-user quota isolation when running
--          cursor-agent during automated builds.
-- =====================================================

-- Enable UUID extension (idempotent)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABLE: cursor_api_keys
-- One row per user. Stores encrypted API key ciphertext.
-- The MCP worker reads this to inject CURSOR_API_KEY
-- into each cursor-agent process.
-- =====================================================
CREATE TABLE IF NOT EXISTS cursor_api_keys (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Encrypted Cursor API key (never store plaintext).
  -- Encrypt with Supabase Vault/pgsodium or app-level AES-GCM.
  api_key_ciphertext TEXT NOT NULL,

  -- Fingerprint for display/debugging (e.g. first 6 + last 4 chars).
  -- Safe to show in UI; not enough to reconstruct the key.
  key_fingerprint TEXT NOT NULL DEFAULT '',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Last time the key was actually used in a build
  last_used_at TIMESTAMPTZ,

  -- Soft-revoke: when set, the key is considered invalid
  revoked_at TIMESTAMPTZ
);

-- Helper: auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_cursor_api_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cursor_api_keys_updated_at ON cursor_api_keys;
CREATE TRIGGER trg_cursor_api_keys_updated_at
  BEFORE UPDATE ON cursor_api_keys
  FOR EACH ROW
  EXECUTE FUNCTION update_cursor_api_keys_updated_at();

-- =====================================================
-- RLS: users can only manage their own key
-- =====================================================
ALTER TABLE cursor_api_keys ENABLE ROW LEVEL SECURITY;

-- Select: user sees only their own row
CREATE POLICY cursor_api_keys_select_own
  ON cursor_api_keys
  FOR SELECT
  USING (auth.uid() = user_id);

-- Insert: user can only insert their own row
CREATE POLICY cursor_api_keys_insert_own
  ON cursor_api_keys
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Update: user can only update their own row
CREATE POLICY cursor_api_keys_update_own
  ON cursor_api_keys
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Delete: user can only delete their own row
CREATE POLICY cursor_api_keys_delete_own
  ON cursor_api_keys
  FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- VIEW: cursor_api_key_status (safe metadata for the app)
-- Returns whether a key is configured, its fingerprint,
-- and last-used timestamp — never the ciphertext.
-- =====================================================
CREATE OR REPLACE VIEW cursor_api_key_status AS
SELECT
  user_id,
  key_fingerprint,
  created_at,
  updated_at,
  last_used_at,
  revoked_at,
  CASE
    WHEN revoked_at IS NOT NULL THEN false
    WHEN api_key_ciphertext IS NOT NULL AND api_key_ciphertext <> '' THEN true
    ELSE false
  END AS has_key
FROM cursor_api_keys;
