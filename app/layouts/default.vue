<template>
  <!-- User-facing shell. Admin pages use the `admin` layout instead. -->
  <div class="min-h-screen flex flex-col bg-muted">
    <AppHeader />

    <main class="flex-1">
      <slot />
    </main>

    <AppFooter />
  </div>
</template>
