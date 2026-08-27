<script setup lang="ts">
// The recipe list lives at /admin. This keeps bookmarks and any stale
// /admin/recipes link working instead of 404-ing.
definePageMeta({
  middleware: ['admin'],
  redirect: '/admin',
})
</script>

<template>
  <div />
</template>
