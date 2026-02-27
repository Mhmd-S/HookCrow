interface TranscriptSegment {
  start: number
  end: number
  text: string
}

interface AnalyzeRequest {
  transcript: string
  segments: TranscriptSegment[]
  videoDuration: number
}

interface AnalyzedSegment {
  label: string
  start_time: number
  end_time: number
  transcript_raw: string
  script_blueprint: string
}

interface AnalyzeResponse {
  logicFlowId: string | null
  logicFlowName: string
  confidence: number
  segments: AnalyzedSegment[]
}

const LOGIC_FLOW_PATTERNS = [
  {
    name: 'PAS (Problem-Agitation-Solution)',
    pattern: 'Hook → Agitation/Bridge → Solution/Value → Proof → CTA',
    indicators: ['problem', 'pain point', 'frustration', 'solution', 'here\'s how']
  },
  {
    name: 'Us vs. Them',
    pattern: 'Hook → Old Way → New/Better Way → Proof → CTA',
    indicators: ['most people', 'instead of', 'better way', 'vs', 'compared to']
  },
  {
    name: 'Listicle / Top N',
    pattern: 'Hook → Item 1 → Item 2 → Item 3 → CTA',
    indicators: ['number', 'tips', 'ways', 'things', 'first', 'second', 'third']
  },
  {
    name: 'Mythbuster',
    pattern: 'Hook (Myth) → Why People Believe → Truth → Proof → CTA',
    indicators: ['stop believing', 'myth', 'actually', 'the truth', 'wrong']
  },
  {
    name: 'Before/After',
    pattern: 'Hook (Before) → Problem → Transformation → After/Result → CTA',
    indicators: ['before', 'after', 'transformation', 'result', 'changed']
  },
  {
    name: 'Tutorial / How-To',
    pattern: 'Hook → Step 1 → Step 2 → Step 3 → Result → CTA',
    indicators: ['how to', 'step', 'tutorial', 'guide', 'learn']
  },
  {
    name: 'Story Arc',
    pattern: 'Hook → Conflict → Journey → Resolution → CTA',
    indicators: ['story', 'happened', 'then', 'finally', 'learned']
  },
  {
    name: 'Testimonial',
    pattern: 'Hook → Problem Before → Discovery → Results → CTA',
    indicators: ['was struggling', 'found', 'results', 'testimonial', 'worked for me']
  }
]

const log = createLogger('analyze-transcript')

export default defineEventHandler(async (event): Promise<AnalyzeResponse> => {
  const ai = useServerGemini()
  const body = await readBody<AnalyzeRequest>(event)

  if (!body?.transcript || typeof body.transcript !== 'string') {
    throw createError({
      statusCode: 400,
      message: 'transcript is required'
    })
  }

  if (!Array.isArray(body?.segments) || body.segments.length === 0) {
    throw createError({
      statusCode: 400,
      message: 'segments array is required'
    })
  }

  const videoDuration = body.videoDuration || body.segments[body.segments.length - 1]?.end || 30
  log.info('Analyzing transcript', {
    transcriptLength: body.transcript.length,
    inputSegments: body.segments.length,
    videoDuration
  })

  // Fetch existing logic flows from database
  const supabase = useServerSupabase()
  const { data: logicFlows } = await supabase
    .from('logic_flows')
    .select('id, name, description')

  log.info('Logic flows loaded', { count: logicFlows?.length || 0, source: logicFlows ? 'database' : 'fallback' })

  const logicFlowsContext = logicFlows?.map(lf => `- ${lf.name}: ${lf.description}`).join('\n') ||
    LOGIC_FLOW_PATTERNS.map(p => `- ${p.name}: ${p.pattern}`).join('\n')

  const systemPrompt = `You are a video content analyst specializing in short-form video structure analysis.
Your job is to analyze video transcripts and identify the skeletal structure (logic flow) being used.

Available logic flow patterns:
${logicFlowsContext}

Segment labels to use: Hook, Bridge, Value, Proof, CTA

Guidelines:
- Hook: The opening that grabs attention (usually first 0-5 seconds)
- Bridge: The transition that builds context or agitates the problem
- Value: The main content, solution, or information being delivered
- Proof: Evidence, results, or social proof
- CTA: Call to action at the end

When creating script blueprints, replace specific details with [PLACEHOLDERS] in CAPS, like:
- [PRODUCT] for product names
- [PAIN POINT] for problems
- [NUMBER] for statistics
- [RESULT] for outcomes
- [TOPIC] for subject matter

Return your analysis as valid JSON.`

  const userPrompt = `Analyze this video transcript and identify the structure:

Full transcript:
"${body.transcript}"

Timestamped segments:
${body.segments.map(s => `[${s.start.toFixed(1)}s - ${s.end.toFixed(1)}s]: "${s.text}"`).join('\n')}

Video duration: ${videoDuration} seconds

Return a JSON object with this exact structure:
{
  "logicFlowName": "Name of the detected pattern (must match one from the list above)",
  "confidence": 0.0 to 1.0 confidence score,
  "segments": [
    {
      "label": "Hook|Bridge|Value|Proof|CTA",
      "start_time": start in seconds,
      "end_time": end in seconds,
      "transcript_raw": "exact transcript text for this segment",
      "script_blueprint": "template version with [PLACEHOLDERS]"
    }
  ]
}

Group the timestamped segments logically into the appropriate labels (Hook, Bridge, Value, Proof, CTA).
Not all labels are required - use only what fits the content.
Ensure segments cover the full video duration without overlapping.`

  const geminiOp = log.timedOp('Gemini structure analysis', { model: 'gemini-2.5-flash' })
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.3,
        responseMimeType: 'application/json'
      }
    })

    const content = response.text
    if (!content) {
      throw new Error('No response from AI')
    }

    log.info('Gemini response received', { responseLength: content.length })

    const analysis = JSON.parse(content) as {
      logicFlowName: string
      confidence: number
      segments: AnalyzedSegment[]
    }

    // Match the detected logic flow to an existing one in the database
    let logicFlowId: string | null = null
    if (logicFlows && analysis.logicFlowName) {
      const match = logicFlows.find(lf =>
        lf.name.toLowerCase().includes(analysis.logicFlowName.toLowerCase()) ||
        analysis.logicFlowName.toLowerCase().includes(lf.name.toLowerCase().split(' ')[0])
      )
      if (match) {
        logicFlowId = match.id
        log.info('Logic flow matched', { detected: analysis.logicFlowName, matched: match.name, logicFlowId })
      } else {
        log.warn('Logic flow not matched', { detected: analysis.logicFlowName })
      }
    }

    // Validate and normalize segments
    const validLabels = ['Hook', 'Bridge', 'Value', 'Proof', 'CTA']
    const rawCount = analysis.segments?.length || 0
    const normalizedSegments = analysis.segments
      .filter(seg => validLabels.includes(seg.label))
      .map(seg => ({
        label: seg.label,
        start_time: Math.max(0, seg.start_time),
        end_time: Math.min(videoDuration, seg.end_time),
        transcript_raw: seg.transcript_raw || '',
        script_blueprint: seg.script_blueprint || ''
      }))

    geminiOp.done({
      logicFlowName: analysis.logicFlowName,
      confidence: analysis.confidence,
      rawSegments: rawCount,
      validSegments: normalizedSegments.length,
      segmentLabels: normalizedSegments.map(s => s.label).join(', ')
    })

    return {
      logicFlowId,
      logicFlowName: analysis.logicFlowName,
      confidence: Math.max(0, Math.min(1, analysis.confidence || 0.5)),
      segments: normalizedSegments
    }
  } catch (err) {
    geminiOp.fail(err)
    throw createError({
      statusCode: 500,
      message: err instanceof Error ? err.message : 'Analysis failed'
    })
  }
})
