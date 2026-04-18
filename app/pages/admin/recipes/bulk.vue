<script setup lang="ts">
definePageMeta({ layout: 'blank', middleware: ['admin'] })
</script>

<template>
  <div class="min-h-screen bg-neutral-50 dark:bg-neutral-950">
    <div class="max-w-4xl mx-auto px-4 py-8">
      <!-- Header -->
      <div class="mb-8">
        <UButton to="/admin" variant="ghost" icon="i-ph-arrow-left" class="mb-4">
          Back to Dashboard
        </UButton>
        <h1 class="text-2xl font-bold">Bulk Upload Recipes</h1>
        <p class="text-neutral-500 mt-1">Add multiple videos at once. Each one is analyzed into a reusable recipe template.</p>
      </div>

      <!-- Bulk Upload Form -->
      <div class="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-6">
        <VideoBulkUploadForm />
      </div>
    </div>
  </div>
</template>
