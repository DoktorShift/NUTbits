<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useHistoryStore } from '@/stores/history.js'
import { useConnectionsStore } from '@/stores/connections.js'
import { useToast } from '@/composables/useToast.js'
import Badge from '@/components/ui/Badge.vue'
import BarChart from '@/components/ui/BarChart.vue'
import Modal from '@/components/ui/Modal.vue'
import Spinner from '@/components/ui/Spinner.vue'
import EmptyState from '@/components/ui/EmptyState.vue'

const route = useRoute()
const historyStore = useHistoryStore()
const connectionsStore = useConnectionsStore()
const { addToast } = useToast()

const typeFilter = ref('')
const connectionFilter = ref(route.query.connection || '')
const limitFilter = ref(50)
const showDetailModal = ref(false)
const selectedTx = ref(null)
const exporting = ref(false)
const chartRange = ref('7d')

const connectionList = computed(() => {
  const data = connectionsStore.connections
  if (Array.isArray(data)) return data
  if (data?.connections) return data.connections
  return []
})

// ── Chart data builder ──────────────────────────────────────────────────
function buildDayBuckets(numDays, labelFormat) {
  const now = new Date()
  const days = []
  for (let i = numDays - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    days.push({
      key: d.toISOString().slice(0, 10),
      label: labelFormat === 'short'
        ? d.toLocaleDateString('en-US', { weekday: 'short' })
        : `${d.getMonth() + 1}/${d.getDate()}`,
    })
  }

  const buckets = {}
  for (const day of days) buckets[day.key] = { incoming: 0, outgoing: 0 }

  for (const tx of historyStore.transactions) {
    const ts = tx.settled_at || tx.created_at
    if (!ts) continue
    const key = new Date(ts * 1000).toISOString().slice(0, 10)
    if (buckets[key]) {
      const sats = Math.floor((tx.amount || 0) / 1000)
      if (tx.type === 'incoming') buckets[key].incoming += sats
      else buckets[key].outgoing += sats
    }
  }

  return days.map((d) => ({
    label: d.label,
    value: buckets[d.key].outgoing,
    value2: buckets[d.key].incoming,
  }))
}

const chartData = computed(() => chartRange.value === '30d' ? buildDayBuckets(30, 'date') : buildDayBuckets(7, 'short'))

function rangeStats(numDays) {
  const cutoff = Math.floor(Date.now() / 1000) - numDays * 86400
  const txs = historyStore.transactions.filter((tx) => (tx.settled_at || tx.created_at || 0) >= cutoff)
  const incoming = txs.filter((t) => t.type === 'incoming' && t.settled_at).reduce((s, t) => s + Math.floor((t.amount || 0) / 1000), 0)
  const outgoing = txs.filter((t) => t.type === 'outgoing' && t.settled_at).reduce((s, t) => s + Math.floor((t.amount || 0) / 1000), 0)
  const settled = txs.filter((t) => t.settled_at).length
  const failed = txs.filter((t) => t.err_msg).length
  return { incoming, outgoing, settled, failed, count: txs.length }
}

const stats = computed(() => rangeStats(chartRange.value === '30d' ? 30 : 7))
const netFlow = computed(() => stats.value.incoming - stats.value.outgoing)
const successRate = computed(() => {
  const total = stats.value.settled + stats.value.failed
  return total > 0 ? Math.round(stats.value.settled / total * 100) : 0
})

// ── Helpers ─────────────────────────────────────────────────────────────
function fmtSats(msat) {
  if (msat == null || msat === 0) return '0'
  return Math.floor(msat / 1000).toLocaleString('en-US')
}

function fmtDate(ts) {
  if (!ts) return '--'
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function txStatus(tx) {
  if (tx.err_msg) return 'failed'
  if (tx.settled_at) return 'settled'
  return 'pending'
}

function statusVariant(s) {
  if (s === 'settled') return 'success'
  if (s === 'pending') return 'warning'
  return 'error'
}

// ── Actions ─────────────────────────────────────────────────────────────
function fetchTransactions() {
  historyStore.fetch({ type: typeFilter.value || undefined, connection: connectionFilter.value || undefined, limit: limitFilter.value })
}
function setTypeFilter(type) { typeFilter.value = type; fetchTransactions() }
function onConnectionChange() { fetchTransactions() }
function onLimitChange() { fetchTransactions() }
function openDetail(tx) { selectedTx.value = tx; showDetailModal.value = true }
function loadMore() { limitFilter.value += 20; fetchTransactions() }

async function handleExport(format) {
  exporting.value = true
  try {
    const data = await historyStore.exportHistory(format, { type: typeFilter.value || undefined, connection: connectionFilter.value || undefined })
    if (format === 'csv' && data.csv) {
      const blob = new Blob([data.csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url
      a.download = data.filename || `nutbits-history-${new Date().toISOString().slice(0, 10)}.csv`
      a.click(); URL.revokeObjectURL(url)
      addToast(`Exported ${data.records} records as CSV`, 'success')
    } else {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url
      a.download = `nutbits-history-${new Date().toISOString().slice(0, 10)}.json`
      a.click(); URL.revokeObjectURL(url)
      addToast(`Exported ${data.total || 0} records as JSON`, 'success')
    }
  } catch (err) { addToast(err.message || 'Export failed', 'error') }
  finally { exporting.value = false }
}

onMounted(() => { fetchTransactions(); connectionsStore.fetch() })
</script>

<template>
  <div class="space-y-4">
    <!-- ── Loading ──────────────────────────────────────────────────── -->
    <div v-if="historyStore.loading && historyStore.transactions.length === 0" class="flex justify-center py-24">
      <Spinner />
    </div>

    <EmptyState
      v-else-if="historyStore.transactions.length === 0 && !connectionFilter"
      title="No transactions yet"
      description="Transactions will appear here as they flow through your NWC connections."
    />

    <EmptyState
      v-else-if="historyStore.transactions.length === 0 && connectionFilter"
      title="No transactions for this connection"
      description="This connection has no transactions yet."
    >
      <div class="flex gap-3">
        <button
          class="bg-nutbits-800 hover:bg-nutbits-700 text-nutbits-100 font-medium rounded-lg px-4 py-2.5 transition-all text-sm border border-nutbits-700"
          @click="connectionFilter = ''; fetchTransactions()"
        >
          Show All Transactions
        </button>
        <router-link
          to="/connections"
          class="bg-amber-500 hover:bg-amber-600 text-nutbits-950 font-medium rounded-lg px-4 py-2.5 transition-all text-sm"
        >
          Back to Connections
        </router-link>
      </div>
    </EmptyState>

    <template v-else>
      <!-- ── CHART HERO ─────────────────────────────────────────────── -->
      <div class="bg-nutbits-900 border border-nutbits-700 rounded-xl overflow-visible">
        <!-- Overlay header row (floats above chart) -->
        <div class="relative z-10 px-5 pt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <!-- Left: title + range toggle + legend -->
          <div class="space-y-3">
            <div class="flex items-center gap-3">
              <h1 class="text-lg font-semibold text-nutbits-100">Volume</h1>
              <div class="flex rounded-md overflow-hidden border border-nutbits-600">
                <button
                  class="px-3 py-1 text-xs font-semibold transition-all"
                  :class="chartRange === '7d' ? 'bg-amber-500 text-nutbits-950' : 'bg-nutbits-800/80 text-nutbits-400 hover:text-nutbits-100'"
                  @click="chartRange = '7d'"
                >7D</button>
                <button
                  class="px-3 py-1 text-xs font-semibold transition-all border-l border-nutbits-600"
                  :class="chartRange === '30d' ? 'bg-amber-500 text-nutbits-950' : 'bg-nutbits-800/80 text-nutbits-400 hover:text-nutbits-100'"
                  @click="chartRange = '30d'"
                >30D</button>
              </div>
            </div>
            <div class="flex items-center gap-4 text-xs">
              <span class="flex items-center gap-1.5">
                <span class="w-2.5 h-2.5 rounded-sm bg-amber-500" />
                <span class="text-nutbits-400">Outgoing</span>
                <span class="text-nutbits-100 font-semibold tabular-nums">{{ stats.outgoing.toLocaleString() }}</span>
              </span>
              <span class="flex items-center gap-1.5">
                <span class="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                <span class="text-nutbits-400">Incoming</span>
                <span class="text-nutbits-100 font-semibold tabular-nums">{{ stats.incoming.toLocaleString() }}</span>
              </span>
            </div>
          </div>

          <!-- Right: key metrics -->
          <div class="flex items-start gap-6">
            <div class="text-right">
              <p class="text-2xl font-bold tabular-nums leading-none" :class="netFlow >= 0 ? 'text-emerald-400' : 'text-red-400'">
                {{ netFlow >= 0 ? '+' : '' }}{{ netFlow.toLocaleString() }}
              </p>
              <p class="text-[10px] text-nutbits-500 mt-1">net flow (sats)</p>
            </div>
            <div class="text-right">
              <p class="text-2xl font-bold tabular-nums leading-none" :class="successRate >= 90 ? 'text-emerald-400' : successRate >= 50 ? 'text-amber-400' : 'text-red-400'">
                {{ successRate }}%
              </p>
              <p class="text-[10px] text-nutbits-500 mt-1">success rate</p>
            </div>
            <div class="text-right">
              <p class="text-2xl font-bold text-nutbits-100 tabular-nums leading-none">{{ stats.count }}</p>
              <p class="text-[10px] text-nutbits-500 mt-1">transactions</p>
            </div>
          </div>
        </div>

        <!-- The chart itself - takes up real space -->
        <div class="h-48 sm:h-56 px-2 pb-1 -mt-2">
          <BarChart
            :data="chartData"
            color="#f59e0b"
            color2="#10b981"
            unit="sats"
            label1="Outgoing"
            label2="Incoming"
            :guides="true"
            :interactive="true"
          />
        </div>
      </div>

      <!-- ── Filters + export ───────────────────────────────────────── -->
      <div class="flex flex-wrap items-center gap-2">
        <div class="flex rounded-md overflow-hidden border border-nutbits-700">
          <button
            class="px-3 py-1.5 text-xs font-medium transition-all"
            :class="typeFilter === '' ? 'bg-amber-500 text-nutbits-950' : 'bg-nutbits-800 text-nutbits-400 hover:text-nutbits-100'"
            @click="setTypeFilter('')"
          >All</button>
          <button
            class="px-3 py-1.5 text-xs font-medium transition-all border-l border-nutbits-700"
            :class="typeFilter === 'incoming' ? 'bg-emerald-600 text-white' : 'bg-nutbits-800 text-nutbits-400 hover:text-nutbits-100'"
            @click="setTypeFilter('incoming')"
          >In</button>
          <button
            class="px-3 py-1.5 text-xs font-medium transition-all border-l border-nutbits-700"
            :class="typeFilter === 'outgoing' ? 'bg-amber-500 text-nutbits-950' : 'bg-nutbits-800 text-nutbits-400 hover:text-nutbits-100'"
            @click="setTypeFilter('outgoing')"
          >Out</button>
        </div>

        <select
          v-model="connectionFilter"
          class="bg-nutbits-800 border border-nutbits-700 rounded-md px-2.5 py-1.5 text-xs text-nutbits-100 focus:border-amber-500 outline-none"
          @change="onConnectionChange"
        >
          <option value="">All connections</option>
          <option v-for="conn in connectionList" :key="conn.app_pubkey" :value="conn.id">{{ conn.label }}</option>
        </select>

        <select
          v-model="limitFilter"
          class="bg-nutbits-800 border border-nutbits-700 rounded-md px-2.5 py-1.5 text-xs text-nutbits-100 focus:border-amber-500 outline-none"
          @change="onLimitChange"
        >
          <option :value="20">20</option>
          <option :value="50">50</option>
          <option :value="100">100</option>
        </select>

        <span class="flex-1" />

        <button
          class="text-nutbits-400 hover:text-nutbits-200 text-xs transition-colors disabled:opacity-50"
          :disabled="exporting" @click="handleExport('csv')"
        >CSV</button>
        <button
          class="text-nutbits-400 hover:text-nutbits-200 text-xs transition-colors disabled:opacity-50"
          :disabled="exporting" @click="handleExport('json')"
        >JSON</button>
        <span class="text-[10px] text-nutbits-600 tabular-nums">{{ historyStore.total }} total</span>
      </div>

      <!-- ── Transaction table ──────────────────────────────────────── -->
      <div class="bg-nutbits-900 border border-nutbits-700 rounded-xl overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-nutbits-500 text-[10px] uppercase tracking-wider bg-nutbits-800/50">
                <th class="px-3 py-2 text-left">Type</th>
                <th class="px-3 py-2 text-left">Amount</th>
                <th class="px-3 py-2 text-left hidden lg:table-cell">Fees</th>
                <th class="px-3 py-2 text-left">Status</th>
                <th class="px-3 py-2 text-left hidden md:table-cell">Connection</th>
                <th class="px-3 py-2 text-left hidden sm:table-cell">Description</th>
                <th class="px-3 py-2 text-right">Date</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(tx, i) in historyStore.transactions"
                :key="tx.payment_hash || i"
                class="border-t border-nutbits-800/60 hover:bg-nutbits-800/30 transition-colors cursor-pointer"
                @click="openDetail(tx)"
              >
                <td class="px-3 py-2"><Badge :variant="tx.type === 'incoming' ? 'success' : 'warning'" :label="tx.type === 'incoming' ? 'In' : 'Out'" /></td>
                <td class="px-3 py-2 font-medium whitespace-nowrap tabular-nums text-xs" :class="tx.type === 'incoming' ? 'text-emerald-400' : 'text-amber-400'">{{ fmtSats(tx.amount) }}</td>
                <td class="px-3 py-2 text-nutbits-500 text-xs hidden lg:table-cell tabular-nums">
                  <template v-if="(tx.fees_paid > 0) || (tx.service_fee > 0)">
                    <span v-if="tx.fees_paid > 0">{{ fmtSats(tx.fees_paid) }}</span>
                    <span v-if="tx.fees_paid > 0 && tx.service_fee > 0"> + </span>
                    <span v-if="tx.service_fee > 0" class="text-amber-400/60">{{ fmtSats(tx.service_fee) }}</span>
                  </template>
                  <span v-else class="text-nutbits-700">--</span>
                </td>
                <td class="px-3 py-2"><Badge :variant="statusVariant(txStatus(tx))" :label="txStatus(tx)" /></td>
                <td class="px-3 py-2 text-nutbits-500 text-xs hidden md:table-cell">{{ tx.connection_label || '--' }}</td>
                <td class="px-3 py-2 text-nutbits-500 text-xs hidden sm:table-cell max-w-[160px] truncate">{{ tx.description || '--' }}</td>
                <td class="px-3 py-2 text-nutbits-500 text-xs text-right whitespace-nowrap">{{ fmtDate(tx.settled_at || tx.created_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="historyStore.transactions.length < historyStore.total" class="px-3 py-2.5 border-t border-nutbits-800 flex items-center justify-between">
          <span class="text-nutbits-500 text-[10px] tabular-nums">{{ historyStore.transactions.length }} of {{ historyStore.total }}</span>
          <button class="text-amber-400 hover:text-amber-300 text-xs font-medium transition-colors" @click="loadMore">Load more</button>
        </div>
      </div>
    </template>

    <!-- ── Detail Modal ─────────────────────────────────────────────── -->
    <Modal :show="showDetailModal" title="Transaction Details" @close="showDetailModal = false">
      <div v-if="selectedTx" class="space-y-4">
        <div class="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span class="text-nutbits-500 text-[10px] uppercase">Type</span>
            <p class="mt-0.5"><Badge :variant="selectedTx.type === 'incoming' ? 'success' : 'warning'" :label="selectedTx.type === 'incoming' ? 'Incoming' : 'Outgoing'" /></p>
          </div>
          <div>
            <span class="text-nutbits-500 text-[10px] uppercase">Status</span>
            <p class="mt-0.5"><Badge :variant="statusVariant(txStatus(selectedTx))" :label="txStatus(selectedTx)" /></p>
          </div>
          <div>
            <span class="text-nutbits-500 text-[10px] uppercase">Amount</span>
            <p class="font-medium mt-0.5" :class="selectedTx.type === 'incoming' ? 'text-emerald-400' : 'text-amber-400'">{{ fmtSats(selectedTx.amount) }} sats</p>
          </div>
          <div>
            <span class="text-nutbits-500 text-[10px] uppercase">Connection</span>
            <p class="text-nutbits-100 mt-0.5">{{ selectedTx.connection_label || '--' }}</p>
          </div>
          <div v-if="selectedTx.fees_paid">
            <span class="text-nutbits-500 text-[10px] uppercase">Routing Fee</span>
            <p class="text-nutbits-100 mt-0.5">{{ fmtSats(selectedTx.fees_paid) }} sats</p>
          </div>
          <div v-if="selectedTx.service_fee">
            <span class="text-nutbits-500 text-[10px] uppercase">Service Fee</span>
            <p class="text-nutbits-100 mt-0.5">{{ fmtSats(selectedTx.service_fee) }} sats</p>
          </div>
          <div>
            <span class="text-nutbits-500 text-[10px] uppercase">Created</span>
            <p class="text-nutbits-100 mt-0.5">{{ fmtDate(selectedTx.created_at) }}</p>
          </div>
          <div v-if="selectedTx.settled_at">
            <span class="text-nutbits-500 text-[10px] uppercase">Settled</span>
            <p class="text-nutbits-100 mt-0.5">{{ fmtDate(selectedTx.settled_at) }}</p>
          </div>
        </div>
        <div v-if="selectedTx.description" class="text-sm">
          <span class="text-nutbits-500 text-[10px] uppercase">Description</span>
          <p class="text-nutbits-100 mt-0.5">{{ selectedTx.description }}</p>
        </div>
        <div v-if="selectedTx.payment_hash" class="text-sm">
          <span class="text-nutbits-500 text-[10px] uppercase">Payment Hash</span>
          <p class="text-nutbits-100 mt-1 font-mono text-[11px] break-all bg-nutbits-800 rounded-lg p-2.5">{{ selectedTx.payment_hash }}</p>
        </div>
        <div v-if="selectedTx.preimage" class="text-sm">
          <span class="text-nutbits-500 text-[10px] uppercase">Preimage</span>
          <p class="text-nutbits-100 mt-1 font-mono text-[11px] break-all bg-nutbits-800 rounded-lg p-2.5">{{ selectedTx.preimage }}</p>
        </div>
        <div v-if="selectedTx.err_msg" class="text-sm">
          <span class="text-red-400 text-[10px] uppercase">Error</span>
          <p class="text-red-300 mt-1 bg-red-500/10 rounded-lg p-2.5 text-xs">{{ selectedTx.err_msg }}</p>
        </div>
      </div>
    </Modal>
  </div>
</template>
