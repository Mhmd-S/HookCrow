interface RequestBody {
  transcript: string
  segments: Array<{
    label: string
    start_time: number
    end_time: number
    transcript_raw: string
  }>
  logicFlowType?: string
}

interface SegmentAnalysis {
  label: string
  goal: string
  technique: string
  psychology: string
  execution: string
  outcome: string
}

interface SkeletalLogicResponse {
  overview: string
  segments: SegmentAnalysis[]
  keyTakeaways: string[]
}

export default defineEventHandler(async (event): Promise<SkeletalLogicResponse> => {
  const ai = useServerGemini()
  const body = await readBody<RequestBody>(event)

  if (!body.transcript || typeof body.transcript !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'transcript is required and must be a string'
    })
  }

  if (!Array.isArray(body.segments) || body.segments.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'segments array is required'
    })
  }

  const segmentsContext = body.segments
    .map(s => `[${s.label}] (${s.start_time.toFixed(1)}s - ${s.end_time.toFixed(1)}s): "${s.transcript_raw}"`)
    .join('\n')

  const systemPrompt = `You are an expert video content strategist specializing in short-form video analysis.

Your task is to provide a DETAILED ANALYTICAL BREAKDOWN of WHY each segment of a video works. This is NOT about creating templates - it's about understanding the strategic reasoning behind each section.

For each segment, analyze:
1. **Goal**: A GENERALIZED intent derived from the segment that could be reused in any video. It must NOT be specific to the exact words, topic, product, creator, or story in this clip.
   - Write it like a reusable principle (e.g., "Create immediate curiosity", "Reduce skepticism before the pitch", "Increase perceived credibility", "Raise urgency", "Pre-empt common objections")
   - Do NOT mention specific nouns from the transcript, brand names, or proper nouns
   - Avoid referencing "this video" / "this segment" / "the creator" / "the product"
2. **Technique**: What specific persuasion or storytelling technique is being used? (e.g., "Open loop", "Pattern interrupt", "Social proof", "Future pacing")
3. **Psychology**: Why does this work on the audience psychologically? Reference behavioral principles like cognitive biases, emotional triggers, or decision-making frameworks.
4. **Execution**: How is the technique executed in the actual content? What specific choices make it effective?
5. **Outcome**: What mental/emotional state should the viewer be in after this segment? How does it set up the next segment?

Be specific, analytical, and educational. Explain the "why" behind everything.

Return your analysis as valid JSON.`

  const userPrompt = `Analyze this video's structure and explain WHY each segment works:

${body.logicFlowType ? `Framework used: ${body.logicFlowType}\n\n` : ''}Full transcript:
"${body.transcript}"

Segmented breakdown:
${segmentsContext}

Return a JSON object with this exact structure:
{
  "overview": "A 2-3 sentence summary of the overall persuasion strategy and why this video structure is effective",
  "segments": [
    {
      "label": "Hook|Bridge|Value|Proof|CTA",
      "goal": "What this segment aims to achieve",
      "technique": "The specific technique or pattern being used",
      "psychology": "Why this works on the human brain - reference specific principles",
      "execution": "How the technique is specifically implemented in this content",
      "outcome": "The viewer's state after this segment and how it connects to the next"
    }
  ],
  "keyTakeaways": ["3-4 bullet points of the most important strategic lessons from this video's structure"]
}`

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.4,
        responseMimeType: 'application/json'
      }
    })

    const content = response.text
    if (!content) {
      throw new Error('No response from AI')
    }

    const analysis = JSON.parse(content) as SkeletalLogicResponse

    // Validate the response structure
    if (!analysis.overview || !Array.isArray(analysis.segments)) {
      throw new Error('Invalid response structure from AI')
    }

    return {
      overview: analysis.overview,
      segments: analysis.segments.map(seg => ({
        label: seg.label || '',
        goal: seg.goal || '',
        technique: seg.technique || '',
        psychology: seg.psychology || '',
        execution: seg.execution || '',
        outcome: seg.outcome || ''
      })),
      keyTakeaways: analysis.keyTakeaways || []
    }
  } catch (err) {
    console.error('Skeletal logic generation error:', err)
    throw createError({
      statusCode: 500,
      statusMessage: err instanceof Error ? err.message : 'Failed to generate skeletal logic'
    })
  }
})
