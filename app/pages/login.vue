<script setup lang="ts">
import type { FormSubmitEvent, AuthFormField } from '@nuxt/ui'

definePageMeta({ layout: 'blank' })

const { login, isAuthenticated, isAdmin } = useAuth()
const route = useRoute()

const error = ref<string | null>(null)
const submitting = ref(false)

const fields: AuthFormField[] = [
  { name: 'email', type: 'email', label: 'Email', placeholder: 'you@example.com', required: true },
  { name: 'password', type: 'password', label: 'Password', placeholder: 'Your password', required: true }
]

function destination() {
  const redirect = route.query.redirect
  if (typeof redirect === 'string' && redirect.startsWith('/')) return redirect
  return isAdmin.value ? '/admin' : '/'
}

watch(isAuthenticated, (val) => {
  if (val) navigateTo(destination())
}, { immediate: true })

async function onSubmit(event: FormSubmitEvent<{ email: string; password: string }>) {
  error.value = null
  submitting.value = true

  const result = await login(event.data.email, event.data.password)
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
        title="Welcome back"
        description="Sign in to your account"
        icon="i-ph-sign-in"
        :fields="fields"
        :loading="submitting"
        @submit="onSubmit"
      >
        <template #validation>
          <UAlert v-if="error" color="error" :title="error" icon="i-ph-warning" />
        </template>

        <template #footer>
          Don't have an account? <ULink to="/register" class="text-primary font-medium">Sign up</ULink>
        </template>
      </UAuthForm>
    </UPageCard>
  </div>
</template>
