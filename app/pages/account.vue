<script setup lang="ts">
useSeoMeta({
  title: 'Account',
  robots: 'noindex,nofollow'
})

const { profile, authHeaders, logout, refreshProfile } = useAuth()
const router = useRouter()

const error = ref<string | null>(null)

async function handleLogout() {
  await logout()
  router.push('/login')
}

const editingName = ref(false)
const draftName = ref('')
const savingName = ref(false)
const nameError = ref<string | null>(null)

function startEditName() {
  draftName.value = profile.value?.display_name || ''
  nameError.value = null
  editingName.value = true
}

function cancelEditName() {
  editingName.value = false
  nameError.value = null
}

async function saveName() {
  const trimmed = draftName.value.trim()
  if (!trimmed) {
    nameError.value = 'Display name cannot be empty'
    return
  }
  savingName.value = true
  nameError.value = null
  try {
    await $fetch('/api/auth/profile', {
      method: 'PUT',
      body: { display_name: trimmed },
      headers: authHeaders()
    })
    await refreshProfile()
    editingName.value = false
  } catch (err: any) {
    nameError.value = err?.data?.message || err?.message || 'Failed to save'
  } finally {
    savingName.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl mx-auto px-4 md:px-6 py-8 md:py-10 space-y-8">
    <h1 class="text-2xl font-bold">Account</h1>

    <UAlert v-if="error" color="error" :title="error" />

    <!-- Profile -->
    <section class="bg-default border border-default rounded-2xl p-6 space-y-3">
      <h2 class="text-sm font-semibold uppercase tracking-wider text-dimmed">Profile</h2>

      <div v-if="editingName" class="space-y-2">
        <UInput
          v-model="draftName"
          placeholder="Display name"
          :disabled="savingName"
          autofocus
          @keydown.enter="saveName"
          @keydown.escape="cancelEditName"
        />
        <p v-if="nameError" class="text-xs text-error">{{ nameError }}</p>
        <div class="flex flex-wrap gap-2 pt-1">
          <UButton size="sm" :loading="savingName" @click="saveName">Save</UButton>
          <UButton size="sm" variant="ghost" :disabled="savingName" @click="cancelEditName">
            Cancel
          </UButton>
        </div>
      </div>

      <div v-else class="flex items-center gap-2">
        <p class="text-default">{{ profile?.display_name || '—' }}</p>
        <UButton
          variant="ghost"
          size="xs"
          icon="i-ph-pencil-simple"
          aria-label="Edit display name"
          @click="startEditName"
        />
      </div>

      <p class="text-sm text-muted">{{ profile?.email }}</p>
    </section>

    <!-- Sign out -->
    <section class="flex justify-end">
      <UButton variant="ghost" color="neutral" @click="handleLogout">Sign out</UButton>
    </section>
  </div>
</template>
