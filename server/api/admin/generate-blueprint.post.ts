interface GenerateBlueprintBody {
  transcript: string
  segmentLabel: string
}

const log = createLogger('generate-blueprint')

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const ai = useServerGemini()
  const body = await readBody<GenerateBlueprintBody>(event)

  if (!body.transcript || body.transcript.trim().length === 0) {
    throw createError({
      statusCode: 400,
      message: 'Transcript is required'
    })
  }

  log.info('Generating blueprint', { segmentLabel: body.segmentLabel, transcriptLength: body.transcript.length })

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

  const geminiOp = log.timedOp('Gemini blueprint generation', { model: 'gemini-2.5-flash', segmentLabel: body.segmentLabel })
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Convert this transcript into a reusable blueprint template:\n\n"${body.transcript}"`,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.3,
        maxOutputTokens: 500
      }
    })

    const blueprint = response.text?.trim() || ''

    geminiOp.done({ blueprintLength: blueprint.length })

    return { blueprint }
  } catch (err) {
    geminiOp.fail(err)
    throw createError({
      statusCode: 500,
      message: err instanceof Error ? err.message : 'Failed to generate blueprint'
    })
  }
})
