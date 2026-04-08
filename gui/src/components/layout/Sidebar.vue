<script setup>
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useStatusStore } from '@/stores/status.js'
import api from '@/api/client.js'

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['close'])
const route = useRoute()
const router = useRouter()
const statusStore = useStatusStore()
const versionLabel = computed(() => {
  var v = statusStore.status?.version
  return v ? `NUTbits v${v}` : 'NUTbits'
})

const iconPaths = {
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  connections: '<path d="M15 7h3a5 5 0 0 1 0 10h-3m-6 0H6A5 5 0 0 1 6 7h3"/><path d="M8 12h8"/>',
  history: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  pay: '<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>',
  receive: '<path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/>',
  mints: '<path d="M12 3l7 4v10l-7 4-7-4V7z"/><circle cx="12" cy="12" r="2.5"/>',
  nuts: '<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 14l2 2 4-4"/>',
  relays: '<path d="M8.3 15.7a5.5 5.5 0 0 1 7.4 0"/><path d="M5 12.5a9.5 9.5 0 0 1 14 0"/><circle cx="12" cy="19" r="1.5" fill="currentColor"/>',
  fees: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6"/><path d="M9 12h6"/><path d="M9 16h4"/>',
  settings: '<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="8" cy="7" r="1.5" fill="currentColor"/><circle cx="14" cy="12" r="1.5" fill="currentColor"/><circle cx="10" cy="17" r="1.5" fill="currentColor"/>',
  logs: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3"/><path d="M13 15h4"/>',
}

const sections = [
  {
    label: 'OVERVIEW',
    items: [
      { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
      { path: '/connections', label: 'Connections', icon: 'connections' },
      { path: '/history', label: 'History', icon: 'history' },
    ],
  },
  {
    label: 'ACTIONS',
    items: [
      { path: '/pay', label: 'Pay', icon: 'pay' },
      { path: '/receive', label: 'Receive', icon: 'receive' },
    ],
  },
  {
    label: 'NETWORK',
    items: [
      { path: '/mints', label: 'Mints', icon: 'mints' },
      { path: '/nuts', label: 'NUTs', icon: 'nuts' },
      { path: '/relays', label: 'Relays', icon: 'relays' },
    ],
  },
  {
    label: 'SYSTEM',
    items: [
      { path: '/fees', label: 'Fees', icon: 'fees' },
      { path: '/settings', label: 'Settings', icon: 'settings' },
      { path: '/logs', label: 'Logs', icon: 'logs' },
    ],
  },
]

function iconSvg(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconPaths[name] || ''}</svg>`
}

function isActive(path) {
  return route.path === path
}

function lockScreen() {
  api.clearStoredAuth()
  router.replace({ name: 'Login' })
}

watch(() => route.path, () => {
  emit('close')
})
</script>

<template>
  <Transition
    enter-active-class="transition-opacity duration-200"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition-opacity duration-200"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <button
      v-if="open"
      class="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
      aria-label="Close navigation"
      @click="emit('close')"
    />
  </Transition>

  <aside
    :class="[
      'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-nutbits-700/50 bg-nutbits-900/92 backdrop-blur-xl transition-transform duration-300 lg:w-56',
      open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
    ]"
  >
    <!-- Logo -->
    <div class="px-4 py-5 border-b border-nutbits-700/50">
      <div class="flex items-center justify-between">
        <router-link to="/dashboard" class="flex items-center gap-3 group">
          <img src="/nutbits-logo.svg" alt="NUTbits" class="w-9 h-9 rounded-xl shadow-[0_0_16px_rgba(245,158,11,0.12)] group-hover:shadow-[0_0_20px_rgba(245,158,11,0.2)] transition-shadow" />
          <div class="leading-tight">
            <span class="text-[15px] font-bold tracking-tight text-gradient-amber block">NUTbits</span>
            <span class="text-nutbits-500 text-[9px] tracking-[0.15em] uppercase leading-none">Console</span>
          </div>
        </router-link>
        <button
          class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-nutbits-700 bg-nutbits-800/80 text-nutbits-400 transition-colors hover:text-nutbits-100 hover:bg-nutbits-700 lg:hidden"
          aria-label="Close navigation"
          @click="emit('close')"
        >
          <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M6 6l12 12" />
            <path d="M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 py-2 px-2 overflow-y-auto">
      <div v-for="(section, si) in sections" :key="section.label" :class="si > 0 ? 'mt-3' : ''">
        <!-- Section label -->
        <div class="px-3 pt-2 pb-1.5">
          <span class="text-[9px] font-semibold text-nutbits-500 tracking-[0.15em] uppercase">{{ section.label }}</span>
          <div class="mt-1 h-px bg-nutbits-700/40" />
        </div>

        <!-- Section items -->
        <router-link
          v-for="item in section.items"
          :key="item.path"
          :to="item.path"
          :class="[
            'flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-150 text-[13px] font-medium relative',
            isActive(item.path)
              ? 'text-amber-500 bg-amber-500/10'
              : 'text-nutbits-400 hover:text-nutbits-100 hover:bg-nutbits-800/60',
          ]"
          @click="emit('close')"
        >
          <span
            v-if="isActive(item.path)"
            class="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-amber-500 rounded-full shadow-[0_0_6px_rgba(245,158,11,0.4)]"
          />
          <span class="w-4 h-4 flex-shrink-0 opacity-80" v-html="iconSvg(item.icon)"></span>
          <span>{{ item.label }}</span>
        </router-link>
      </div>
    </nav>

    <!-- Footer -->
    <div class="px-4 py-3 border-t border-nutbits-700/50 flex items-center justify-between">
      <span class="text-nutbits-600 text-[10px]">{{ versionLabel }}</span>
      <button
        @click="lockScreen"
        class="inline-flex items-center justify-center w-7 h-7 rounded-lg text-nutbits-500 hover:text-amber-500 hover:bg-nutbits-800/60 transition-all"
        title="Lock screen (Ctrl+L)"
        aria-label="Lock screen"
      >
        <svg viewBox="0 0 24 24" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </button>
    </div>
  </aside>
</template>
