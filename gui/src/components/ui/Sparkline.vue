<script setup>
import { computed } from 'vue'

const props = defineProps({
  data: { type: Array, default: () => [] },
  width: { type: Number, default: 200 },
  height: { type: Number, default: 32 },
  color: { type: String, default: '#f59e0b' },
  fill: { type: Boolean, default: true },
})

const pathData = computed(() => {
  const d = props.data
  if (!d || d.length < 2) return { line: '', area: '' }

  const min = Math.min(...d)
  const max = Math.max(...d)
  const range = max - min || 1
  const w = props.width
  const h = props.height
  const pad = h * 0.1
  const plotH = h - pad * 2
  const step = w / (d.length - 1)

  const pts = d.map((val, i) => ({
    x: i * step,
    y: pad + plotH - ((val - min) / range) * plotH,
  }))

  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const area = `${line} L${w},${h} L0,${h} Z`

  return { line, area }
})
</script>

<template>
  <svg
    :width="width"
    :height="height"
    :viewBox="`0 0 ${width} ${height}`"
    class="block"
    preserveAspectRatio="none"
  >
    <defs>
      <linearGradient :id="`sf-${$.uid}`" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" :stop-color="color" stop-opacity="0.2" />
        <stop offset="100%" :stop-color="color" stop-opacity="0" />
      </linearGradient>
    </defs>
    <path v-if="fill && pathData.area" :d="pathData.area" :fill="`url(#sf-${$.uid})`" />
    <path
      v-if="pathData.line"
      :d="pathData.line"
      fill="none"
      :stroke="color"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>
