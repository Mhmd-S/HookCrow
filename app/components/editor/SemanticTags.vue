<script setup lang="ts">
import { SEMANTIC_TAG_CATEGORIES, type SemanticTag } from '~/types'

const { authHeaders } = useAuth()

interface Props {
  modelValue: string[]
  transcript?: string
}

const props = withDefaults(defineProps<Props>(), {
  transcript: ''
})

const emit = defineEmits<{
  'update:modelValue': [tags: string[]]
}>()

const suggesting = ref(false)
const error = ref<string | null>(null)
const dropdownOpen = ref(false)
const searchQuery = ref('')

// Computed selected tags
const selectedTags = computed(() => new Set(props.modelValue))

// Filter tags by search query
const filteredCategories = computed(() => {
  const query = searchQuery.value.toLowerCase().trim()
  if (!query) {
    return SEMANTIC_TAG_CATEGORIES
  }

  return {
    domain: SEMANTIC_TAG_CATEGORIES.domain.filter(tag =>
      tag.toLowerCase().includes(query)
    ),
    format: SEMANTIC_TAG_CATEGORIES.format.filter(tag =>
      tag.toLowerCase().includes(query)
    ),
    audience: SEMANTIC_TAG_CATEGORIES.audience.filter(tag =>
      tag.toLowerCase().includes(query)
    )
  }
})

function toggleTag(tag: string) {
  const current = new Set(props.modelValue)
  if (current.has(tag)) {
    current.delete(tag)
  } else {
    current.add(tag)
  }
  emit('update:modelValue', Array.from(current))
}

function removeTag(tag: string) {
  emit('update:modelValue', props.modelValue.filter(t => t !== tag))
}

async function suggestTags() {
  if (!props.transcript) {
    error.value = 'No transcript available to analyze'
    return
  }

  suggesting.value = true
  error.value = null

  try {
    const result = await $fetch<{
      domain: string[]
      format: string[]
      audience: string[]
      confidence: number
    }>('/api/admin/suggest-semantic-tags', {
      method: 'POST',
      body: {
        transcript: props.transcript
      },
      headers: authHeaders()
    })

    // Merge suggested tags with existing ones
    const newTags = new Set(props.modelValue)
    ;[...result.domain, ...result.format, ...result.audience].forEach(tag => {
      newTags.add(tag)
    })

    emit('update:modelValue', Array.from(newTags))
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to suggest tags'
  } finally {
    suggesting.value = false
  }
}

function getTagColor(tag: string): 'primary' | 'success' | 'warning' {
  if (SEMANTIC_TAG_CATEGORIES.domain.includes(tag as SemanticTag)) return 'primary'
  if (SEMANTIC_TAG_CATEGORIES.format.includes(tag as SemanticTag)) return 'success'
  return 'warning'
}

function getCategoryLabel(category: string): string {
  switch (category) {
    case 'domain':
      return 'Content Domain'
    case 'format':
      return 'Format'
    case 'audience':
      return 'Audience'
    default:
      return category
  }
}
</script>

<template>
  <div class="space-y-2">
    <!-- Header with actions -->
    <div class="flex items-center justify-between">
      <label class="text-xs font-medium text-muted">Semantic Tags</label>
      <div class="flex items-center gap-1">
        <UButton
          v-if="transcript"
          :loading="suggesting"
          variant="ghost"
          size="xs"
          icon="i-ph-magic-wand"
          @click="suggestTags"
        >
          Suggest
        </UButton>
        <UPopover v-model:open="dropdownOpen">
          <UButton variant="ghost" size="xs" icon="i-ph-plus">
            Add
          </UButton>

          <template #content>
            <div class="w-72 max-h-80 overflow-hidden flex flex-col">
              <!-- Search input -->
              <div class="p-2 border-b border-muted">
                <input
                  v-model="searchQuery"
                  type="text"
                  placeholder="Search tags..."
                  class="w-full px-2 py-1 text-xs bg-muted border border-default rounded focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <!-- Tag categories -->
              <div class="flex-1 overflow-y-auto p-2 space-y-3">
                <div
                  v-for="(tags, category) in filteredCategories"
                  :key="category"
                  class="space-y-1"
                >
                  <div
                    v-if="tags.length > 0"
                    class="text-xs font-medium text-muted uppercase tracking-wide"
                  >
                    {{ getCategoryLabel(category) }}
                  </div>
                  <div class="flex flex-wrap gap-1">
                    <button
                      v-for="tag in tags"
                      :key="tag"
                      class="px-2 py-0.5 text-xs rounded transition-colors"
                      :class="
                        selectedTags.has(tag)
                          ? 'bg-primary text-white'
                          : 'bg-muted text-default hover:bg-accented'
                      "
                      @click="toggleTag(tag)"
                    >
                      {{ tag }}
                    </button>
                  </div>
                </div>

                <div
                  v-if="
                    filteredCategories.domain.length === 0 &&
                    filteredCategories.format.length === 0 &&
                    filteredCategories.audience.length === 0
                  "
                  class="text-xs text-muted text-center py-4"
                >
                  No tags match "{{ searchQuery }}"
                </div>
              </div>
            </div>
          </template>
        </UPopover>
      </div>
    </div>

    <!-- Error message -->
    <div v-if="error" class="text-xs text-error">{{ error }}</div>

    <!-- Selected tags display -->
    <div v-if="modelValue.length > 0" class="flex flex-wrap gap-1">
      <UBadge
        v-for="tag in modelValue"
        :key="tag"
        :color="getTagColor(tag)"
        variant="subtle"
        size="sm"
        class="cursor-pointer group"
        @click="removeTag(tag)"
      >
        {{ tag }}
        <UIcon
          name="i-ph-x"
          class="w-3 h-3 ml-1 opacity-50 group-hover:opacity-100"
        />
      </UBadge>
    </div>

    <!-- Empty state -->
    <div
      v-else
      class="text-xs text-dimmed italic"
    >
      No tags selected. Click "Add" or "Suggest" to add tags.
    </div>
  </div>
</template>
