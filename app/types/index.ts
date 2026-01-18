import type { Database } from './database'

// Database row types
export type LogicFlow = Database['public']['Tables']['logic_flows']['Row']
export type Video = Database['public']['Tables']['videos']['Row']
export type Segment = Database['public']['Tables']['segments']['Row']

// Insert types
export type LogicFlowInsert = Database['public']['Tables']['logic_flows']['Insert']
export type VideoInsert = Database['public']['Tables']['videos']['Insert']
export type SegmentInsert = Database['public']['Tables']['segments']['Insert']

// Update types
export type LogicFlowUpdate = Database['public']['Tables']['logic_flows']['Update']
export type VideoUpdate = Database['public']['Tables']['videos']['Update']
export type SegmentUpdate = Database['public']['Tables']['segments']['Update']

// Video with relations
export interface VideoWithSegments extends Video {
  segments: Segment[]
  logic_flow?: LogicFlow | null
}

// Constants
export const PLATFORMS = ['TikTok', 'Instagram', 'YouTube Shorts'] as const
export type Platform = (typeof PLATFORMS)[number]

export const VIDEO_STATUSES = ['draft', 'complete'] as const
export type VideoStatus = (typeof VIDEO_STATUSES)[number]

export const SEGMENT_LABELS = [
  'Hook',
  'Bridge',
  'Value',
  'Proof',
  'CTA'
] as const
export type SegmentLabel = (typeof SEGMENT_LABELS)[number]

// Pattern tags for segments
export const VISUAL_TAGS = [
  'Green Screen',
  'POV',
  'Match Cut',
  'Text Overlay',
  'Split Screen',
  'UGC Style',
  'Professional/Studio',
  'Talking Head'
] as const

export const PSYCHOLOGICAL_TAGS = [
  'FOMO',
  'Curiosity Gap',
  'Social Proof',
  'Authority',
  'Scarcity',
  'Pattern Interrupt',
  'Negative Constraint',
  'Educational Shock',
  'Direct Reward'
] as const

// Semantic tags for video content categorization
// These are shared across all videos for consistent categorization
export const SEMANTIC_TAG_CATEGORIES = {
  // Content Domain - What is the video about?
  domain: [
    'Education',
    'Business',
    'Technology',
    'Food & Cooking',
    'Health & Fitness',
    'Finance',
    'Entertainment',
    'Lifestyle',
    'Beauty & Fashion',
    'Travel',
    'Sports',
    'Gaming',
    'DIY & Crafts',
    'Parenting',
    'Relationships',
    'Productivity',
    'Marketing',
    'Real Estate',
    'Music',
    'Art & Design',
    'Science',
    'News & Current Events',
    'Career & Work',
    'Personal Development',
    'Home & Garden',
    'Pets & Animals',
    'Automotive',
    'Photography & Video'
  ],

  // Content Format - How is the content presented?
  format: [
    'Tutorial',
    'Review',
    'Story/Narrative',
    'Tips & Tricks',
    'Comparison',
    'Transformation',
    'Day-in-the-life',
    'Behind-the-scenes',
    'Q&A',
    'Challenge',
    'Reaction',
    'Unboxing',
    'Explainer',
    'Motivation',
    'Comedy/Humor',
    'Opinion/Commentary'
  ],

  // Audience Level - Who is this for?
  audience: [
    'Beginner-friendly',
    'Intermediate',
    'Advanced/Expert',
    'Professional',
    'Casual/General'
  ]
} as const

// Flat list of all semantic tags for easy access
export const SEMANTIC_TAGS = [
  ...SEMANTIC_TAG_CATEGORIES.domain,
  ...SEMANTIC_TAG_CATEGORIES.format,
  ...SEMANTIC_TAG_CATEGORIES.audience
] as const

export type SemanticTag = (typeof SEMANTIC_TAGS)[number]
export type SemanticTagCategory = keyof typeof SEMANTIC_TAG_CATEGORIES

// Skeletal logic analysis (videos.skeletal_logic)
export interface SkeletalLogicSegmentAnalysis {
  label: string
  goal: string
  technique: string
  psychology: string
  execution: string
  outcome: string
}

export interface SkeletalLogicAnalysis {
  overview: string
  segments: SkeletalLogicSegmentAnalysis[]
  keyTakeaways: string[]
}

// Sound effect types for audio analysis
export const SOUND_EFFECT_TYPES = [
  'whoosh',
  'ding',
  'bass_drop',
  'notification',
  'pop',
  'click',
  'swoosh',
  'impact',
  'transition',
  'riser',
  'ambient',
  'other'
] as const
export type SoundEffectType = (typeof SOUND_EFFECT_TYPES)[number]

// Audio metadata interfaces
export interface MusicTrack {
  title: string
  artist: string
  bpm: number | null
  mood: string | null
  start_time: number
  end_time: number
  confidence: number
}

export interface UnidentifiedMusic {
  start_time: number
  end_time: number
  description: string
}

export interface SoundEffect {
  type: SoundEffectType
  label: string
  start_time: number
  end_time: number
  confidence: number
}

export interface AudioOverall {
  has_speech: boolean
  has_music: boolean
  has_sfx: boolean
  dominant_audio: 'speech' | 'music' | 'mixed' | 'silent'
}

export interface AudioMetadata {
  music: {
    detected: boolean
    tracks: MusicTrack[]
    unidentified_music: UnidentifiedMusic[]
  }
  sound_effects: SoundEffect[]
  overall: AudioOverall
}

// Audio analysis status for videos
export type AudioAnalysisStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface VideoAudioAnalysis {
  status: AudioAnalysisStatus
  analyzed_at: string | null
  error: string | null
  metadata: AudioMetadata | null
}
