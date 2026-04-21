<script setup lang="ts">
definePageMeta({ layout: 'blank' })

useSeoMeta({
  title: 'Confirming email…',
  robots: 'noindex,nofollow'
})

const { setSessionFromTokens } = useAuth()

const status = ref<'working' | 'success' | 'error'>('working')
const errorMessage = ref<string>('')

function decodeParam(value: string | null): string {
  return value ? decodeURIComponent(value.replace(/\+/g, ' ')) : ''
}

onMounted(async () => {
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : ''
  const hashParams = new URLSearchParams(hash)
  const queryParams = new URLSearchParams(window.location.search)

  const errCode = hashParams.get('error') || hashParams.get('error_code') || queryParams.get('error')
  const errDesc = hashParams.get('error_description') || queryParams.get('error_description')
  if (errCode || errDesc) {
    status.value = 'error'
    errorMessage.value = decodeParam(errDesc) || decodeParam(errCode) || 'Confirmation failed'
    return
  }

  const accessToken = hashParams.get('access_token')
  const refreshToken = hashParams.get('refresh_token')
  if (!accessToken || !refreshToken) {
    status.value = 'error'
    errorMessage.value = 'Missing confirmation tokens. Open the link from your email again.'
    return
  }

  const { error } = await setSessionFromTokens(accessToken, refreshToken)
  if (error) {
    status.value = 'error'
    errorMessage.value = error
    return
  }

  history.replaceState(null, '', window.location.pathname)
  status.value = 'success'
  setTimeout(() => navigateTo('/'), 800)
})
</script>

<template>
  <div class="min-h-screen bg-muted flex items-center justify-center px-4">
    <UPageCard class="w-full max-w-md">
      <div class="p-8 text-center space-y-4">
        <template v-if="status === 'working'">
          <UIcon name="i-ph-circle-notch" class="w-10 h-10 animate-spin text-primary mx-auto" />
          <h1 class="text-lg font-semibold">Confirming your email…</h1>
          <p class="text-muted text-sm">This only takes a second.</p>
        </template>

        <template v-else-if="status === 'success'">
          <UIcon name="i-ph-check-circle-fill" class="w-12 h-12 text-success mx-auto" />
          <h1 class="text-lg font-semibold">Email confirmed</h1>
          <p class="text-muted text-sm">Taking you into Hookcrow…</p>
        </template>

        <template v-else>
          <UIcon name="i-ph-warning" class="w-12 h-12 text-error mx-auto" />
          <h1 class="text-lg font-semibold">Couldn't confirm email</h1>
          <p class="text-muted text-sm">{{ errorMessage }}</p>
          <div class="flex flex-col gap-2 pt-2">
            <UButton to="/register" variant="soft" block>
              Try signing up again
            </UButton>
            <UButton to="/login" variant="ghost" block>
              Back to login
            </UButton>
          </div>
        </template>
      </div>
    </UPageCard>
  </div>
</template>
