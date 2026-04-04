<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import api from '@/api/client.js'
import { useConnectionsStore } from '@/stores/connections.js'
import { useStatusStore } from '@/stores/status.js'
import { useMintsStore } from '@/stores/mints.js'
import { useToast } from '@/composables/useToast.js'
import Badge from '@/components/ui/Badge.vue'
import Modal from '@/components/ui/Modal.vue'
import Spinner from '@/components/ui/Spinner.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import StepSelectApp from '@/components/wizard/StepSelectApp.vue'
import StepConfigure from '@/components/wizard/StepConfigure.vue'
import StepFinalize from '@/components/wizard/StepFinalize.vue'

const connectionsStore = useConnectionsStore()
const statusStore = useStatusStore()
const mintsStore = useMintsStore()
const { addToast } = useToast()

// Connection list - handle both array and {connections: []} shapes
const connectionList = computed(() => {
  const data = connectionsStore.connections
  if (Array.isArray(data)) return data
  if (data?.connections) return data.connections
  return []
})

// Create modal — phased: 'select' (app grid) → 'configure' (form) → 'finalize' (QR + instructions)
const showCreateModal = ref(false)
const createPhase = ref('select')    // 'select' | 'configure' | 'finalize'
const selectedWizardApp = ref(null)  // catalog app entry or null

const creating = ref(false)

// Created connection (used by finalize phase)
const createdConnection = ref(null)

// Revoke modal
const showRevokeModal = ref(false)
const revokeTarget = ref(null)
const revoking = ref(false)

// Edit lud16 modal
const showEditLud16Modal = ref(false)
const editLud16Target = ref(null)
const editLud16Value = ref('')
const editingLud16 = ref(false)

// Fund/withdraw modal
const showFundModal = ref(false)
const fundTarget = ref(null)
const fundAmount = ref('')
const funding = ref(false)
const fundMode = ref('fund') // 'fund' or 'withdraw'

// Export modal
const showExportModal = ref(false)
const exportData = ref(null)
const exporting = ref(false)

// View mode (cards vs list)
const viewMode = ref(localStorage.getItem('nutbits_conn_view') || 'cards')
function setViewMode(mode) {
  viewMode.value = mode
  localStorage.setItem('nutbits_conn_view', mode)
}

// Mint filter for list view
const mintFilter = ref('')
const uniqueMints = computed(() => {
  var seen = new Set()
  for (var conn of connectionList.value) {
    if (conn.mint) seen.add(conn.mint)
  }
  return [...seen].sort()
})
const filteredConnectionList = computed(() => {
  if (!mintFilter.value) return connectionList.value
  return connectionList.value.filter(c => c.mint === mintFilter.value)
})

// NWC string reveal + QR modal
const showNwcModal = ref(false)
const nwcModalConn = ref(null)

const wizardModalTitle = computed(() => {
  if (createPhase.value === 'finalize') return 'Connection Created'
  if (createPhase.value === 'configure') return selectedWizardApp.value ? `Connect ${selectedWizardApp.value.name}` : 'Custom Connection'
  return 'New Connection'
})

function truncatePubkey(pk) {
  if (!pk || pk.length < 16) return pk || '--'
  return pk.slice(0, 8) + '...' + pk.slice(-4)
}

function truncateUrl(url, maxLen = 36) {
  if (!url) return '--'
  return url.length > maxLen ? url.slice(0, maxLen) + '...' : url
}

function shortUrl(url) {
  if (!url) return '--'
  try {
    var u = new URL(url)
    var host = u.hostname.replace(/^www\./, '')
    var path = u.pathname.replace(/\/+$/, '')
    return path && path !== '/' ? host + path : host
  } catch {
    return truncateUrl(url, 24)
  }
}

function formatDate(ts) {
  if (!ts) return '--'
  return new Date(ts * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function openCreateModal() {
  createPhase.value = 'select'
  selectedWizardApp.value = null
  createdConnection.value = null
  showCreateModal.value = true
}

/** Called when user picks an app from the catalog grid. */
function handleWizardAppSelect(selection) {
  selectedWizardApp.value = selection.app || null
  createPhase.value = 'configure'
}

/** Called when StepConfigure emits 'create' with the final payload. */
async function handleConfigureCreate(payload) {
  creating.value = true
  try {
    var body = {
      label: payload.label,
      permissions: payload.permissions,
    }
    if (payload.mint) body.mint = payload.mint
    if (payload.max_daily_sats > 0) body.max_daily_sats = payload.max_daily_sats
    if (payload.max_payment_sats > 0) body.max_payment_sats = payload.max_payment_sats
    if (payload.dedicated === false) body.dedicated = false
    if (payload.lud16) body.lud16 = payload.lud16
    if (payload.service_fee_ppm !== undefined) body.service_fee_ppm = payload.service_fee_ppm
    if (payload.service_fee_base !== undefined) body.service_fee_base = payload.service_fee_base

    var result = await connectionsStore.create(body)
    createdConnection.value = result
    createPhase.value = 'finalize'
    addToast('Connection created', 'success')
  } catch (err) {
    addToast(err.message || 'Failed to create connection', 'error')
  } finally {
    creating.value = false
  }
}

function openEditLud16Modal(conn) {
  editLud16Target.value = conn
  editLud16Value.value = conn.lud16 || ''
  showEditLud16Modal.value = true
}

async function submitEditLud16() {
  if (!editLud16Target.value) return
  editingLud16.value = true
  try {
    var lud16 = editLud16Value.value.trim() || null
    await connectionsStore.update(editLud16Target.value.app_pubkey, { lud16 })
    showEditLud16Modal.value = false
    editLud16Target.value = null
    addToast(lud16 ? 'Lightning Address updated -- copy the new NWC string for your app' : 'Lightning Address removed -- NWC string has changed', 'warning')
  } catch (err) {
    addToast(err.message || 'Failed to update Lightning Address', 'error')
  } finally {
    editingLud16.value = false
  }
}

function openFundModal(conn) {
  fundTarget.value = conn
  fundAmount.value = ''
  fundMode.value = 'fund'
  showFundModal.value = true
}

async function submitFund() {
  if (!fundTarget.value || !fundAmount.value) return
  funding.value = true
  try {
    var amount = Number(fundAmount.value)
    if (amount <= 0) throw new Error('Amount must be positive')
    if (fundMode.value === 'fund') {
      await connectionsStore.fund(fundTarget.value.app_pubkey, amount)
      addToast(`Funded ${amount.toLocaleString()} sats`, 'success')
    } else {
      await connectionsStore.withdraw(fundTarget.value.app_pubkey, amount)
      addToast(`Withdrawn ${amount.toLocaleString()} sats`, 'success')
    }
    showFundModal.value = false
  } catch (err) {
    addToast(err.message || 'Operation failed', 'error')
  } finally {
    funding.value = false
  }
}

async function withdrawAll() {
  if (!fundTarget.value) return
  funding.value = true
  try {
    await connectionsStore.withdraw(fundTarget.value.app_pubkey, 0)
    addToast('All funds withdrawn', 'success')
    showFundModal.value = false
  } catch (err) {
    addToast(err.message || 'Withdraw failed', 'error')
  } finally {
    funding.value = false
  }
}

function openRevokeModal(conn) {
  revokeTarget.value = conn
  showRevokeModal.value = true
}

async function confirmRevoke() {
  if (!revokeTarget.value) return
  revoking.value = true
  try {
    await connectionsStore.revoke(revokeTarget.value.app_pubkey)
    showRevokeModal.value = false
    revokeTarget.value = null
    addToast('Connection revoked', 'success')
  } catch (err) {
    addToast(err.message || 'Failed to revoke connection', 'error')
  } finally {
    revoking.value = false
  }
}

async function handleExport() {
  exporting.value = true
  try {
    const data = await connectionsStore.exportAll(false)
    exportData.value = data
    showExportModal.value = true
  } catch (err) {
    addToast(err.message || 'Export failed', 'error')
  } finally {
    exporting.value = false
  }
}

function downloadExport() {
  if (!exportData.value) return
  const blob = new Blob([JSON.stringify(exportData.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `nutbits-connections-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
    addToast('Copied to clipboard', 'success')
  } catch {
    addToast('Failed to copy', 'error')
  }
}

const nwcLoading = ref(false)

async function openNwcModal(conn) {
  // Start with what we have from the list endpoint
  nwcModalConn.value = { ...conn }
  showNwcModal.value = true

  // The list endpoint may not include nwc_string. Fetch it from export.
  if (!conn.nwc_string) {
    nwcLoading.value = true
    try {
      var data = await api.get(`/api/v1/connections/export?id=${conn.id}`)
      var exported = data?.connections?.[0]
      if (exported?.nwc_string) {
        nwcModalConn.value = { ...nwcModalConn.value, nwc_string: exported.nwc_string }
      }
    } catch { /* best effort */ }
    nwcLoading.value = false
  }
}

async function renderNwcQr() {
  var nwcString = nwcModalConn.value?.nwc_string
  var canvas = document.getElementById('nwc-qr-canvas')
  if (!canvas || !nwcString) return
  try {
    var QRModule = await import('qrcode')
    var QRCode = QRModule.default || QRModule
    await QRCode.toCanvas(canvas, nwcString.toUpperCase(), {
      width: 260,
      margin: 3,
      color: { dark: '#1a1a2e', light: '#f5f0e8' },
    })
  } catch {
    canvas.width = 260
    canvas.height = 50
    var ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.fillStyle = '#666'
      ctx.font = '13px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('QR code unavailable', 130, 30)
    }
  }
}

// Render QR whenever the modal opens or the nwc_string arrives from the export fetch.
// The modal uses Teleport + Transition so the canvas needs time to mount.
watch(showNwcModal, (open) => {
  if (open) setTimeout(renderNwcQr, 300)
}, { flush: 'post' })

watch(() => nwcModalConn.value?.nwc_string, (val) => {
  if (val && showNwcModal.value) setTimeout(renderNwcQr, 50)
})

// Render QR on the success modal after creating a new connection
async function renderSuccessQr() {
  var nwcString = createdConnection.value?.nwc_string
  var canvas = document.getElementById('success-qr-canvas')
  if (!canvas || !nwcString) return
  try {
    var QRModule = await import('qrcode')
    var QRCode = QRModule.default || QRModule
    await QRCode.toCanvas(canvas, nwcString.toUpperCase(), {
      width: 260,
      margin: 3,
      color: { dark: '#1a1a2e', light: '#f5f0e8' },
    })
  } catch {
    var ctx = canvas.getContext('2d')
    canvas.width = 260; canvas.height = 60
    ctx.fillStyle = '#666'
    ctx.font = '13px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('QR code unavailable', 130, 30)
  }
}


onMounted(() => {
  connectionsStore.fetch()
  statusStore.fetch()
  mintsStore.fetch()
})
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div class="space-y-2">
        <div class="flex items-center gap-3">
          <h2 class="text-2xl font-semibold text-nutbits-100">Connections</h2>
          <Badge variant="info" :label="String(connectionList.length)" />
        </div>
        <p class="text-sm text-nutbits-400">
          Manage NWC app access, export connection secrets, and revoke stale clients.
        </p>
      </div>
      <div class="flex items-center gap-3">
        <!-- View toggle -->
        <div class="flex rounded-md overflow-hidden border border-nutbits-700">
          <button
            class="px-2.5 py-2 transition-all"
            :class="viewMode === 'cards' ? 'bg-amber-500 text-nutbits-950' : 'bg-nutbits-800 text-nutbits-400 hover:text-nutbits-100'"
            title="Card view"
            @click="setViewMode('cards')"
          >
            <svg viewBox="0 0 16 16" class="w-4 h-4" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1" /><rect x="9" y="1" width="6" height="6" rx="1" /><rect x="1" y="9" width="6" height="6" rx="1" /><rect x="9" y="9" width="6" height="6" rx="1" /></svg>
          </button>
          <button
            class="px-2.5 py-2 transition-all border-l border-nutbits-700"
            :class="viewMode === 'list' ? 'bg-amber-500 text-nutbits-950' : 'bg-nutbits-800 text-nutbits-400 hover:text-nutbits-100'"
            title="List view"
            @click="setViewMode('list')"
          >
            <svg viewBox="0 0 16 16" class="w-4 h-4" fill="currentColor"><rect x="1" y="1" width="14" height="3" rx="0.5" /><rect x="1" y="6.5" width="14" height="3" rx="0.5" /><rect x="1" y="12" width="14" height="3" rx="0.5" /></svg>
          </button>
        </div>

        <button
          class="bg-nutbits-800 hover:bg-nutbits-700 text-nutbits-100 font-medium rounded-lg px-4 py-2.5 transition-all border border-nutbits-700"
          :disabled="exporting"
          @click="handleExport"
        >
          {{ exporting ? 'Exporting...' : 'Export' }}
        </button>
        <button
          class="bg-amber-500 hover:bg-amber-600 text-nutbits-950 font-medium rounded-lg px-4 py-2.5 transition-all"
          @click="openCreateModal"
        >
          New Connection
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="connectionsStore.loading && connectionList.length === 0" class="flex justify-center py-12">
      <Spinner />
    </div>

    <!-- Empty State -->
    <EmptyState
      v-else-if="connectionList.length === 0"
      title="No connections yet"
      description="Create your first NWC connection to link apps like BuhoGO, Alby Go, LNbits, or Amethyst."
    >
      <button
        class="bg-amber-500 hover:bg-amber-600 text-nutbits-950 font-medium rounded-lg px-4 py-2.5 transition-all"
        @click="openCreateModal"
      >
        Create Connection
      </button>
    </EmptyState>

    <!-- ═══ CARD VIEW ═══ -->
    <div v-else-if="viewMode === 'cards'" class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div
        v-for="conn in connectionList"
        :key="conn.app_pubkey"
        class="bg-nutbits-900 border border-nutbits-700 rounded-xl p-6 space-y-4"
      >
        <!-- Header row -->
        <div class="flex items-start justify-between">
          <div>
            <div class="flex items-center gap-2">
              <h3 class="text-nutbits-100 font-semibold text-lg">{{ conn.label }}</h3>
              <span v-if="conn.dedicated" class="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">dedicated</span>
              <span v-else class="text-[10px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full">shared</span>
            </div>
            <p class="text-nutbits-400 text-xs font-mono mt-0.5">{{ truncatePubkey(conn.app_pubkey) }}</p>
          </div>
          <div class="flex items-center gap-2">
            <button v-if="conn.dedicated"
              class="text-emerald-400 hover:text-emerald-300 text-sm font-medium transition-colors px-3 py-1 rounded-lg hover:bg-emerald-500/10"
              @click="openFundModal(conn)"
            >
              Fund
            </button>
            <button
              class="text-amber-400 hover:text-amber-300 text-sm font-medium transition-colors px-3 py-1 rounded-lg hover:bg-amber-500/10"
              @click="openNwcModal(conn)"
            >
              NWC String
            </button>
            <button
              class="text-red-400 hover:text-red-300 text-sm font-medium transition-colors px-3 py-1 rounded-lg hover:bg-red-500/10"
              @click="openRevokeModal(conn)"
            >
              Revoke
            </button>
          </div>
        </div>

        <!-- Permissions -->
        <div class="flex flex-wrap gap-1.5">
          <Badge
            v-for="perm in conn.permissions"
            :key="perm"
            variant="info"
            :label="perm.replace('_', ' ')"
          />
        </div>

        <!-- Details grid -->
        <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <span class="text-nutbits-400">Balance</span>
            <p v-if="conn.dedicated" class="text-nutbits-100 font-medium">
              {{ Math.floor((conn.dedicated_balance_msat || 0) / 1000).toLocaleString('en-US') }}
              <span class="text-nutbits-500 text-xs ml-0.5">sats dedicated</span>
            </p>
            <p v-else class="text-nutbits-100 font-medium">{{ Math.floor((conn.balance_msat || 0) / 1000).toLocaleString('en-US') }} sats</p>
          </div>
          <div>
            <span class="text-nutbits-400">Transactions</span>
            <router-link
              :to="{ path: '/history', query: { connection: conn.id } }"
              class="text-amber-400 hover:text-amber-300 font-medium transition-colors block"
            >
              {{ conn.tx_count || 0 }}
            </router-link>
          </div>
          <div class="col-span-2">
            <span class="text-nutbits-400">Mint</span>
            <p class="text-nutbits-100 font-mono text-xs" :title="conn.mint">{{ shortUrl(conn.mint) }}</p>
          </div>
          <div class="col-span-2">
            <span class="text-nutbits-400">Relay</span>
            <p class="text-nutbits-100 font-mono text-xs">{{ truncateUrl(conn.relay) }}</p>
          </div>
          <div class="col-span-2">
            <span class="text-nutbits-400">Lightning Address</span>
            <div class="flex items-center gap-2 mt-0.5">
              <p v-if="conn.lud16" class="text-amber-400 text-sm">{{ conn.lud16 }}</p>
              <p v-else class="text-nutbits-600 text-sm">Not set</p>
              <button
                class="text-nutbits-400 hover:text-nutbits-200 text-xs transition-colors"
                @click="openEditLud16Modal(conn)"
              >
                {{ conn.lud16 ? 'edit' : 'add' }}
              </button>
            </div>
          </div>
          <div>
            <span class="text-nutbits-400">Created</span>
            <p class="text-nutbits-100">{{ formatDate(conn.created_at) }}</p>
          </div>
          <div v-if="conn.max_daily_sats || conn.max_payment_sats">
            <span class="text-nutbits-400">Limits</span>
            <p class="text-nutbits-100 text-xs">
              <span v-if="conn.max_daily_sats">Daily: {{ conn.max_daily_sats.toLocaleString('en-US') }}</span>
              <span v-if="conn.max_daily_sats && conn.max_payment_sats"> / </span>
              <span v-if="conn.max_payment_sats">Per tx: {{ conn.max_payment_sats.toLocaleString('en-US') }}</span>
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ LIST VIEW ═══ -->
    <template v-else>
      <!-- Mint filter bar -->
      <div v-if="uniqueMints.length > 1" class="flex items-center gap-2">
        <span class="text-nutbits-500 text-xs">Filter by mint:</span>
        <select
          v-model="mintFilter"
          class="bg-nutbits-800 border border-nutbits-700 rounded-md px-2.5 py-1.5 text-xs text-nutbits-100 focus:border-amber-500 outline-none"
        >
          <option value="">All mints</option>
          <option v-for="mint in uniqueMints" :key="mint" :value="mint">{{ shortUrl(mint) }}</option>
        </select>
        <span class="text-nutbits-600 text-[10px] tabular-nums">{{ filteredConnectionList.length }} connection{{ filteredConnectionList.length !== 1 ? 's' : '' }}</span>
      </div>

      <div class="bg-nutbits-900 border border-nutbits-700 rounded-xl overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-nutbits-500 text-[10px] uppercase tracking-wider bg-nutbits-800/50">
                <th class="px-4 py-2.5 text-left">Label</th>
                <th class="px-4 py-2.5 text-right">Balance</th>
                <th class="px-4 py-2.5 text-right">Txs</th>
                <th class="px-4 py-2.5 text-left hidden md:table-cell">Mint</th>
                <th class="px-4 py-2.5 text-left hidden md:table-cell">Lightning Address</th>
                <th class="px-4 py-2.5 text-left hidden lg:table-cell">Limits</th>
                <th class="px-4 py-2.5 text-left hidden xl:table-cell">Relay</th>
                <th class="px-4 py-2.5 text-left hidden sm:table-cell">Created</th>
                <th class="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="conn in filteredConnectionList"
                :key="conn.app_pubkey"
                class="border-t border-nutbits-800/60 hover:bg-nutbits-800/30 transition-colors"
              >
                <td class="px-4 py-3">
                  <div class="flex items-center gap-1.5">
                    <p class="text-nutbits-100 font-medium">{{ conn.label }}</p>
                    <span v-if="conn.dedicated" class="text-[9px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1 py-0 rounded-full">ded</span>
                  </div>
                  <p class="text-nutbits-500 text-[10px] font-mono">{{ truncatePubkey(conn.app_pubkey) }}</p>
                </td>
                <td class="px-4 py-3 text-right text-nutbits-100 font-medium tabular-nums whitespace-nowrap">
                  {{ Math.floor(((conn.dedicated ? conn.dedicated_balance_msat : conn.balance_msat) || 0) / 1000).toLocaleString('en-US') }}
                  <span class="text-nutbits-500 text-xs ml-0.5">sats</span>
                </td>
                <td class="px-4 py-3 text-right">
                  <router-link
                    :to="{ path: '/history', query: { connection: conn.id } }"
                    class="text-amber-400 hover:text-amber-300 font-medium transition-colors tabular-nums"
                  >
                    {{ conn.tx_count || 0 }}
                  </router-link>
                </td>
                <td class="px-4 py-3 hidden md:table-cell">
                  <span class="text-nutbits-400 text-xs font-mono cursor-default" :title="conn.mint">{{ shortUrl(conn.mint) }}</span>
                </td>
              <td class="px-4 py-3 hidden md:table-cell">
                <div class="flex items-center gap-1.5">
                  <span v-if="conn.lud16" class="text-amber-400 text-xs">{{ conn.lud16 }}</span>
                  <span v-else class="text-nutbits-600 text-xs">--</span>
                  <button
                    class="text-nutbits-500 hover:text-nutbits-200 text-[10px] transition-colors"
                    @click="openEditLud16Modal(conn)"
                  >
                    {{ conn.lud16 ? 'edit' : 'add' }}
                  </button>
                </div>
              </td>
              <td class="px-4 py-3 hidden lg:table-cell">
                <div v-if="conn.max_daily_sats || conn.max_payment_sats" class="text-xs text-nutbits-300 leading-relaxed">
                  <p v-if="conn.max_daily_sats">Daily: {{ conn.max_daily_sats.toLocaleString('en-US') }}</p>
                  <p v-if="conn.max_payment_sats">Per tx: {{ conn.max_payment_sats.toLocaleString('en-US') }}</p>
                </div>
                <span v-else class="text-nutbits-600 text-xs">--</span>
              </td>
              <td class="px-4 py-3 hidden xl:table-cell">
                <span class="text-nutbits-400 text-xs font-mono cursor-default" :title="conn.relay">{{ shortUrl(conn.relay) }}</span>
              </td>
              <td class="px-4 py-3 hidden sm:table-cell">
                <span class="text-nutbits-400 text-xs whitespace-nowrap">{{ formatDate(conn.created_at) }}</span>
              </td>
              <td class="px-4 py-3 text-right">
                <div class="flex items-center justify-end gap-1">
                  <button v-if="conn.dedicated"
                    class="text-emerald-400 hover:text-emerald-300 text-xs font-medium transition-colors px-2 py-1 rounded hover:bg-emerald-500/10"
                    @click="openFundModal(conn)"
                  >
                    Fund
                  </button>
                  <button
                    class="text-amber-400 hover:text-amber-300 text-xs font-medium transition-colors px-2 py-1 rounded hover:bg-amber-500/10"
                    @click="openNwcModal(conn)"
                  >
                    NWC
                  </button>
                  <button
                    class="text-red-400 hover:text-red-300 text-xs font-medium transition-colors px-2 py-1 rounded hover:bg-red-500/10"
                    @click="openRevokeModal(conn)"
                  >
                    Revoke
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    </template>

    <!-- ═══ NEW CONNECTION MODAL ═══ -->
    <Modal :show="showCreateModal" :title="wizardModalTitle" max-width="42rem" @close="showCreateModal = false">

      <!-- Step indicator -->
      <div v-if="createPhase !== 'finalize'" class="wizard-steps">
        <div class="wizard-step" :class="{ active: createPhase === 'select', done: createPhase === 'configure' }">
          <span class="wizard-dot">1</span>
          <span class="wizard-step-label">Select App</span>
        </div>
        <div class="wizard-line" :class="{ filled: createPhase === 'configure' }"></div>
        <div class="wizard-step" :class="{ active: createPhase === 'configure' }">
          <span class="wizard-dot">2</span>
          <span class="wizard-step-label">Configure</span>
        </div>
      </div>

      <!-- ── Step 1: SELECT (app grid) ── -->
      <template v-if="createPhase === 'select'">
        <StepSelectApp @select="handleWizardAppSelect" />
      </template>

      <!-- ── Step 2: CONFIGURE (form, prefilled or empty) ── -->
      <template v-if="createPhase === 'configure'">
        <StepConfigure
          :app="selectedWizardApp"
          :loading="creating"
          @create="handleConfigureCreate"
          @back="createPhase = 'select'"
        />
      </template>

      <!-- ── Step 3: FINALIZE (QR + copy + per-app instructions) ── -->
      <template v-if="createPhase === 'finalize' && createdConnection">
        <StepFinalize
          :nwc-string="createdConnection.nwc_string"
          :app="selectedWizardApp"
          :connection="createdConnection"
          @done="showCreateModal = false"
        />
      </template>
    </Modal>

    <!-- Fund / Withdraw Modal -->
    <Modal :show="showFundModal" :title="fundMode === 'fund' ? 'Fund Connection' : 'Withdraw'" @close="showFundModal = false">
      <div v-if="fundTarget" class="space-y-4">
        <div class="flex items-center justify-between text-sm">
          <span class="text-nutbits-400">Connection</span>
          <span class="text-nutbits-100 font-medium">{{ fundTarget.label }}</span>
        </div>
        <div class="flex items-center justify-between text-sm">
          <span class="text-nutbits-400">Dedicated balance</span>
          <span class="text-nutbits-100 font-medium tabular-nums">{{ Math.floor((fundTarget.dedicated_balance_msat || 0) / 1000).toLocaleString('en-US') }} sats</span>
        </div>

        <!-- Mode toggle -->
        <div class="flex rounded-lg border border-nutbits-700 overflow-hidden">
          <button
            class="flex-1 py-2 text-sm font-medium transition-all"
            :class="fundMode === 'fund' ? 'bg-emerald-500/15 text-emerald-400 border-r border-nutbits-700' : 'bg-nutbits-800 text-nutbits-400 border-r border-nutbits-700 hover:text-nutbits-200'"
            @click="fundMode = 'fund'"
          >Fund</button>
          <button
            class="flex-1 py-2 text-sm font-medium transition-all"
            :class="fundMode === 'withdraw' ? 'bg-amber-500/15 text-amber-400' : 'bg-nutbits-800 text-nutbits-400 hover:text-nutbits-200'"
            @click="fundMode = 'withdraw'"
          >Withdraw</button>
        </div>

        <div>
          <label class="block text-nutbits-400 text-sm mb-1.5">Amount (sats)</label>
          <input
            v-model.number="fundAmount"
            type="number"
            min="1"
            :placeholder="fundMode === 'fund' ? 'Amount to add' : 'Amount to withdraw'"
            class="w-full bg-nutbits-800 border border-nutbits-700 rounded-lg px-4 py-2.5 text-nutbits-100 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 outline-none"
          />
        </div>

        <div class="flex justify-between items-center pt-2">
          <button v-if="fundMode === 'withdraw' && (fundTarget.dedicated_balance_msat || 0) > 0"
            class="text-nutbits-400 hover:text-nutbits-200 text-xs transition-colors"
            @click="withdrawAll"
            :disabled="funding"
          >
            Withdraw all
          </button>
          <span v-else></span>
          <div class="flex gap-3">
            <button
              class="bg-nutbits-800 hover:bg-nutbits-700 text-nutbits-100 font-medium rounded-lg px-4 py-2.5 transition-all border border-nutbits-700"
              @click="showFundModal = false"
            >Cancel</button>
            <button
              class="font-medium rounded-lg px-4 py-2.5 transition-all disabled:opacity-50"
              :class="fundMode === 'fund' ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'bg-amber-500 hover:bg-amber-600 text-nutbits-950'"
              :disabled="funding || !fundAmount || fundAmount <= 0"
              @click="submitFund"
            >{{ funding ? 'Processing...' : (fundMode === 'fund' ? 'Fund' : 'Withdraw') }}</button>
          </div>
        </div>
      </div>
    </Modal>

    <!-- Revoke Confirmation Modal -->
    <Modal :show="showRevokeModal" title="Revoke Connection" @close="showRevokeModal = false">
      <div class="space-y-4">
        <div class="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <p class="text-red-400 text-sm font-medium">This action is irreversible.</p>
          <p class="text-nutbits-400 text-sm mt-1">
            The connection will be permanently revoked and can no longer be used by the connected app.
          </p>
        </div>

        <div v-if="revokeTarget" class="flex items-center justify-between text-sm">
          <span class="text-nutbits-400">Connection</span>
          <span class="text-nutbits-100 font-medium">{{ revokeTarget.label }}</span>
        </div>

        <div class="flex justify-end gap-3 pt-2">
          <button
            class="bg-nutbits-800 hover:bg-nutbits-700 text-nutbits-100 font-medium rounded-lg px-4 py-2.5 transition-all border border-nutbits-700"
            @click="showRevokeModal = false"
          >
            Cancel
          </button>
          <button
            class="bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg px-4 py-2.5 transition-all disabled:opacity-50"
            :disabled="revoking"
            @click="confirmRevoke"
          >
            {{ revoking ? 'Revoking...' : 'Revoke' }}
          </button>
        </div>
      </div>
    </Modal>

    <!-- Edit Lightning Address Modal -->
    <Modal :show="showEditLud16Modal" title="Lightning Address" @close="showEditLud16Modal = false">
      <form class="space-y-4" @submit.prevent="submitEditLud16">
        <p class="text-nutbits-400 text-sm">
          Set or update the Lightning Address for
          <span class="text-nutbits-100 font-medium">{{ editLud16Target?.label }}</span>.
          The address will be resolved to verify it works.
        </p>

        <!-- Warning banner -->
        <div class="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
          <p class="text-red-400 text-sm font-medium">This will change the NWC connection string</p>
          <p class="text-nutbits-400 text-xs mt-1">
            Changing the Lightning Address regenerates the NWC string for this connection.
            Any app using the current string must be updated with the new one, or it will
            lose access to the updated address.
          </p>
        </div>

        <div>
          <input
            v-model="editLud16Value"
            type="text"
            placeholder="you@getalby.com (leave empty to remove)"
            class="w-full bg-nutbits-800 border border-nutbits-700 rounded-lg px-4 py-2.5 text-nutbits-100 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 outline-none placeholder:text-nutbits-600"
          />
        </div>

        <div class="flex justify-end gap-3 pt-2">
          <button
            type="button"
            class="bg-nutbits-800 hover:bg-nutbits-700 text-nutbits-100 font-medium rounded-lg px-4 py-2.5 transition-all border border-nutbits-700"
            @click="showEditLud16Modal = false"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="bg-red-500/80 hover:bg-red-500 text-white font-medium rounded-lg px-4 py-2.5 transition-all disabled:opacity-50"
            :disabled="editingLud16"
          >
            {{ editingLud16 ? 'Verifying...' : 'Change Address' }}
          </button>
        </div>
      </form>
    </Modal>

    <!-- NWC String Modal -->
    <Modal :show="showNwcModal" :title="nwcModalConn ? nwcModalConn.label : 'NWC String'" @close="showNwcModal = false">
      <div v-if="nwcModalConn" class="space-y-4">
        <!-- Connection details -->
        <div class="bg-nutbits-800/50 rounded-lg px-4 py-3">
          <div class="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span class="text-nutbits-500">Mint</span>
              <p class="text-nutbits-300 font-mono truncate" :title="nwcModalConn.mint">{{ shortUrl(nwcModalConn.mint) }}</p>
            </div>
            <div>
              <span class="text-nutbits-500">Relay</span>
              <p class="text-nutbits-300 font-mono truncate" :title="nwcModalConn.relay">{{ shortUrl(nwcModalConn.relay) }}</p>
            </div>
            <div>
              <span class="text-nutbits-500">Lightning Address</span>
              <p :class="nwcModalConn.lud16 ? 'text-amber-400' : 'text-nutbits-600'">{{ nwcModalConn.lud16 || 'Not set' }}</p>
            </div>
            <div>
              <span class="text-nutbits-500">Permissions</span>
              <p class="text-nutbits-300">{{ nwcModalConn.permissions?.length || 0 }}</p>
            </div>
          </div>
        </div>

        <!-- Loading -->
        <div v-if="nwcLoading" class="flex justify-center py-6">
          <Spinner />
        </div>

        <template v-else-if="nwcModalConn.nwc_string">
          <!-- QR Code -->
          <div class="flex justify-center">
            <div class="bg-nutbits-800 border border-nutbits-700 rounded-xl p-5 shadow-[0_0_30px_rgba(245,158,11,0.06)]">
              <canvas id="nwc-qr-canvas" class="rounded-lg" />
              <p class="text-center text-[10px] text-nutbits-500 mt-3 tracking-wide uppercase">Scan with your wallet app</p>
            </div>
          </div>

          <!-- NWC string -->
          <div class="space-y-2">
            <p class="text-[10px] text-nutbits-500 uppercase tracking-wide">Connection String</p>
            <div
              class="bg-nutbits-800 border border-nutbits-700 rounded-lg p-3 font-mono text-[11px] text-nutbits-300 break-all select-all leading-relaxed max-h-24 overflow-y-auto cursor-text"
            >
              {{ nwcModalConn.nwc_string }}
            </div>
          </div>
        </template>

        <div v-else class="bg-nutbits-800 rounded-lg px-4 py-6 text-center">
          <p class="text-nutbits-400 text-sm">NWC string not available. Restart NUTbits to enable this feature.</p>
        </div>

        <!-- Security warning -->
        <div class="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5">
          <p class="text-red-400/80 text-[11px]">
            Keep this string private. Anyone with it can use this connection's wallet permissions.
          </p>
        </div>
      </div>
    </Modal>

    <!-- Export Modal -->
    <Modal :show="showExportModal" title="Export Connections" @close="showExportModal = false">
      <div class="space-y-4">
        <div v-if="exportData" class="space-y-3">
          <div class="flex items-center justify-between text-sm">
            <span class="text-nutbits-400">Connections exported</span>
            <span class="text-nutbits-100 font-medium">{{ exportData.connections?.length || 0 }}</span>
          </div>
          <div class="flex items-center justify-between text-sm">
            <span class="text-nutbits-400">Exported at</span>
            <span class="text-nutbits-100">{{ exportData.exported_at }}</span>
          </div>

          <div class="bg-nutbits-800 border border-nutbits-700 rounded-lg p-4 max-h-64 overflow-y-auto font-mono text-xs text-nutbits-400">
            <pre>{{ JSON.stringify(exportData, null, 2) }}</pre>
          </div>
        </div>

        <div class="flex justify-end gap-3 pt-2">
          <button
            class="bg-nutbits-800 hover:bg-nutbits-700 text-nutbits-100 font-medium rounded-lg px-4 py-2.5 transition-all border border-nutbits-700"
            @click="showExportModal = false"
          >
            Close
          </button>
          <button
            class="bg-amber-500 hover:bg-amber-600 text-nutbits-950 font-medium rounded-lg px-4 py-2.5 transition-all"
            @click="downloadExport"
          >
            Download JSON
          </button>
        </div>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.wizard-steps {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  margin-bottom: 1.25rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid rgba(42, 40, 39, 0.6);
}

.wizard-step {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.wizard-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 700;
  border: 1.5px solid #3a3735;
  color: #625a52;
  background: transparent;
  transition: all 0.2s ease;
}

.wizard-step.active .wizard-dot {
  border-color: #f59e0b;
  color: #0f0e0d;
  background: #f59e0b;
}

.wizard-step.done .wizard-dot {
  border-color: #34d399;
  color: #0f0e0d;
  background: #34d399;
}

.wizard-step-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: #625a52;
  transition: color 0.2s ease;
}

.wizard-step.active .wizard-step-label { color: #e8e0d8; }
.wizard-step.done .wizard-step-label { color: #34d399; }

.wizard-line {
  width: 3rem;
  height: 2px;
  background: #2a2827;
  margin: 0 0.75rem;
  border-radius: 1px;
  transition: background 0.2s ease;
}

.wizard-line.filled { background: #34d399; }
</style>
