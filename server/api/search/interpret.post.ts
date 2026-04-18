interface InterpretRequest {
  query: string
}

interface InterpretResponse {
  keywords: string[]
  tags: string[]
  logicFlowTypes: string[]
  marketingAngles: string[]
  productTerms: string[]
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
  // Anonymous callers are allowed so the product/service search works before
  // signup. Rate limited per IP to bound Gemini spend under abuse.
  checkRateLimit(event, { bucket: 'search-interpret', limit: 20, windowMs: 5 * 60 * 1000 })

  const ai = useServerGemini()
  const body = await readBody<InterpretRequest>(event)

  const query = sanitizeString(validateRequired(body.query, 'query'))
  validateString(query, 'query', { minLength: 2, maxLength: 500 })

  log.info('Interpreting search query', { query })

  const systemPrompt = `You are a search query interpreter for a short-form marketing video template library (TikTok, Instagram Reels, YouTube Shorts).

Most users are marketers who type in the product or service they're selling (e.g. "meal planning app", "B2B SaaS CRM", "organic skincare", "online course"). Your job is to turn that into structured search parameters that surface templates the marketer can steal.

Available domain tags: ${AVAILABLE_TAGS.domain.join(', ')}
Available format tags: ${AVAILABLE_TAGS.format.join(', ')}
Available audience tags: ${AVAILABLE_TAGS.audience.join(', ')}
Available logic flow types: ${LOGIC_FLOW_TYPES.join(', ')}

Rules:
- Only use tags from the provided lists — never invent new ones.
- Extract 2-5 "keywords" — literal terms likely to appear in video titles, descriptions, or transcripts for this product category.
- Extract 3-6 "marketingAngles" — adjacent terms a creator would use to SELL this product (e.g. "meal planning app" → ["download", "free trial", "time saver", "recipes", "grocery list"]; "skincare" → ["routine", "before after", "glow", "results", "ingredients"]). These broaden full-text recall.
- Extract 2-6 "productTerms" — brand/competitor names and category aliases that a recipe's product_context would plausibly mention (e.g. "Notion competitor" → ["Notion", "note taking", "docs", "wiki"]; "CRM for realtors" → ["CRM", "real estate", "customer tracker", "pipeline"]; "meal planning app" → ["meal planner", "MyFitnessPal", "Mealime", "recipe app"]). Use actual product names when the query implies a space with known players. Empty array if the query isn't product-oriented.
- Map industries and products to the closest domain tag (e.g., "SaaS" or "app" → "Technology", "gym" → "Health & Fitness", "course" → "Education").
- If the query mentions a content style, map it to a format tag (e.g., "how to" → "Tutorial", "review" → "Review").
- Include 1-3 logic flow types that work well for marketing this category (e.g., consumer app → ["PAS (Problem-Agitation-Solution)", "Before/After", "Tutorial/How-To"]). Empty array if unsure.
- Phrase "intent" as marketer-facing: "Templates for marketing <thing>" (e.g., "Templates for marketing a meal planning app"). If the query isn't a product/service, fall back to "Templates about <topic>".
- Return valid JSON only.`

  const userPrompt = `Interpret this search query: "${query}"

Return JSON:
{
  "keywords": ["keyword1", "keyword2"],
  "marketingAngles": ["angle1", "angle2"],
  "productTerms": ["competitor name", "category alias"],
  "tags": ["ExactTagFromList1", "ExactTagFromList2"],
  "logicFlowTypes": ["Exact Logic Flow Name"],
  "intent": "Templates for marketing <thing>",
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
        maxOutputTokens: 2048,
        responseMimeType: 'application/json'
      }
    })

    const content = response.text
    if (!content) throw new Error('No response from AI')

    log.info('Gemini response received', { responseLength: content.length })

    const result = JSON.parse(content) as {
      keywords?: string[]
      marketingAngles?: string[]
      productTerms?: string[]
      tags?: string[]
      logicFlowTypes?: string[]
      logicFlowType?: string | null
      intent?: string
      confidence?: number
    }

    // Validate tags against known lists
    const rawTags = result.tags || []
    const validatedTags = rawTags.filter(tag => ALL_TAGS.includes(tag))
    const invalidTags = rawTags.filter(tag => !ALL_TAGS.includes(tag))

    if (invalidTags.length > 0) {
      log.warn('Filtered out invalid tags from AI response', { invalidTags })
    }

    // Validate logic flow types — accept either new array field or legacy single-string.
    const rawLogicFlows = Array.isArray(result.logicFlowTypes)
      ? result.logicFlowTypes
      : result.logicFlowType
        ? [result.logicFlowType]
        : []
    const validLogicFlows = rawLogicFlows.filter(
      lf => typeof lf === 'string' && LOGIC_FLOW_TYPES.some(known => known.toLowerCase() === lf.toLowerCase())
    )

    const interpreted: InterpretResponse = {
      keywords: (result.keywords || []).slice(0, 5).map(k => sanitizeString(String(k))),
      marketingAngles: (result.marketingAngles || []).slice(0, 6).map(a => sanitizeString(String(a))),
      productTerms: (result.productTerms || []).slice(0, 6).map(t => sanitizeString(String(t))).filter(Boolean),
      tags: validatedTags,
      logicFlowTypes: validLogicFlows,
      intent: sanitizeString(String(result.intent || query)),
      confidence: Math.max(0, Math.min(1, result.confidence || 0.5))
    }

    op.done({
      keywords: interpreted.keywords,
      marketingAngles: interpreted.marketingAngles,
      productTerms: interpreted.productTerms,
      tags: interpreted.tags,
      logicFlowTypes: interpreted.logicFlowTypes,
      confidence: interpreted.confidence
    })

    return interpreted
  } catch (err) {
    op.fail(err)
    // Graceful fallback: split query into keywords so search never breaks
    log.warn('Falling back to keyword extraction', { query })
    return {
      keywords: query.split(/\s+/).filter(w => w.length > 2).slice(0, 5),
      marketingAngles: [],
      productTerms: [],
      tags: [],
      logicFlowTypes: [],
      intent: query,
      confidence: 0
    }
  }
})
