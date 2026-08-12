import type {
  VideoVisualAnalysis,
  SegmentVisualAnalysis,
  VideoVisualOverview,
  ProductContext,
  ProductCategory,
  PricingModel
} from '~/types'
import { SEMANTIC_TAG_CATEGORIES, PRODUCT_CATEGORIES, PRICING_MODELS } from '~/types'
import type { Json } from '~/types/database'

const log = createLogger('analyze-video')

const VALID_SEGMENT_LABELS = ['Hook', 'Bridge', 'Value', 'Proof', 'CTA']

const VISUAL_TAGS = [
  'Green Screen', 'POV', 'Match Cut', 'Text Overlay',
  'Split Screen', 'UGC Style', 'Professional/Studio', 'Talking Head'
]

export async function analyzeVideoBuffer(opts: {
  ai: ReturnType<typeof useServerGemini>,
  supabase: ReturnType<typeof useServerSupabase>,
  config: ReturnType<typeof useRuntimeConfig>,
  videoId: string,
  videoBuffer: Buffer,
  durationSeconds?: number,
  existingTitle?: string | null,
}): Promise<{ segmentCount: number; logicFlowId: string | null; logicFlowName: string | null }> {
  const { ai, supabase, videoId, videoBuffer, durationSeconds: providedDuration, existingTitle } = opts

  const { data: logicFlows } = await supabase
    .from('logic_flows')
    .select('id, name, description')

  log.info('Logic flows loaded', { count: logicFlows?.length || 0 })

  const logicFlowsContext = logicFlows?.map(lf => `- ${lf.name}: ${lf.description}`).join('\n') || ''

  let videoDuration = providedDuration || 0
  if (!videoDuration) {
    try {
      videoDuration = Math.round(await getVideoDuration(videoBuffer))
      log.info('Video duration extracted via ffprobe', { videoId, durationSeconds: videoDuration })
    } catch {
      videoDuration = 30
      log.warn('Could not extract video duration, using fallback', { videoId, fallback: videoDuration })
    }
  }

  // Mark visual analysis as processing up front
  await supabase
    .from('videos')
    .update({
      visual_analysis: { status: 'processing', analyzed_at: null, error: null, overview: null, segments: null } as unknown as Json
    })
    .eq('id', videoId)

  let uploadedFile: { uri: string; mimeType: string; name: string }
  try {
    uploadedFile = await uploadVideoToGemini(ai, videoBuffer)
  } catch (err) {
    log.error('Video upload to Gemini failed', err, { videoId })
    throw createError({
      statusCode: 500,
      message: err instanceof Error ? err.message : 'Failed to upload video for processing'
    })
  }

  const prompt = `You are analyzing a short-form marketing video (${videoDuration}s). Perform ALL of the following tasks in a single response, returning one JSON object.

=== TASK 1: TITLE ===
Write a concise title (max 80 chars, no quotes, no trailing punctuation) that captures the specific angle, hook, or product claim — not a generic description. Examples of the style: "The $0 Cold DM That Booked 12 Calls", "Why Your Landing Page Hook Loses in 3 Seconds", "POV: Launching a SaaS With Zero Audience". Avoid filler like "Video about…", emojis.

=== TASK 2: TRANSCRIPT + STRUCTURE ===
Transcribe spoken words. Then segment the video using these labels: Hook, Bridge, Value, Proof, CTA.
- Hook: opening attention grab (usually 0-5s)
- Bridge: transition building context or agitating the problem
- Value: main content/solution/information
- Proof: evidence, results, social proof
- CTA: call to action

Match the overall structure to ONE of these logic flow patterns:
${logicFlowsContext}

For each segment's script_blueprint, replace specifics with [PLACEHOLDERS]: [PRODUCT], [PAIN POINT], [NUMBER], [RESULT], [TOPIC]. Segments must cover the full ${videoDuration}s duration without overlapping. Not all labels required.

=== TASK 3: VISUAL ANALYSIS (per segment + overview) ===
Known visual tags: ${VISUAL_TAGS.join(', ')}.

For EACH segment (aligned 1:1 with TASK 2 segments, same order):
1. camera_movements: array (e.g. "static", "slow zoom in", "handheld shake")
2. shot_types: array (e.g. "close-up", "medium shot", "wide shot")
3. color_grading: { dominant_colors: string[], mood: string, style: string }
4. scene_composition: how frame is composed
5. text_overlays: { detected: boolean, items: [{ text, style, position }] } — IGNORE watermarks, usernames, @handles, platform logos, TikTok/Instagram UI. Only include intentional creator-added text.
6. transitions: TO next segment { type, description } or null for last
7. visual_pacing: editing pace in this segment
8. branding_elements: array
9. thumbnail_worthy_frames: descriptions
10. detected_visual_tags: which tags apply
11. editing_instructions: {
    cuts: [{ timestamp (relative to segment start, e.g. "0.0s"), type (e.g. "jump cut", "j-cut", "l-cut", "match cut", "hard cut", "cutaway"), description }],
    effects: [{ type (e.g. "shake", "blur", "flash", "glow", "vignette", "grain", "glitch"), parameters, timing }],
    speed_changes: [{ range, speed (e.g. "0.5x slow motion", "2x speed up"), reason }],
    zoom_keyframes: [{ timestamp, zoom_level (e.g. "100%", "150%"), direction }],
    text_to_add: [{ text (use [PLACEHOLDER] for specifics), appear_at, duration, style, position, animation }],
    color_grade_preset: one-line preset description,
    audio_sync_notes: how edits sync to audio/beats
  }

OVERALL visual:
- overall_style, editing_pace (include approximate cuts/second), production_quality ∈ {"low","medium","high","professional"}, aspect_ratio, notable_techniques: array

=== TASK 4: SEMANTIC TAGS ===
Categorize this short-form marketing video using ONLY tags from the controlled vocabularies below. Use both the transcript AND visuals to choose tags — production_style especially relies on what the video looks like, not what the creator says.

Return the tags grouped by category. If no tag reasonably applies, return an empty array for that category (do NOT invent new tags).

Quantity guidance (tight — prefer fewer, more-confident tags):
- domain: 1–3 tags — the content subject matter
- format: 1–2 tags — how it's presented
- audience: exactly 1 tag
- product_type: 1–2 tags — what product/service is being advertised (use "Non-Product (Personal Brand)" if it's pure brand content)
- production_style: 1–2 tags — the visual/production aesthetic (Lo-fi vs Studio vs UGC etc.)

Allowed vocabularies (copy tags verbatim, case-sensitive):
- domain: ${SEMANTIC_TAG_CATEGORIES.domain.join(', ')}
- format: ${SEMANTIC_TAG_CATEGORIES.format.join(', ')}
- audience: ${SEMANTIC_TAG_CATEGORIES.audience.join(', ')}
- product_type: ${SEMANTIC_TAG_CATEGORIES.product_type.join(', ')}
- production_style: ${SEMANTIC_TAG_CATEGORIES.production_style.join(', ')}

=== TASK 5: PRODUCT CONTEXT ===
Identify the specific product/service being marketed (if any). Extract from BOTH speech AND visuals — screen recordings, app UI, logos, on-screen captions.

Rules:
- If this is pure personal-brand / entertainment / educational content with no marketed product or service, set has_specific_product=false and leave string fields null / arrays empty. DO NOT invent a product.
- Be concrete and literal. Prefer the creator's own phrasing over generic summaries.
- product_category must be ONE value copied verbatim from this list: ${PRODUCT_CATEGORIES.join(', ')}.
- pricing_model must be one of: ${PRICING_MODELS.join(', ')}. Use "unknown" when not stated.

Fields:
- product_name: exact name as shown/spoken (correct capitalization), or null
- product_category: one value from the list above, or null
- one_liner: ≤120 chars — the core value prop as the creator frames it
- target_user: who it's for — literal phrasing if given, otherwise inferred
- problem_solved: ≤200 chars — the specific pain the product addresses
- key_features: up to 6 short phrases (verbatim from video when possible)
- pricing_model: one of the allowed values
- competitors_mentioned: literal brand names stated or visually shown as comparison (deduplicated)
- has_specific_product: boolean

=== RETURN THIS EXACT JSON SHAPE ===
{
  "title": "…",
  "transcript": "…",
  "logicFlowName": "…",
  "confidence": 0.0-1.0,
  "segments": [
    { "label": "Hook|Bridge|Value|Proof|CTA", "start_time": number, "end_time": number, "transcript_raw": "…", "script_blueprint": "…" }
  ],
  "visual": {
    "overview": { "overall_style": "…", "editing_pace": "…", "production_quality": "low|medium|high|professional", "aspect_ratio": "…", "notable_techniques": ["…"] },
    "segments": [ /* one per TASK 2 segment, same order, with all 11 fields above */ ]
  },
  "tags": {
    "domain": ["…"],
    "format": ["…"],
    "audience": ["…"],
    "product_type": ["…"],
    "production_style": ["…"]
  },
  "product": {
    "product_name": "…" | null,
    "product_category": "…" | null,
    "one_liner": "…" | null,
    "target_user": "…" | null,
    "problem_solved": "…" | null,
    "key_features": ["…"],
    "pricing_model": "free|freemium|subscription|one-time|unknown",
    "competitors_mentioned": ["…"],
    "has_specific_product": true
  }
}

If no speech is detected, still return segments based on visual structure with empty transcript_raw.`

  type CombinedResponse = {
    title?: string
    transcript?: string
    logicFlowName?: string
    confidence?: number
    segments?: Array<{
      label: string
      start_time: number
      end_time: number
      transcript_raw?: string
      script_blueprint?: string
    }>
    visual?: {
      overview?: VideoVisualOverview
      segments?: SegmentVisualAnalysis[]
    }
    tags?: {
      domain?: unknown
      format?: unknown
      audience?: unknown
      product_type?: unknown
      production_style?: unknown
    }
    product?: {
      product_name?: unknown
      product_category?: unknown
      one_liner?: unknown
      target_user?: unknown
      problem_solved?: unknown
      key_features?: unknown
      pricing_model?: unknown
      competitors_mentioned?: unknown
      has_specific_product?: unknown
    }
  }

  let analysis: CombinedResponse
  const geminiOp = log.timedOp('Gemini combined analysis', { videoId, model: 'gemini-2.5-flash' })
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        role: 'user',
        parts: [
          { fileData: { fileUri: uploadedFile.uri, mimeType: uploadedFile.mimeType } },
          { text: prompt }
        ]
      },
      config: {
        temperature: 0.3,
        responseMimeType: 'application/json',
        maxOutputTokens: 32768
      }
    })

    const content = response.text
    if (!content) throw new Error('No response from AI')

    log.info('Gemini response received', { videoId, responseLength: content.length })
    analysis = JSON.parse(content) as CombinedResponse

    geminiOp.done({
      logicFlowName: analysis.logicFlowName,
      confidence: analysis.confidence,
      transcriptLength: analysis.transcript?.length || 0,
      rawSegments: analysis.segments?.length || 0,
      hasVisual: !!analysis.visual,
      visualSegmentsReturned: analysis.visual?.segments?.length || 0
    })
  } catch (err) {
    geminiOp.fail(err)
    // Mark visual failed on parse failure so the UI shows a clear state
    const failedAt = new Date().toISOString()
    const message = err instanceof Error ? err.message : 'Analysis failed'
    await supabase.from('videos').update({
      visual_analysis: { status: 'failed', analyzed_at: failedAt, error: message, overview: null, segments: null } as unknown as Json
    }).eq('id', videoId)

    throw createError({ statusCode: 500, message })
  }

  // --- Normalize segments (labels, times, ms→s detection) ---
  const actualDuration = videoDuration
  const rawSegments = analysis.segments || []
  const rawSegmentCount = rawSegments.length

  const maxEndTime = Math.max(...rawSegments.map(s => s.end_time || 0), 0)
  const timesInMs = actualDuration > 0 && maxEndTime > actualDuration * 2
  if (timesInMs) {
    log.warn('Detected timestamps in milliseconds, converting to seconds', { videoId, maxEndTime, actualDuration })
  }

  const normalizedSegments = rawSegments
    .map((seg, idx) => ({ seg, idx }))
    .filter(({ seg }) => VALID_SEGMENT_LABELS.includes(seg.label))
    .map(({ seg, idx }) => {
      const startRaw = timesInMs ? seg.start_time / 1000 : seg.start_time
      const endRaw = timesInMs ? seg.end_time / 1000 : seg.end_time
      return {
        originalIndex: idx,
        label: seg.label,
        start_time: Math.max(0, startRaw),
        end_time: Math.min(actualDuration, Math.max(startRaw + 0.1, endRaw)),
        transcript_raw: seg.transcript_raw || '',
        script_blueprint: seg.script_blueprint || ''
      }
    })
    .filter(seg => seg.end_time > seg.start_time)

  // --- Match logic flow ---
  let logicFlowId: string | null = null
  if (logicFlows && analysis.logicFlowName) {
    const match = logicFlows.find(lf =>
      lf.name.toLowerCase().includes(analysis.logicFlowName!.toLowerCase()) ||
      analysis.logicFlowName!.toLowerCase().includes(lf.name.toLowerCase().split(' ')[0] || '')
    )
    if (match) {
      logicFlowId = match.id
      log.info('Logic flow matched', { detected: analysis.logicFlowName, matched: match.name, logicFlowId })
    } else {
      log.warn('Logic flow not matched', { detected: analysis.logicFlowName })
    }
  }

  // --- Clean title ---
  const cleanedTitle = analysis.title
    ? sanitizeString(String(analysis.title)).replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim().slice(0, 200) || null
    : null

  const transcript = analysis.transcript || ''
  const confidence = Math.max(0, Math.min(1, analysis.confidence || 0.5))

  const nowIso = new Date().toISOString()

  // --- Normalize visual ---
  // The model returns visual.segments aligned with the raw (pre-filter) segment list.
  // We map each kept segment to the visual entry at its originalIndex.
  const rawVisualSegments = analysis.visual?.segments || []
  const alignedVisualSegments: SegmentVisualAnalysis[] = normalizedSegments.map(
    ns => rawVisualSegments[ns.originalIndex] || ({} as SegmentVisualAnalysis)
  )
  const visualAnalysis: VideoVisualAnalysis = {
    status: 'completed',
    analyzed_at: nowIso,
    error: null,
    overview: analysis.visual?.overview || null,
    segments: alignedVisualSegments.length > 0 ? alignedVisualSegments : null
  }

  // --- Normalize semantic tags (whitelist against taxonomy, dedupe, flatten) ---
  const rawTags = analysis.tags || {}
  const tagCategoriesSeen: Record<string, number> = {}
  let rejectedTagCount = 0
  const normalizedTags: string[] = []
  const seen = new Set<string>()

  for (const category of ['domain', 'format', 'audience', 'product_type', 'production_style'] as const) {
    const allowed = SEMANTIC_TAG_CATEGORIES[category] as readonly string[]
    const input = Array.isArray(rawTags[category]) ? (rawTags[category] as unknown[]) : []
    let kept = 0
    for (const item of input) {
      if (typeof item !== 'string') { rejectedTagCount++; continue }
      if (!allowed.includes(item)) { rejectedTagCount++; continue }
      if (seen.has(item)) continue
      seen.add(item)
      normalizedTags.push(item)
      kept++
    }
    tagCategoriesSeen[category] = kept
  }

  // --- Normalize product context (whitelist category, clip strings, dedupe arrays) ---
  const rawProduct = analysis.product || {}
  const productCategoryRaw = typeof rawProduct.product_category === 'string' ? rawProduct.product_category : null
  const productCategory = productCategoryRaw && (PRODUCT_CATEGORIES as readonly string[]).includes(productCategoryRaw)
    ? (productCategoryRaw as ProductCategory)
    : null
  const pricingRaw = typeof rawProduct.pricing_model === 'string' ? rawProduct.pricing_model : null
  const pricingModel: PricingModel = pricingRaw && (PRICING_MODELS as readonly string[]).includes(pricingRaw)
    ? (pricingRaw as PricingModel)
    : 'unknown'

  function clipString(v: unknown, max: number): string | null {
    if (typeof v !== 'string') return null
    const t = sanitizeString(v).trim()
    if (!t) return null
    return t.length > max ? t.slice(0, max) : t
  }
  function dedupedStringArray(v: unknown, maxItems: number, maxLen: number): string[] {
    if (!Array.isArray(v)) return []
    const out: string[] = []
    const s = new Set<string>()
    for (const item of v) {
      if (typeof item !== 'string') continue
      const clean = sanitizeString(item).trim()
      if (!clean) continue
      const clipped = clean.length > maxLen ? clean.slice(0, maxLen) : clean
      const key = clipped.toLowerCase()
      if (s.has(key)) continue
      s.add(key)
      out.push(clipped)
      if (out.length >= maxItems) break
    }
    return out
  }

  const hasSpecificProduct = rawProduct.has_specific_product === true
  const productContext: ProductContext = {
    product_name: hasSpecificProduct ? clipString(rawProduct.product_name, 120) : null,
    product_category: hasSpecificProduct ? productCategory : null,
    one_liner: hasSpecificProduct ? clipString(rawProduct.one_liner, 120) : null,
    target_user: hasSpecificProduct ? clipString(rawProduct.target_user, 160) : null,
    problem_solved: hasSpecificProduct ? clipString(rawProduct.problem_solved, 200) : null,
    key_features: hasSpecificProduct ? dedupedStringArray(rawProduct.key_features, 6, 120) : [],
    pricing_model: hasSpecificProduct ? pricingModel : 'unknown',
    competitors_mentioned: hasSpecificProduct ? dedupedStringArray(rawProduct.competitors_mentioned, 10, 80) : [],
    has_specific_product: hasSpecificProduct
  }

  // --- Persist video row ---
  const shouldSetTitle = !existingTitle && !!cleanedTitle
  log.info('Updating video record', {
    videoId,
    logicFlowId,
    settingTitle: shouldSetTitle,
    tagCount: normalizedTags.length,
    tagCategoriesSeen,
    rejectedTagCount,
    productCategory: productContext.product_category,
    productName: productContext.product_name,
    hasSpecificProduct: productContext.has_specific_product
  })

  const videoUpdate: Record<string, unknown> = {
    logic_flow_id: logicFlowId,
    script_raw: transcript,
    duration_seconds: videoDuration,
    visual_analysis: visualAnalysis as unknown as Json
  }
  if (shouldSetTitle) videoUpdate.title = cleanedTitle
  // Only overwrite semantic_tags if the model returned at least one valid tag —
  // otherwise preserve whatever's already in the row (per plan).
  if (normalizedTags.length > 0) videoUpdate.semantic_tags = normalizedTags
  videoUpdate.product_context = productContext as unknown as Json

  const { error: updateError } = await supabase
    .from('videos')
    .update(videoUpdate)
    .eq('id', videoId)

  if (updateError) {
    log.error('Failed to update video record', updateError, { videoId })
    throw createError({ statusCode: 500, message: 'Failed to update video record' })
  }

  // --- Replace segments ---
  log.info('Replacing segments', { videoId, newSegmentCount: normalizedSegments.length })
  const { error: deleteError } = await supabase
    .from('segments')
    .delete()
    .eq('video_id', videoId)

  if (deleteError) {
    log.error('Failed to delete existing segments', deleteError, { videoId })
  }

  if (normalizedSegments.length > 0) {
    const segmentInserts = normalizedSegments.map((seg, index) => ({
      video_id: videoId,
      segment_order: index,
      label: seg.label,
      start_time: seg.start_time,
      end_time: seg.end_time,
      transcript_raw: seg.transcript_raw,
      script_blueprint: seg.script_blueprint
    }))

    const { error: insertError } = await supabase
      .from('segments')
      .insert(segmentInserts)

    if (insertError) {
      log.error('Failed to insert segments', insertError, {
        videoId,
        segmentCount: segmentInserts.length,
        sampleSegment: segmentInserts[0]
      })
      throw createError({ statusCode: 500, message: 'Failed to save segments' })
    }
  }

  // --- Generate embedding (best-effort; never fails the pipeline) ---
  try {
    const embeddingInput = [
      cleanedTitle || '',
      productContext.product_name || '',
      productContext.one_liner || '',
      productContext.problem_solved || '',
      productContext.target_user || '',
      productContext.competitors_mentioned.join(' '),
      productContext.key_features.join(' '),
      transcript.slice(0, 4000)
    ].filter(Boolean).join('\n\n')

    if (embeddingInput.trim().length > 0) {
      const embedOp = log.timedOp('generate embedding', { videoId, inputLength: embeddingInput.length })
      const vector = await embedText(ai, embeddingInput)
      const { error: embedUpdateError } = await supabase
        .from('videos')
        .update({ embedding: vector as unknown as Json } as Record<string, unknown>)
        .eq('id', videoId)
      if (embedUpdateError) {
        embedOp.fail(embedUpdateError)
      } else {
        embedOp.done({ dim: vector.length })
      }
    }
  } catch (err) {
    log.warn('Embedding generation failed — video remains searchable via ts_rank only', {
      videoId,
      error: err instanceof Error ? err.message : String(err)
    })
  }

  const filteredOut = rawSegmentCount - normalizedSegments.length
  log.info('Analysis complete', {
    videoId,
    logicFlowName: analysis.logicFlowName,
    confidence,
    transcriptLength: transcript.length,
    rawSegments: rawSegmentCount,
    validSegments: normalizedSegments.length,
    filteredOut,
    segmentLabels: normalizedSegments.map(s => s.label).join(', '),
    productionQuality: visualAnalysis.overview?.production_quality,
    visualSegmentsAligned: alignedVisualSegments.length,
    semanticTagCount: normalizedTags.length,
    tagCategoriesSeen,
    rejectedTagCount: rejectedTagCount > 0 ? rejectedTagCount : undefined
  })

  return {
    segmentCount: normalizedSegments.length,
    logicFlowId,
    logicFlowName: analysis.logicFlowName || null
  }
}
