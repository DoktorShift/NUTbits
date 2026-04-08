<script setup>
import { computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useStatusStore } from './stores/status.js'
import { useToast } from './composables/useToast.js'
import api from './api/client.js'
import AppLayout from './components/layout/AppLayout.vue'

const route = useRoute()
const router = useRouter()
const statusStore = useStatusStore()
const { addToast } = useToast()

const isConnected = computed(() => statusStore.backendConnected)
const isLoginPage = computed(() => route.name === 'Login')

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
      // Token is invalid — send to login
      api.clearStoredAuth()
      router.replace({ name: 'Login' })
      return
    }

    addToast(`Could not reach the NUTbits backend: ${err?.message || 'unknown error'}`, 'error')
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
</template>
