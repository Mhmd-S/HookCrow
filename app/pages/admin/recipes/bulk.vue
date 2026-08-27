<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: ['admin'] })
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-8">
    <!-- Header -->
    <div class="mb-8">
      <h1 class="text-2xl font-bold">Bulk Upload Recipes</h1>
      <p class="text-muted mt-1">Add multiple videos at once. Each one is analyzed into a reusable recipe template.</p>
    </div>

    <!-- Bulk Upload Form -->
    <div class="bg-default rounded-xl border border-default p-6">
      <VideoBulkUploadForm />
    </div>
  </div>
</template>
