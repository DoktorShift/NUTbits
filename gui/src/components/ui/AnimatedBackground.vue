<script setup>
/**
 * Renders an animated lock-screen background from a preset.
 *
 * Supports three preset types:
 *   - whatamesh  → Stripe-style mesh gradient (pure WebGL, ~40KB)
 *   - neat       → @firecms/neat 3D gradient (three.js)
 *   - static     → CSS-only gradient, no canvas
 *
 * Usage:
 *   <AnimatedBackground :preset="presetObject" />
 */
import { ref, onMounted, onUnmounted, watch } from 'vue'

const props = defineProps({
  preset: { type: Object, required: true },
})

const canvasRef = ref(null)
let cleanup = null

// ── Initializers ───────────────────────────────────────────────

async function initWhatamesh(canvas, config) {
  const { Gradient } = await import('whatamesh')

  // Whatamesh reads colors from CSS custom properties on the canvas
  canvas.style.setProperty('--gradient-color-1', config.colors[0] || '#b45309')
  canvas.style.setProperty('--gradient-color-2', config.colors[1] || '#1a0e00')
  canvas.style.setProperty('--gradient-color-3', config.colors[2] || '#3d1f00')
  canvas.style.setProperty('--gradient-color-4', config.colors[3] || '#0f0e0d')

  // Whatamesh needs the canvas to have a unique ID
  const id = `wm-${Date.now()}`
  canvas.id = id
  canvas.setAttribute('data-transition-in', '')

  const gradient = new Gradient()
  gradient.initGradient(`#${id}`)

  return () => {
    try { gradient.pause() } catch { /* already stopped */ }
  }
}

async function initNeat(canvas, config) {
  const { NeatGradient } = await import('@firecms/neat')

  const gradient = new NeatGradient({ ref: canvas, ...config })

  return () => {
    try { gradient.destroy() } catch { /* already destroyed */ }
  }
}

// ── Lifecycle ──────────────────────────────────────────────────

async function mount() {
  destroy()

  const canvas = canvasRef.value
  if (!canvas) return

  const { type, config } = props.preset

  if (type === 'whatamesh') {
    cleanup = await initWhatamesh(canvas, config)
  } else if (type === 'neat') {
    cleanup = await initNeat(canvas, config)
  }
  // 'static' type uses CSS only — no canvas init needed
}

function destroy() {
  if (cleanup) {
    cleanup()
    cleanup = null
  }
}

onMounted(mount)
onUnmounted(destroy)

watch(() => props.preset.id, () => {
  mount()
})
</script>

<template>
  <!-- Static backgrounds use CSS; animated ones use canvas -->
  <div
    v-if="preset.type === 'static'"
    class="absolute inset-0 w-full h-full"
    :style="{ background: preset.preview }"
  />
  <canvas
    v-else
    ref="canvasRef"
    class="absolute inset-0 w-full h-full"
  />
</template>
