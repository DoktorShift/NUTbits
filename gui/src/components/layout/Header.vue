<script setup>
import { computed } from 'vue'
import { useStatusStore } from '@/stores/status.js'

defineProps({
  connected: {
    type: Boolean,
    default: false,
  },
})

defineEmits(['toggle-nav'])

const statusStore = useStatusStore()

const headerMeta = computed(() => [
  statusStore.status?.version ? `v${statusStore.status.version}` : null,
  statusStore.uptimeFormatted !== '--' ? `Uptime ${statusStore.uptimeFormatted}` : null,
].filter(Boolean))
</script>

<template>
  <header
    class="sticky top-0 z-30 border-b border-nutbits-700/50 bg-nutbits-950/85 px-4 py-4 backdrop-blur-xl sm:px-6 lg:px-8"
  >
    <div class="flex items-center justify-between gap-4">
      <div class="flex min-w-0 items-center gap-3">
        <button
          class="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-nutbits-700 bg-nutbits-900 text-nutbits-200 transition-colors hover:border-nutbits-600 hover:text-nutbits-50 lg:hidden"
          aria-label="Open navigation"
          @click="$emit('toggle-nav')"
        >
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round">
            <path d="M4 7h16" />
            <path d="M4 12h16" />
            <path d="M4 17h16" />
          </svg>
        </button>

        <div v-if="headerMeta.length" class="min-w-0">
          <div class="flex flex-wrap items-center gap-2 text-[11px] text-nutbits-500">
            <span v-for="item in headerMeta" :key="item">{{ item }}</span>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs"
        :class="connected
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
          : 'border-red-500/30 bg-red-500/10 text-red-300'"
      >
        <span
          :class="[
            'inline-block h-2 w-2 rounded-full transition-colors duration-200',
            connected ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]' : 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]',
          ]"
        />
        <span class="hidden sm:inline">{{ connected ? 'Backend online' : 'Backend offline' }}</span>
        <span class="sm:hidden">{{ connected ? 'Online' : 'Offline' }}</span>
      </div>
    </div>
  </header>
</template>
