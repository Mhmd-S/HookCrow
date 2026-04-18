<script setup lang="ts">
import type { ProductContext, ProductCategory, PricingModel } from '~/types'
import { PRODUCT_CATEGORIES, PRICING_MODELS } from '~/types'

const props = defineProps<{
  modelValue: ProductContext | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: ProductContext]
}>()

const defaultCtx: ProductContext = {
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

const ctx = computed<ProductContext>(() => props.modelValue ?? defaultCtx)

function patch(update: Partial<ProductContext>) {
  emit('update:modelValue', { ...ctx.value, ...update })
}

const categoryOptions = PRODUCT_CATEGORIES.map(c => ({ label: c, value: c }))
const pricingOptions = PRICING_MODELS.map(p => ({ label: p, value: p }))

const featuresText = ref(ctx.value.key_features.join('\n'))
const competitorsText = ref(ctx.value.competitors_mentioned.join(', '))

watch(() => ctx.value.key_features, (v) => {
  const joined = v.join('\n')
  if (joined !== featuresText.value) featuresText.value = joined
})
watch(() => ctx.value.competitors_mentioned, (v) => {
  const joined = v.join(', ')
  if (joined !== competitorsText.value) competitorsText.value = joined
})

function commitFeatures() {
  const list = featuresText.value
    .split(/\n+/)
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 6)
  patch({ key_features: list })
}

function commitCompetitors() {
  const list = competitorsText.value
    .split(/[,\n]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 10)
  patch({ competitors_mentioned: list })
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">Product Context</h3>
      <label class="flex items-center gap-2 text-xs cursor-pointer">
        <span class="text-muted">Has specific product</span>
        <USwitch
          :model-value="ctx.has_specific_product"
          size="xs"
          @update:model-value="(v: boolean) => patch({ has_specific_product: v })"
        />
      </label>
    </div>

    <div v-if="!ctx.has_specific_product" class="text-xs text-muted italic">
      No specific product — treated as personal brand / entertainment / educational content.
    </div>

    <div v-else class="space-y-3">
      <div>
        <label class="text-xs text-muted">Product name</label>
        <UInput
          size="sm"
          :model-value="ctx.product_name ?? ''"
          placeholder="e.g. Linear, Notion"
          @update:model-value="(v: string) => patch({ product_name: v ? String(v).slice(0, 120) : null })"
        />
      </div>

      <div>
        <label class="text-xs text-muted">Category</label>
        <USelect
          size="sm"
          :model-value="ctx.product_category ?? ''"
          :items="[{ label: '— none —', value: '' }, ...categoryOptions]"
          @update:model-value="(v: string) => patch({ product_category: v ? (v as ProductCategory) : null })"
        />
      </div>

      <div>
        <label class="text-xs text-muted">One-liner (≤120)</label>
        <UTextarea
          size="sm"
          :rows="2"
          :model-value="ctx.one_liner ?? ''"
          placeholder="Core value prop"
          @update:model-value="(v: string) => patch({ one_liner: v ? String(v).slice(0, 120) : null })"
        />
      </div>

      <div>
        <label class="text-xs text-muted">Target user</label>
        <UInput
          size="sm"
          :model-value="ctx.target_user ?? ''"
          placeholder="e.g. B2B sales teams, solo founders"
          @update:model-value="(v: string) => patch({ target_user: v ? String(v).slice(0, 160) : null })"
        />
      </div>

      <div>
        <label class="text-xs text-muted">Problem solved (≤200)</label>
        <UTextarea
          size="sm"
          :rows="2"
          :model-value="ctx.problem_solved ?? ''"
          placeholder="Specific pain the product addresses"
          @update:model-value="(v: string) => patch({ problem_solved: v ? String(v).slice(0, 200) : null })"
        />
      </div>

      <div>
        <label class="text-xs text-muted">Key features (one per line, max 6)</label>
        <UTextarea
          v-model="featuresText"
          size="sm"
          :rows="3"
          placeholder="Feature phrases…"
          @blur="commitFeatures"
        />
      </div>

      <div>
        <label class="text-xs text-muted">Pricing model</label>
        <USelect
          size="sm"
          :model-value="ctx.pricing_model"
          :items="pricingOptions"
          @update:model-value="(v: PricingModel) => patch({ pricing_model: v })"
        />
      </div>

      <div>
        <label class="text-xs text-muted">Competitors mentioned (comma-separated)</label>
        <UTextarea
          v-model="competitorsText"
          size="sm"
          :rows="2"
          placeholder="Notion, Linear, Asana…"
          @blur="commitCompetitors"
        />
      </div>
    </div>
  </div>
</template>
