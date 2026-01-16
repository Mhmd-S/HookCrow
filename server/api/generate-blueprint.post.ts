import OpenAI from 'openai'

interface GenerateBlueprintBody {
  transcript: string
  segmentLabel: string
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  if (!config.openaiApiKey) {
    throw createError({
      statusCode: 500,
      message: 'OpenAI API key not configured'
    })
  }

  const body = await readBody<GenerateBlueprintBody>(event)

  if (!body.transcript || body.transcript.trim().length === 0) {
    throw createError({
      statusCode: 400,
      message: 'Transcript is required'
    })
  }

  const openai = new OpenAI({
    apiKey: config.openaiApiKey as string
  })

  const systemPrompt = `You are an expert at analyzing short-form video scripts and converting them into reusable templates.

Your task is to take a transcript from a video segment and convert it into a "blueprint" - a template version where specific details are replaced with [bracketed placeholders] that others can fill in.

Rules:
- Replace specific products, names, brands with [Product], [Name], [Brand]
- Replace specific numbers/stats with [Number], [Stat], [Percentage]
- Replace specific pain points with [Pain Point], [Problem]
- Replace specific benefits with [Benefit], [Result], [Outcome]
- Replace specific actions with [Action], [Step]
- Keep the sentence structure and flow intact
- Keep emotional words and power phrases
- The blueprint should be immediately usable by someone else

Segment type context: ${body.segmentLabel}
- Hook: Focus on attention-grabbing pattern
- Bridge: Focus on transition/connection pattern
- Value: Focus on content delivery pattern
- Proof: Focus on credibility/evidence pattern
- CTA: Focus on call-to-action pattern`

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Convert this transcript into a reusable blueprint template:\n\n"${body.transcript}"` }
      ],
      max_tokens: 500,
      temperature: 0.3
    })

    const blueprint = completion.choices[0]?.message?.content?.trim() || ''

    return { blueprint }
  } catch (err) {
    console.error('Blueprint generation error:', err)
    throw createError({
      statusCode: 500,
      message: err instanceof Error ? err.message : 'Failed to generate blueprint'
    })
  }
})
