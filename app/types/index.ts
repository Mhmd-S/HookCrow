import type { Database } from './database'

// Database row types
export type Profile = Database['public']['Tables']['profiles']['Row']
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

// Auth
export type UserRole = 'admin' | 'user'
export type SubscriptionStatus = 'free' | 'active' | 'past_due' | 'canceled'
export type SubscriptionPlan = 'monthly' | 'annual'

// Paywall — returned by /api/recipes/:id when the viewer lacks access
export type LockedReason = 'premium' | 'login_required'

export interface LockedRecipe {
  id: string
  title: string | null
  description: string | null
  creator_handle: string | null
  platform: string | null
  video_path: string
  duration_seconds: number | null
  semantic_tags: string[] | null
  overview_teaser: string | null
  locked: true
  reason: LockedReason
}

// Video with relations
export interface VideoWithSegments extends Video {
  segments: Segment[]
  logic_flow?: LogicFlow | null
}

// Browse
export interface BrowseFilters {
  tags: string[]
  search: string
  page: number
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
  ],

  // Product / Service Type - What is being advertised?
  product_type: [
    'SaaS',
    'Mobile App',
    'Web App',
    'DTC Physical Product',
    'Consumer Electronics',
    'Beauty & Skincare',
    'Fitness & Health',
    'Food & Beverage',
    'Fashion & Apparel',
    'Home & Kitchen',
    'Pet Products',
    'Subscription Box',
    'Course/Info Product',
    'Coaching/Consulting',
    'Agency Service',
    'Local Service',
    'B2B Service',
    'Fintech/Finance',
    'EdTech',
    'Creator Tool',
    'AI Tool',
    'Marketplace',
    'Media/Content',
    'Event/Experience',
    'Non-Product (Personal Brand)'
  ],

  // Production Style - How is it produced / shot?
  production_style: [
    'Lo-fi/Selfie',
    'UGC/Creator-shot',
    'Talking Head',
    'Screen Recording',
    'Tutorial Capture',
    'Vlog Style',
    'Prosumer',
    'Studio/Polished',
    'Cinematic',
    'Commercial/Ad',
    'Animation/Motion Graphics',
    'AI-generated',
    'Stock Footage Mix',
    'Podcast Clip',
    'Livestream Clip'
  ]
} as const

// Flat list of all semantic tags for easy access
export const SEMANTIC_TAGS = [
  ...SEMANTIC_TAG_CATEGORIES.domain,
  ...SEMANTIC_TAG_CATEGORIES.format,
  ...SEMANTIC_TAG_CATEGORIES.audience,
  ...SEMANTIC_TAG_CATEGORIES.product_type,
  ...SEMANTIC_TAG_CATEGORIES.production_style
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

// ==========================================
// Visual Analysis Types
// ==========================================

export type VisualAnalysisStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface SegmentVisualAnalysis {
  camera_movements: string[]
  shot_types: string[]
  color_grading: {
    dominant_colors: string[]
    mood: string
    style: string
  }
  scene_composition: string
  text_overlays: {
    detected: boolean
    items: Array<{
      text: string
      style: string
      position: string
    }>
  }
  transitions: {
    type: string
    description: string
  } | null
  visual_pacing: string
  branding_elements: string[]
  thumbnail_worthy_frames: string[]
  detected_visual_tags: string[]
  editing_instructions: {
    cuts: Array<{
      timestamp: string
      type: string
      description: string
    }>
    effects: Array<{
      type: string
      parameters: string
      timing: string
    }>
    speed_changes: Array<{
      range: string
      speed: string
      reason: string
    }>
    zoom_keyframes: Array<{
      timestamp: string
      zoom_level: string
      direction: string
    }>
    text_to_add: Array<{
      text: string
      appear_at: string
      duration: string
      style: string
      position: string
      animation: string
    }>
    color_grade_preset: string
    audio_sync_notes: string
  }
}

export interface VideoVisualOverview {
  overall_style: string
  editing_pace: string
  production_quality: 'low' | 'medium' | 'high' | 'professional'
  aspect_ratio: string
  notable_techniques: string[]
}

export interface VideoVisualAnalysis {
  status: VisualAnalysisStatus
  analyzed_at: string | null
  error: string | null
  overview: VideoVisualOverview | null
  segments: SegmentVisualAnalysis[] | null
}

// ==========================================
// Product Context (videos.product_context)
// ==========================================

export const PRODUCT_CATEGORIES = [
  'SaaS - Analytics',
  'SaaS - CRM',
  'SaaS - Productivity',
  'SaaS - Marketing',
  'SaaS - Developer Tools',
  'SaaS - Finance',
  'SaaS - HR',
  'SaaS - Other',
  'Consumer App - Health & Fitness',
  'Consumer App - Finance',
  'Consumer App - Productivity',
  'Consumer App - Social',
  'Consumer App - Other',
  'E-commerce / Physical Product',
  'Marketplace / Platform',
  'Online Course / Info Product',
  'Agency / Service',
  'Creator / Personal Brand',
  'Non-Product (Entertainment/Education)'
] as const
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number]

export const PRICING_MODELS = ['free', 'freemium', 'subscription', 'one-time', 'unknown'] as const
export type PricingModel = (typeof PRICING_MODELS)[number]

export interface ProductContext {
  product_name: string | null
  product_category: ProductCategory | null
  one_liner: string | null
  target_user: string | null
  problem_solved: string | null
  key_features: string[]
  pricing_model: PricingModel
  competitors_mentioned: string[]
  has_specific_product: boolean
}

