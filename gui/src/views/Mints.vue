<script setup>
import { computed, onMounted, ref } from 'vue'
import { useMintsStore } from '@/stores/mints.js'
import { useConfigStore } from '@/stores/config.js'
import { usePolling } from '@/composables/usePolling.js'
import { useToast } from '@/composables/useToast.js'
import Badge from '@/components/ui/Badge.vue'
import HelpTip from '@/components/ui/HelpTip.vue'
import Modal from '@/components/ui/Modal.vue'
import Spinner from '@/components/ui/Spinner.vue'
import EmptyState from '@/components/ui/EmptyState.vue'

const mintsStore = useMintsStore()
const configStore = useConfigStore()
const { addToast } = useToast()

// ── UI state ────────────────────────────────────────────────────────────
const newMintUrl = ref('')
const savingList = ref(false)
const switchingMint = ref('')
const pendingRestart = ref(false)
const showAddModal = ref(false)
const showCapabilities = ref(false)

import { NUT_LABELS } from '@/config/nuts.js'

// ── Derived data ────────────────────────────────────────────────────────
const envOptions = computed(() => configStore.envOptions || [])
const config = computed(() => configStore.config || {})

const configuredMintUrls = computed(() => {
  const multi = envOptions.value.find((o) => o.key === 'NUTBITS_MINT_URLS')
  const single = envOptions.value.find((o) => o.key === 'NUTBITS_MINT_URL')
  return (multi?.value || single?.value || '').split(',').map((u) => u.trim()).filter(Boolean)
})

const liveMintMap = computed(() => {
  const map = new Map()
  for (const mint of mintsStore.mints) map.set(mint.url, mint)
  return map
})

const displayedMints = computed(() => configuredMintUrls.value.map((url, index) => {
  const live = liveMintMap.value.get(url)
  return {
    index, url,
    active: mintsStore.activeMint === url || !!live?.active,
    main: index === 0,
    name: live?.name || 'Mint',
    version: live?.version || '?',
    motd: live?.motd || null,
    healthy: live?.healthy ?? null,
    last_check: live?.last_check || null,
    consecutive_failures: live?.consecutive_failures || 0,
    balance_sats: live?.balance_sats || 0,
  }
}))

const activeMint = computed(() => displayedMints.value.find((m) => m.active) || null)
const standbyMints = computed(() => displayedMints.value.filter((m) => !m.active))
const healthyCount = computed(() => displayedMints.value.filter((m) => m.healthy).length)
const totalBalance = computed(() => displayedMints.value.reduce((s, m) => s + (m.balance_sats || 0), 0))
const supportedNutCount = computed(() => Object.values(activeMintNuts.value).filter(Boolean).length)

const activeMintNuts = computed(() => {
  const url = activeMint.value?.url
  if (!url) return {}
  return mintsStore.nuts?.mints?.[url]?.nuts || {}
})

const restartRequired = computed(() => {
  if (pendingRestart.value) return true
  const runtime = Array.isArray(config.value.mint_urls) ? config.value.mint_urls : []
  if (runtime.length !== configuredMintUrls.value.length) return true
  return configuredMintUrls.value.some((url, i) => url !== runtime[i])
})

// ── Helpers ─────────────────────────────────────────────────────────────
function fmtSats(v) { return v == null ? '0' : Number(v).toLocaleString() }
function fmtRelative(ts) {
  if (!ts) return 'never'
  const s = Math.floor((Date.now() - (typeof ts === 'number' ? ts : Number(ts))) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}
function shortUrl(url) { return url ? url.replace(/^https?:\/\//, '').replace(/\/+$/, '') : '--' }

function normalizeMintUrl(raw) {
  let v = raw.trim()
  if (!v) throw new Error('Mint URL is required')
  if (!v.startsWith('http://') && !v.startsWith('https://')) v = 'https://' + v
  let parsed
  try { parsed = new URL(v) } catch { throw new Error('Invalid mint URL') }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Must use http or https')
  return parsed.origin + parsed.pathname.replace(/\/+$/, '')
}

// ── Actions ─────────────────────────────────────────────────────────────
async function refreshAll() {
  await Promise.all([mintsStore.fetch(), mintsStore.fetchNuts(), configStore.fetch(), configStore.fetchEnv()])
}

async function saveMintList(urls) {
  await configStore.updateEnv('NUTBITS_MINT_URLS', urls.join(','))
  pendingRestart.value = true
}

async function addMint() {
  let url
  try { url = normalizeMintUrl(newMintUrl.value) } catch (e) { addToast(e.message, 'error'); return }
  if (configuredMintUrls.value.includes(url)) { addToast('Mint already configured', 'warning'); return }
  savingList.value = true
  try {
    await saveMintList([...configuredMintUrls.value, url])
    newMintUrl.value = ''
    showAddModal.value = false
    addToast('Mint added. Restart to use it in failover.', 'success')
    await refreshAll()
  } catch (e) { addToast(e.message || 'Failed to add mint', 'error') }
  finally { savingList.value = false }
}

async function removeMint(url) {
  if (configuredMintUrls.value.length <= 1) { addToast('Need at least one mint', 'warning'); return }
  if (!window.confirm(`Remove ${shortUrl(url)}?`)) return
  savingList.value = true
  try {
    await saveMintList(configuredMintUrls.value.filter((u) => u !== url))
    addToast('Mint removed. Restart to apply.', 'success')
    await refreshAll()
  } catch (e) { addToast(e.message || 'Failed', 'error') }
  finally { savingList.value = false }
}

async function makeMain(url) {
  if (configuredMintUrls.value[0] === url) return
  savingList.value = true
  try {
    await saveMintList([url, ...configuredMintUrls.value.filter((u) => u !== url)])
    addToast('Main mint updated. Restart to apply.', 'success')
    await refreshAll()
  } catch (e) { addToast(e.message || 'Failed', 'error') }
  finally { savingList.value = false }
}

async function moveMint(url, offset) {
  const i = configuredMintUrls.value.indexOf(url)
  const j = i + offset
  if (i === -1 || j < 0 || j >= configuredMintUrls.value.length) return
  const next = [...configuredMintUrls.value]
  ;[next[i], next[j]] = [next[j], next[i]]
  savingList.value = true
  try { await saveMintList(next); addToast('Order updated. Restart to apply.', 'success'); await refreshAll() }
  catch (e) { addToast(e.message || 'Failed', 'error') }
  finally { savingList.value = false }
}

async function switchActiveMint(url) {
  if (mintsStore.activeMint === url) return
  switchingMint.value = url
  try {
    await mintsStore.setActiveMint(url)
    await mintsStore.fetchNuts()
    addToast('Switched to ' + shortUrl(url), 'success')
  } catch (e) { addToast(e.message || 'Failed to switch', 'error') }
  finally { switchingMint.value = '' }
}

const { start } = usePolling(() => mintsStore.fetch(), 30000)
onMounted(async () => { await refreshAll(); start() })
</script>

<template>
  <div class="space-y-5">
    <!-- ── Loading / Error / Empty ──────────────────────────────────── -->
    <div v-if="mintsStore.loading && !displayedMints.length" class="flex justify-center py-24">
      <Spinner />
    </div>

    <div
      v-else-if="mintsStore.error && !displayedMints.length"
      class="bg-nutbits-900 border border-red-500/30 rounded-xl p-6 text-red-400 text-sm"
    >
      Failed to load mints: {{ mintsStore.error }}
    </div>

    <EmptyState
      v-else-if="!displayedMints.length"
      title="No mints configured"
      description="Add a Cashu mint to get started."
    >
      <button
        class="mt-3 bg-amber-500 hover:bg-amber-600 text-nutbits-950 font-medium rounded-lg px-5 py-2.5 transition-all text-sm"
        @click="showAddModal = true"
      >
        Add your first mint
      </button>
    </EmptyState>

    <template v-else>
      <!-- ── Restart banner ─────────────────────────────────────────── -->
      <div
        v-if="restartRequired"
        class="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-2.5"
      >
        <span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
        <p class="text-amber-400 text-xs">Mint list changed. Restart NUTbits to apply.</p>
      </div>

      <!-- ── ACTIVE MINT ────────────────────────────────────────────── -->
      <section v-if="activeMint" class="space-y-4">
        <!-- Top bar: page title + actions -->
        <div class="flex items-center justify-between gap-4">
          <h1 class="text-lg font-semibold text-nutbits-100">Your Mint</h1>
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
              + Add Mint
            </button>
          </div>
        </div>

        <!-- Active mint card -->
        <div class="relative bg-nutbits-900 border border-nutbits-700 rounded-xl overflow-hidden">
          <!-- Accent top edge -->
          <span
            class="absolute top-0 inset-x-0 h-0.5 block"
            :class="activeMint.healthy ? 'bg-emerald-500' : activeMint.healthy === false ? 'bg-red-500' : 'bg-nutbits-600'"
          />

          <div class="p-5 space-y-4">
            <!-- Row 1: Identity -->
            <div class="flex items-start justify-between gap-4">
              <div class="min-w-0 space-y-1">
                <div class="flex items-center gap-2">
                  <span
                    class="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    :class="activeMint.healthy ? 'bg-emerald-500' : activeMint.healthy === false ? 'bg-red-500' : 'bg-nutbits-600 animate-pulse'"
                  />
                  <h2 class="text-base font-semibold text-nutbits-100 truncate">{{ activeMint.name }}</h2>
                  <Badge v-if="activeMint.main" variant="success" label="primary" />
                </div>
                <p class="text-xs text-nutbits-500 font-mono truncate">{{ activeMint.url }}</p>
              </div>
              <div class="text-right flex-shrink-0">
                <p class="text-lg font-semibold text-nutbits-100 tabular-nums">{{ fmtSats(activeMint.balance_sats) }}</p>
                <p class="text-[10px] text-nutbits-500 uppercase tracking-wide">sats</p>
              </div>
            </div>

            <!-- Row 2: Quick stats strip -->
            <div class="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-nutbits-400 border-t border-nutbits-800 pt-3">
              <span>Version <span class="text-nutbits-200">{{ activeMint.version }}</span></span>
              <span>Health check <span class="text-nutbits-200">{{ fmtRelative(activeMint.last_check) }}</span></span>
              <span v-if="activeMint.consecutive_failures > 0" class="text-red-400">
                {{ activeMint.consecutive_failures }} consecutive failure{{ activeMint.consecutive_failures !== 1 ? 's' : '' }}
              </span>
              <button
                class="ml-auto text-amber-400/80 hover:text-amber-300 transition-colors"
                @click="showCapabilities = !showCapabilities"
              >
                {{ supportedNutCount }}/{{ Object.keys(NUT_LABELS).length }} NUTs {{ showCapabilities ? '&#9650;' : '&#9660;' }}
              </button>
            </div>

            <!-- Row 3: NUT capabilities (toggle) -->
            <div v-if="showCapabilities" class="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1">
              <div
                v-for="(label, key) in NUT_LABELS"
                :key="key"
                class="flex items-center gap-1.5 rounded px-2 py-1 text-[11px]"
                :class="activeMintNuts[key] ? 'text-nutbits-200' : 'text-nutbits-600'"
              >
                <span :class="activeMintNuts[key] ? 'text-emerald-500' : 'text-nutbits-700'" class="text-xs">{{ activeMintNuts[key] ? '&#10003;' : '&#10005;' }}</span>
                <span class="font-mono">{{ key }}</span>
                <span class="truncate">{{ label }}</span>
              </div>
            </div>

            <!-- MOTD -->
            <div
              v-if="activeMint.motd"
              class="bg-nutbits-800/60 rounded-lg px-3 py-2 text-xs text-nutbits-300 border-l-2 border-amber-500/40"
            >
              {{ activeMint.motd }}
            </div>
          </div>
        </div>
      </section>

      <!-- ── STANDBY MINTS ──────────────────────────────────────────── -->
      <section v-if="standbyMints.length" class="space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="text-xs font-semibold text-nutbits-400 uppercase tracking-wide">
            Other Mints
            <span class="text-nutbits-600 font-normal">({{ healthyCount }}/{{ displayedMints.length }} healthy)</span>
          </h2>
        </div>

        <div class="space-y-2">
          <div
            v-for="mint in standbyMints"
            :key="mint.url"
            class="bg-nutbits-900 border border-nutbits-700 rounded-lg px-4 py-3 flex items-center gap-4 hover:border-nutbits-600 transition-colors"
          >
            <!-- Health + Info -->
            <span
              class="w-2 h-2 rounded-full flex-shrink-0"
              :class="mint.healthy ? 'bg-emerald-500' : mint.healthy === false ? 'bg-red-500' : 'bg-nutbits-600'"
            />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <p class="text-sm text-nutbits-200 font-medium truncate">{{ mint.name }}</p>
                <Badge v-if="mint.main" variant="success" label="primary" />
              </div>
              <p class="text-[11px] text-nutbits-500 font-mono truncate">{{ shortUrl(mint.url) }}</p>
            </div>

            <!-- Balance -->
            <div class="text-right flex-shrink-0 hidden sm:block">
              <p class="text-sm text-nutbits-200 tabular-nums">{{ fmtSats(mint.balance_sats) }}</p>
              <p class="text-[10px] text-nutbits-600">sats</p>
            </div>

            <!-- Actions -->
            <div class="flex items-center gap-1.5 flex-shrink-0">
              <button
                class="bg-amber-500/90 hover:bg-amber-500 text-nutbits-950 text-xs font-semibold rounded-md px-2.5 py-1.5 transition-all disabled:opacity-40"
                :disabled="switchingMint === mint.url"
                @click="switchActiveMint(mint.url)"
              >
                {{ switchingMint === mint.url ? '...' : 'Use' }}
              </button>
              <button
                v-if="!mint.main"
                class="text-nutbits-400 hover:text-nutbits-200 text-xs rounded-md px-2 py-1.5 transition-colors hover:bg-nutbits-800"
                :disabled="savingList"
                @click="makeMain(mint.url)"
                title="Set as primary after restart"
              >
                Make primary
              </button>
              <button
                class="text-nutbits-600 hover:text-red-400 text-xs rounded-md px-2 py-1.5 transition-colors hover:bg-red-500/10"
                :disabled="savingList"
                @click="removeMint(mint.url)"
                title="Remove mint"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- ── MINT ORDER (only when 2+ mints) ────────────────────────── -->
      <section v-if="displayedMints.length > 1" class="space-y-3">
        <div class="flex items-center gap-2">
          <h2 class="text-xs font-semibold text-nutbits-400 uppercase tracking-wide">Failover Priority</h2>
          <HelpTip text="If your active mint goes down, NUTbits tries each mint in this order. Drag up or down to change priority. Position 1 is used on restart." />
        </div>

        <div class="bg-nutbits-900 border border-nutbits-700 rounded-lg divide-y divide-nutbits-800">
          <div
            v-for="mint in displayedMints"
            :key="`order-${mint.url}`"
            class="flex items-center gap-3 px-4 py-2.5"
          >
            <span class="text-nutbits-600 text-xs font-mono w-4 text-center">{{ mint.index + 1 }}</span>
            <span
              class="w-1.5 h-1.5 rounded-full flex-shrink-0"
              :class="mint.healthy ? 'bg-emerald-500' : mint.healthy === false ? 'bg-red-500' : 'bg-nutbits-700'"
            />
            <span class="text-xs text-nutbits-300 truncate flex-1">{{ shortUrl(mint.url) }}</span>
            <Badge v-if="mint.active" variant="warning" label="active" />
            <div class="flex gap-1">
              <button
                class="text-nutbits-500 hover:text-nutbits-200 disabled:opacity-20 text-xs px-1 transition-colors"
                :disabled="mint.index === 0 || savingList"
                @click="moveMint(mint.url, -1)"
              >&#9650;</button>
              <button
                class="text-nutbits-500 hover:text-nutbits-200 disabled:opacity-20 text-xs px-1 transition-colors"
                :disabled="mint.index === displayedMints.length - 1 || savingList"
                @click="moveMint(mint.url, 1)"
              >&#9660;</button>
            </div>
          </div>
        </div>

        <p class="text-[11px] text-nutbits-600">
          Order changes save to <code class="text-nutbits-500">NUTBITS_MINT_URLS</code> and apply after restart.
        </p>
      </section>

      <!-- ── Settings link ──────────────────────────────────────────── -->
      <div class="flex items-center justify-between bg-nutbits-900/50 border border-nutbits-800 rounded-lg px-4 py-3">
        <p class="text-xs text-nutbits-500">
          Failover cooldown and health check timing are in
          <router-link to="/settings" class="text-amber-400/80 hover:text-amber-300 transition-colors underline underline-offset-2">Settings</router-link>
        </p>
      </div>
    </template>

    <!-- ── ADD MINT MODAL ───────────────────────────────────────────── -->
    <Modal :show="showAddModal" title="Add Mint" @close="showAddModal = false">
      <form class="space-y-4" @submit.prevent="addMint">
        <p class="text-sm text-nutbits-400">
          Add a Cashu mint to your configuration. New mints are available for failover after restart.
        </p>

        <div>
          <label class="block text-xs text-nutbits-500 mb-1.5">Mint URL</label>
          <input
            v-model="newMintUrl"
            type="text"
            placeholder="https://testnut.cashu.space"
            class="w-full bg-nutbits-800 border border-nutbits-700 rounded-lg px-4 py-2.5 text-nutbits-100 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 outline-none text-sm font-mono"
            autofocus
          />
          <p class="text-[11px] text-nutbits-600 mt-1.5">
            Public testnets: testnut.cashu.space, testnut.cashudevkit.org
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
            :disabled="savingList || !newMintUrl.trim()"
          >
            {{ savingList ? 'Adding...' : 'Add Mint' }}
          </button>
        </div>
      </form>
    </Modal>
  </div>
</template>
