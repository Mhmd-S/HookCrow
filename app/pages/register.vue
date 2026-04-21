<script setup lang="ts">
import type { FormSubmitEvent, AuthFormField } from '@nuxt/ui'

definePageMeta({ layout: 'blank' })

useSeoMeta({
  title: 'Create account',
  robots: 'noindex,nofollow'
})

const { register, resendConfirmation, isAuthenticated } = useAuth()
const route = useRoute()

const error = ref<string | null>(null)
const submitting = ref(false)
const pendingEmail = ref<string | null>(null)
const resending = ref(false)
const resendStatus = ref<'idle' | 'sent' | 'error'>('idle')
const resendError = ref<string | null>(null)

const prefillEmail = typeof route.query.email === 'string' ? route.query.email : ''

const fields: AuthFormField[] = [
  { name: 'displayName', type: 'text', label: 'Display Name', placeholder: 'Your name' },
  { name: 'email', type: 'email', label: 'Email', placeholder: 'you@example.com', required: true, defaultValue: prefillEmail },
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
  } else if (result.needsConfirmation) {
    pendingEmail.value = event.data.email
  } else {
    navigateTo(destination())
  }

  submitting.value = false
}

async function onResend() {
  if (!pendingEmail.value || resending.value) return
  resending.value = true
  resendStatus.value = 'idle'
  resendError.value = null

  const result = await resendConfirmation(pendingEmail.value)
  if (result.error) {
    resendStatus.value = 'error'
    resendError.value = result.error
  } else {
    resendStatus.value = 'sent'
  }

  resending.value = false
}
</script>

<template>
  <div class="min-h-screen bg-muted flex items-center justify-center px-4">
    <UPageCard class="w-full max-w-md">
      <template v-if="!pendingEmail">
        <UAuthForm
          title="Create account"
          description="Get started with Hookcrow"
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
      </template>

      <template v-else>
        <div class="p-6 md:p-8 text-center space-y-4">
          <UIcon name="i-ph-envelope-simple" class="w-12 h-12 text-primary mx-auto" />
          <h1 class="text-xl font-semibold tracking-tight">Check your email</h1>
          <p class="text-muted text-sm">
            We sent a confirmation link to
            <span class="font-medium text-default break-all">{{ pendingEmail }}</span>.
            Click the link to activate your account.
          </p>

          <UAlert
            v-if="resendStatus === 'sent'"
            color="success"
            icon="i-ph-check-circle"
            title="Confirmation email resent"
            description="Give it a minute and check your spam folder if you don't see it."
          />
          <UAlert
            v-else-if="resendStatus === 'error'"
            color="error"
            icon="i-ph-warning"
            :title="resendError || 'Failed to resend'"
          />

          <div class="flex flex-col gap-2 pt-2">
            <UButton
              variant="soft"
              :loading="resending"
              icon="i-ph-paper-plane-tilt"
              block
              @click="onResend"
            >
              Resend confirmation email
            </UButton>
            <UButton to="/login" variant="ghost" block>
              Back to login
            </UButton>
          </div>
        </div>
      </template>
    </UPageCard>
  </div>
</template>
