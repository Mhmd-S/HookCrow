<template>
  <div class="max-w-xl mx-auto px-6 py-24 text-center space-y-4">
    <UIcon name="i-ph-x-circle" class="w-10 h-10 text-muted mx-auto" />
    <h1 class="text-xl font-semibold">Checkout canceled</h1>
    <p class="text-muted text-sm">No charge was made. You can try again whenever you're ready.</p>
    <div class="flex flex-wrap gap-2 justify-center pt-2">
      <UButton to="/pricing" size="lg">See plans</UButton>
      <UButton to="/" variant="ghost" size="lg">Keep browsing</UButton>
    </div>
  </div>
</template>
