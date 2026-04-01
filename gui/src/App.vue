<script setup>
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useStatusStore } from './stores/status.js'
import { useToast } from './composables/useToast.js'
import api from './api/client.js'
import AppLayout from './components/layout/AppLayout.vue'

const route = useRoute()
const statusStore = useStatusStore()
const { addToast } = useToast()

const isConnected = computed(() => statusStore.backendConnected)
const isFullscreen = computed(() => route.meta?.fullscreen === true)

onMounted(async () => {
  // Auto-detect API token on startup
  const result = await api.autoDetectToken()

  if (result.ok && result.source === '~/.nutbits/nutbits.sock.token') {
    addToast('API token auto-detected from local NUTbits installation', 'success')
  } else if (result.ok && result.source === 'local-bootstrap') {
    addToast('Connected to local NUTbits automatically', 'success')
  } else if (!result.ok) {
    addToast(
      'Could not auto-connect to NUTbits. Set API URL and token in Settings, or run the backend locally on 127.0.0.1:3338.',
      'warning',
      8000,
    )
    return
  }

  // Token is ready — fetch initial status
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
          // fall through to generic error below
        }
      }
    }

    addToast(`Could not reach the NUTbits backend: ${err?.message || 'unknown error'}`, 'error')
  }
})
</script>

<template>
  <!-- Full-screen routes (e.g. deep link connect) bypass the layout -->
  <router-view v-if="isFullscreen" v-slot="{ Component }">
    <transition name="fade" mode="out-in">
      <component :is="Component" />
    </transition>
  </router-view>

  <AppLayout v-else :connected="isConnected">
    <router-view v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
  </AppLayout>
</template>
