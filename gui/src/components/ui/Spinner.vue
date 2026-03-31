<script setup>
import { computed } from 'vue'

const props = defineProps({
  size: {
    type: String,
    default: 'md',
    validator: (v) => ['sm', 'md', 'lg'].includes(v),
  },
})

const sizeClasses = computed(() => {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-10 h-10',
  }
  return sizes[props.size]
})
</script>

<template>
  <div
    :class="[
      'rounded-full border-2 border-nutbits-700 border-t-amber-500 animate-spin shadow-[0_0_8px_rgba(245,158,11,0.15)]',
      sizeClasses,
    ]"
    role="status"
    aria-label="Loading"
  ></div>
</template>
