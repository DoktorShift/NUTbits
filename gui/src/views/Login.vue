<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/api/client.js'
import { getSelectedPreset } from '@/config/backgrounds.js'
import AnimatedBackground from '@/components/ui/AnimatedBackground.vue'

const router = useRouter()
const token = ref('')
const error = ref('')
const loading = ref(false)
const preset = getSelectedPreset()

async function unlock() {
  error.value = ''
  const val = token.value.trim()
  if (!val) {
    error.value = 'Enter your API token'
    return
  }

  loading.value = true
  try {
    localStorage.setItem('nutbits_api_token', val)
    await api.get('/api/v1/status')
    router.replace('/dashboard')
  } catch {
    localStorage.removeItem('nutbits_api_token')
    error.value = 'Invalid token'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="fixed inset-0 flex items-center justify-center overflow-hidden">
    <!-- Animated background -->
    <AnimatedBackground :preset="preset" />

    <!-- Glass card -->
    <div class="relative z-10 w-full max-w-sm mx-4">
      <div class="rounded-2xl border border-nutbits-700/40 bg-nutbits-900/70 backdrop-blur-2xl shadow-2xl shadow-black/40 p-8">

        <!-- Logo -->
        <div class="flex flex-col items-center mb-8">
          <img
            src="/nutbits-logo.svg"
            alt="NUTbits"
            class="w-16 h-16 rounded-2xl shadow-[0_0_30px_rgba(245,158,11,0.15)] mb-4"
          />
          <h1 class="text-2xl font-bold text-gradient-amber tracking-tight">NUTbits</h1>
          <p class="text-nutbits-500 text-xs mt-1 tracking-wide uppercase">Console</p>
        </div>

        <!-- Form -->
        <form @submit.prevent="unlock" class="space-y-4">
          <div>
            <label for="token" class="block text-xs font-medium text-nutbits-400 mb-1.5 pl-1">
              API Token
            </label>
            <input
              id="token"
              v-model="token"
              type="password"
              placeholder="Enter your API token"
              autocomplete="current-password"
              autofocus
              :disabled="loading"
              class="w-full px-4 py-3 rounded-xl border border-nutbits-700/60 bg-nutbits-800/50 text-nutbits-100 placeholder-nutbits-600 text-sm focus:border-amber-500/50 focus:shadow-[0_0_0_3px_rgba(245,158,11,0.1)] transition-all"
            />
          </div>

          <!-- Error -->
          <p v-if="error" class="text-red-400 text-xs pl-1">{{ error }}</p>

          <!-- Submit -->
          <button
            type="submit"
            :disabled="loading"
            class="w-full py-3 rounded-xl bg-amber-500/15 border border-amber-500/25 text-amber-500 text-sm font-semibold hover:bg-amber-500/25 hover:border-amber-500/40 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <span v-if="loading" class="inline-flex items-center gap-2">
              <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" opacity="0.3" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              </svg>
              Connecting...
            </span>
            <span v-else>Unlock</span>
          </button>
        </form>

        <!-- Hint -->
        <p class="text-nutbits-600 text-[10px] text-center mt-6 leading-relaxed">
          Use the <span class="text-nutbits-400">NUTBITS_API_TOKEN</span> from your <span class="text-nutbits-400">.env</span> file
        </p>
      </div>
    </div>
  </div>
</template>
