interface RequestBody {
  transcript: string
  videoContext?: string
  logicFlowType?: string
}

// Template-specific instructions for each logic flow type
const LOGIC_FLOW_PROMPTS: Record<string, string> = {
  'PAS (Problem-Agitation-Solution)': `Structure the template following the PAS framework:
- Hook (0-10%): State a relatable pain point using [PAIN POINT] placeholder
- Bridge (10-25%): Agitate the problem, make them feel the frustration
- Value (25-70%): Introduce [PRODUCT/SOLUTION] as the answer
- Proof (70-85%): Include social proof or results with [STAT], [NUMBER]
- CTA (85-100%): Clear call to action`,

  'Us vs. Them': `Structure the template as a contrast between old and new:
- Hook: "Most people do [OLD WAY]..." or similar contrast opener
- Bridge: Explain why the old way is broken using [PROBLEM] placeholders
- Value: Reveal the better approach with [NEW METHOD] or [SOLUTION]
- Proof: Quick comparison showing improvement
- CTA: Invite them to try the new way`,

  'Listicle / Top N': `Structure the template as a numbered list:
- Hook: "[NUMBER] [THINGS] you need to know about [TOPIC]"
- Value sections: Multiple items (#1, #2, #3, etc.) with brief explanations
- Each item should use placeholders like [TIP], [ITEM], [BENEFIT]
- CTA: Follow for more or save for later`,

  'Mythbuster': `Structure the template to debunk a misconception:
- Hook: "Stop believing [COMMON MYTH]" or "Everyone thinks [MYTH] but..."
- Bridge: Explain why people believe this myth
- Value: Reveal the truth with [FACT], [EVIDENCE], [EXPLANATION]
- Proof: Cite source or show evidence
- CTA: Share with someone who needs to hear this`,

  'Before/After': `Structure the template to show transformation:
- Hook: Show the "before" state with [PROBLEM], [STRUGGLE]
- Bridge: Describe what wasn't working
- Value: Show the transformation process using [METHOD], [STEPS]
- Proof: Reveal the "after" with [RESULT], [OUTCOME]
- CTA: Want this result? Here's how`,

  'Tutorial / How-To': `Structure the template as step-by-step instructions:
- Hook: "Here's how to [ACHIEVE RESULT]"
- Value: Multiple steps (Step 1, Step 2, Step 3) with [ACTION] placeholders
- Each step should be clear and actionable
- Proof: Show the finished result
- CTA: Save this for later / Follow for more tutorials`,

  'Story Arc': `Structure the template as a narrative:
- Hook: Open with an intriguing setup using [SITUATION], [QUESTION]
- Bridge: Introduce the challenge or conflict with [OBSTACLE]
- Value: The journey - use [EXPERIENCE], [LESSON], [DISCOVERY]
- Proof: The resolution or transformation with [OUTCOME]
- CTA: What this means for the viewer`,

  'Testimonial': `Structure the template around a customer story:
- Hook: "[NAME] was struggling with [PROBLEM]..."
- Bridge: Describe their situation before with [CHALLENGE], [PAIN POINT]
- Value: How they discovered [PRODUCT/SOLUTION]
- Proof: Their results with [STAT], [RESULT], [TIMEFRAME]
- CTA: Ready for your own transformation?`
}

const log = createLogger('generate-transcript-template')

export default defineEventHandler(async (event) => {
  const ai = useServerGemini()
  const body = await readBody<RequestBody>(event)

  if (!body.transcript || typeof body.transcript !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'transcript is required and must be a string'
    })
  }

  log.info('Generating transcript template', {
    transcriptLength: body.transcript.length,
    logicFlowType: body.logicFlowType || 'none',
    hasVideoContext: !!body.videoContext
  })

  // Get template-specific instructions if a logic flow type is provided
  const templateInstructions = body.logicFlowType
    ? LOGIC_FLOW_PROMPTS[body.logicFlowType] || ''
    : ''

  if (body.logicFlowType && !templateInstructions) {
    log.warn('Unknown logic flow type, no template instructions available', { logicFlowType: body.logicFlowType })
  }

  const systemPrompt = `You are a video script template generator. Your task is to convert a raw video transcript into a reusable template skeleton.

  Rules:
  1. Replace specific names, products, brands with placeholders like [PRODUCT], [NAME], [BRAND], [COMPANY]
  2. Replace specific numbers with [NUMBER], [STAT], [PERCENTAGE]
  3. Replace specific locations with [LOCATION], [CITY], [COUNTRY]
  4. Replace specific dates/times with [DATE], [TIME], [TIMEFRAME]
  5. Replace specific prices with [PRICE], [AMOUNT]
  6. Keep the emotional tone markers and structural flow intact
  7. Add timing markers where natural pauses occur: [PAUSE], [BEAT]
  8. Mark emphasis points with [EMPHASIS]
  9. Preserve the hook, transition, value delivery, and CTA structure
  10. Add notes in brackets for delivery style: [excited], [serious], [casual]
  ${templateInstructions ? `\nTemplate Framework:\n${templateInstructions}` : ''}

  Output ONLY the template skeleton, no explanations.`

  const prompt = `Convert this video transcript into a reusable template skeleton${body.logicFlowType ? ` following the "${body.logicFlowType}" framework` : ''}:

${body.videoContext ? `Context: ${body.videoContext}\n\n` : ''}Transcript:
"${body.transcript}"

Template skeleton:`

  const geminiOp = log.timedOp('Gemini template generation', { model: 'gemini-2.5-flash', logicFlowType: body.logicFlowType })
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.3,
        maxOutputTokens: 1024,
        topP: 0.9
      }
    })

    const template = response.text?.trim() || ''

    geminiOp.done({ templateLength: template.length })

    return { template }
  } catch (err) {
    geminiOp.fail(err)
    throw createError({
      statusCode: 500,
      statusMessage: err instanceof Error ? err.message : 'Failed to generate template'
    })
  }
})
