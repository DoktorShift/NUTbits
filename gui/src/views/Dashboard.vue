<script setup>
import { onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useStatusStore } from '@/stores/status.js'
import { useBalanceStore } from '@/stores/balance.js'
import { useHistoryStore } from '@/stores/history.js'
import { usePolling } from '@/composables/usePolling.js'
import { NUT_IDS } from '@/config/nuts.js'
import Badge from '@/components/ui/Badge.vue'
import NutBadge from '@/components/ui/NutBadge.vue'
import Spinner from '@/components/ui/Spinner.vue'
import EmptyState from '@/components/ui/EmptyState.vue'

const router = useRouter()
const statusStore = useStatusStore()
const balanceStore = useBalanceStore()
const historyStore = useHistoryStore()

const statusPolling = usePolling(() => statusStore.fetch(), 15000)
const balancePolling = usePolling(() => balanceStore.fetch(), 15000)

const s = computed(() => statusStore.status || {})
const mint = computed(() => s.value.mint || {})
const relays = computed(() => s.value.relays || {})
const limits = computed(() => s.value.limits || {})

const relayLabel = computed(() => `${relays.value.connected ?? 0}/${relays.value.total ?? 0}`)

// NUT support compact display
const nutNumbers = NUT_IDS
function isNutSupported(num) {
  const nuts = s.value.nuts
  if (!nuts) return false
  return !!nuts[num] || !!nuts[`nut${num}`] || !!nuts[`NUT-${num}`]
}

// Transaction channel split (like TUI)
const recentTxs = computed(() => historyStore.transactions.slice(0, 20))
const nwcTxs = computed(() => recentTxs.value.filter(tx => tx.connection_label && tx.connection_label !== 'API'))
const mintTxs = computed(() => recentTxs.value.filter(tx => !tx.connection_label || tx.connection_label === 'API'))

// Per-mint balance data
const mintBalances = computed(() => balanceStore.mints || [])

function formatSats(msat) {
  if (msat == null) return '0'
  return Math.floor(msat / 1000).toLocaleString('en-US')
}

function formatRelativeTime(ts) {
  if (!ts) return '--'
  const diff = Math.floor(Date.now() / 1000) - ts
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function shortMintUrl(url) {
  if (!url) return 'unknown'
  try {
    var u = new URL(url)
    var host = u.hostname.replace(/^www\./, '')
    var path = u.pathname.replace(/\/+$/, '')
    return path && path !== '/' ? host + path : host
  } catch {
    return url.replace(/^(wss?|https?):\/\//, '').replace(/\/+$/, '')
  }
}

onMounted(() => {
  statusPolling.start()
  balancePolling.start()
  historyStore.fetch({ limit: 20, unpaid: 'true' })
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div class="space-y-2">
        <h1 class="text-2xl font-bold text-nutbits-100">Dashboard</h1>
        <p class="text-sm text-nutbits-400">
          Live service status, wallet capacity, and recent activity across your mint and NWC clients.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Badge :variant="statusStore.isHealthy ? 'success' : 'error'" :label="statusStore.isHealthy ? 'Mint healthy' : 'Mint degraded'" />
        <Badge :variant="(relays.connected ?? 0) > 0 ? 'info' : 'error'" :label="`${relays.connected ?? 0}/${relays.total ?? 0} relays`" />
        <Badge :variant="s.seed_configured ? 'success' : 'warning'" :label="s.seed_configured ? 'Seed set' : 'Seed missing'" />
      </div>
    </div>

    <!-- ── Row 1: Compact Metrics ─────────────────────────────────────── -->
    <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
      <router-link to="/mints" class="bg-nutbits-900 border border-nutbits-700 rounded-lg px-3.5 py-2.5 relative overflow-hidden hover:border-nutbits-600 transition-colors">
        <div class="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
        <span class="text-[10px] text-nutbits-400 uppercase tracking-wider block">Balance</span>
        <span class="text-lg font-bold text-amber-500">{{ balanceStore.formattedTotal }}</span>
        <span class="text-[10px] text-nutbits-400 ml-1">sats</span>
      </router-link>
      <router-link to="/connections" class="bg-nutbits-900 border border-nutbits-700 rounded-lg px-3.5 py-2.5 hover:border-nutbits-600 transition-colors">
        <span class="text-[10px] text-nutbits-400 uppercase tracking-wider block">Connections</span>
        <span class="text-lg font-bold text-nutbits-50">{{ s.connections_count ?? '--' }}</span>
        <span class="text-[10px] text-nutbits-400 ml-1">active</span>
      </router-link>
      <router-link to="/relays" class="bg-nutbits-900 border border-nutbits-700 rounded-lg px-3.5 py-2.5 hover:border-nutbits-600 transition-colors">
        <span class="text-[10px] text-nutbits-400 uppercase tracking-wider block">Relays</span>
        <span class="text-lg font-bold text-nutbits-50">{{ relayLabel }}</span>
        <span class="text-[10px] text-nutbits-400 ml-1">connected</span>
      </router-link>
      <div class="bg-nutbits-900 border border-nutbits-700 rounded-lg px-3.5 py-2.5">
        <span class="text-[10px] text-nutbits-400 uppercase tracking-wider block">Uptime</span>
        <span class="text-lg font-bold text-nutbits-50">{{ statusStore.uptimeFormatted }}</span>
      </div>
      <router-link to="/settings" class="bg-nutbits-900 border border-nutbits-700 rounded-lg px-3.5 py-2.5 hover:border-nutbits-600 transition-colors">
        <span class="text-[10px] text-nutbits-400 uppercase tracking-wider block">Seed</span>
        <div class="flex items-center gap-1.5 mt-0.5">
          <span class="w-2 h-2 rounded-full" :class="s.seed_configured ? 'bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.5)]' : 'bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.5)]'" />
          <span class="text-sm font-medium" :class="s.seed_configured ? 'text-emerald-400' : 'text-red-400'">
            {{ s.seed_configured ? 'configured' : 'not set' }}
          </span>
        </div>
      </router-link>
      <router-link to="/settings" class="bg-nutbits-900 border border-nutbits-700 rounded-lg px-3.5 py-2.5 hover:border-nutbits-600 transition-colors">
        <span class="text-[10px] text-nutbits-400 uppercase tracking-wider block">Storage</span>
        <span class="text-lg font-semibold text-nutbits-50">{{ s.storage ?? '--' }}</span>
      </router-link>
    </div>

    <!-- ── Row 2: Active Mint + Quick Actions ─────────────────────────── -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-3">
      <!-- Active Mint (2/3) -->
      <div class="lg:col-span-2 bg-nutbits-900 border border-nutbits-700 rounded-xl p-5 space-y-3.5">
        <router-link to="/mints" class="flex items-center justify-between group">
          <h3 class="text-sm font-semibold text-nutbits-100 uppercase tracking-wide group-hover:text-amber-400 transition-colors">Active Mint</h3>
          <Badge :variant="statusStore.isHealthy ? 'success' : 'error'" :label="statusStore.isHealthy ? 'Healthy' : 'Unhealthy'" />
        </router-link>

        <div v-if="(statusStore.loading || !statusStore.lastSuccessAt) && !mint.name" class="flex justify-center py-6"><Spinner /></div>

        <template v-else-if="mint.name || mint.url">
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
            <div>
              <span class="text-nutbits-500 text-[10px] uppercase tracking-wider">Name</span>
              <p class="text-nutbits-50 font-semibold">{{ mint.name || 'Unknown' }}</p>
            </div>
            <div>
              <span class="text-nutbits-500 text-[10px] uppercase tracking-wider">Version</span>
              <p class="text-nutbits-100">{{ mint.version || '?' }}</p>
            </div>
            <div class="col-span-2 sm:col-span-1">
              <span class="text-nutbits-500 text-[10px] uppercase tracking-wider">URL</span>
              <p class="text-nutbits-300 font-mono text-xs truncate" :title="mint.url">{{ shortMintUrl(mint.url) }}</p>
            </div>
          </div>

          <!-- NUT support compact -->
          <div>
            <span class="text-nutbits-500 text-[10px] uppercase tracking-wider block mb-1.5">NUTs</span>
            <div class="flex flex-wrap gap-1">
              <NutBadge
                v-for="num in nutNumbers"
                :key="num"
                :num="num"
                :supported="isNutSupported(num)"
              />
            </div>
          </div>

          <div v-if="mint.motd" class="bg-nutbits-800/60 rounded-lg px-3 py-2">
            <span class="text-nutbits-500 text-[9px] uppercase tracking-wider">MOTD</span>
            <p class="text-amber-400/80 text-sm">"{{ mint.motd }}"</p>
          </div>

          <!-- Spending limits (only when user has configured non-default values) -->
          <div v-if="limits.max_payment_sats > 0 || limits.daily_limit_sats > 0" class="border-t border-nutbits-800 pt-3">
            <div class="flex items-center justify-between mb-2">
              <span class="text-nutbits-500 text-[10px] uppercase tracking-wider">Spending Limits</span>
              <router-link to="/settings" class="text-[10px] text-nutbits-500 hover:text-nutbits-300 transition-colors underline underline-offset-2">Edit</router-link>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div v-if="limits.max_payment_sats > 0" class="bg-nutbits-800/60 rounded-lg px-3 py-2">
                <span class="text-nutbits-500 text-[10px] uppercase tracking-wider block">Max per tx</span>
                <p class="text-nutbits-100 font-semibold tabular-nums">{{ limits.max_payment_sats.toLocaleString() }} <span class="text-nutbits-400 text-xs font-normal">sats</span></p>
              </div>
              <div v-if="limits.daily_limit_sats > 0" class="bg-nutbits-800/60 rounded-lg px-3 py-2">
                <span class="text-nutbits-500 text-[10px] uppercase tracking-wider block">Daily limit</span>
                <p class="text-nutbits-100 font-semibold tabular-nums">{{ limits.daily_limit_sats.toLocaleString() }} <span class="text-nutbits-400 text-xs font-normal">sats</span></p>
              </div>
              <div v-if="limits.fee_reserve_pct > 1" class="bg-nutbits-800/60 rounded-lg px-3 py-2">
                <span class="text-nutbits-500 text-[10px] uppercase tracking-wider block">Fee reserve</span>
                <p class="text-nutbits-100 font-semibold tabular-nums">{{ limits.fee_reserve_pct }}<span class="text-nutbits-400 text-xs font-normal">%</span></p>
              </div>
            </div>
          </div>
        </template>
        <div v-else class="text-nutbits-500 text-sm py-4">No mint data available</div>
      </div>

      <!-- Right column -->
      <div class="space-y-3">
        <!-- Quick Actions -->
        <div class="bg-nutbits-900 border border-nutbits-700 rounded-xl p-4">
          <h3 class="text-sm font-semibold text-nutbits-100 uppercase tracking-wide mb-3">Actions</h3>
          <div class="space-y-1.5">
            <button class="w-full bg-amber-500 hover:bg-amber-600 text-nutbits-950 font-medium rounded-lg px-3 py-2 transition-all text-sm" @click="router.push('/pay')">Pay Invoice</button>
            <button class="w-full bg-nutbits-800 hover:bg-nutbits-700 text-nutbits-100 font-medium rounded-lg px-3 py-2 transition-all border border-nutbits-700 text-sm" @click="router.push('/receive')">Create Invoice</button>
            <button class="w-full bg-nutbits-800 hover:bg-nutbits-700 text-nutbits-100 font-medium rounded-lg px-3 py-2 transition-all border border-nutbits-700 text-sm" @click="router.push('/connections')">New Connection</button>
          </div>
        </div>

        <!-- Per-mint balance -->
        <div v-if="mintBalances.length > 0" class="bg-nutbits-900 border border-nutbits-700 rounded-xl p-4">
          <router-link to="/mints" class="text-sm font-semibold text-nutbits-100 uppercase tracking-wide mb-2.5 block hover:text-amber-400 transition-colors">Balance by Mint</router-link>
          <div class="space-y-2">
            <div v-for="m in mintBalances" :key="m.url" class="space-y-1">
              <div class="flex justify-between text-[11px]">
                <span class="text-nutbits-400 truncate max-w-[120px]">{{ shortMintUrl(m.url) }}</span>
                <span class="text-nutbits-100 font-medium tabular-nums">{{ (m.sats || 0).toLocaleString() }}</span>
              </div>
              <div class="h-1 rounded-full bg-nutbits-800 overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-500"
                  :class="m.active ? 'bg-amber-500' : 'bg-nutbits-500'"
                  :style="{ width: `${Math.min(100, ((m.sats || 0) / Math.max(balanceStore.total_sats, 1)) * 100)}%` }"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Row 3: Recent Transactions (split by channel) ──────────────── -->
    <div class="bg-nutbits-900 border border-nutbits-700 rounded-xl p-5">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-semibold text-nutbits-100 uppercase tracking-wide">Recent Transactions</h3>
        <button class="text-amber-500 hover:text-amber-400 text-xs font-medium transition-colors" @click="router.push('/history')">View All</button>
      </div>

      <div v-if="historyStore.loading && recentTxs.length === 0" class="flex justify-center py-8"><Spinner /></div>

      <EmptyState v-else-if="recentTxs.length === 0" title="No transactions yet" description="Incoming payments and sent invoices will appear here." />

      <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <!-- NWC Channel -->
        <div class="bg-nutbits-800/30 border border-nutbits-700/50 rounded-lg overflow-hidden">
          <router-link to="/connections" class="flex items-center justify-between px-4 py-2.5 border-b border-nutbits-700/50 hover:bg-nutbits-800/30 transition-colors">
            <div class="flex items-center gap-2">
              <span class="w-1.5 h-1.5 rounded-full bg-blue-500" />
              <span class="text-xs font-semibold text-nutbits-100">NWC</span>
              <span class="text-[10px] text-nutbits-500">Nostr Wallet Connect</span>
            </div>
            <span class="text-[10px] text-nutbits-500 tabular-nums">{{ nwcTxs.length }}</span>
          </router-link>
          <div v-if="nwcTxs.length === 0" class="text-[11px] text-nutbits-500 px-4 py-4 text-center">No NWC transactions yet</div>
          <table v-else class="w-full text-xs">
            <tbody>
              <tr v-for="tx in nwcTxs.slice(0, 7)" :key="tx.payment_hash" class="border-t border-nutbits-800/40 hover:bg-nutbits-800/20 transition-colors">
                <td class="py-2 pl-4 pr-2 whitespace-nowrap text-nutbits-500 w-[70px]">{{ formatRelativeTime(tx.settled_at || tx.created_at) }}</td>
                <td class="py-2 px-2 w-[44px]">
                  <span :class="tx.type === 'incoming' ? 'text-emerald-400' : 'text-red-400'" class="font-medium">{{ tx.type === 'incoming' ? '← in' : '→ out' }}</span>
                </td>
                <td class="py-2 px-2 font-medium tabular-nums text-right w-[72px]" :class="tx.type === 'incoming' ? 'text-emerald-400' : 'text-amber-400'">{{ formatSats(tx.amount) }}</td>
                <td class="py-2 px-2 w-[60px]"><Badge :variant="tx.settled_at ? 'success' : tx.err_msg ? 'error' : 'warning'" :label="tx.settled_at ? 'settled' : tx.err_msg ? 'failed' : 'pending'" /></td>
                <td class="py-2 pl-2 pr-4 truncate max-w-[120px]">
                  <div class="flex items-center gap-1.5">
                    <span class="text-nutbits-400">{{ tx.connection_label || '' }}</span>
                    <span v-if="tx.connection_dedicated" class="text-[8px] font-medium text-emerald-400/70 bg-emerald-500/10 px-1 py-0 rounded">ded</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Mint/API Channel -->
        <div class="bg-nutbits-800/30 border border-nutbits-700/50 rounded-lg overflow-hidden">
          <router-link to="/mints" class="flex items-center justify-between px-4 py-2.5 border-b border-nutbits-700/50 hover:bg-nutbits-800/30 transition-colors">
            <div class="flex items-center gap-2">
              <span class="w-1.5 h-1.5 rounded-full bg-purple-500" />
              <span class="text-xs font-semibold text-nutbits-100">Mint</span>
              <span v-if="mint.name" class="text-[10px] text-nutbits-500">{{ mint.name }}</span>
              <span v-else class="text-[10px] text-nutbits-500">Direct CLI / API</span>
            </div>
            <span class="text-[10px] text-nutbits-500 tabular-nums">{{ mintTxs.length }}</span>
          </router-link>
          <div v-if="mintTxs.length === 0" class="text-[11px] text-nutbits-500 px-4 py-4 text-center">No direct mint transactions yet</div>
          <table v-else class="w-full text-xs">
            <tbody>
              <tr v-for="tx in mintTxs.slice(0, 7)" :key="tx.payment_hash" class="border-t border-nutbits-800/40 hover:bg-nutbits-800/20 transition-colors">
                <td class="py-2 pl-4 pr-2 whitespace-nowrap text-nutbits-500 w-[70px]">{{ formatRelativeTime(tx.settled_at || tx.created_at) }}</td>
                <td class="py-2 px-2 w-[44px]">
                  <span :class="tx.type === 'incoming' ? 'text-emerald-400' : 'text-red-400'" class="font-medium">{{ tx.type === 'incoming' ? '← in' : '→ out' }}</span>
                </td>
                <td class="py-2 px-2 font-medium tabular-nums text-right w-[72px]" :class="tx.type === 'incoming' ? 'text-emerald-400' : 'text-amber-400'">{{ formatSats(tx.amount) }}</td>
                <td class="py-2 px-2 w-[60px]"><Badge :variant="tx.settled_at ? 'success' : tx.err_msg ? 'error' : 'warning'" :label="tx.settled_at ? 'settled' : tx.err_msg ? 'failed' : 'pending'" /></td>
                <td class="py-2 pl-2 pr-4 text-nutbits-400 truncate max-w-[100px]">{{ tx.description ? tx.description.slice(0, 20) : '' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
