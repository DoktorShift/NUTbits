<script setup>
/**
 * Smart connection-failure diagnostic popup.
 *
 * Shown when the GUI cannot reach the backend after login.
 * Diagnoses the likely cause and links directly to the fix.
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import Modal from '@/components/ui/Modal.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  error: { type: String, default: '' },
})

const emit = defineEmits(['close', 'logout'])
const router = useRouter()

const diagnosis = computed(() => {
  const err = (props.error || '').toLowerCase()

  if (err.includes('unauthorized') || err.includes('401')) {
    return {
      icon: '🔑',
      title: 'Invalid API Token',
      description: 'The token stored in your browser was rejected by the backend.',
      checks: [
        'Your .env file has NUTBITS_API_TOKEN set',
        'The token in the browser matches the one in .env exactly',
        'You restarted the backend after changing the token',
      ],
      action: { label: 'Re-enter token', handler: () => emit('logout') },
    }
  }

  if (err.includes('could not reach') || err.includes('failed to fetch') || err.includes('networkerror') || err.includes('timed out')) {
    return {
      icon: '🔌',
      title: 'Backend Not Reachable',
      description: 'The GUI cannot connect to the NUTbits backend.',
      checks: [
        'The backend is running (npm start or systemctl --user status nutbits-backend)',
        'NUTBITS_API_PORT is set in .env (default: 3338)',
        'NUTBITS_API_ENABLED is not set to false',
        'If on a VPS: Caddy is proxying /api/* to 127.0.0.1:3338',
      ],
      action: { label: 'Check API settings', handler: () => { emit('close'); router.push('/settings') } },
    }
  }

  if (err.includes('cors') || err.includes('blocked')) {
    return {
      icon: '🚫',
      title: 'Request Blocked',
      description: 'The browser is blocking requests to the backend, usually a CORS or mixed-content issue.',
      checks: [
        'API URL in Settings is empty (use same-origin, not http://127.0.0.1:...)',
        'Your reverse proxy passes all headers through',
        'You are not mixing https:// (GUI) with http:// (API)',
      ],
      action: { label: 'Fix API URL', handler: () => { emit('close'); router.push('/settings') } },
    }
  }

  // Generic fallback
  return {
    icon: '⚠️',
    title: 'Connection Problem',
    description: props.error || 'Something went wrong connecting to the backend.',
    checks: [
      'The backend is running',
      'Your .env file is valid',
      'Check the backend logs for errors',
    ],
    action: { label: 'Go to Settings', handler: () => { emit('close'); router.push('/settings') } },
  }
})
</script>

<template>
  <Modal :open="open" :title="diagnosis.title" max-width="28rem" @close="emit('close')">
    <div class="space-y-5">
      <!-- Icon + description -->
      <div class="flex items-start gap-3">
        <span class="text-2xl leading-none mt-0.5">{{ diagnosis.icon }}</span>
        <p class="text-sm text-nutbits-300 leading-relaxed">{{ diagnosis.description }}</p>
      </div>

      <!-- Checklist -->
      <div class="bg-nutbits-800/60 rounded-lg p-4 space-y-2.5">
        <p class="text-xs text-nutbits-400 font-semibold uppercase tracking-wide">Check these</p>
        <ul class="space-y-2">
          <li
            v-for="(check, i) in diagnosis.checks"
            :key="i"
            class="flex items-start gap-2 text-sm text-nutbits-200"
          >
            <span class="text-nutbits-500 mt-0.5 shrink-0">{{ i + 1 }}.</span>
            <span>{{ check }}</span>
          </li>
        </ul>
      </div>

      <!-- Action buttons -->
      <div class="flex items-center gap-3">
        <button
          class="bg-amber-500/15 border border-amber-500/25 text-amber-500 text-sm font-semibold rounded-lg px-4 py-2.5 hover:bg-amber-500/25 hover:border-amber-500/40 transition-all"
          @click="diagnosis.action.handler()"
        >
          {{ diagnosis.action.label }}
        </button>
        <button
          class="text-nutbits-400 hover:text-nutbits-100 text-sm transition-colors"
          @click="emit('close')"
        >
          Dismiss
        </button>
      </div>
    </div>
  </Modal>
</template>
