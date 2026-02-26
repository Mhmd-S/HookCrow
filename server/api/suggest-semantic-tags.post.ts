interface RequestBody {
  transcript: string
}

interface SuggestTagsResponse {
  domain: string[]
  format: string[]
  audience: string[]
  confidence: number
}

// Available tags - must match the SEMANTIC_TAG_CATEGORIES in types/index.ts
const AVAILABLE_TAGS = {
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
  audience: [
    'Beginner-friendly',
    'Intermediate',
    'Advanced/Expert',
    'Professional',
    'Casual/General'
  ]
}

export default defineEventHandler(async (event): Promise<SuggestTagsResponse> => {
  const ai = useServerGemini()
  const body = await readBody<RequestBody>(event)

  if (!body.transcript || typeof body.transcript !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'transcript is required and must be a string'
    })
  }

  const systemPrompt = `You are a content categorization specialist. Your job is to analyze video transcripts and suggest appropriate tags from a predefined list.

You must ONLY select tags from the provided lists. Do not suggest any tags that are not in the lists.

Available tags by category:

DOMAIN (what is the video about - select 1-3 most relevant):
${AVAILABLE_TAGS.domain.join(', ')}

FORMAT (how is the content presented - select 1-2):
${AVAILABLE_TAGS.format.join(', ')}

AUDIENCE (who is this for - select 1):
${AVAILABLE_TAGS.audience.join(', ')}

Be precise and only select tags that clearly apply to the content. It's better to select fewer highly relevant tags than many loosely related ones.

Return your analysis as valid JSON.`

  const userPrompt = `Analyze this video transcript and suggest the most appropriate tags:

"${body.transcript}"

Return a JSON object with this exact structure:
{
  "domain": ["Tag1", "Tag2"],
  "format": ["Tag1"],
  "audience": ["Tag1"],
  "confidence": 0.0 to 1.0 confidence score for your tag suggestions
}`

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
    if (!content) {
      throw new Error('No response from AI')
    }

    const suggestions = JSON.parse(content) as SuggestTagsResponse

    // Validate that suggested tags are in our allowed lists
    const validatedDomain = (suggestions.domain || []).filter(tag =>
      AVAILABLE_TAGS.domain.includes(tag)
    )
    const validatedFormat = (suggestions.format || []).filter(tag =>
      AVAILABLE_TAGS.format.includes(tag)
    )
    const validatedAudience = (suggestions.audience || []).filter(tag =>
      AVAILABLE_TAGS.audience.includes(tag)
    )

    return {
      domain: validatedDomain,
      format: validatedFormat,
      audience: validatedAudience,
      confidence: Math.max(0, Math.min(1, suggestions.confidence || 0.5))
    }
  } catch (err) {
    console.error('Tag suggestion error:', err)
    throw createError({
      statusCode: 500,
      statusMessage: err instanceof Error ? err.message : 'Failed to suggest tags'
    })
  }
})
