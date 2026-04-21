<script setup lang="ts">
const { isAuthenticated } = useAuth()
</script>

<template>
  <footer class="border-t border-default bg-default">
    <div class="max-w-7xl mx-auto px-4 md:px-6 py-10">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
        <!-- Brand -->
        <div class="space-y-3">
          <NuxtLink to="/" class="flex items-center gap-2" aria-label="Hookcrow — home">
            <img src="/icon.svg" alt="" width="32" height="32" class="w-8 h-8">
            <span class="text-[17px] font-bold tracking-tight text-default">hookcrow</span>
          </NuxtLink>
          <p class="text-sm text-muted max-w-xs">
            The creative reference for short-form marketing videos — hooks, bridges, and CTAs from real creators.
          </p>
          <p class="text-xs text-dimmed">© 2026 Hookcrow</p>
        </div>

        <!-- Product -->
        <div class="space-y-3">
          <p class="text-xs font-semibold uppercase tracking-wider text-dimmed">Product</p>
          <ul class="space-y-2 text-sm">
            <li><NuxtLink to="/search" class="text-default hover:text-primary transition-colors">Browse</NuxtLink></li>
            <li><NuxtLink to="/pricing" class="text-default hover:text-primary transition-colors">Pricing</NuxtLink></li>
            <li v-if="isAuthenticated">
              <NuxtLink to="/bookmarks" class="text-default hover:text-primary transition-colors">Bookmarks</NuxtLink>
            </li>
          </ul>
        </div>

        <!-- Company -->
        <div class="space-y-3">
          <p class="text-xs font-semibold uppercase tracking-wider text-dimmed">Company</p>
          <ul class="space-y-2 text-sm">
            <li><NuxtLink to="/terms" class="text-default hover:text-primary transition-colors">Terms</NuxtLink></li>
            <li><NuxtLink to="/privacy" class="text-default hover:text-primary transition-colors">Privacy</NuxtLink></li>
            <li><NuxtLink to="/contact" class="text-default hover:text-primary transition-colors">Contact</NuxtLink></li>
          </ul>
        </div>
      </div>
    </div>
  </footer>
</template>
