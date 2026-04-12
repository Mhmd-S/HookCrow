<script setup lang="ts">
import { SEMANTIC_TAG_CATEGORIES } from '~/types'

const props = defineProps<{
  modelValue: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
}>()

const domains = SEMANTIC_TAG_CATEGORIES.domain

function select(domain: string | null) {
  if (domain === props.modelValue) {
    emit('update:modelValue', null)
  } else {
    emit('update:modelValue', domain)
  }
}
</script>

<template>
  <div class="space-y-3">
    <p class="text-xs font-medium uppercase tracking-wider text-muted">
      Browse by domain
    </p>
    <div class="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-6 px-6 pb-1">
      <button
        type="button"
        class="shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors"
        :class="modelValue === null
          ? 'bg-primary text-white'
          : 'bg-neutral-100 text-default hover:bg-neutral-200'"
        @click="select(null)"
      >
        All
      </button>
      <button
        v-for="domain in domains"
        :key="domain"
        type="button"
        class="shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors"
        :class="modelValue === domain
          ? 'bg-primary text-white'
          : 'bg-neutral-100 text-default hover:bg-neutral-200'"
        @click="select(domain)"
      >
        {{ domain }}
      </button>
    </div>
  </div>
</template>
