# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
pnpm dev          # Start development server (localhost:3000)
pnpm build        # Build for production
pnpm generate     # Generate static site
pnpm preview      # Preview production build
```

## Architecture Overview

Nuxt 4 **Video Anatomizer** — a "Mobbin for Video" tool that breaks down short-form videos (TikTok, Instagram, YouTube Shorts) into structured, reusable templates with AI-powered analysis.

**Tech stack:** Nuxt 4, Vue 3, @nuxt/ui v4, Tailwind CSS 4, Supabase (PostgreSQL + storage), Google Gemini 2.5 Flash (all AI tasks — transcription, analysis, visual).

### Directory Structure

```
app/
  pages/                         # Route pages
    index.vue                    # Dashboard — video library grid
    anatomize/index.vue          # Upload new video
    anatomize/[id].vue           # Edit video anatomy (3-column layout)
    view/[id].vue                # View template with copyable blueprints
  components/
    video/Player.vue             # HTML5 video player with segment overlay
    video/PreviewPanel.vue       # Video preview wrapper for editor
    video/Timeline.vue           # Interactive timeline for segment creation
    video/UploadForm.vue         # Video upload with processing progress
    editor/Panels.vue            # Tab container (Skeletal Logic | Transcript | Visual)
    editor/TranscriptSkeleton.vue # Segment transcript + blueprint editor
    editor/SkeletalLogic.vue     # AI strategic analysis display
    editor/SemanticTags.vue      # Multi-select tag picker with AI suggest
    editor/AudioMetadata.vue     # Audio analysis results display
    editor/VisualAnalysis.vue    # Per-segment visual analysis display
    editor/Markdown.vue          # Markdown editor (legacy, unused)
    library/Panel.vue            # Sidebar video library with filters
    library/VideoCard.vue        # Video card in library sidebar
    library/TemplateCard.vue     # Logic flow template card
    viewer/BlueprintSidecar.vue  # Read-only copyable blueprint display
    anatomy/PreviewCard.vue      # (legacy)
    anatomy/SegmentEditor.vue    # (legacy)
  composables/
    useVideos.ts                 # Video CRUD operations
    useSegments.ts               # Segment CRUD operations
    useLogicFlows.ts             # Logic flow fetching (shared state via useState)
    useLibrary.ts                # Aggregated library with filtering
    useTemplates.ts              # Logic flow template updates
    useMarkdownSync.ts           # Bidirectional segment ↔ markdown sync
  types/
    index.ts                     # All types, interfaces, and constants
    database.ts                  # Supabase auto-generated database types
  utils/
    markdownParser.ts            # Parse/generate segment markdown format
  assets/css/main.css            # Global styles
  app.vue                        # Root component
  app.config.ts                  # Nuxt UI theme config
server/
  api/
    videos/index.get.ts          # GET  /api/videos
    videos/index.post.ts         # POST /api/videos
    videos/[id].get.ts           # GET  /api/videos/:id
    videos/[id].put.ts           # PUT  /api/videos/:id
    videos/[id].delete.ts        # DELETE /api/videos/:id
    videos/upload.post.ts        # POST /api/videos/upload
    segments/index.get.ts        # GET  /api/segments?videoId=
    segments/index.post.ts       # POST /api/segments
    segments/[id].put.ts         # PUT  /api/segments/:id
    segments/[id].delete.ts      # DELETE /api/segments/:id
    segments/upsert.post.ts      # POST /api/segments/upsert (bulk replace)
    logic-flows/index.get.ts     # GET  /api/logic-flows
    logic-flows/[id].put.ts      # PUT  /api/logic-flows/:id
    process-video.post.ts        # POST /api/process-video (full pipeline)
    transcribe.post.ts           # POST /api/transcribe (Gemini)
    analyze-transcript.post.ts   # POST /api/analyze-transcript
    generate-blueprint.post.ts   # POST /api/generate-blueprint
    generate-skeletal-logic.post.ts  # POST /api/generate-skeletal-logic
    generate-transcript-template.post.ts  # POST /api/generate-transcript-template
    suggest-semantic-tags.post.ts    # POST /api/suggest-semantic-tags
    analyze-audio.post.ts        # POST /api/analyze-audio
    analyze-visual.post.ts       # POST /api/analyze-visual
  utils/
    supabase.ts                  # useServerSupabase() singleton client
    gemini.ts                    # useServerGemini() singleton + uploadVideoToGemini()
    validation.ts                # validateUUID, validateString, sanitizeString, etc.
    audio.ts                     # FFmpeg audio extraction helpers
supabase/schema.sql              # PostgreSQL schema + 8 seeded logic flows
nuxt.config.ts                   # Nuxt config (modules, runtimeConfig, colorMode)
```

## Database Schema

### Tables

**logic_flows** — Predefined video structure templates
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | auto-generated |
| name | TEXT UNIQUE | e.g., "PAS (Problem-Agitation-Solution)" |
| description | TEXT | Pattern explanation |
| template_markdown | TEXT | Time-based segment template |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | auto-updated via trigger |

8 seeded templates: PAS, Us vs. Them, Listicle/Top N, Mythbuster, Before/After, Tutorial/How-To, Story Arc, Testimonial.

**videos** — Main content container
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | auto-generated |
| creator_handle | TEXT | TikTok handle, username |
| platform | TEXT | 'TikTok' \| 'Instagram' \| 'YouTube Shorts' |
| source_url | TEXT | Original video URL |
| video_path | TEXT NOT NULL | Supabase storage path |
| duration_seconds | INTEGER | Total duration |
| logic_flow_id | UUID FK | → logic_flows.id |
| script_raw | TEXT | Full transcript |
| script_blueprint | TEXT | Template with [PLACEHOLDERS] |
| skeletal_logic | JSONB | SkeletalLogicAnalysis object |
| audio_analysis | JSONB | VideoAudioAnalysis object |
| visual_analysis | JSONB | VideoVisualAnalysis object |
| semantic_tags | TEXT[] | Categorization tags array |
| status | TEXT | 'draft' \| 'complete' |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | auto-updated via trigger |

**segments** — Time-based sections within a video
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | auto-generated |
| video_id | UUID FK NOT NULL | → videos.id (CASCADE delete) |
| segment_order | INTEGER | Position in sequence |
| label | TEXT NOT NULL | 'Hook' \| 'Bridge' \| 'Value' \| 'Proof' \| 'CTA' |
| start_time | FLOAT | Seconds (CHECK: >= 0) |
| end_time | FLOAT | Seconds (CHECK: > start_time) |
| transcript_raw | TEXT | Segment transcript |
| script_blueprint | TEXT | Segment template |
| visual_notes | TEXT | Visual pattern descriptions |
| tags | TEXT[] | Segment-specific tags |
| audio_metadata | JSONB | Per-segment audio data |
| created_at | TIMESTAMPTZ | |

Indexes: `idx_segments_video_id`, `idx_segments_order`. RLS enabled on all tables (no policies = service_role only).

## Types & Constants

All defined in `app/types/index.ts`. Database row types derived from Supabase schema:

```typescript
// Core types (from database.ts)
type LogicFlow, Video, Segment         // Row types
type LogicFlowInsert, VideoInsert, SegmentInsert  // Insert types
type LogicFlowUpdate, VideoUpdate, SegmentUpdate  // Update types

// Relations
interface VideoWithSegments extends Video {
  segments: Segment[]
  logic_flow?: LogicFlow | null
}

// Enums
PLATFORMS = ['TikTok', 'Instagram', 'YouTube Shorts'] as const
VIDEO_STATUSES = ['draft', 'complete'] as const
SEGMENT_LABELS = ['Hook', 'Bridge', 'Value', 'Proof', 'CTA'] as const

// Semantic tags (3 categories, 49 total tags)
SEMANTIC_TAG_CATEGORIES = {
  domain: ['Education', 'Business', 'Technology', ...28 total],
  format: ['Tutorial', 'Review', 'Story/Narrative', ...16 total],
  audience: ['Beginner-friendly', 'Intermediate', 'Advanced/Expert', 'Professional', 'Casual/General']
}

// Pattern tags
VISUAL_TAGS = ['Green Screen', 'POV', 'Match Cut', 'Text Overlay', 'Split Screen', 'UGC Style', 'Professional/Studio', 'Talking Head']
PSYCHOLOGICAL_TAGS = ['FOMO', 'Curiosity Gap', 'Social Proof', 'Authority', 'Scarcity', 'Pattern Interrupt', 'Negative Constraint', 'Educational Shock', 'Direct Reward']

// Skeletal logic analysis (stored in videos.skeletal_logic JSONB)
interface SkeletalLogicAnalysis {
  overview: string
  segments: Array<{ label, goal, technique, psychology, execution, outcome }>
  keyTakeaways: string[]
}

// Audio analysis (stored in videos.audio_analysis JSONB)
SOUND_EFFECT_TYPES = ['whoosh', 'ding', 'bass_drop', 'notification', 'pop', 'click', 'swoosh', 'impact', 'transition', 'riser', 'ambient', 'other']
interface MusicTrack {
  title: string | null, artist: string | null, genre: string, description: string,
  start_time: number, end_time: number, bpm: number | null
}
interface AudioMetadata {
  music: { detected: boolean, tracks: MusicTrack[] }
  sound_effects: SoundEffect[]
  overall: { has_speech, has_music, has_sfx, dominant_audio: 'speech'|'music'|'mixed'|'silent' }
}
interface VideoAudioAnalysis { status: AudioAnalysisStatus, analyzed_at, error, metadata: AudioMetadata | null }

// Visual analysis (stored in videos.visual_analysis JSONB)
interface SegmentVisualAnalysis {
  camera_movements: string[], shot_types: string[],
  color_grading: { dominant_colors, mood, style },
  scene_composition: string, text_overlays: { detected, items: [{ text, style, position }] },
  transitions: { type, description } | null, visual_pacing: string,
  branding_elements: string[], thumbnail_worthy_frames: string[], detected_visual_tags: string[]
}
interface VideoVisualOverview {
  overall_style, editing_pace, production_quality: 'low'|'medium'|'high'|'professional',
  aspect_ratio, notable_techniques: string[]
}
interface VideoVisualAnalysis { status, analyzed_at, error, overview: VideoVisualOverview | null, segments: SegmentVisualAnalysis[] | null }
```

## Component Interfaces

### Video Components

**VideoPlayer** (`video/Player.vue`)
- Props: `src: string`, `segments?: Segment[]`
- Emits: `timeupdate(time)`, `durationchange(duration)`, `segmentChange(segment | null)`
- Exposes: `seek(time)`, `currentTime`, `duration`

**VideoPreviewPanel** (`video/PreviewPanel.vue`)
- Props: `videoSrc: string`, `segments: Segment[]`, `currentTime?: number`, `duration?: number`
- Emits: `update:segments`, `update:currentTime`, `update:duration`, `segmentChange`
- Exposes: `seek(time)`

**VideoTimeline** (`video/Timeline.vue`)
- Props: `duration: number`, `currentTime: number`, `modelValue: Segment[]` (v-model)
- Emits: `update:modelValue(segments)`, `seek(time)`
- Features: right-click to add segments, drag edges to resize, quick templates, clear all

**VideoUploadForm** (`video/UploadForm.vue`)
- Emits: `success(videoId: string)`
- Accepts: video/mp4, video/webm, video/quicktime, video/x-msvideo (max 500MB)

### Editor Components

**EditorPanels** (`editor/Panels.vue`)
- Props: `segments: Segment[]`, `skeletalLogic?: SkeletalLogicAnalysis`, `skeletalLogicGenerating?: boolean`, `visualAnalysis?: VideoVisualAnalysis`, `visualAnalysisAnalyzing?: boolean`, `saving?: boolean`, `saveStatus?: 'saved'|'saving'|'unsaved'|'error'`
- Emits: `update:segments`, `generateSkeletalLogic`, `analyzeVisual`, `save`
- Three tabs: Skeletal Logic (analysis), Transcript Skeleton, and Visual Analysis

**EditorTranscriptSkeleton** (`editor/TranscriptSkeleton.vue`)
- Props: `segments: Segment[]`, `saving?: boolean`, `saveStatus?: 'saved'|'saving'|'unsaved'|'error'`
- Emits: `update:segments`, `save`
- Calls: `POST /api/generate-transcript-template` for blueprint generation

**EditorSkeletalLogic** (`editor/SkeletalLogic.vue`)
- Props: `analysis: SkeletalLogicAnalysis | null`, `segments: Segment[]`, `generating?: boolean`
- Emits: `generate`

**EditorSemanticTags** (`editor/SemanticTags.vue`)
- Props: `modelValue: string[]` (v-model), `transcript?: string`
- Emits: `update:modelValue(tags)`
- Tag colors: domain=primary, format=success, audience=warning
- Calls: `POST /api/suggest-semantic-tags` for AI suggestions

**EditorAudioMetadata** (`editor/AudioMetadata.vue`)
- Props: `audioAnalysis: VideoAudioAnalysis | null`, `analyzing?: boolean`
- Emits: `analyze`

**EditorVisualAnalysis** (`editor/VisualAnalysis.vue`)
- Props: `visualAnalysis: VideoVisualAnalysis | null`, `analyzing?: boolean`, `segments?: Segment[]`
- Emits: `analyze`
- Shows: overview (production quality, style, pace, techniques), per-segment cards (camera movements, shot types, color grading, text overlays, transitions, pacing, visual tags, branding, thumbnail frames)

### Library Components

**LibraryPanel** (`library/Panel.vue`)
- Props: `videos: Video[]`, `currentVideoId?: string`, `loading?: boolean`
- Emits: `selectVideo(video)`
- Internal filters: search, status (all/draft/complete)

**LibraryVideoCard** (`library/VideoCard.vue`)
- Props: `video: Video`, `active?: boolean`
- Emits: `select(video)`

### Viewer Components

**ViewerBlueprintSidecar** (`viewer/BlueprintSidecar.vue`)
- Props: `video: VideoWithSegments`, `currentSegment: Segment | null`, `logicFlow: LogicFlow | null`

## Composables

### useVideos()
```typescript
fetchVideos()              → { data: Video[] | null, error }
fetchVideo(id)             → { data: VideoWithSegments | null, error }
createVideo(VideoInsert)   → { data: Video | null, error }
updateVideo(id, VideoUpdate) → { data: Video | null, error }
deleteVideo(id)            → { error }
uploadVideoFile(File)      → { path: string | null, error }
getVideoUrl(path)          → string  // Constructs Supabase storage URL
```

### useSegments()
```typescript
fetchSegments(videoId)           → { data: Segment[] | null, error }
createSegment(SegmentInsert)     → { data: Segment | null, error }
updateSegment(id, SegmentUpdate) → { data: Segment | null, error }
deleteSegment(id)                → { error }
upsertSegments(videoId, SegmentInsert[]) → { data: Segment[] | null, error }
```

### useLogicFlows()
Uses `useState` for SSR-safe shared state.
```typescript
logicFlows: Ref<LogicFlow[]>
loading: Ref<boolean>
error: Ref<string | null>
fetchLogicFlows() → { data, error }
```

### useLibrary()
```typescript
// State
videos, logicFlows, loading, error, filters: Ref<LibraryFilters>
// LibraryFilters = { status: VideoStatus|'all', platform, logicFlowId, search }

// Actions
loadLibrary()           // Fetch videos + logic flows in parallel
fetchVideos()           // With filter params as query string
setFilters(partial)     // Update filters + auto-refetch
clearFilters()

// Computed
draftVideos, completedVideos, hasVideos, hasTemplates
```

### useTemplates()
```typescript
saving: Ref<boolean>
error: Ref<string | null>
saveTemplate(logicFlowId, markdown) → { data: LogicFlow | null, error }
updateLogicFlow(id, LogicFlowUpdate) → { data: LogicFlow | null, error }
getTemplateMarkdown(flows[], id) → string | null
```

### useMarkdownSync(segments: Ref<Segment[]>, options)
Bidirectional sync between segment array and markdown text.
```typescript
// Options: { videoId: string, debounceMs?: number (default 300) }
// Returns:
markdown: Ref<string>
parseErrors: Ref<ParseError[]>
isSyncing: Ref<boolean>
initFromSegments()
applyTemplate(templateMarkdown, videoDuration?)  // Scales times to fit duration
```

**Markdown format:** `0-3s [Hook]: Description text` or `1:30-2:00 [Value]: Description`

## Server API Endpoints

### Video CRUD

| Method | Path | Body / Query | Response |
|--------|------|--------------|----------|
| GET | `/api/videos` | `?status=&platform=&logic_flow_id=&search=` | `{ data: Video[] }` |
| POST | `/api/videos` | `{ video_path, source_url?, creator_handle?, platform?, status? }` | `{ data: Video }` |
| GET | `/api/videos/:id` | — | `{ data: VideoWithSegments }` (includes segments + logic_flow) |
| PUT | `/api/videos/:id` | Partial video fields | `{ data: Video }` |
| DELETE | `/api/videos/:id` | — | `{ success: true }` |
| POST | `/api/videos/upload` | multipart `file` (max 500MB, mp4/webm/mov/avi) | `{ path: string }` |

### Segment CRUD

| Method | Path | Body / Query | Response |
|--------|------|--------------|----------|
| GET | `/api/segments` | `?videoId=` (required) | `{ data: Segment[] }` |
| POST | `/api/segments` | `{ video_id, label, segment_order, start_time, end_time, ... }` | `{ data: Segment }` |
| PUT | `/api/segments/:id` | Partial segment fields | `{ data: Segment }` |
| DELETE | `/api/segments/:id` | — | `{ success: true }` |
| POST | `/api/segments/upsert` | `{ videoId, segments: SegmentInsert[] }` (max 50) | `{ data: Segment[] }` — deletes all existing, inserts new |

### Logic Flows

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/api/logic-flows` | — | `{ data: LogicFlow[] }` |
| PUT | `/api/logic-flows/:id` | `{ name?, description?, template_markdown? }` | `{ data: LogicFlow }` |

### AI / Processing Endpoints

All AI endpoints use **Google Gemini 2.5 Flash** via `useServerGemini()`.

**POST /api/process-video** — Full pipeline: transcribe + analyze in single Gemini call
- Body: `{ videoId: string }`
- Uses: Gemini 2.5 Flash with video via Files API (combined transcription + structure analysis)
- Response: `{ success, logicFlowId, logicFlowName, segmentCount }`

**POST /api/transcribe** — Standalone transcription
- Body: multipart `file` (max 100MB)
- Uses: Gemini 2.5 Flash with video via Files API
- Response: `{ text, segments: Array<{ start, end, text }> }`

**POST /api/generate-blueprint** — Convert transcript to template
- Body: `{ transcript: string, segmentLabel: string }`
- Uses: Gemini 2.5 Flash, temperature 0.3, maxOutputTokens 500
- Response: `{ blueprint: string }`
- Replaces specifics with `[Product]`, `[Pain Point]`, `[Number]`, `[Result]`, etc.

**POST /api/generate-skeletal-logic** — Strategic analysis
- Body: `{ transcript, segments: Array<{ label, start_time, end_time, transcript_raw }>, logicFlowType? }`
- Uses: Gemini 2.5 Flash, temperature 0.4, JSON response
- Response: `{ overview, segments: Array<{ label, goal, technique, psychology, execution, outcome }>, keyTakeaways }`

**POST /api/generate-transcript-template** — Template generation
- Body: `{ transcript, videoContext?, logicFlowType? }`
- Uses: Gemini 2.5 Flash, temperature 0.3, topP 0.9
- Response: `{ template: string }`

**POST /api/suggest-semantic-tags** — AI tag suggestions
- Body: `{ transcript: string }`
- Uses: Gemini 2.5 Flash, temperature 0.2, JSON response
- Response: `{ domain: string[], format: string[], audience: string[], confidence: number }`

**POST /api/analyze-audio** — Music + SFX detection
- Body: `{ videoId: string }`
- Uses: Gemini 2.5 Flash with video via Files API (music + SFX + overall audio)
- Response: `{ success, audioAnalysis: VideoAudioAnalysis }`

**POST /api/analyze-visual** — Comprehensive visual analysis
- Body: `{ videoId: string }`
- Uses: Gemini 2.5 Flash with video via Files API
- Response: `{ success, visualAnalysis: VideoVisualAnalysis }`
- Per-segment: camera movements, shot types, color grading, text overlays, transitions, pacing, visual tags, branding, thumbnail frames
- Overall: style, editing pace, production quality, aspect ratio, notable techniques

**POST /api/analyze-transcript** — Analyze structure (alternative to process-video)
- Body: `{ transcript, segments: Array<{ start, end, text }>, videoDuration? }`
- Response: `{ logicFlowId, logicFlowName, confidence, segments }`

## Server Utilities

### useServerSupabase() (`server/utils/supabase.ts`)
Singleton Supabase client typed with `Database`. Used in all API endpoints.

### useServerGemini() (`server/utils/gemini.ts`)
Singleton `GoogleGenAI` client from `@google/genai`. Also exports:
- `uploadVideoToGemini(ai, buffer, mimeType?)` — uploads video buffer to Gemini Files API (temp file → upload → poll until ACTIVE → return `{ uri, mimeType, name }`)

### Validation (`server/utils/validation.ts`)
```typescript
validateUUID(id, fieldName?)          // Throws 400 if invalid
validateRequired<T>(value, fieldName) // Throws 400 if null/empty
validateString(value, fieldName, { maxLength?, minLength? })
validateNumber(value, fieldName, { min?, max? })
validateEnum<T>(value, fieldName, allowedValues)
validateArray<T>(value, fieldName)
sanitizeString(value)                 // Strips HTML tags (XSS prevention)
```

### Audio (`server/utils/audio.ts`)
```typescript
extractAudioFromVideo(buffer)     → Buffer (WAV, 16kHz mono)
extractAudioSegment(buffer, start, end) → Buffer
checkFfmpegAvailable()            → boolean
getAudioDuration(buffer)          → number (seconds)
```

### Markdown Parser (`app/utils/markdownParser.ts`)
```typescript
parseSegmentMarkdown(markdown)    → { segments: ParsedSegment[], errors: ParseError[] }
generateSegmentMarkdown(segments) → string
mergeWithExisting(parsed[], existing[], videoId) → Segment[]
// Format: "0-3s [Hook]: Description" or "1:30-2:00 [Value]: Description"
// Comments: # or // prefixed lines ignored. Empty lines ignored.
// Invalid labels default to "Value" with warning.
```

## UI Framework & Conventions

Uses `@nuxt/ui` v4 with Tailwind CSS 4. Docs: https://ui.nuxt.com/llms.txt

- **Primary color:** indigo
- **Icons:** Phosphor icons, prefix `i-ph-*` — e.g., `<UIcon name="i-ph-check" />`
- **Border radius:** `--ui-radius: 0.125rem` (sharp)
- **Font:** Geist
- **Theme:** Light only (`ui.colorMode: false` in nuxt.config.ts)

### CSS Variable Classes (Design Tokens)

Use these instead of hardcoded Tailwind colors:

| Background | Text | Border |
|------------|------|--------|
| `bg-default` | `text-default` | `border-default` |
| `bg-muted` | `text-muted` | `border-muted` |
| `bg-elevated` | `text-dimmed` | `border-accented` |
| `bg-accented` | `text-toned` | |
| `bg-inverted` | `text-highlighted` | |
| | `text-inverted` | |
| `bg-primary` | `text-primary` | |
| | `text-success`, `text-error`, `text-warning`, `text-info` | |

### Segment Color Map

Hardcoded across all components — keep consistent:
```
Hook:   red    (bg-red-500, text-red-500, border-red-500)
Bridge: yellow (bg-yellow-500, text-yellow-500, border-yellow-500)
Value:  green  (bg-green-500, text-green-500, border-green-500)
Proof:  blue   (bg-blue-500, text-blue-500, border-blue-500)
CTA:    purple (bg-purple-500, text-purple-500, border-purple-500)
```

## Coding Conventions

### Server-side patterns
- Handlers use `defineEventHandler` (Nuxt 4 / h3)
- Validate inputs with `server/utils/validation.ts` helpers
- Sanitize user strings with `sanitizeString()` to prevent XSS
- Throw errors with `createError({ statusCode, message })`
- Access Supabase via `useServerSupabase()`
- Access Gemini via `useServerGemini()` — all AI calls use `ai.models.generateContent()`
- API responses wrap data in `{ data: ... }` or return `{ success: true }`

### Client-side patterns
- Composables return `{ data, error }` tuples — never throw
- Use `$fetch` for API calls (Nuxt built-in, handles serialization)
- SSR-safe shared state via `useState('key', () => initialValue)`
- Component state via `ref()` / `reactive()`
- Auto-save: 2000ms debounce on the edit page (`anatomize/[id].vue`)
- Keyboard shortcut: Cmd/Ctrl+S triggers save in TranscriptSkeleton

### File naming
- Pages: `index.vue`, `[id].vue` (Nuxt file-based routing)
- Components: PascalCase in `<template>`, auto-imported by directory prefix (e.g., `EditorPanels`, `VideoPlayer`, `LibraryPanel`)
- Server endpoints: `[method].ts` suffix (e.g., `index.get.ts`, `[id].put.ts`)
- Composables: `use*.ts`

## Environment Variables

```bash
# Required
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key     # runtimeConfig.public.supabaseKey
GEMINI_API_KEY=your-gemini-api-key     # runtimeConfig.geminiApiKey
```

Configured in `nuxt.config.ts` under `runtimeConfig` (private) and `runtimeConfig.public` (client-accessible).

## Key Workflows

### Upload → Process → Edit → View
1. Upload video file → `POST /api/videos/upload` → Supabase storage
2. Create record → `POST /api/videos` → returns `videoId`
3. Process → `POST /api/process-video` → Gemini transcription + structure analysis (single call) → creates segments
4. Navigate to `/anatomize/[id]` for editing
5. Mark complete → navigate to `/view/[id]` for read-only blueprint view

### Auto-save (Edit page)
- 2000ms debounce after segment/tag/metadata changes
- Calls `upsertSegments` + `updateVideo` in parallel
- Visual status: saving → saved → unsaved (on change)

### Markdown ↔ Segment sync
- `useMarkdownSync` watches both directions with circular update prevention
- Markdown → Segments: debounced 300ms parse with `mergeWithExisting` (preserves transcript/notes/tags)
- Segments → Markdown: immediate `generateSegmentMarkdown`
- Template application scales times to fit video duration

### Blueprint generation
- Per-segment: `POST /api/generate-transcript-template` with segment transcript
- Replaces specifics with `[PLACEHOLDER]` tokens while preserving sentence structure
- Toggle Raw/Template view per segment in TranscriptSkeleton

## Supabase Setup

1. Create `.env` with `SUPABASE_URL`
2. Run `supabase/schema.sql` in Supabase SQL Editor (creates tables + seeds 8 logic flows)
3. Create storage bucket named `videos` with public access
