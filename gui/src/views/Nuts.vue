<script setup>
import { onMounted, computed } from 'vue'
import { useMintsStore } from '@/stores/mints.js'
import Badge from '@/components/ui/Badge.vue'
import Spinner from '@/components/ui/Spinner.vue'

const mintsStore = useMintsStore()

const NUT_LABELS = {
  '00': 'Cryptography',
  '01': 'Mint Public Keys',
  '02': 'Keysets',
  '03': 'Swap',
  '04': 'Mint (BOLT11)',
  '05': 'Melt (BOLT11)',
  '06': 'Mint Info',
  '07': 'Proof State Check',
  '08': 'Fee Return',
  '09': 'Signature Restore',
  '12': 'DLEQ Proofs',
  '13': 'Deterministic Secrets',
  '15': 'Partial Multi-Path',
  '17': 'WebSocket Subscriptions',
  '20': 'Signature on Mint',
}

const nutIds = Object.keys(NUT_LABELS)
const nutsData = computed(() => mintsStore.nuts || {})
const nutNames = computed(() => nutsData.value.nuts || NUT_LABELS)
const mintUrls = computed(() => Object.keys(nutsData.value.mints || {}))

function getNutSupport(mintUrl, nutId) {
  return nutsData.value.mints?.[mintUrl]?.nuts?.[nutId]
}

function getSupportCount(mintUrl) {
  const nuts = nutsData.value.mints?.[mintUrl]?.nuts || {}
  return Object.values(nuts).filter(Boolean).length
}

function shortUrl(url) {
  return url.replace(/^https?:\/\//, '').split('/')[0]
}

onMounted(() => {
  mintsStore.fetchNuts()
})
</script>

<template>
  <div class="space-y-5">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-bold text-nutbits-100">NUT Support</h2>
      <button
        class="bg-nutbits-800 hover:bg-nutbits-700 text-nutbits-100 font-medium rounded-lg px-4 py-2 transition-all text-sm"
        @click="mintsStore.fetchNuts()"
      >
        Refresh
      </button>
    </div>

    <div v-if="mintsStore.loading" class="flex justify-center py-16"><Spinner /></div>

    <template v-else-if="mintUrls.length">
      <div v-for="url in mintUrls" :key="url" class="bg-nutbits-900 border border-nutbits-700 rounded-xl p-5 space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <div class="flex items-center gap-2">
              <h3 class="text-nutbits-100 font-semibold">{{ shortUrl(url) }}</h3>
              <Badge :variant="nutsData.mints?.[url]?.active ? 'success' : 'default'" :label="nutsData.mints?.[url]?.active ? 'active' : 'standby'" />
            </div>
            <p class="text-nutbits-500 font-mono text-xs mt-0.5">{{ url }}</p>
          </div>
          <span class="text-nutbits-400 text-sm font-medium">{{ getSupportCount(url) }}/{{ nutIds.length }}</span>
        </div>

        <!-- Compact NUT indicator row -->
        <div class="flex flex-wrap gap-1 mb-2">
          <span
            v-for="nid in nutIds"
            :key="nid"
            class="inline-flex items-center justify-center w-7 h-5 rounded text-[10px] font-mono font-semibold"
            :class="getNutSupport(url, nid) ? 'bg-emerald-500/10 text-emerald-400' : 'bg-nutbits-800 text-nutbits-600'"
          >{{ nid }}</span>
        </div>

        <!-- Detail list -->
        <div class="border-t border-nutbits-800 pt-3 space-y-0.5">
          <div
            v-for="nid in nutIds"
            :key="nid"
            class="flex items-center gap-3 py-1"
            :class="getNutSupport(url, nid) ? '' : 'opacity-40'"
          >
            <span class="text-xs font-bold w-4 text-center" :class="getNutSupport(url, nid) ? 'text-emerald-400' : 'text-nutbits-600'">
              {{ getNutSupport(url, nid) ? '✓' : '✗' }}
            </span>
            <span class="text-nutbits-400 font-mono text-xs w-5">{{ nid }}</span>
            <span class="text-sm" :class="getNutSupport(url, nid) ? 'text-nutbits-100' : 'text-nutbits-500'">
              {{ nutNames[nid] || NUT_LABELS[nid] }}
            </span>
          </div>
        </div>
      </div>
    </template>

    <div v-else class="bg-nutbits-900 border border-nutbits-700 rounded-xl p-8 text-center">
      <p class="text-nutbits-400 text-sm">No NUT data available.</p>
      <p class="text-nutbits-500 text-xs mt-1">Make sure the backend is running on port 3338.</p>
    </div>
  </div>
</template>
