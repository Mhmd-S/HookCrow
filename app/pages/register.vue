<script setup lang="ts">
import type { FormSubmitEvent, AuthFormField } from '@nuxt/ui'

definePageMeta({ layout: 'blank' })

const { register, isAuthenticated } = useAuth()
const route = useRoute()

const error = ref<string | null>(null)
const submitting = ref(false)

const fields: AuthFormField[] = [
  { name: 'displayName', type: 'text', label: 'Display Name', placeholder: 'Your name' },
  { name: 'email', type: 'email', label: 'Email', placeholder: 'you@example.com', required: true },
  { name: 'password', type: 'password', label: 'Password', placeholder: 'Min. 6 characters', required: true }
]

function destination() {
  const redirect = route.query.redirect
  if (typeof redirect === 'string' && redirect.startsWith('/')) return redirect
  return '/'
}

watch(isAuthenticated, (val) => {
  if (val) navigateTo(destination())
}, { immediate: true })

async function onSubmit(event: FormSubmitEvent<{ displayName?: string; email: string; password: string }>) {
  error.value = null
  submitting.value = true

  const result = await register(event.data.email, event.data.password, event.data.displayName || undefined)
  if (result.error) {
    error.value = result.error
  } else {
    navigateTo(destination())
  }

  submitting.value = false
}
</script>

<template>
  <div class="min-h-screen bg-muted flex items-center justify-center px-4">
    <UPageCard class="w-full max-w-md">
      <UAuthForm
        title="Create account"
        description="Get started with Skelet"
        icon="i-ph-user-plus"
        :fields="fields"
        :loading="submitting"
        @submit="onSubmit"
      >
        <template #validation>
          <UAlert v-if="error" color="error" :title="error" icon="i-ph-warning" />
        </template>

        <template #footer>
          Already have an account? <ULink to="/login" class="text-primary font-medium">Sign in</ULink>
        </template>
      </UAuthForm>
    </UPageCard>
  </div>
</template>
