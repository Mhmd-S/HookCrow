-- Video Anatomizer Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Logic Flows table (the skeleton types like PAS, Listicle, etc.)
CREATE TABLE logic_flows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Videos table (the main content container)
CREATE TABLE videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_handle TEXT,
  platform TEXT CHECK (platform IN ('TikTok', 'Instagram', 'YouTube Shorts')),
  source_url TEXT,
  video_path TEXT NOT NULL,
  duration_seconds INTEGER,
  logic_flow_id UUID REFERENCES logic_flows(id) ON DELETE SET NULL,
  script_raw TEXT,
  script_blueprint TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'complete')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Segments table (Hook, Bridge, Value, CTA sections)
CREATE TABLE segments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  segment_order INTEGER NOT NULL,
  label TEXT NOT NULL,
  start_time FLOAT NOT NULL,
  end_time FLOAT NOT NULL,
  transcript_raw TEXT,
  script_blueprint TEXT,
  visual_notes TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_time_range CHECK (end_time > start_time)
);

-- Create index for faster segment lookups
CREATE INDEX idx_segments_video_id ON segments(video_id);
CREATE INDEX idx_segments_order ON segments(video_id, segment_order);

-- Updated at trigger for videos
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER videos_updated_at
  BEFORE UPDATE ON videos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Seed logic flows with common video structures
INSERT INTO logic_flows (name, description) VALUES
  ('PAS (Problem-Agitation-Solution)', 'Identifies a pain point, intensifies the frustration, and introduces the product as the hero.'),
  ('Us vs. Them', 'Contrasts the old way with a new, better approach or product.'),
  ('Listicle / Top N', 'Presents content as a numbered list of tips, products, or ideas.'),
  ('Mythbuster', 'Debunks a common misconception and provides the correct information.'),
  ('Before/After', 'Shows transformation by contrasting the before and after states.'),
  ('Tutorial / How-To', 'Step-by-step instructional content teaching a specific skill or process.'),
  ('Story Arc', 'Narrative-driven content with a beginning, middle, and end.'),
  ('Testimonial', 'Features customer or user experiences and social proof.');

-- Enable Row Level Security (service_role bypasses RLS)
ALTER TABLE logic_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE segments ENABLE ROW LEVEL SECURITY;

-- No policies = no access for anon/authenticated
-- service_role key bypasses RLS automatically
-- This ensures all access must go through the server API

-- Create storage bucket for videos (run this separately in Supabase Dashboard > Storage)
-- Or use the Supabase client to create it programmatically

-- ===========================================
-- MIGRATION: Add status column (run if upgrading existing database)
-- ===========================================
-- ALTER TABLE videos ADD COLUMN status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'complete'));
