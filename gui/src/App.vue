<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useStatusStore } from './stores/status.js'
import { useToast } from './composables/useToast.js'
import api from './api/client.js'
import AppLayout from './components/layout/AppLayout.vue'
import ConnectionHelper from './components/ui/ConnectionHelper.vue'

const route = useRoute()
const router = useRouter()
const statusStore = useStatusStore()
const { addToast } = useToast()

const isConnected = computed(() => statusStore.backendConnected)
const isLoginPage = computed(() => route.name === 'Login')

// ── Connection failure popup ───────────────────────────────────
const showHelper = ref(false)
const helperError = ref('')

function openHelper(errorMsg) {
  helperError.value = errorMsg
  showHelper.value = true
}

function handleLogout() {
  showHelper.value = false
  api.clearStoredAuth()
  router.replace({ name: 'Login' })
}

onMounted(async () => {
  // If we're on the login page, skip bootstrap
  if (isLoginPage.value) return

  // Token exists (router guard passed) — fetch initial status
  try {
    await statusStore.fetch()
  } catch (err) {
    if (err?.message?.includes('unauthorized')) {
      const recovered = await api.recoverAuth()
      if (recovered.ok) {
        try {
          await statusStore.fetch()
          addToast('Reconnected to local NUTbits', 'success')
          return
        } catch {
          // fall through
        }
      }
      // Token is invalid — show helper instead of silently redirecting
      openHelper(err.message)
      return
    }

    // Backend unreachable or other error — show helper
    openHelper(err.message)
  }
})

// ── Lock shortcut: Ctrl+L / Cmd+L ─────────────────────────────
function handleKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
    // Don't hijack if user is typing in an input
    const tag = document.activeElement?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return

    e.preventDefault()
    api.clearStoredAuth()
    router.replace({ name: 'Login' })
  }
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onUnmounted(() => window.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <!-- Login page renders standalone, no sidebar/header -->
  <router-view v-if="isLoginPage" />

  <!-- All other pages get the full app layout -->
  <AppLayout v-else :connected="isConnected">
    <router-view v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
  </AppLayout>

  <!-- Connection failure diagnostic popup -->
  <ConnectionHelper
    :open="showHelper"
    :error="helperError"
    @close="showHelper = false"
    @logout="handleLogout"
  />
</template>
