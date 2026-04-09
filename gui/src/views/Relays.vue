<script setup>
import { computed, ref, onMounted } from 'vue'
import { useRelaysStore } from '@/stores/relays.js'
import { useConfigStore } from '@/stores/config.js'
import { usePolling } from '@/composables/usePolling.js'
import { useToast } from '@/composables/useToast.js'
import Badge from '@/components/ui/Badge.vue'
import HelpTip from '@/components/ui/HelpTip.vue'
import Modal from '@/components/ui/Modal.vue'
import Spinner from '@/components/ui/Spinner.vue'
import EmptyState from '@/components/ui/EmptyState.vue'

const relaysStore = useRelaysStore()
const configStore = useConfigStore()
const { addToast } = useToast()

// ── UI state ────────────────────────────────────────────────────────────
const newRelayUrl = ref('')
const adding = ref(false)
const showAddModal = ref(false)
const showRemoveModal = ref(false)
const removeTarget = ref(null)
const removing = ref(false)
const pendingRestart = ref(false)

// ── Derived data ────────────────────────────────────────────────────────
const envOptions = computed(() => configStore.envOptions || [])

const configuredRelayUrls = computed(() => {
  const opt = envOptions.value.find((o) => o.key === 'NUTBITS_RELAYS')
  if (!opt?.value) return []
  return opt.value.split(',').map((u) => u.trim()).filter(Boolean)
})

const liveRelayMap = computed(() => {
  const map = new Map()
  for (const r of relaysStore.relays) map.set(r.url, r)
  return map
})

const displayedRelays = computed(() => configuredRelayUrls.value.map((url) => {
  const live = liveRelayMap.value.get(url)
  return {
    url,
    connected: !!live?.connected,
    subscriptions: live?.subscriptions ?? null,
    live: !!live,
  }
}))

const connectedCount = computed(() => displayedRelays.value.filter((r) => r.connected).length)
const totalCount = computed(() => displayedRelays.value.length)

const restartRequired = computed(() => {
  if (pendingRestart.value) return true
  const liveUrls = relaysStore.relays.map((r) => r.url)
  if (liveUrls.length !== configuredRelayUrls.value.length) return true
  return configuredRelayUrls.value.some((url, i) => url !== liveUrls[i])
})

// ── Helpers ─────────────────────────────────────────────────────────────
function shortUrl(url) { return url ? url.replace(/^wss?:\/\//, '') : '--' }

// ── Actions ─────────────────────────────────────────────────────────────
async function refreshAll() {
  await Promise.all([configStore.fetchEnv(), relaysStore.fetch()])
}

async function saveRelayList(urls) {
  await configStore.updateEnv('NUTBITS_RELAYS', urls.join(','))
  pendingRestart.value = true
}

async function addRelay() {
  let url = newRelayUrl.value.trim()
  if (!url) return
  if (!url.startsWith('wss://') && !url.startsWith('ws://')) url = 'wss://' + url
  try { new URL(url) } catch { addToast('Invalid relay URL', 'error'); return }

  if (configuredRelayUrls.value.includes(url)) { addToast('Relay already configured', 'warning'); return }

  adding.value = true
  try {
    await saveRelayList([...configuredRelayUrls.value, url])
    newRelayUrl.value = ''
    showAddModal.value = false
    addToast('Relay added. Restart to connect.', 'success')
    await refreshAll()
  } catch (e) { addToast(e.message || 'Failed to add relay', 'error') }
  finally { adding.value = false }
}

function openRemoveModal(relay) {
  removeTarget.value = relay
  showRemoveModal.value = true
}

async function confirmRemove() {
  if (!removeTarget.value) return
  removing.value = true
  try {
    await saveRelayList(configuredRelayUrls.value.filter((u) => u !== removeTarget.value.url))
    showRemoveModal.value = false
    removeTarget.value = null
    addToast('Relay removed. Restart to apply.', 'success')
    await refreshAll()
  } catch (e) { addToast(e.message || 'Failed', 'error') }
  finally { removing.value = false }
}

const { start } = usePolling(() => relaysStore.fetch(), 15000)
onMounted(async () => { await refreshAll(); start() })
</script>

<template>
  <div class="space-y-5">
    <!-- ── Loading / Error / Empty ──────────────────────────────────── -->
    <div v-if="relaysStore.loading && !displayedRelays.length" class="flex justify-center py-24">
      <Spinner />
    </div>

    <div
      v-else-if="relaysStore.error && !displayedRelays.length"
      class="bg-nutbits-900 border border-red-500/30 rounded-xl p-6 text-red-400 text-sm"
    >
      Failed to load relays: {{ relaysStore.error }}
    </div>

    <EmptyState
      v-else-if="!displayedRelays.length"
      title="No relays configured"
      description="Add a Nostr relay to enable NWC connections."
    >
      <button
        class="mt-3 bg-amber-500 hover:bg-amber-600 text-nutbits-950 font-medium rounded-lg px-5 py-2.5 transition-all text-sm"
        @click="showAddModal = true"
      >
        Add your first relay
      </button>
    </EmptyState>

    <template v-else>
      <!-- ── Restart banner ─────────────────────────────────────────── -->
      <div
        v-if="restartRequired"
        class="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-2.5"
      >
        <span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
        <p class="text-amber-400 text-xs">Relay list changed. Restart NUTbits to apply.</p>
      </div>

      <!-- ── Header + actions ───────────────────────────────────────── -->
      <div class="flex items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <h1 class="text-lg font-semibold text-nutbits-100">Relays</h1>
          <span class="text-xs text-nutbits-500">
            <span
              class="font-semibold"
              :class="connectedCount === totalCount && totalCount > 0 ? 'text-emerald-400' : connectedCount > 0 ? 'text-amber-400' : 'text-red-400'"
            >{{ connectedCount }}</span>/<span class="text-nutbits-400">{{ totalCount }}</span>
            connected
          </span>
        </div>
        <div class="flex items-center gap-2">
          <button
            class="text-xs text-nutbits-400 hover:text-nutbits-200 transition-colors"
            @click="refreshAll"
          >
            Refresh
          </button>
          <button
            class="bg-amber-500 hover:bg-amber-600 text-nutbits-950 text-xs font-semibold rounded-lg px-3.5 py-2 transition-all"
            @click="showAddModal = true"
          >
            + Add Relay
          </button>
        </div>
      </div>

      <!-- ── Relay list ─────────────────────────────────────────────── -->
      <div class="space-y-2">
        <div
          v-for="relay in displayedRelays"
          :key="relay.url"
          class="relative bg-nutbits-900 border border-nutbits-700 rounded-lg overflow-hidden hover:border-nutbits-600 transition-colors"
        >
          <!-- Accent left edge -->
          <span
            class="absolute left-0 inset-y-0 w-0.5 block"
            :class="relay.connected ? 'bg-emerald-500' : relay.live ? 'bg-red-500' : 'bg-nutbits-700'"
          />

          <div class="pl-4 pr-4 py-3 flex items-center gap-4">
            <!-- Health dot -->
            <span
              class="w-2.5 h-2.5 rounded-full flex-shrink-0"
              :class="relay.connected
                ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]'
                : relay.live ? 'bg-red-500/60' : 'bg-nutbits-600 animate-pulse'"
            />

            <!-- URL + status -->
            <div class="min-w-0 flex-1">
              <p class="text-sm text-nutbits-200 font-mono truncate">{{ shortUrl(relay.url) }}</p>
              <p class="text-[11px] mt-0.5" :class="relay.connected ? 'text-emerald-400/70' : relay.live ? 'text-red-400/70' : 'text-nutbits-600'">
                {{ relay.connected ? 'Connected' : relay.live ? 'Disconnected' : 'Pending restart' }}
              </p>
            </div>

            <!-- Subscriptions -->
            <div v-if="relay.subscriptions != null" class="text-right flex-shrink-0 hidden sm:block">
              <p class="text-sm text-nutbits-200 tabular-nums">{{ relay.subscriptions }}</p>
              <p class="text-[10px] text-nutbits-600">{{ relay.subscriptions === 1 ? 'subscription' : 'subscriptions' }}</p>
            </div>

            <!-- Remove -->
            <button
              class="text-nutbits-600 hover:text-red-400 text-xs rounded-md px-2 py-1.5 transition-colors hover:bg-red-500/10 flex-shrink-0"
              @click="openRemoveModal(relay)"
              title="Remove relay"
            >
              Remove
            </button>
          </div>
        </div>
      </div>

      <!-- ── Footer info ────────────────────────────────────────────── -->
      <div class="flex items-center justify-between bg-nutbits-900/50 border border-nutbits-800 rounded-lg px-4 py-3">
        <p class="text-xs text-nutbits-500">
          Relays are stored in
          <code class="text-nutbits-400">NUTBITS_RELAYS</code>
          <HelpTip text="NUTbits uses Nostr relays for NWC communication. Each relay maintains subscriptions for your NWC connections. More relays improve redundancy but add reconnect overhead. Use NWC-friendly relays like relay.getalby.com or relay.8333.space." />
        </p>
      </div>
    </template>

    <!-- ── ADD RELAY MODAL ──────────────────────────────────────────── -->
    <Modal :show="showAddModal" title="Add Relay" @close="showAddModal = false">
      <form class="space-y-4" @submit.prevent="addRelay">
        <p class="text-sm text-nutbits-400">
          Add a Nostr relay for NWC communication. New relays connect after restart.
        </p>

        <div>
          <label class="block text-xs text-nutbits-500 mb-1.5">Relay URL</label>
          <input
            v-model="newRelayUrl"
            type="text"
            placeholder="wss://relay.getalby.com/v1"
            class="w-full bg-nutbits-800 border border-nutbits-700 rounded-lg px-4 py-2.5 text-nutbits-100 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 outline-none text-sm font-mono"
            autofocus
          />
          <p class="text-[11px] text-nutbits-600 mt-1.5">
            NWC-friendly relays: relay.getalby.com/v1, relay.8333.space
          </p>
        </div>

        <div class="flex justify-end gap-3 pt-1">
          <button
            type="button"
            class="text-nutbits-400 hover:text-nutbits-200 text-sm transition-colors px-3 py-2"
            @click="showAddModal = false"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="bg-amber-500 hover:bg-amber-600 text-nutbits-950 font-medium rounded-lg px-5 py-2.5 transition-all text-sm disabled:opacity-50"
            :disabled="adding || !newRelayUrl.trim()"
          >
            {{ adding ? 'Adding...' : 'Add Relay' }}
          </button>
        </div>
      </form>
    </Modal>

    <!-- ── REMOVE RELAY MODAL ───────────────────────────────────────── -->
    <Modal :show="showRemoveModal" title="Remove Relay" @close="showRemoveModal = false">
      <div class="space-y-4">
        <p class="text-nutbits-400 text-sm">
          Remove this relay? Connected NWC apps using it may lose connectivity.
        </p>

        <div v-if="removeTarget" class="bg-nutbits-800 rounded-lg px-4 py-3">
          <p class="text-nutbits-100 font-mono text-sm break-all">{{ removeTarget.url }}</p>
        </div>

        <div class="flex justify-end gap-3 pt-1">
          <button
            class="text-nutbits-400 hover:text-nutbits-200 text-sm transition-colors px-3 py-2"
            @click="showRemoveModal = false"
          >
            Cancel
          </button>
          <button
            class="bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg px-5 py-2.5 transition-all text-sm disabled:opacity-50"
            :disabled="removing"
            @click="confirmRemove"
          >
            {{ removing ? 'Removing...' : 'Remove' }}
          </button>
        </div>
      </div>
    </Modal>
  </div>
</template>
