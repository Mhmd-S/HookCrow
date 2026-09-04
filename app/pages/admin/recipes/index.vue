<script setup lang="ts">
// The recipe list lives at /admin. This keeps any stale /admin/recipes link
// working instead of 404-ing.
definePageMeta({
  middleware: ['admin'],
  redirect: '/admin',
})

useSeoMeta({
  title: 'Recipes',
  robots: 'noindex,nofollow'
})
</script>

<template>
  <div />
</template>
