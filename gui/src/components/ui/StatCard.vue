<script setup>
import { computed } from 'vue'

const props = defineProps({
  label: {
    type: String,
    default: '',
  },
  title: {
    type: String,
    default: '',
  },
  value: {
    type: [String, Number],
    default: '--',
  },
  sublabel: {
    type: String,
    default: '',
  },
  trend: {
    type: String,
    default: '',
    validator: (v) => ['', 'up', 'down'].includes(v),
  },
  icon: {
    type: String,
    default: '',
  },
  loading: {
    type: Boolean,
    default: false,
  },
})

const displayLabel = computed(() => props.label || props.title)

const trendIcon = computed(() => {
  if (props.trend === 'up') return '\u2191'
  if (props.trend === 'down') return '\u2193'
  return ''
})

const trendColor = computed(() => {
  if (props.trend === 'up') return 'text-emerald-400'
  if (props.trend === 'down') return 'text-red-400'
  return ''
})
</script>

<template>
  <div
    class="group bg-nutbits-900 border border-nutbits-700 rounded-xl p-5 hover:border-nutbits-600 hover:shadow-[0_0_30px_rgba(245,158,11,0.04)] transition-all duration-300 relative overflow-hidden"
  >
    <div class="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />

    <div class="flex items-center justify-between mb-3">
      <span class="text-xs font-medium text-nutbits-400 uppercase tracking-wide">
        {{ displayLabel }}
      </span>
      <span v-if="icon" class="text-nutbits-400 text-lg">{{ icon }}</span>
    </div>

    <div class="flex items-end gap-2">
      <template v-if="loading">
        <div class="h-8 w-24 rounded bg-nutbits-800 animate-pulse" />
      </template>
      <template v-else>
        <span class="text-2xl font-semibold text-nutbits-50">{{ value }}</span>
        <span v-if="trendIcon" :class="['text-sm font-medium mb-0.5', trendColor]">
          {{ trendIcon }}
        </span>
      </template>
    </div>

    <p v-if="sublabel" class="text-xs text-nutbits-400 mt-1">
      {{ sublabel }}
    </p>
  </div>
</template>
