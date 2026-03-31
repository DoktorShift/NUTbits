<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useLogsStore } from '@/stores/logs.js'
import Badge from '@/components/ui/Badge.vue'
import Spinner from '@/components/ui/Spinner.vue'
import EmptyState from '@/components/ui/EmptyState.vue'

const logsStore = useLogsStore()

const levels = ['error', 'warn', 'info', 'debug']
const limits = [50, 100, 200]

const selectedLevel = ref('info')
const selectedLimit = ref(100)
const autoRefresh = ref(false)
const expandedRows = ref(new Set())
const searchQuery = ref('')

let autoRefreshTimer = null

const LEVEL_STYLES = {
  error:   { badge: 'error',   border: 'border-l-red-500',     bg: 'bg-red-500/5' },
  warn:    { badge: 'warning', border: 'border-l-yellow-500',  bg: 'bg-yellow-500/5' },
  warning: { badge: 'warning', border: 'border-l-yellow-500',  bg: 'bg-yellow-500/5' },
  info:    { badge: 'info',    border: 'border-l-blue-500',    bg: '' },
  debug:   { badge: 'default', border: 'border-l-nutbits-600', bg: '' },
}

function levelStyle(level) {
  return LEVEL_STYLES[level] || LEVEL_STYLES.debug
}

// Normalize API fields (API sends msg/ts, but could also send message/timestamp)
function entryMsg(entry) {
  return entry.message || entry.msg || ''
}
function entryTs(entry) {
  return entry.timestamp || entry.ts || null
}

function formatTimestamp(ts) {
  if (!ts) return '--'
  var d = new Date(typeof ts === 'number' ? (ts > 1e12 ? ts : ts * 1000) : ts)
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    + '.' + String(d.getMilliseconds()).padStart(3, '0')
}

function formatDate(ts) {
  if (!ts) return ''
  var d = new Date(typeof ts === 'number' ? (ts > 1e12 ? ts : ts * 1000) : ts)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatFullDate(ts) {
  if (!ts) return ''
  var d = new Date(typeof ts === 'number' ? (ts > 1e12 ? ts : ts * 1000) : ts)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function toggleExpand(index) {
  if (expandedRows.value.has(index)) {
    expandedRows.value.delete(index)
  } else {
    expandedRows.value.add(index)
  }
}

function formatJson(data) {
  try {
    if (typeof data === 'string') data = JSON.parse(data)
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}

// Filtered logs (search)
const filteredLogs = computed(() => {
  var entries = [...logsStore.logs].reverse()
  if (!searchQuery.value.trim()) return entries
  var q = searchQuery.value.toLowerCase()
  return entries.filter(entry => {
    var msg = entryMsg(entry).toLowerCase()
    var data = entry.data ? JSON.stringify(entry.data).toLowerCase() : ''
    return msg.includes(q) || data.includes(q)
  })
})

// Level counts for summary
const levelCounts = computed(() => {
  var counts = { error: 0, warn: 0, info: 0, debug: 0 }
  for (var entry of logsStore.logs) {
    var lvl = entry.level || 'info'
    if (lvl === 'warning') lvl = 'warn'
    if (counts[lvl] !== undefined) counts[lvl]++
  }
  return counts
})

async function fetchLogs() {
  await logsStore.fetch(selectedLevel.value, selectedLimit.value)
}

function setLevel(level) {
  selectedLevel.value = level
  fetchLogs()
}

function setLimit(limit) {
  selectedLimit.value = limit
  fetchLogs()
}

function toggleAutoRefresh() {
  autoRefresh.value = !autoRefresh.value
  if (autoRefresh.value) {
    autoRefreshTimer = setInterval(fetchLogs, 5000)
  } else {
    clearInterval(autoRefreshTimer)
    autoRefreshTimer = null
  }
}

function clearSearch() {
  searchQuery.value = ''
}

onMounted(() => {
  fetchLogs()
})

onUnmounted(() => {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer)
  }
})
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-lg font-semibold text-nutbits-100">Logs</h1>
        <p class="text-xs text-nutbits-500 mt-0.5">Runtime log output from NUTbits. Sensitive values are automatically redacted.</p>
      </div>
      <div class="flex items-center gap-2">
        <button
          class="px-3 py-1.5 text-xs rounded-lg font-medium transition-all"
          :class="autoRefresh
            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            : 'bg-nutbits-800 text-nutbits-400 hover:text-nutbits-100 border border-nutbits-700'"
          @click="toggleAutoRefresh"
        >
          {{ autoRefresh ? 'Live' : 'Paused' }}
        </button>
        <button
          class="bg-nutbits-800 hover:bg-nutbits-700 text-nutbits-100 font-medium rounded-lg px-3 py-1.5 transition-all text-xs border border-nutbits-700"
          @click="fetchLogs"
        >
          Refresh
        </button>
      </div>
    </div>

    <!-- Summary + filters -->
    <div class="bg-nutbits-900 border border-nutbits-700 rounded-xl p-4 space-y-3">
      <!-- Level counts -->
      <div class="flex items-center gap-4">
        <div class="flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-red-500" />
          <span class="text-xs text-nutbits-400">Errors</span>
          <span class="text-xs text-nutbits-100 font-semibold tabular-nums">{{ levelCounts.error }}</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-yellow-500" />
          <span class="text-xs text-nutbits-400">Warnings</span>
          <span class="text-xs text-nutbits-100 font-semibold tabular-nums">{{ levelCounts.warn }}</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-blue-500" />
          <span class="text-xs text-nutbits-400">Info</span>
          <span class="text-xs text-nutbits-100 font-semibold tabular-nums">{{ levelCounts.info }}</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-nutbits-600" />
          <span class="text-xs text-nutbits-400">Debug</span>
          <span class="text-xs text-nutbits-100 font-semibold tabular-nums">{{ levelCounts.debug }}</span>
        </div>
        <span class="flex-1" />
        <span class="text-[10px] text-nutbits-600 tabular-nums">{{ filteredLogs.length }} of {{ logsStore.logs.length }} entries</span>
      </div>

      <!-- Filters row -->
      <div class="flex flex-wrap items-center gap-3">
        <!-- Level buttons -->
        <div class="flex rounded-md overflow-hidden border border-nutbits-700">
          <button
            v-for="level in levels"
            :key="level"
            class="px-3 py-1.5 text-xs font-medium transition-all"
            :class="[
              selectedLevel === level
                ? 'bg-amber-500 text-nutbits-950'
                : 'bg-nutbits-800 text-nutbits-400 hover:text-nutbits-100',
              level !== levels[0] ? 'border-l border-nutbits-700' : '',
            ]"
            @click="setLevel(level)"
          >
            {{ level }}
          </button>
        </div>

        <!-- Limit buttons -->
        <div class="flex rounded-md overflow-hidden border border-nutbits-700">
          <button
            v-for="limit in limits"
            :key="limit"
            class="px-2.5 py-1.5 text-xs font-medium transition-all"
            :class="[
              selectedLimit === limit
                ? 'bg-amber-500 text-nutbits-950'
                : 'bg-nutbits-800 text-nutbits-400 hover:text-nutbits-100',
              limit !== limits[0] ? 'border-l border-nutbits-700' : '',
            ]"
            @click="setLimit(limit)"
          >
            {{ limit }}
          </button>
        </div>

        <!-- Search -->
        <div class="flex-1 min-w-[180px] relative">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Filter logs..."
            class="w-full bg-nutbits-800 border border-nutbits-700 rounded-lg px-3 py-1.5 text-xs text-nutbits-100 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 outline-none placeholder:text-nutbits-600 pr-7"
          />
          <button
            v-if="searchQuery"
            class="absolute right-2 top-1/2 -translate-y-1/2 text-nutbits-500 hover:text-nutbits-200 text-xs transition-colors"
            @click="clearSearch"
          >
            &times;
          </button>
        </div>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="logsStore.loading && !logsStore.logs.length" class="flex justify-center py-20">
      <Spinner />
    </div>

    <!-- Empty -->
    <EmptyState
      v-else-if="!logsStore.logs.length"
      title="No log entries"
      description="No logs found for the selected filter level. Try a broader filter or select 'debug' to see everything."
    />

    <!-- No search results -->
    <div v-else-if="filteredLogs.length === 0" class="bg-nutbits-900 border border-nutbits-700 rounded-xl px-5 py-8 text-center">
      <p class="text-nutbits-400 text-sm">No logs matching "{{ searchQuery }}"</p>
      <button class="text-amber-400 hover:text-amber-300 text-xs mt-2 transition-colors" @click="clearSearch">Clear filter</button>
    </div>

    <!-- Log entries -->
    <div v-else class="bg-nutbits-900 border border-nutbits-700 rounded-xl overflow-hidden">
      <div class="divide-y divide-nutbits-800/60">
        <div
          v-for="(entry, idx) in filteredLogs"
          :key="idx"
          class="border-l-[3px] transition-colors"
          :class="[
            levelStyle(entry.level).border,
            levelStyle(entry.level).bg,
            entry.data ? 'cursor-pointer hover:bg-nutbits-800/30' : '',
          ]"
          @click="entry.data ? toggleExpand(idx) : null"
        >
          <!-- Main row -->
          <div class="flex items-start gap-3 px-4 py-2.5">
            <!-- Timestamp -->
            <div class="flex-shrink-0 text-[11px] font-mono text-nutbits-500 pt-px w-[100px]">
              <span class="text-nutbits-600 block leading-none">{{ formatDate(entryTs(entry)) }}</span>
              <span class="leading-none">{{ formatTimestamp(entryTs(entry)) }}</span>
            </div>

            <!-- Level -->
            <div class="flex-shrink-0 w-[52px] pt-px">
              <span
                class="text-[10px] font-bold uppercase tracking-wider"
                :class="{
                  'text-red-400': entry.level === 'error',
                  'text-yellow-400': entry.level === 'warn' || entry.level === 'warning',
                  'text-blue-400': entry.level === 'info',
                  'text-nutbits-500': entry.level === 'debug',
                }"
              >
                {{ (entry.level || 'info').toUpperCase() }}
              </span>
            </div>

            <!-- Message -->
            <p class="flex-1 text-[13px] font-mono text-nutbits-200 break-words leading-relaxed">{{ entryMsg(entry) }}</p>

            <!-- Data indicator -->
            <span
              v-if="entry.data"
              class="text-nutbits-600 text-[10px] flex-shrink-0 pt-1 font-mono"
            >
              {{ expandedRows.has(idx) ? '&#9660;' : '{ }' }}
            </span>
          </div>

          <!-- Expanded data payload -->
          <div
            v-if="entry.data && expandedRows.has(idx)"
            class="px-4 pb-3"
          >
            <div class="ml-[100px] pl-3 border-l-2 border-nutbits-700/50">
              <div class="flex items-center justify-between mb-1.5">
                <span class="text-[10px] text-nutbits-500 uppercase tracking-wider">Payload</span>
                <span class="text-[10px] text-nutbits-600" :title="formatFullDate(entryTs(entry))">{{ formatFullDate(entryTs(entry)) }}</span>
              </div>
              <pre class="text-[11px] font-mono text-nutbits-400 bg-nutbits-800 rounded-lg p-3 overflow-x-auto max-h-64 overflow-y-auto leading-relaxed">{{ formatJson(entry.data) }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Error -->
    <div
      v-if="logsStore.error"
      class="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400"
    >
      {{ logsStore.error }}
    </div>
  </div>
</template>
