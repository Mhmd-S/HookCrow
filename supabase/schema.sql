-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.logic_flows (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL UNIQUE,
  description text,
  template_markdown text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT logic_flows_pkey PRIMARY KEY (id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  email text NOT NULL,
  display_name text,
  role text NOT NULL DEFAULT 'user'::text CHECK (role = ANY (ARRAY['admin'::text, 'user'::text])),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.segments (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  video_id uuid NOT NULL,
  segment_order integer NOT NULL,
  label text NOT NULL,
  start_time double precision NOT NULL,
  end_time double precision NOT NULL,
  transcript_raw text,
  script_blueprint text,
  visual_notes text,
  tags ARRAY,
  audio_metadata jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT segments_pkey PRIMARY KEY (id),
  CONSTRAINT segments_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id)
);
CREATE TABLE public.videos (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  creator_handle text,
  platform text CHECK (platform = ANY (ARRAY['TikTok'::text, 'Instagram'::text, 'YouTube Shorts'::text])),
  source_url text,
  video_path text NOT NULL,
  duration_seconds integer,
  logic_flow_id uuid,
  script_raw text,
  script_blueprint text,
  skeletal_logic jsonb,
  audio_analysis jsonb,
  semantic_tags ARRAY,
  status text NOT NULL DEFAULT 'draft'::text CHECK (status = ANY (ARRAY['draft'::text, 'complete'::text])),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  user_id uuid,
  is_published boolean NOT NULL DEFAULT false,
  title text,
  description text,
  CONSTRAINT videos_pkey PRIMARY KEY (id),
  CONSTRAINT videos_logic_flow_id_fkey FOREIGN KEY (logic_flow_id) REFERENCES public.logic_flows(id),
  CONSTRAINT videos_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);