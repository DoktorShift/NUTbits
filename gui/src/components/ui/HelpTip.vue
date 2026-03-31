<script setup>
import { ref, nextTick } from 'vue'

defineProps({
  text: {
    type: String,
    default: '',
  },
})

const tipRef = ref(null)
const popoverRef = ref(null)
const visible = ref(false)
const popoverStyle = ref({})

async function toggle() {
  if (visible.value) {
    visible.value = false
    return
  }

  visible.value = true
  await nextTick()
  reposition()
}

function reposition() {
  if (!tipRef.value || !popoverRef.value) return

  const trigger = tipRef.value.getBoundingClientRect()
  const popover = popoverRef.value.getBoundingClientRect()
  const pad = 12

  // Default: centered above the icon
  let left = trigger.left + trigger.width / 2 - popover.width / 2
  let top = trigger.top - popover.height - 8

  // If it would go above viewport, show below instead
  if (top < pad) {
    top = trigger.bottom + 8
  }

  // Clamp horizontally to stay inside viewport
  if (left < pad) left = pad
  if (left + popover.width > window.innerWidth - pad) {
    left = window.innerWidth - pad - popover.width
  }

  popoverStyle.value = {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
    zIndex: 9999,
  }
}

function close() {
  visible.value = false
}
</script>

<template>
  <span
    v-if="text"
    ref="tipRef"
    class="inline-flex items-center"
  >
    <button
      type="button"
      class="inline-flex h-4 w-4 items-center justify-center rounded-full border border-nutbits-600 text-[10px] font-bold text-nutbits-400 cursor-help hover:border-nutbits-400 hover:text-nutbits-200 transition-colors"
      aria-label="Help"
      @click.stop="toggle"
    >
      ?
    </button>

    <Teleport to="body">
      <div
        v-if="visible"
        class="fixed inset-0 z-[9998]"
        @click="close"
      />
      <div
        v-if="visible"
        ref="popoverRef"
        :style="popoverStyle"
        class="w-72 max-w-[calc(100vw-1.5rem)] rounded-lg border border-nutbits-700 bg-nutbits-900 px-3.5 py-2.5 text-xs leading-5 text-nutbits-200 shadow-2xl"
      >
        {{ text }}
      </div>
    </Teleport>
  </span>
</template>
