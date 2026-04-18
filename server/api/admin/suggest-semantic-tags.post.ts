import { SEMANTIC_TAG_CATEGORIES } from '~/types'

interface RequestBody {
  transcript: string
}

interface SuggestTagsResponse {
  domain: string[]
  format: string[]
  audience: string[]
  product_type: string[]
  production_style: string[]
  confidence: number
}

const CATEGORIES = ['domain', 'format', 'audience', 'product_type', 'production_style'] as const
type Category = typeof CATEGORIES[number]

const log = createLogger('suggest-semantic-tags')

export default defineEventHandler(async (event): Promise<SuggestTagsResponse> => {
  await requireAdmin(event)

  const ai = useServerGemini()
  const body = await readBody<RequestBody>(event)

  if (!body.transcript || typeof body.transcript !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'transcript is required and must be a string'
    })
  }

  log.info('Suggesting semantic tags', { transcriptLength: body.transcript.length })

  const systemPrompt = `You are a content categorization specialist for short-form marketing videos. Your job is to analyze transcripts and suggest tags from a predefined vocabulary.

You must ONLY select tags from the provided lists. Do not invent new tags.

Available tags by category:

DOMAIN (what is the video about — select 1–3 most relevant):
${SEMANTIC_TAG_CATEGORIES.domain.join(', ')}

FORMAT (how is the content presented — select 1–2):
${SEMANTIC_TAG_CATEGORIES.format.join(', ')}

AUDIENCE (who is this for — select exactly 1):
${SEMANTIC_TAG_CATEGORIES.audience.join(', ')}

PRODUCT_TYPE (what product/service is being advertised — select 1–2; use "Non-Product (Personal Brand)" if it's pure brand content):
${SEMANTIC_TAG_CATEGORIES.product_type.join(', ')}

PRODUCTION_STYLE (the visual/production aesthetic — select 1–2). IMPORTANT: you are only seeing the transcript, not the video. Only select a production_style tag if the transcript gives clear signal (e.g. "welcome to my studio", "POV", "here's my screen"). If you cannot tell, return an empty array for production_style rather than guessing.
${SEMANTIC_TAG_CATEGORIES.production_style.join(', ')}

Be precise. It's better to select fewer highly-relevant tags than many loosely-related ones.

Return valid JSON only.`

  const userPrompt = `Analyze this video transcript and suggest the most appropriate tags:

"${body.transcript}"

Return a JSON object with this exact structure:
{
  "domain": ["Tag1", "Tag2"],
  "format": ["Tag1"],
  "audience": ["Tag1"],
  "product_type": ["Tag1"],
  "production_style": [],
  "confidence": 0.0 to 1.0
}`

  const geminiOp = log.timedOp('Gemini tag suggestion', { model: 'gemini-2.5-flash' })
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.2,
        responseMimeType: 'application/json'
      }
    })

    const content = response.text
    if (!content) throw new Error('No response from AI')

    log.info('Gemini response received', { responseLength: content.length })

    const suggestions = JSON.parse(content) as Partial<Record<Category, unknown>> & { confidence?: number }

    const validated: Record<Category, string[]> = {
      domain: [],
      format: [],
      audience: [],
      product_type: [],
      production_style: []
    }
    const invalidCounts: Partial<Record<Category, number>> = {}

    for (const category of CATEGORIES) {
      const allowed = SEMANTIC_TAG_CATEGORIES[category] as readonly string[]
      const raw = Array.isArray(suggestions[category]) ? (suggestions[category] as unknown[]) : []
      let invalid = 0
      for (const item of raw) {
        if (typeof item === 'string' && allowed.includes(item)) {
          if (!validated[category].includes(item)) validated[category].push(item)
        } else {
          invalid++
        }
      }
      if (invalid > 0) invalidCounts[category] = invalid
    }

    if (Object.keys(invalidCounts).length > 0) {
      log.warn('Filtered out invalid tags from AI response', invalidCounts)
    }

    const confidence = Math.max(0, Math.min(1, suggestions.confidence || 0.5))

    geminiOp.done({
      ...validated,
      confidence,
      invalidCounts: Object.keys(invalidCounts).length ? invalidCounts : undefined
    })

    return { ...validated, confidence }
  } catch (err) {
    geminiOp.fail(err)
    throw createError({
      statusCode: 500,
      statusMessage: err instanceof Error ? err.message : 'Failed to suggest tags'
    })
  }
})
