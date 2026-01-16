<script setup lang="ts">
import type { LogicFlow } from '~/types'
import type { ParseError } from '~/utils/markdownParser'

interface Props {
  modelValue: string
  errors?: ParseError[]
  logicFlows?: LogicFlow[]
  selectedLogicFlowId?: string | null
  videoTitle?: string
  saving?: boolean
  saveStatus?: 'saved' | 'saving' | 'unsaved' | 'error'
}

const props = withDefaults(defineProps<Props>(), {
  errors: () => [],
  logicFlows: () => [],
  saving: false,
  saveStatus: 'saved'
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:selectedLogicFlowId': [id: string | null]
  applyTemplate: [template: LogicFlow]
  save: []
}>()

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const commandPaletteOpen = ref(false)

// Track cursor position to restore after external updates
const cursorPosition = ref<{ start: number; end: number } | null>(null)
const isUserTyping = ref(false)
let typingTimeout: ReturnType<typeof setTimeout> | null = null

// Watch for external value changes and restore cursor
watch(
    () => props.modelValue,
    () => {
        // Only restore cursor if user was recently typing
        if (isUserTyping.value && cursorPosition.value && textareaRef.value) {
            nextTick(() => {
                if (textareaRef.value && cursorPosition.value) {
                    textareaRef.value.setSelectionRange(
                        cursorPosition.value.start,
                        cursorPosition.value.end
                    )
                }
            })
        }
    }
)

// Command palette groups for templates
const commandGroups = computed(() => [
  {
    id: 'templates',
    label: 'Templates',
    items: props.logicFlows.map((lf) => ({
      id: lf.id,
      label: lf.name,
      suffix: lf.description || '',
      icon: 'i-ph-file-text',
      onSelect: () => {
        handleLogicFlowChange(lf.id)
        commandPaletteOpen.value = false
      }
    }))
  }
])

defineShortcuts({
  meta_k: () => {
    commandPaletteOpen.value = true
  }
})

// Compute line numbers for display
const lineCount = computed(() => {
  return props.modelValue.split('\n').length
})

// Map errors by line number for quick lookup
const errorsByLine = computed(() => {
  const map = new Map<number, ParseError>()
  for (const err of props.errors) {
    map.set(err.line, err)
  }
  return map
})

const hasErrors = computed(() => props.errors.some((e) => e.severity === 'error'))
const hasWarnings = computed(() => props.errors.some((e) => e.severity === 'warning'))

// Status indicator
const statusIcon = computed(() => {
  switch (props.saveStatus) {
    case 'saving':
      return 'i-ph-spinner'
    case 'saved':
      return 'i-ph-check-circle'
    case 'error':
      return 'i-ph-x-circle'
    case 'unsaved':
      return 'i-ph-circle'
    default:
      return 'i-ph-circle'
  }
})

const statusColor = computed(() => {
  switch (props.saveStatus) {
    case 'saving':
      return 'text-muted'
    case 'saved':
      return 'text-green-500'
    case 'error':
      return 'text-red-500'
    case 'unsaved':
      return 'text-yellow-500'
    default:
      return 'text-muted'
  }
})

function handleInput(event: Event) {
    const target = event.target as HTMLTextAreaElement

    // Save cursor position before emitting
    cursorPosition.value = {
        start: target.selectionStart,
        end: target.selectionEnd
    }

    // Mark as typing and clear previous timeout
    isUserTyping.value = true
    if (typingTimeout) {
        clearTimeout(typingTimeout)
    }

    // Reset typing flag after a delay (longer than debounce)
    typingTimeout = setTimeout(() => {
        isUserTyping.value = false
    }, 500)

    emit('update:modelValue', target.value)
}

function handleLogicFlowChange(id: string | null) {
  emit('update:selectedLogicFlowId', id)

  // Find the template and apply it
  if (id) {
    const template = props.logicFlows.find((lf) => lf.id === id)
    if (template?.template_markdown) {
      emit('applyTemplate', template)
    }
  }
}

// Keyboard shortcut for save
function handleKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key === 's') {
    event.preventDefault()
    emit('save')
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown)
    if (typingTimeout) {
        clearTimeout(typingTimeout)
    }
})
</script>

<template>
  <div class="h-full flex flex-col ">
    <!-- Header -->
    <div
      class="flex items-center justify-between p-3 border-b border-muted "
    >
      <div class="flex items-center gap-3">
        <h2 class="text-sm font-semibold ">
          {{'Script Editor & Skeleton Logic' }}
        </h2>

        <!-- Status Indicator -->
        <div class="flex items-center gap-1">
          <UIcon
            :name="statusIcon"
            class="w-4 h-4"
            :class="[statusColor, { 'animate-spin': saveStatus === 'saving' }]"
          />
          <span class="text-xs" :class="statusColor">
            {{ saveStatus === 'saving' ? 'Saving...' : saveStatus }}
          </span>
        </div>
      </div>

      <!-- Template Search & Actions -->
      <div class="flex items-center gap-2">
        <UButton
          variant="outline"
          color="neutral"
          size="sm"
          icon="i-ph-magnifying-glass"
          @click="commandPaletteOpen = true"
        >
          <span class="text-muted">Search templates...</span>
          <UKbd class="ml-2">⌘K</UKbd>
        </UButton>

        <UButton size="sm" variant="ghost" icon="i-ph-floppy-disk" @click="emit('save')">
          Save
        </UButton>
      </div>
    </div>

    <!-- Command Palette Modal -->
    <UModal v-model:open="commandPaletteOpen">
      <template #content>
        <UCommandPalette
          :groups="commandGroups"
          placeholder="Search templates..."
          :close="true"
          @update:open="commandPaletteOpen = $event"
        />
      </template>
    </UModal>

    <!-- Editor Area -->
    <div class="flex-1 flex overflow-hidden">
      <!-- Line Numbers -->
      <div
        class="w-10 border-r border-muted overflow-hidden"
      >
        <div class="py-3 text-right pr-2">
          <div
            v-for="line in lineCount"
            :key="line"
            class="text-xs leading-6 font-mono"
            :class="
              errorsByLine.has(line)
                ? errorsByLine.get(line)?.severity === 'error'
                  ? 'text-red-500 font-medium'
                  : 'text-yellow-500'
                : 'text-dimmed'
            "
          >
            {{ line }}
          </div>
        </div>
      </div>

      <!-- Textarea -->
      <div class="flex-1 relative">
        <textarea
          ref="textareaRef"
          :value="modelValue"
          class="w-full h-full p-3 bg-transparent text-sm font-mono resize-none focus:outline-none leading-6"
          placeholder="0-3s [Hook]: Grab attention with a bold statement.
            3-8s [Bridge]: Transition to your solution.
            8-25s [Value]: Deliver the core content.
            25-30s [CTA]: Clear call to action."
          spellcheck="false"
          @input="handleInput"
        />
      </div>
    </div>

    <!-- Error/Warning Panel -->
    <div
      v-if="errors.length > 0"
      class="border-t border-muted max-h-32 overflow-y-auto"
    >
      <div class="p-2 space-y-1">
        <div
          v-for="(error, index) in errors"
          :key="index"
          class="flex items-start gap-2 text-xs p-1.5 rounded"
          :class="
            error.severity === 'error'
              ? 'bg-red-500/10 text-red-500'
              : 'bg-yellow-500/10 text-yellow-500'
          "
        >
          <UIcon
            :name="
              error.severity === 'error'
                ? 'i-ph-x-circle'
                : 'i-ph-warning-circle'
            "
            class="w-4 h-4  mt-0.5 shrink-0"
          />
          <span>
            <span class="font-medium">Line {{ error.line }}:</span>
            {{ error.message }}
          </span>
        </div>
      </div>
    </div>

    <!-- Help Text -->
    <div class="px-3 py-2 border-t border-muted">
      <p class="text-xs text-dimmed">
        Format: <code class="px-1 rounded">0-3s [Hook]: Description</code>
        &nbsp;|&nbsp; Labels: Hook, Bridge, Value, Proof, CTA
      </p>
    </div>
  </div>
</template>
