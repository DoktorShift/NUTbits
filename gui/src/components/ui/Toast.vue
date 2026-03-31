<script setup>
import { computed } from 'vue'

const props = defineProps({
  toast: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['close'])

const borderColor = computed(() => {
  const colors = {
    success: 'border-l-emerald-500',
    error: 'border-l-red-500',
    warning: 'border-l-yellow-500',
    info: 'border-l-blue-500',
  }
  return colors[props.toast.type] || colors.info
})

const iconChar = computed(() => {
  const icons = {
    success: '\u2713',
    error: '\u2717',
    warning: '\u26A0',
    info: '\u2139',
  }
  return icons[props.toast.type] || icons.info
})

const iconColor = computed(() => {
  const colors = {
    success: 'text-emerald-400',
    error: 'text-red-400',
    warning: 'text-yellow-400',
    info: 'text-blue-400',
  }
  return colors[props.toast.type] || colors.info
})
</script>

<template>
  <div
    :class="[
      'flex items-start gap-3 bg-nutbits-900 border border-nutbits-700 border-l-4 rounded-lg shadow-xl px-4 py-3 min-w-[280px] max-w-[400px] transition-all duration-300',
      borderColor,
      toast.removing
        ? 'opacity-0 translate-x-8'
        : 'opacity-100 translate-x-0',
    ]"
  >
    <span :class="['text-sm mt-0.5', iconColor]">{{ iconChar }}</span>
    <p class="flex-1 text-sm text-nutbits-100">{{ toast.message }}</p>
    <button
      class="text-nutbits-400 hover:text-nutbits-100 transition-colors text-sm leading-none ml-2"
      @click="emit('close', toast.id)"
    >
      &times;
    </button>
  </div>
</template>
