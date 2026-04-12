interface InterpretRequest {
  query: string
}

interface InterpretResponse {
  keywords: string[]
  tags: string[]
  logicFlowType: string | null
  intent: string
  confidence: number
}

// Available tags — must match SEMANTIC_TAG_CATEGORIES in types/index.ts
const AVAILABLE_TAGS = {
  domain: [
    'Education', 'Business', 'Technology', 'Food & Cooking', 'Health & Fitness',
    'Finance', 'Entertainment', 'Lifestyle', 'Beauty & Fashion', 'Travel',
    'Sports', 'Gaming', 'DIY & Crafts', 'Parenting', 'Relationships',
    'Productivity', 'Marketing', 'Real Estate', 'Music', 'Art & Design',
    'Science', 'News & Current Events', 'Career & Work', 'Personal Development',
    'Home & Garden', 'Pets & Animals', 'Automotive', 'Photography & Video'
  ],
  format: [
    'Tutorial', 'Review', 'Story/Narrative', 'Tips & Tricks', 'Comparison',
    'Transformation', 'Day-in-the-life', 'Behind-the-scenes', 'Q&A', 'Challenge',
    'Reaction', 'Unboxing', 'Explainer', 'Motivation', 'Comedy/Humor', 'Opinion/Commentary'
  ],
  audience: [
    'Beginner-friendly', 'Intermediate', 'Advanced/Expert', 'Professional', 'Casual/General'
  ]
}

const ALL_TAGS = [
  ...AVAILABLE_TAGS.domain,
  ...AVAILABLE_TAGS.format,
  ...AVAILABLE_TAGS.audience
]

const LOGIC_FLOW_TYPES = [
  'PAS (Problem-Agitation-Solution)',
  'Us vs. Them',
  'Listicle/Top N',
  'Mythbuster',
  'Before/After',
  'Tutorial/How-To',
  'Story Arc',
  'Testimonial'
]

const log = createLogger('search-interpret')

export default defineEventHandler(async (event): Promise<InterpretResponse> => {
  await requireAuth(event)
  const ai = useServerGemini()
  const body = await readBody<InterpretRequest>(event)

  const query = sanitizeString(validateRequired(body.query, 'query'))
  validateString(query, 'query', { minLength: 2, maxLength: 500 })

  log.info('Interpreting search query', { query })

  const systemPrompt = `You are a search query interpreter for a short-form video template library (TikTok, Instagram Reels, YouTube Shorts).

Users search using natural language to find video templates. Your job is to extract structured search parameters from their query.

Available domain tags: ${AVAILABLE_TAGS.domain.join(', ')}
Available format tags: ${AVAILABLE_TAGS.format.join(', ')}
Available audience tags: ${AVAILABLE_TAGS.audience.join(', ')}
Available logic flow types: ${LOGIC_FLOW_TYPES.join(', ')}

Rules:
- Only use tags from the provided lists — never invent new ones.
- Extract 2-5 meaningful keywords that would appear in video titles, descriptions, or transcripts.
- Map industries and topics to the closest domain tag (e.g., "SaaS" or "software" → "Technology", "gym" → "Health & Fitness").
- If the query mentions a content style, map it to a format tag (e.g., "how to" → "Tutorial", "review" → "Review").
- If a logic flow type is implied, include it (e.g., "problem solution" → "PAS (Problem-Agitation-Solution)").
- Return valid JSON only.`

  const userPrompt = `Interpret this search query: "${query}"

Return JSON:
{
  "keywords": ["keyword1", "keyword2"],
  "tags": ["ExactTagFromList1", "ExactTagFromList2"],
  "logicFlowType": "Exact Logic Flow Name or null",
  "intent": "brief natural language description of what the user is looking for",
  "confidence": 0.0 to 1.0
}`

  const op = log.timedOp('Gemini search interpretation', { query })
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.1,
        maxOutputTokens: 500,
        responseMimeType: 'application/json'
      }
    })

    const content = response.text
    if (!content) throw new Error('No response from AI')

    log.info('Gemini response received', { responseLength: content.length })

    const result = JSON.parse(content) as InterpretResponse

    // Validate tags against known lists
    const rawTags = result.tags || []
    const validatedTags = rawTags.filter(tag => ALL_TAGS.includes(tag))
    const invalidTags = rawTags.filter(tag => !ALL_TAGS.includes(tag))

    if (invalidTags.length > 0) {
      log.warn('Filtered out invalid tags from AI response', { invalidTags })
    }

    // Validate logic flow type
    const validLogicFlow = result.logicFlowType && LOGIC_FLOW_TYPES.some(
      lf => lf.toLowerCase() === result.logicFlowType!.toLowerCase()
    ) ? result.logicFlowType : null

    const interpreted: InterpretResponse = {
      keywords: (result.keywords || []).slice(0, 5).map(k => sanitizeString(String(k))),
      tags: validatedTags,
      logicFlowType: validLogicFlow,
      intent: sanitizeString(String(result.intent || query)),
      confidence: Math.max(0, Math.min(1, result.confidence || 0.5))
    }

    op.done({
      keywords: interpreted.keywords,
      tags: interpreted.tags,
      logicFlowType: interpreted.logicFlowType,
      confidence: interpreted.confidence
    })

    return interpreted
  } catch (err) {
    op.fail(err)
    // Graceful fallback: split query into keywords so search never breaks
    log.warn('Falling back to keyword extraction', { query })
    return {
      keywords: query.split(/\s+/).filter(w => w.length > 2).slice(0, 5),
      tags: [],
      logicFlowType: null,
      intent: query,
      confidence: 0
    }
  }
})
