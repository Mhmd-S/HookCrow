<script setup lang="ts">
import type { UserRole } from '~/types'

definePageMeta({ layout: 'admin', middleware: ['admin'] })

interface AdminUser {
  id: string
  email: string
  display_name: string | null
  role: UserRole
  created_at: string
  updated_at: string
}

const { authHeaders, profile } = useAuth()

const users = ref<AdminUser[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const updatingId = ref<string | null>(null)

async function loadUsers() {
  loading.value = true
  error.value = null
  try {
    const { data } = await $fetch<{ data: AdminUser[] }>('/api/admin/users', {
      headers: authHeaders()
    })
    users.value = data || []
  } catch (err: any) {
    error.value = err?.data?.message || err?.message || 'Failed to load users'
  } finally {
    loading.value = false
  }
}

async function setRole(user: AdminUser, role: UserRole) {
  if (user.role === role) return
  updatingId.value = user.id
  error.value = null
  try {
    const { data } = await $fetch<{ data: AdminUser }>(`/api/admin/users/${user.id}/role`, {
      method: 'PUT',
      body: { role },
      headers: authHeaders()
    })
    const idx = users.value.findIndex(u => u.id === data.id)
    if (idx >= 0) users.value[idx] = data
  } catch (err: any) {
    error.value = err?.data?.message || err?.message || 'Failed to update role'
  } finally {
    updatingId.value = null
  }
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

onMounted(loadUsers)
</script>

<template>
  <div class="p-6 max-w-5xl mx-auto">
    <div class="mb-6">
      <h2 class="text-lg font-semibold">Users</h2>
      <p class="text-muted text-sm mt-1">Promote members to admin or revoke access.</p>
    </div>

    <UAlert v-if="error" color="error" :title="error" class="mb-4" />

    <div v-if="loading" class="flex items-center justify-center py-20">
      <UIcon name="i-ph-circle-notch" class="w-8 h-8 animate-spin text-neutral-400" />
    </div>

    <div v-else class="bg-white border border-default rounded-lg overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-neutral-50 text-left text-xs uppercase tracking-wider text-dimmed">
          <tr>
            <th class="px-4 py-2">User</th>
            <th class="px-4 py-2">Role</th>
            <th class="px-4 py-2">Joined</th>
            <th class="px-4 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-default">
          <tr v-for="user in users" :key="user.id">
            <td class="px-4 py-3">
              <div class="font-medium">{{ user.display_name || user.email }}</div>
              <div class="text-xs text-muted">{{ user.email }}</div>
            </td>
            <td class="px-4 py-3">
              <UBadge :color="user.role === 'admin' ? 'primary' : 'neutral'" variant="subtle" size="sm">
                {{ user.role }}
              </UBadge>
            </td>
            <td class="px-4 py-3 text-muted">{{ formatDate(user.created_at) }}</td>
            <td class="px-4 py-3 text-right">
              <div class="inline-flex gap-2">
                <UButton
                  size="xs"
                  variant="soft"
                  :loading="updatingId === user.id && user.role !== 'admin'"
                  :disabled="user.role === 'admin'"
                  @click="setRole(user, 'admin')"
                >
                  Make admin
                </UButton>
                <UButton
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  :loading="updatingId === user.id && user.role === 'admin'"
                  :disabled="user.role === 'user' || user.id === profile?.id"
                  @click="setRole(user, 'user')"
                >
                  Revoke admin
                </UButton>
              </div>
            </td>
          </tr>
          <tr v-if="users.length === 0">
            <td colspan="4" class="px-4 py-8 text-center text-muted">No users yet.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
