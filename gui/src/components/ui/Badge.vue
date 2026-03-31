<script setup>
import { computed } from 'vue'

const props = defineProps({
  variant: {
    type: String,
    default: '',
  },
  type: {
    type: String,
    default: '',
  },
  label: {
    type: String,
    default: '',
  },
  size: {
    type: String,
    default: 'sm',
    validator: (v) => ['sm', 'md'].includes(v),
  },
})

const effectiveVariant = computed(() => props.variant || props.type || 'default')

const variantClasses = computed(() => {
  const variants = {
    success: 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20',
    warning: 'bg-yellow-500/10 text-yellow-400 ring-1 ring-yellow-500/20',
    error: 'bg-red-500/10 text-red-400 ring-1 ring-red-500/20',
    info: 'bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20',
    default: 'bg-nutbits-700/50 text-nutbits-300 ring-1 ring-nutbits-600/30',
  }
  return variants[effectiveVariant.value] || variants.default
})

const sizeClasses = computed(() => {
  return props.size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[11px]'
})
</script>

<template>
  <span
    :class="[
      'inline-flex items-center rounded-full font-medium leading-tight',
      variantClasses,
      sizeClasses,
    ]"
  >
    <slot>{{ label }}</slot>
  </span>
</template>
