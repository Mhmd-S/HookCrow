import type { ProductContext, ProductCategory, PricingModel } from '~/types'
import { PRODUCT_CATEGORIES, PRICING_MODELS } from '~/types'
import type { Json } from '~/types/database'

interface ReembedRequest {
  batchSize?: number
}

interface ReembedResponse {
  processed: number
  remaining: number
  errors: Array<{ id: string; error: string }>
}

const log = createLogger('reembed')

interface ProductExtractionResponse {
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

function clipString(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = sanitizeString(v).trim()
  if (!t) return null
  return t.length > max ? t.slice(0, max) : t
}

function dedupedStringArray(v: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of v) {
    if (typeof item !== 'string') continue
    const clean = sanitizeString(item).trim()
    if (!clean) continue
    const clipped = clean.length > maxLen ? clean.slice(0, maxLen) : clean
    const key = clipped.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(clipped)
    if (out.length >= maxItems) break
  }
  return out
}

function normalizeProductContext(raw: ProductExtractionResponse): ProductContext {
  const categoryRaw = typeof raw.product_category === 'string' ? raw.product_category : null
  const category = categoryRaw && (PRODUCT_CATEGORIES as readonly string[]).includes(categoryRaw)
    ? (categoryRaw as ProductCategory)
    : null
  const pricingRaw = typeof raw.pricing_model === 'string' ? raw.pricing_model : null
  const pricing: PricingModel = pricingRaw && (PRICING_MODELS as readonly string[]).includes(pricingRaw)
    ? (pricingRaw as PricingModel)
    : 'unknown'
  const has = raw.has_specific_product === true
  return {
    product_name: has ? clipString(raw.product_name, 120) : null,
    product_category: has ? category : null,
    one_liner: has ? clipString(raw.one_liner, 120) : null,
    target_user: has ? clipString(raw.target_user, 160) : null,
    problem_solved: has ? clipString(raw.problem_solved, 200) : null,
    key_features: has ? dedupedStringArray(raw.key_features, 6, 120) : [],
    pricing_model: has ? pricing : 'unknown',
    competitors_mentioned: has ? dedupedStringArray(raw.competitors_mentioned, 10, 80) : [],
    has_specific_product: has
  }
}

async function extractProductContext(
  ai: ReturnType<typeof useServerGemini>,
  title: string | null,
  transcript: string
): Promise<ProductContext> {
  const prompt = `You are analyzing the transcript of a short-form marketing video to extract structured product context.

Title: ${title || '(untitled)'}

Transcript:
${transcript.slice(0, 8000)}

Identify the specific product/service being marketed (if any). If this is pure personal-brand / entertainment / educational content with no marketed product, set has_specific_product=false and leave string fields null / arrays empty.

product_category must be ONE value copied verbatim from: ${PRODUCT_CATEGORIES.join(', ')}.
pricing_model must be one of: ${PRICING_MODELS.join(', ')}. Use "unknown" when not stated.

Return JSON with exactly these keys:
{
  "product_name": string | null,
  "product_category": string | null,
  "one_liner": string | null,
  "target_user": string | null,
  "problem_solved": string | null,
  "key_features": string[],
  "pricing_model": "free"|"freemium"|"subscription"|"one-time"|"unknown",
  "competitors_mentioned": string[],
  "has_specific_product": boolean
}`

  const res = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      maxOutputTokens: 1500
    }
  })

  const content = res.text
  if (!content) throw new Error('Gemini returned empty product extraction')
  const parsed = JSON.parse(content) as ProductExtractionResponse
  return normalizeProductContext(parsed)
}

export default defineEventHandler(async (event): Promise<ReembedResponse> => {
  await requireAdmin(event)

  const body = await readBody<ReembedRequest>(event).catch(() => ({} as ReembedRequest))
  const batchSize = Math.min(Math.max(1, body?.batchSize ?? 5), 20)

  const supabase = useServerSupabase()
  const ai = useServerGemini()

  const { data: rows, error: fetchErr } = await (supabase
    .from('videos')
    .select('id, title, script_raw, product_context, embedding')
    .eq('status', 'complete')
    .or('embedding.is.null,product_context.is.null')
    .limit(batchSize) as unknown as Promise<{ data: Array<{ id: string; title: string | null; script_raw: string | null; product_context: unknown; embedding: unknown }> | null; error: { message: string } | null }>)

  if (fetchErr) {
    log.error('Failed to fetch reembed batch', new Error(fetchErr.message))
    throw createError({ statusCode: 500, message: fetchErr.message })
  }

  const errors: Array<{ id: string; error: string }> = []
  let processed = 0

  for (const row of rows || []) {
    try {
      let productContext: ProductContext | null = (row.product_context as ProductContext | null) ?? null
      const needsProduct = !productContext
      const needsEmbedding = !row.embedding

      if (needsProduct) {
        const transcript = row.script_raw || ''
        if (!transcript.trim()) {
          // No transcript → can't extract. Store an empty product_context so we don't retry forever.
          productContext = {
            product_name: null,
            product_category: null,
            one_liner: null,
            target_user: null,
            problem_solved: null,
            key_features: [],
            pricing_model: 'unknown',
            competitors_mentioned: [],
            has_specific_product: false
          }
        } else {
          productContext = await extractProductContext(ai, row.title, transcript)
        }
        const { error: pcErr } = await supabase
          .from('videos')
          .update({ product_context: productContext as unknown as Json } as Record<string, unknown>)
          .eq('id', row.id)
        if (pcErr) throw new Error(`product_context update: ${pcErr.message}`)
      }

      if (needsEmbedding) {
        const pc = productContext ?? {
          product_name: null, one_liner: null, problem_solved: null,
          target_user: null, competitors_mentioned: [], key_features: []
        } as Partial<ProductContext>
        const embeddingInput = [
          row.title || '',
          pc.product_name || '',
          pc.one_liner || '',
          pc.problem_solved || '',
          pc.target_user || '',
          (pc.competitors_mentioned || []).join(' '),
          (pc.key_features || []).join(' '),
          (row.script_raw || '').slice(0, 4000)
        ].filter(Boolean).join('\n\n')

        if (embeddingInput.trim()) {
          const vector = await embedText(ai, embeddingInput)
          const { error: embErr } = await supabase
            .from('videos')
            .update({ embedding: vector as unknown as Json } as Record<string, unknown>)
            .eq('id', row.id)
          if (embErr) throw new Error(`embedding update: ${embErr.message}`)
        }
      }

      processed++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.warn('Reembed row failed', { id: row.id, error: message })
      errors.push({ id: row.id, error: message })
    }
  }

  // Count remaining after this batch.
  const { count: remainingCount } = await (supabase
    .from('videos')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'complete')
    .or('embedding.is.null,product_context.is.null') as unknown as Promise<{ count: number | null }>)

  const remaining = remainingCount ?? 0

  log.info('Reembed batch complete', { processed, remaining, errorCount: errors.length, batchSize })

  return { processed, remaining, errors }
})
