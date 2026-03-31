<script setup>
import { ref, computed, onMounted } from 'vue'
import { useFeesStore } from '@/stores/fees.js'
import { useHistoryStore } from '@/stores/history.js'
import { useConfigStore } from '@/stores/config.js'
import BarChart from '@/components/ui/BarChart.vue'
import Spinner from '@/components/ui/Spinner.vue'

const feesStore = useFeesStore()
const historyStore = useHistoryStore()
const configStore = useConfigStore()

const fees = computed(() => feesStore.fees || {})
const config = computed(() => configStore.config || {})
const chartRange = ref('7d')

const feeEnabled = computed(() => !!(config.value.service_fee_ppm || config.value.service_fee_base))

const feePolicyLabel = computed(() => {
  const ppm = config.value.service_fee_ppm ?? 0
  const base = config.value.service_fee_base ?? 0
  if (!ppm && !base) return 'Disabled'
  const parts = []
  if (ppm > 0) parts.push(`${(ppm / 10000).toFixed(2)}%`)
  if (base > 0) parts.push(`${base} sat base`)
  return parts.join(' + ')
})

const connections = computed(() => {
  const byConn = fees.value.by_connection
  if (!byConn) return []
  if (Array.isArray(byConn)) return byConn
  return Object.entries(byConn).map(([label, data]) => ({ label, ...data }))
})

// ── Chart data builder ──────────────────────────────────────────────────
function buildFeeBuckets(numDays, labelFormat) {
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
  for (const day of days) buckets[day.key] = { sats: 0, txs: 0 }

  for (const tx of historyStore.transactions) {
    const fee = tx.service_fee || 0
    if (fee <= 0) continue
    const ts = tx.settled_at || tx.created_at
    if (!ts) continue
    const key = new Date(ts * 1000).toISOString().slice(0, 10)
    if (buckets[key] !== undefined) {
      buckets[key].sats += Math.floor(fee / 1000)
      buckets[key].txs++
    }
  }

  return days.map((d) => ({ label: d.label, value: buckets[d.key].sats, txCount: buckets[d.key].txs }))
}

const chartData = computed(() => chartRange.value === '30d' ? buildFeeBuckets(30, 'date') : buildFeeBuckets(7, 'short'))
const rangeTotal = computed(() => chartData.value.reduce((s, d) => s + d.value, 0))
const rangeDays = computed(() => chartRange.value === '30d' ? 30 : 7)
const dailyAvg = computed(() => rangeDays.value > 0 ? Math.round(rangeTotal.value / rangeDays.value) : 0)
const bestDay = computed(() => chartData.value.length ? Math.max(...chartData.value.map((d) => d.value)) : 0)

function fmtSats(v) { return v == null ? '0' : Number(v).toLocaleString() }
function msatToSats(msat) {
  if (msat == null) return '0'
  const sats = Number(msat) / 1000
  return sats >= 1 ? Math.floor(sats).toLocaleString() : sats.toFixed(3)
}

async function refreshAll() {
  await Promise.all([feesStore.fetch(), historyStore.fetch({ limit: 100 }), configStore.fetch()])
}

onMounted(() => refreshAll())
</script>

<template>
  <div class="space-y-4">
    <!-- ── Loading ──────────────────────────────────────────────────── -->
    <div v-if="feesStore.loading && !fees.today_sats" class="flex justify-center py-24">
      <Spinner />
    </div>

    <template v-else>
      <!-- ── CHART HERO ─────────────────────────────────────────────── -->
      <div class="bg-nutbits-900 border border-nutbits-700 rounded-xl overflow-visible">
        <!-- Overlay header -->
        <div class="relative z-10 px-5 pt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <!-- Left: title + range + policy -->
          <div class="space-y-3">
            <div class="flex items-center gap-3">
              <h1 class="text-lg font-semibold text-nutbits-100">Fees</h1>
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
              <span class="text-xs font-medium" :class="feeEnabled ? 'text-amber-400' : 'text-nutbits-600'">{{ feePolicyLabel }}</span>
            </div>
            <!-- Range stats -->
            <div class="flex items-center gap-4 text-xs text-nutbits-400">
              <span>{{ rangeTotal.toLocaleString() }} sats earned</span>
              <span class="text-nutbits-700">|</span>
              <span>~{{ dailyAvg.toLocaleString() }}/day avg</span>
              <template v-if="bestDay > 0">
                <span class="text-nutbits-700">|</span>
                <span class="text-amber-400/70">{{ bestDay.toLocaleString() }} peak</span>
              </template>
            </div>
          </div>

          <!-- Right: headline numbers -->
          <div class="flex items-start gap-6">
            <div class="text-right">
              <p class="text-2xl font-bold text-nutbits-100 tabular-nums leading-none">{{ fmtSats(fees.today_sats) }}</p>
              <p class="text-[10px] text-nutbits-500 mt-1">today (sats)</p>
            </div>
            <div class="text-right">
              <p class="text-2xl font-bold text-amber-400 tabular-nums leading-none">{{ fmtSats(fees.total_sats) }}</p>
              <p class="text-[10px] text-nutbits-500 mt-1">all time (sats)</p>
            </div>
          </div>
        </div>

        <!-- Chart -->
        <div v-if="feeEnabled" class="h-44 sm:h-52 px-2 pb-1 -mt-2">
          <BarChart
            :data="chartData"
            color="#f59e0b"
            unit="sats"
            :guides="true"
            :interactive="true"
          >
            <template #tooltip="{ bar }">
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-sm bg-amber-500 flex-shrink-0" />
                <span class="text-nutbits-400">Earned</span>
                <span class="text-nutbits-100 font-semibold tabular-nums ml-auto pl-3">{{ bar.value.toLocaleString() }} sats</span>
              </div>
              <div class="flex items-center gap-2 mt-1">
                <span class="w-2 h-2 rounded-sm bg-nutbits-500 flex-shrink-0" />
                <span class="text-nutbits-400">Transactions</span>
                <span class="text-nutbits-100 font-medium tabular-nums ml-auto pl-3">{{ bar.txCount || 0 }}</span>
              </div>
              <div v-if="bar.txCount > 0" class="border-t border-nutbits-700 mt-1.5 pt-1.5 flex justify-between">
                <span class="text-nutbits-500">Avg per tx</span>
                <span class="text-amber-400 font-medium tabular-nums">{{ Math.round(bar.value / bar.txCount).toLocaleString() }} sats</span>
              </div>
              <div v-if="dailyAvg > 0" class="flex justify-between mt-0.5">
                <span class="text-nutbits-500">vs. daily avg</span>
                <span
                  class="font-medium tabular-nums"
                  :class="bar.value >= dailyAvg ? 'text-emerald-400' : 'text-nutbits-500'"
                >{{ bar.value >= dailyAvg ? '+' : '' }}{{ (bar.value - dailyAvg).toLocaleString() }} sats</span>
              </div>
            </template>
          </BarChart>
        </div>

        <!-- Disabled state -->
        <div v-else class="h-44 sm:h-52 flex items-center justify-center px-5 pb-5">
          <div class="text-center">
            <p class="text-nutbits-500 text-sm">Service fees are disabled</p>
            <router-link
              to="/settings"
              class="inline-block mt-2 text-amber-400 hover:text-amber-300 text-xs underline underline-offset-2 transition-colors"
            >Enable in Settings</router-link>
          </div>
        </div>
      </div>

      <!-- ── Earnings by connection ─────────────────────────────────── -->
      <div
        v-if="connections.length"
        class="bg-nutbits-900 border border-nutbits-700 rounded-xl overflow-hidden"
      >
        <div class="px-4 py-2.5 border-b border-nutbits-800">
          <p class="text-[10px] text-nutbits-500 uppercase tracking-wide font-medium">Earnings by Connection</p>
        </div>
        <div class="divide-y divide-nutbits-800/60">
          <div
            v-for="conn in connections"
            :key="conn.label"
            class="flex items-center justify-between px-4 py-2.5 hover:bg-nutbits-800/20 transition-colors"
          >
            <span class="text-xs text-nutbits-200 font-medium truncate">{{ conn.label }}</span>
            <div class="flex items-center gap-5 text-right flex-shrink-0">
              <div>
                <p class="text-xs text-nutbits-200 tabular-nums">{{ msatToSats(conn.today_msat) }}</p>
                <p class="text-[9px] text-nutbits-600">today</p>
              </div>
              <div>
                <p class="text-xs text-nutbits-200 tabular-nums">{{ msatToSats(conn.total_msat) }}</p>
                <p class="text-[9px] text-nutbits-600">all time</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Settings link ──────────────────────────────────────────── -->
      <div class="flex items-center justify-between bg-nutbits-900/50 border border-nutbits-800 rounded-lg px-4 py-3">
        <p class="text-xs text-nutbits-500">
          Fee policy is configured in
          <router-link to="/settings" class="text-amber-400/80 hover:text-amber-300 transition-colors underline underline-offset-2">Settings</router-link>
        </p>
        <button class="text-xs text-nutbits-400 hover:text-nutbits-200 transition-colors" @click="refreshAll">Refresh</button>
      </div>
    </template>
  </div>
</template>
