<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  /** Array of { label: string, value: number, value2?: number } */
  data: { type: Array, default: () => [] },
  /** Primary bar color */
  color: { type: String, default: '#f59e0b' },
  /** Secondary bar color (for stacked/dual values) */
  color2: { type: String, default: '#10b981' },
  /** Unit suffix shown on hover values */
  unit: { type: String, default: '' },
  /** Label for primary value in tooltip */
  label1: { type: String, default: '' },
  /** Label for secondary value in tooltip */
  label2: { type: String, default: '' },
  /** Show horizontal guide lines */
  guides: { type: Boolean, default: true },
  /** Show value on top of hovered bar */
  interactive: { type: Boolean, default: true },
})

const containerRef = ref(null)
const containerW = ref(600)
const containerH = ref(200)
const hoverIndex = ref(-1)
const hoverX = ref(0)

const hoveredBar = computed(() => hoverIndex.value >= 0 ? chartData.value[hoverIndex.value] : null)

function measure() {
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  containerW.value = Math.floor(rect.width) || 600
  containerH.value = Math.floor(rect.height) || 200
}

let ro = null
onMounted(() => {
  measure()
  ro = new ResizeObserver(measure)
  if (containerRef.value) ro.observe(containerRef.value)
})
onBeforeUnmount(() => { if (ro) ro.disconnect() })

const W = computed(() => containerW.value)
const H = computed(() => containerH.value)
const labelH = 18
const topPad = 6
const plotH = computed(() => H.value - labelH - topPad)

const maxVal = computed(() => {
  if (!props.data.length) return 1
  const m = Math.max(...props.data.map((d) => (d.value || 0) + (d.value2 || 0)))
  return m || 1
})

const barGap = computed(() => props.data.length > 14 ? 1 : Math.max(1, Math.floor(W.value / props.data.length * 0.15)))
const barWidth = computed(() => {
  const count = props.data.length || 1
  return Math.max(3, (W.value - barGap.value * (count - 1)) / count)
})

const labelEvery = computed(() => {
  if (props.data.length <= 8) return 1
  if (props.data.length <= 16) return 2
  return Math.ceil(props.data.length / 8)
})

const chartData = computed(() => {
  return props.data.map((d, i) => {
    const total = (d.value || 0) + (d.value2 || 0)
    const h1 = ((d.value || 0) / maxVal.value) * plotH.value
    const h2 = ((d.value2 || 0) / maxVal.value) * plotH.value
    const x = i * (barWidth.value + barGap.value)
    return { ...d, x, h1, h2, total, i }
  })
})

const guideLines = computed(() => {
  if (!props.guides) return []
  const m = maxVal.value
  return [0.25, 0.5, 0.75].map((pct) => ({
    y: topPad + plotH.value - pct * plotH.value,
    label: m * pct >= 1000 ? `${(m * pct / 1000).toFixed(1)}k` : Math.round(m * pct).toLocaleString(),
  }))
})

function barY(bar) { return topPad + plotH.value - bar.h1 - bar.h2 }

// Tooltip position as % of container width (to avoid overflow)
const tooltipStyle = computed(() => {
  if (!hoveredBar.value) return {}
  const bar = hoveredBar.value
  const pctX = (bar.x + barWidth.value / 2) / W.value * 100
  return {
    left: `${Math.min(85, Math.max(15, pctX))}%`,
    transform: 'translateX(-50%)',
  }
})

function fmtVal(v) { return v == null ? '0' : v.toLocaleString() }
</script>

<template>
  <div ref="containerRef" class="w-full h-full min-h-0 relative">
    <svg
      :viewBox="`0 0 ${W} ${H}`"
      class="w-full h-full block"
      preserveAspectRatio="none"
      @mouseleave="hoverIndex = -1"
    >
      <!-- Guide lines -->
      <template v-if="guides && maxVal > 0">
        <g v-for="(g, gi) in guideLines" :key="'g' + gi">
          <line :x1="0" :y1="g.y" :x2="W" :y2="g.y" stroke="currentColor" class="text-nutbits-800/60" stroke-width="0.5" />
          <text :x="W - 4" :y="g.y - 3" text-anchor="end" class="fill-current text-nutbits-700" style="font-size: 9px; font-family: ui-monospace, monospace;">{{ g.label }}</text>
        </g>
      </template>

      <!-- Baseline -->
      <line :x1="0" :y1="topPad + plotH" :x2="W" :y2="topPad + plotH" stroke="currentColor" class="text-nutbits-800" stroke-width="0.5" />

      <!-- Bars -->
      <g v-for="bar in chartData" :key="bar.i">
        <!-- Hover detection zone (full height, invisible) -->
        <rect
          v-if="interactive"
          :x="bar.x - barGap / 2"
          :y="0"
          :width="barWidth + barGap"
          :height="H"
          fill="transparent"
          @mouseenter="hoverIndex = bar.i"
        />

        <!-- Hover highlight column -->
        <rect
          v-if="hoverIndex === bar.i"
          :x="bar.x - 1"
          :y="topPad"
          :width="barWidth + 2"
          :height="plotH"
          fill="currentColor"
          class="text-nutbits-800/30"
          rx="2"
        />

        <!-- Primary bar -->
        <rect
          :x="bar.x"
          :y="barY(bar)"
          :width="barWidth"
          :height="Math.max(bar.h1, bar.total > 0 ? 2 : 0)"
          :fill="color"
          :rx="barWidth > 6 ? 2 : 1"
          :opacity="bar.total > 0 ? (hoverIndex === bar.i ? 1 : 0.85) : 0.1"
          class="transition-opacity duration-150"
        />

        <!-- Secondary bar (stacked) -->
        <rect
          v-if="bar.value2"
          :x="bar.x"
          :y="topPad + plotH - bar.h2"
          :width="barWidth"
          :height="Math.max(bar.h2, 2)"
          :fill="color2"
          :rx="barWidth > 6 ? 2 : 1"
          :opacity="hoverIndex === bar.i ? 1 : 0.85"
          class="transition-opacity duration-150"
        />

        <!-- Hover value (simple number above bar) -->
        <text
          v-if="interactive && hoverIndex === bar.i && bar.total > 0"
          :x="bar.x + barWidth / 2"
          :y="barY(bar) - 4"
          text-anchor="middle"
          class="fill-current text-nutbits-100"
          style="font-size: 10px; font-family: ui-monospace, monospace; font-weight: 700;"
        >
          {{ bar.total.toLocaleString() }}
        </text>

        <!-- X-axis label -->
        <text
          v-if="bar.i % labelEvery === 0"
          :x="bar.x + barWidth / 2"
          :y="H - 3"
          text-anchor="middle"
          class="fill-current"
          :class="hoverIndex === bar.i ? 'text-nutbits-300' : 'text-nutbits-600'"
          style="font-size: 9px; font-family: ui-monospace, monospace;"
        >
          {{ bar.label }}
        </text>
      </g>
    </svg>

    <!-- HTML tooltip overlay -->
    <div
      v-if="interactive && hoveredBar && hoveredBar.total > 0"
      class="absolute top-1 pointer-events-none z-10"
      :style="tooltipStyle"
    >
      <div class="bg-nutbits-800 border border-nutbits-600 rounded-lg px-3 py-2 shadow-xl text-xs whitespace-nowrap">
        <p class="text-nutbits-100 font-semibold mb-1">{{ hoveredBar.label }}</p>
        <!-- Custom tooltip content via slot -->
        <slot name="tooltip" :bar="hoveredBar" :unit="unit" :color="color" :color2="color2">
          <!-- Stacked: show both values -->
          <template v-if="hoveredBar.value2 !== undefined && hoveredBar.value2 !== null">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-sm flex-shrink-0" :style="{ background: color }" />
              <span class="text-nutbits-400">{{ label1 || 'Primary' }}</span>
              <span class="text-nutbits-100 font-medium tabular-nums ml-auto pl-3">{{ fmtVal(hoveredBar.value) }}{{ unit ? ' ' + unit : '' }}</span>
            </div>
            <div class="flex items-center gap-2 mt-0.5">
              <span class="w-2 h-2 rounded-sm flex-shrink-0" :style="{ background: color2 }" />
              <span class="text-nutbits-400">{{ label2 || 'Secondary' }}</span>
              <span class="text-nutbits-100 font-medium tabular-nums ml-auto pl-3">{{ fmtVal(hoveredBar.value2) }}{{ unit ? ' ' + unit : '' }}</span>
            </div>
            <div class="border-t border-nutbits-700 mt-1.5 pt-1.5 flex justify-between">
              <span class="text-nutbits-500">Total</span>
              <span class="text-nutbits-100 font-semibold tabular-nums">{{ fmtVal(hoveredBar.total) }}{{ unit ? ' ' + unit : '' }}</span>
            </div>
          </template>
          <!-- Single: just the value -->
          <template v-else>
            <span class="text-nutbits-100 font-medium tabular-nums">{{ fmtVal(hoveredBar.value) }}{{ unit ? ' ' + unit : '' }}</span>
          </template>
        </slot>
      </div>
    </div>
  </div>
</template>
