<script setup lang="ts">
import { highlightPlaceholders } from '~/utils/highlightPlaceholders'

const props = defineProps<{
  blueprint: string | null
}>()

const copied = ref(false)

function copyScript() {
  if (!props.blueprint) return
  navigator.clipboard.writeText(props.blueprint)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}
</script>

<template>
  <div v-if="blueprint" class="bg-white rounded-lg border border-neutral-200 p-5">
    <div class="flex items-center justify-between mb-3">
      <h2 class="text-lg font-semibold text-default">Script Template</h2>
      <UButton
        :icon="copied ? 'i-ph-check' : 'i-ph-copy'"
        size="xs"
        variant="ghost"
        @click="copyScript"
      >
        {{ copied ? 'Copied' : 'Copy' }}
      </UButton>
    </div>
    <div
      class="font-mono text-sm leading-relaxed bg-neutral-50 rounded-md p-4 border border-neutral-100 whitespace-pre-wrap"
      v-html="highlightPlaceholders(blueprint)"
    />
  </div>
</template>
