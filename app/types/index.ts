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
