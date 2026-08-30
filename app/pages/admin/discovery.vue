<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: ['admin'] })

useSeoMeta({
  title: 'Discovery Sources',
  robots: 'noindex,nofollow'
})

interface DiscoverySource {
  id: string
  type: 'hashtag' | 'profile' | 'search' | 'creative_center'
  value: string
  enabled: boolean
  max_per_run: number
  cadence_hours: number
  last_run_at: string | null
  created_at: string | null
}

interface RunSummary {
  sourceId: string
  found: number
  ingested: number
  skipped: number
  failed: number
  error?: string
}

const { authHeaders } = useAuth()

const sources = ref<DiscoverySource[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

// Add-source modal
const showAddModal = ref(false)
const addForm = reactive({
  type: 'creative_center' as 'hashtag' | 'profile' | 'search' | 'creative_center',
  value: '',
  max_per_run: 15,
  cadence_hours: 24,
})
const addError = ref<string | null>(null)
const adding = ref(false)

// Run states
const sourceRunning = ref<Record<string, boolean>>({})
const runAllRunning = ref(false)
const runResults = ref<RunSummary[] | null>(null)

const SOURCE_TYPES = ['creative_center', 'profile', 'hashtag', 'search'] as const

const typePlaceholder: Record<string, string> = {
  creative_center: 'keyword, or leave empty for top ads overall',
  hashtag: 'e.g. "saasmarketing" (no #)',
  profile: 'e.g. "drinkag1"',
  search: 'e.g. "cold email hook"',
}

const typeHint: Record<string, string> = {
  creative_center: 'TikTok\'s own Top Ads, ranked by CTR. Videos are hosted by us so they play inline.',
  hashtag: 'Organic posts carrying the hashtag. Noisy — prefer niche tags.',
  profile: 'Every recent post from one account. Embedded, not hosted.',
  search: 'Organic search results. Least predictable.',
}

async function loadSources() {
  loading.value = true
  error.value = null
  try {
    const { data } = await $fetch<{ data: DiscoverySource[] }>('/api/admin/discovery/sources', {
      headers: authHeaders(),
    })
    sources.value = data || []
  } catch (err: any) {
    error.value = err?.data?.message || err?.message || 'Failed to load sources'
  } finally {
    loading.value = false
  }
}

async function handleAdd() {
  addError.value = null
  adding.value = true
  try {
    await $fetch('/api/admin/discovery/sources', {
      method: 'POST',
      body: {
        type: addForm.type,
        value: addForm.value.trim(),
        max_per_run: addForm.max_per_run,
        cadence_hours: addForm.cadence_hours,
      },
      headers: authHeaders(),
    })
    addForm.value = ''
    showAddModal.value = false
    await loadSources()
  } catch (err: any) {
    if (err?.statusCode === 409 || err?.data?.statusCode === 409) {
      addError.value = 'This source already exists.'
    } else {
      addError.value = err?.data?.message || err?.message || 'Failed to add source'
    }
  } finally {
    adding.value = false
  }
}

async function handleRun(sourceId: string) {
  sourceRunning.value[sourceId] = true
  try {
    const { data } = await $fetch<{ data: RunSummary[] }>('/api/admin/discovery/run', {
      method: 'POST',
      body: { sourceId },
      headers: authHeaders(),
    })
    runResults.value = data
    await loadSources()
  } catch (err: any) {
    error.value = err?.data?.message || err?.message || 'Run failed'
  } finally {
    sourceRunning.value[sourceId] = false
  }
}

async function handleRunAll() {
  runAllRunning.value = true
  runResults.value = null
  try {
    const { data } = await $fetch<{ data: RunSummary[] }>('/api/admin/discovery/run', {
      method: 'POST',
      body: {},
      headers: authHeaders(),
    })
    runResults.value = data
    await loadSources()
  } catch (err: any) {
    error.value = err?.data?.message || err?.message || 'Run failed'
  } finally {
    runAllRunning.value = false
  }
}

async function handleToggle(source: DiscoverySource) {
  const original = source.enabled
  source.enabled = !original
  try {
    await $fetch(`/api/admin/discovery/sources/${source.id}`, {
      method: 'PUT',
      body: { enabled: source.enabled },
      headers: authHeaders(),
    })
  } catch (err: any) {
    source.enabled = original
    error.value = err?.data?.message || err?.message || 'Failed to update'
  }
}

async function handleDelete(source: DiscoverySource) {
  if (!confirm(`Delete discovery source "${source.value}"? This cannot be undone.`)) return
  try {
    await $fetch(`/api/admin/discovery/sources/${source.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    await loadSources()
  } catch (err: any) {
    error.value = err?.data?.message || err?.message || 'Failed to delete'
  }
}

function formatDate(val: string | null) {
  if (!val) return 'never'
  return new Date(val).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function labelForSource(sourceId: string): string {
  const source = sources.value.find(s => s.id === sourceId)
  if (!source) return sourceId.slice(0, 8)
  return source.type === 'hashtag' ? `#${source.value}`
    : source.type === 'profile' ? `@${source.value}`
      : source.value
}

function openAddModal() {
  addError.value = null
  addForm.type = 'creative_center'
  addForm.value = ''
  addForm.max_per_run = 15
  addForm.cadence_hours = 24
  showAddModal.value = true
}

onMounted(loadSources)
</script>

<template>
  <div class="p-6 max-w-5xl mx-auto">
    <!-- Header -->
    <div class="mb-6 flex items-start justify-between gap-4">
      <div>
        <h2 class="text-lg font-semibold">Discovery Sources</h2>
        <p class="text-muted text-sm mt-1">
          Auto-discover TikTok videos from hashtags, profiles, and search queries.
        </p>
      </div>
      <div class="flex gap-2 shrink-0">
        <UButton
          color="neutral"
          variant="outline"
          icon="i-ph-magnifying-glass"
          :loading="runAllRunning"
          :disabled="runAllRunning || sources.length === 0"
          @click="handleRunAll"
        >
          Run all now
        </UButton>
        <UButton icon="i-ph-plus" @click="openAddModal">
          Add source
        </UButton>
      </div>
    </div>

    <!-- Global error -->
    <UAlert v-if="error" color="error" :title="error" class="mb-4" />

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-20">
      <UIcon name="i-ph-circle-notch" class="w-8 h-8 animate-spin text-dimmed" />
    </div>

    <!-- Empty -->
    <div
      v-else-if="sources.length === 0 && !runResults"
      class="bg-default border border-dashed border-default rounded-lg py-16 px-6 text-center"
    >
      <UIcon name="i-ph-magnifying-glass" class="w-10 h-10 text-dimmed mx-auto mb-3" />
      <p class="text-muted text-sm mb-4">No sources yet — add one to start discovering.</p>
      <UButton icon="i-ph-plus" @click="openAddModal">Add source</UButton>
    </div>

    <!-- Run results panel -->
    <div
      v-if="runResults && runResults.length > 0"
      class="mb-6 bg-muted border border-default rounded-lg overflow-hidden"
    >
      <div class="px-4 py-2 border-b border-default bg-elevated">
        <span class="text-xs font-semibold uppercase tracking-wider text-dimmed">Latest run results</span>
      </div>
      <div class="divide-y divide-default">
        <div
          v-for="r in runResults"
          :key="r.sourceId"
          class="px-4 py-2 text-sm flex items-center gap-3"
        >
          <span class="font-medium truncate min-w-0 flex-1">{{ labelForSource(r.sourceId) }}</span>
          <span class="text-muted text-xs shrink-0">{{ r.found }} found</span>
          <span v-if="r.ingested > 0" class="text-success text-xs shrink-0">{{ r.ingested }} ingested</span>
          <span v-if="r.skipped > 0" class="text-warning text-xs shrink-0">{{ r.skipped }} skipped</span>
          <span v-if="r.failed > 0" class="text-error text-xs shrink-0">{{ r.failed }} failed</span>
          <span v-if="r.error" class="text-error text-xs truncate shrink-0">{{ r.error }}</span>
        </div>
      </div>
    </div>

    <!-- Sources table -->
    <div
      v-if="sources.length > 0"
      class="bg-default border border-default rounded-lg overflow-hidden"
    >
      <table class="w-full text-sm">
        <thead class="bg-muted text-left text-xs uppercase tracking-wider text-dimmed">
          <tr>
            <th class="px-4 py-2">Type</th>
            <th class="px-4 py-2">Value</th>
            <th class="px-4 py-2">Cadence (h)</th>
            <th class="px-4 py-2">Max/run</th>
            <th class="px-4 py-2 text-center">Enabled</th>
            <th class="px-4 py-2">Last run</th>
            <th class="px-4 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-default">
          <tr v-for="source in sources" :key="source.id">
            <!-- Type -->
            <td class="px-4 py-3">
              <UBadge variant="subtle" size="sm">
                {{ source.type }}
              </UBadge>
            </td>
            <!-- Value -->
            <td class="px-4 py-3 font-medium">
              {{ source.value || (source.type === 'creative_center' ? 'Top ads (all)' : '—') }}
            </td>
            <!-- Cadence -->
            <td class="px-4 py-3 text-muted">{{ source.cadence_hours }}</td>
            <!-- Max/run -->
            <td class="px-4 py-3 text-muted">{{ source.max_per_run }}</td>
            <!-- Enabled -->
            <td class="px-4 py-3 text-center">
              <USwitch
                :model-value="source.enabled"
                @update:model-value="handleToggle(source)"
              />
            </td>
            <!-- Last run -->
            <td class="px-4 py-3 text-muted text-xs">{{ formatDate(source.last_run_at) }}</td>
            <!-- Actions -->
            <td class="px-4 py-3 text-right">
              <div class="inline-flex gap-1">
                <UButton
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  :loading="sourceRunning[source.id]"
                  :disabled="sourceRunning[source.id]"
                  @click="handleRun(source.id)"
                >
                  Run now
                </UButton>
                <UButton
                  size="xs"
                  variant="ghost"
                  color="error"
                  @click="handleDelete(source)"
                >
                  Delete
                </UButton>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Add-source modal -->
    <UModal v-model:open="showAddModal" title="Add discovery source">
      <template #body>
        <div class="space-y-4 p-1">
          <div>
            <label class="block text-sm font-medium mb-1.5">Type</label>
            <USelectMenu
              v-model="addForm.type"
              :items="SOURCE_TYPES"
              class="w-full"
            />
            <p class="text-xs text-muted mt-1.5">{{ typeHint[addForm.type] }}</p>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1.5">Value</label>
            <UInput
              v-model="addForm.value"
              :placeholder="typePlaceholder[addForm.type]"
              class="w-full"
            />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium mb-1.5">Max per run</label>
              <UInput
                v-model.number="addForm.max_per_run"
                type="number"
                :min="1"
                :max="100"
                class="w-full"
              />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1.5">Cadence (hours)</label>
              <UInput
                v-model.number="addForm.cadence_hours"
                type="number"
                :min="1"
                class="w-full"
              />
            </div>
          </div>
          <UAlert v-if="addError" color="error" :title="addError" />
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="showAddModal = false">
            Cancel
          </UButton>
          <UButton
            :loading="adding"
            :disabled="adding || (addForm.type !== 'creative_center' && !addForm.value.trim())"
            @click="handleAdd"
          >
            Add
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
