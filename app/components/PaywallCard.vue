<script setup lang="ts">
import type { LockedRecipe } from '~/types'

interface Props {
  recipe: LockedRecipe
  videoUrl: string
}

const props = defineProps<Props>()
const route = useRoute()

const isLoginGate = computed(() => props.recipe.reason === 'login_required')

const loginHref = computed(() => `/login?redirect=${encodeURIComponent(route.fullPath)}`)
const registerHref = computed(() => `/register?redirect=${encodeURIComponent(route.fullPath)}`)

const headline = computed(() =>
  isLoginGate.value ? 'Create a free account to view this recipe' : 'Unlock this recipe with Pro'
)

const subhead = computed(() =>
  isLoginGate.value
    ? 'Sign up to browse the full free catalogue. Paid plan only needed for Pro recipes.'
    : 'Full script breakdown, strategic analysis, and every future Pro recipe.'
)

const primaryCta = computed(() =>
  isLoginGate.value
    ? { to: registerHref.value, label: 'Sign up — it\'s free', icon: 'i-ph-user-plus' }
    : { to: '/pricing', label: 'See plans', icon: 'i-ph-arrow-right' }
)

const secondaryCta = computed(() =>
  isLoginGate.value
    ? { to: loginHref.value, label: 'I already have an account' }
    : { to: '/', label: 'Back to free recipes' }
)

const bullets = computed(() =>
  isLoginGate.value
    ? [
        'Browse every free recipe in the library',
        'Save your progress and preferences',
        'Upgrade later for premium recipes'
      ]
    : [
        'Full script blueprint with every segment broken down',
        'Skeletal logic — goal, technique, and psychology per segment',
        'Unlimited access to every Pro recipe, now and added later'
      ]
)

const badgeLabel = computed(() => (isLoginGate.value ? 'Members only' : 'Pro recipe'))
const badgeIcon = computed(() => (isLoginGate.value ? 'i-ph-lock-key' : 'i-ph-lock-fill'))
</script>

<template>
  <div class="flex flex-col lg:flex-row gap-8 p-6 max-w-7xl mx-auto">
    <!-- Locked video preview -->
    <aside class="lg:w-80 shrink-0">
      <div class="lg:sticky lg:top-6 space-y-4">
        <div class="relative aspect-9/16 bg-black rounded-2xl overflow-hidden shadow-sm ring-1 ring-neutral-200">
          <video
            :src="videoUrl"
            class="w-full h-full object-cover blur-md scale-110"
            muted
            playsinline
          />
          <div class="absolute inset-0 bg-black/40 flex items-center justify-center">
            <div class="flex flex-col items-center gap-2 text-white">
              <UIcon :name="badgeIcon" class="w-10 h-10" />
              <span class="text-xs font-semibold uppercase tracking-wider">{{ badgeLabel }}</span>
            </div>
          </div>
        </div>

        <div>
          <h1 class="text-xl font-bold text-default leading-tight">
            {{ recipe.title || recipe.creator_handle || 'Recipe' }}
          </h1>
          <div v-if="recipe.creator_handle" class="flex items-center gap-1.5 mt-1.5 text-sm text-muted">
            <UIcon name="i-ph-user-circle" class="w-4 h-4" />
            <span>@{{ recipe.creator_handle }}</span>
            <span v-if="recipe.platform" class="text-dimmed">·</span>
            <span v-if="recipe.platform" class="text-dimmed">{{ recipe.platform }}</span>
          </div>
        </div>

        <div v-if="(recipe.semantic_tags || []).length" class="flex flex-wrap gap-1.5">
          <UBadge
            v-for="tag in recipe.semantic_tags"
            :key="tag"
            size="sm"
            color="neutral"
            variant="subtle"
          >
            {{ tag }}
          </UBadge>
        </div>
      </div>
    </aside>

    <!-- Upgrade pitch -->
    <div class="flex-1 min-w-0">
      <div class="bg-white border border-default rounded-2xl p-8 space-y-6">
        <div class="flex items-center gap-3">
          <div class="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary">
            <UIcon
              :name="isLoginGate ? 'i-ph-user-plus' : 'i-ph-crown-simple'"
              class="w-5 h-5"
            />
          </div>
          <div>
            <h2 class="text-lg font-semibold">{{ headline }}</h2>
            <p class="text-sm text-muted">{{ subhead }}</p>
          </div>
        </div>

        <p
          v-if="recipe.overview_teaser"
          class="text-base leading-relaxed text-default border-l-2 border-primary/40 pl-4 italic"
        >
          {{ recipe.overview_teaser }}
        </p>

        <ul class="space-y-2 text-sm">
          <li v-for="bullet in bullets" :key="bullet" class="flex items-start gap-2">
            <UIcon name="i-ph-check-circle-fill" class="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <span>{{ bullet }}</span>
          </li>
        </ul>

        <div class="flex flex-wrap gap-2">
          <UButton :to="primaryCta.to" :icon="primaryCta.icon" size="lg">
            {{ primaryCta.label }}
          </UButton>
          <UButton :to="secondaryCta.to" variant="ghost" size="lg">
            {{ secondaryCta.label }}
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>
