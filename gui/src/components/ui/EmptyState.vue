<script setup>
defineProps({
  icon: {
    type: String,
    default: '',
  },
  title: {
    type: String,
    default: '',
  },
  message: {
    type: String,
    default: '',
  },
  description: {
    type: String,
    default: '',
  },
})
</script>

<template>
  <div class="rounded-2xl border border-dashed border-nutbits-700 bg-nutbits-900/70 px-6 py-14 text-center">
    <span v-if="icon" class="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-nutbits-700 bg-nutbits-800 text-3xl text-nutbits-300">{{ icon }}</span>
    <h3 class="mb-2 text-lg font-semibold text-nutbits-100">{{ title || message }}</h3>
    <p v-if="description" class="mx-auto mb-6 max-w-md text-sm text-nutbits-400">
      {{ description }}
    </p>
    <slot />
  </div>
</template>
