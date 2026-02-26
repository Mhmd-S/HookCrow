-- Migration 001: Auth + Profiles + Video Publishing
-- Run this AFTER the initial schema.sql has been applied

-- =========================================
-- PROFILES TABLE (linked to Supabase Auth)
-- =========================================

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Profile creation is handled by the server API (POST /api/auth/register)
-- No database trigger — keeps auth flow simple and debuggable

-- =========================================
-- NEW COLUMNS ON VIDEOS TABLE
-- =========================================

ALTER TABLE videos ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE videos ADD COLUMN is_published BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE videos ADD COLUMN title TEXT;
ALTER TABLE videos ADD COLUMN description TEXT;

-- Indexes for browse queries
CREATE INDEX idx_videos_published ON videos(is_published, updated_at DESC) WHERE is_published = true;
CREATE INDEX idx_videos_user_id ON videos(user_id);
CREATE INDEX idx_videos_semantic_tags ON videos USING GIN(semantic_tags);
