<script setup lang="ts">
const { isOpen, close } = useSidebarState()
</script>

<template>
  <div class="h-screen flex overflow-hidden bg-muted">
    <!-- Mobile backdrop -->
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-200"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isOpen"
        class="fixed inset-0 bg-black/30 z-40 lg:hidden"
        @click="close"
      />
    </Transition>

    <!-- Sidebar -->
    <aside
      class="fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 lg:static lg:translate-x-0"
      :class="isOpen ? 'translate-x-0' : '-translate-x-full'"
    >
      <AppSidebar />
    </aside>

    <!-- Main area: the only scroll container in the admin shell -->
    <div class="flex-1 flex flex-col min-w-0">
      <AdminTopbar />
      <main class="flex-1 overflow-y-auto">
        <slot />
      </main>
    </div>
  </div>
</template>
