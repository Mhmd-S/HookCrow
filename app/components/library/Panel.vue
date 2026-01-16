<script setup lang="ts">
import type { Video } from '~/types'

interface Props {
  videos: Video[]
  currentVideoId?: string
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  loading: false
})

const emit = defineEmits<{
  selectVideo: [video: Video]
}>()

const searchQuery = ref('')
const statusFilter = ref<'all' | 'draft' | 'complete'>('all')
const collapsed = ref({
  drafts: false,
  completed: false
})

// Filter and group videos
const filteredVideos = computed(() => {
  let videos = props.videos

  // Apply search filter
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase()
    videos = videos.filter((v) => {
      const handle = v.creator_handle?.toLowerCase() || ''
      const platform = v.platform?.toLowerCase() || ''
      return handle.includes(query) || platform.includes(query)
    })
  }

  // Apply status filter
  if (statusFilter.value !== 'all') {
    videos = videos.filter((v) => v.status === statusFilter.value)
  }

  return videos
})

const draftVideos = computed(() =>
  filteredVideos.value
    .filter((v) => v.status === 'draft')
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )
)

const completedVideos = computed(() =>
  filteredVideos.value
    .filter((v) => v.status === 'complete')
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )
)

function toggleSection(section: 'drafts' | 'completed') {
  collapsed.value[section] = !collapsed.value[section]
}
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Header -->
    <div class="p-3 border-b border-muted">
      <h2 class="text-sm font-semibold mb-3">Library</h2>

      <!-- Search -->
      <UInput
        v-model="searchQuery"
        placeholder="Search..."
        icon="i-ph-magnifying-glass"
        size="sm"
        class="mb-2"
      />

      <!-- Status Filter -->
      <div class="flex gap-1">
        <UButton
          size="xs"
          :variant="statusFilter === 'all' ? 'solid' : 'ghost'"
          @click="statusFilter = 'all'"
        >
          All
        </UButton>
        <UButton
          size="xs"
          :variant="statusFilter === 'draft' ? 'solid' : 'ghost'"
          @click="statusFilter = 'draft'"
        >
          Drafts
        </UButton>
        <UButton
          size="xs"
          :variant="statusFilter === 'complete' ? 'solid' : 'ghost'"
          @click="statusFilter = 'complete'"
        >
          Complete
        </UButton>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto">
      <!-- Loading State -->
      <div v-if="loading" class="p-4 text-center">
        <UIcon
          name="i-ph-spinner"
          class="w-5 h-5 animate-spin "
        />
      </div>

      <template v-else>
        <!-- Drafts Section -->
        <div v-if="statusFilter !== 'complete'" class="border-b border-muted">
          <button
            class="w-full flex items-center justify-between p-3 text-xs font-medium uppercase tracking-wide"
            @click="toggleSection('drafts')"
          >
            <span>Drafts ({{ draftVideos.length }})</span>
            <UIcon
              :name="collapsed.drafts ? 'i-ph-caret-right' : 'i-ph-caret-down'"
              class="w-4 h-4"
            />
          </button>

          <div v-if="!collapsed.drafts" class="px-2 pb-2 space-y-1">
            <template v-if="draftVideos.length > 0">
              <LibraryVideoCard
                v-for="video in draftVideos"
                :key="video.id"
                :video="video"
                :active="video.id === currentVideoId"
                @select="emit('selectVideo', $event)"
              />
            </template>
            <p
              v-else
              class="text-xs text-dimmed text-center py-4"
            >
              No drafts found
            </p>
          </div>
        </div>

        <!-- Completed Section -->
        <div v-if="statusFilter !== 'draft'">
          <button
            class="w-full flex items-center justify-between p-3 text-xs font-medium  uppercase tracking-wide hover:bg-elevated"
            @click="toggleSection('completed')"
          >
            <span>Completed ({{ completedVideos.length }})</span>
            <UIcon
              :name="collapsed.completed ? 'i-ph-caret-right' : 'i-ph-caret-down'"
              class="w-4 h-4"
            />
          </button>

          <div v-if="!collapsed.completed" class="px-2 pb-2 space-y-1">
            <template v-if="completedVideos.length > 0">
              <LibraryVideoCard
                v-for="video in completedVideos"
                :key="video.id"
                :video="video"
                :active="video.id === currentVideoId"
                @select="emit('selectVideo', $event)"
              />
            </template>
            <p
              v-else
              class="text-xs text-center py-4"
            >
              No completed videos
            </p>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
