export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      logic_flows: {
        Row: {
          id: string
          name: string
          description: string | null
          template_markdown: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          template_markdown?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          template_markdown?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      videos: {
        Row: {
          id: string
          creator_handle: string | null
          platform: string | null
          source_url: string | null
          video_path: string
          duration_seconds: number | null
          logic_flow_id: string | null
          script_raw: string | null
          script_blueprint: string | null
          status: 'draft' | 'complete'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          creator_handle?: string | null
          platform?: string | null
          source_url?: string | null
          video_path: string
          duration_seconds?: number | null
          logic_flow_id?: string | null
          script_raw?: string | null
          script_blueprint?: string | null
          status?: 'draft' | 'complete'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          creator_handle?: string | null
          platform?: string | null
          source_url?: string | null
          video_path?: string
          duration_seconds?: number | null
          logic_flow_id?: string | null
          script_raw?: string | null
          script_blueprint?: string | null
          status?: 'draft' | 'complete'
          created_at?: string
          updated_at?: string
        }
      }
      segments: {
        Row: {
          id: string
          video_id: string
          segment_order: number
          label: string
          start_time: number
          end_time: number
          transcript_raw: string | null
          script_blueprint: string | null
          visual_notes: string | null
          tags: string[] | null
          created_at: string
        }
        Insert: {
          id?: string
          video_id: string
          segment_order: number
          label: string
          start_time: number
          end_time: number
          transcript_raw?: string | null
          script_blueprint?: string | null
          visual_notes?: string | null
          tags?: string[] | null
          created_at?: string
        }
        Update: {
          id?: string
          video_id?: string
          segment_order?: number
          label?: string
          start_time?: number
          end_time?: number
          transcript_raw?: string | null
          script_blueprint?: string | null
          visual_notes?: string | null
          tags?: string[] | null
          created_at?: string
        }
      }
    }
  }
}
