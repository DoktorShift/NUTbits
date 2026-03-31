<script setup>
import { ref, computed, watch } from 'vue'
import { useBalanceStore } from '@/stores/balance.js'
import { useStatusStore } from '@/stores/status.js'
import { useToast } from '@/composables/useToast.js'
import api from '@/api/client.js'
import Badge from '@/components/ui/Badge.vue'
import Spinner from '@/components/ui/Spinner.vue'

const balanceStore = useBalanceStore()
const statusStore = useStatusStore()
const { addToast } = useToast()

const input = ref('')
const lnAmount = ref('')
const paying = ref(false)
const payResult = ref(null)
const payError = ref(null)

// ── Lightning Address resolution ────────────────────────────────────────
const lnAddrMeta = ref(null)
const lnAddrResolving = ref(false)
const lnAddrError = ref(null)
const showAdvancedMeta = ref(false)
let resolveDebounce = null

// ── Input detection ─────────────────────────────────────────────────────
const LN_ADDR_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

const inputType = computed(() => {
  const val = input.value.trim().toLowerCase()
  if (!val) return 'empty'
  if (LN_ADDR_RE.test(val)) return 'lnaddr'
  if (val.startsWith('lnbc') || val.startsWith('lntb') || val.startsWith('lnbcrt')) return 'bolt11'
  return 'unknown'
})

// Auto-resolve Lightning Address after the user stops typing
watch(input, () => {
  if (resolveDebounce) clearTimeout(resolveDebounce)
  // Clear stale metadata when input changes
  if (lnAddrMeta.value && lnAddrMeta.value.address !== input.value.trim().toLowerCase()) {
    lnAddrMeta.value = null
  }
  lnAddrError.value = null

  if (inputType.value === 'lnaddr') {
    resolveDebounce = setTimeout(() => resolveLnAddr(input.value.trim()), 800)
  } else {
    lnAddrMeta.value = null
    showAdvancedMeta.value = false
  }
})

async function resolveLnAddr(address) {
  lnAddrResolving.value = true
  lnAddrError.value = null
  lnAddrMeta.value = null
  try {
    const data = await api.get(`/api/v1/lnurl/resolve?address=${encodeURIComponent(address)}`)
    lnAddrMeta.value = data
  } catch (err) {
    lnAddrError.value = err.message || 'Could not resolve address'
  } finally {
    lnAddrResolving.value = false
  }
}

// ── BOLT11 decoding ─────────────────────────────────────────────────────
const decodedInfo = computed(() => {
  if (inputType.value !== 'bolt11') return null
  const raw = input.value.trim().toLowerCase()
  try {
    const hrp = raw.match(/^(lnbc|lntb|lnbcrt)(\d+)([munp]?)/)
    if (!hrp) return null
    const n = parseInt(hrp[2], 10)
    const m = hrp[3]
    let sats = 0
    if (m === 'm') sats = n * 100000
    else if (m === 'u') sats = n * 100
    else if (m === 'n') sats = n / 10
    else if (m === 'p') sats = n / 10000
    else sats = n * 100000000
    return { amount_sats: Math.round(sats) }
  } catch { return null }
})

// ── Derived state ───────────────────────────────────────────────────────
const effectiveAmount = computed(() => {
  if (inputType.value === 'lnaddr') return Number(lnAmount.value) || 0
  if (decodedInfo.value) return decodedInfo.value.amount_sats
  return 0
})

const canPay = computed(() => {
  if (paying.value) return false
  if (inputType.value === 'lnaddr') {
    if (!lnAddrMeta.value) return false
    if (effectiveAmount.value <= 0) return false
    if (lnAddrMeta.value.min_sats && effectiveAmount.value < lnAddrMeta.value.min_sats) return false
    if (lnAddrMeta.value.max_sats && effectiveAmount.value > lnAddrMeta.value.max_sats) return false
    return true
  }
  if (inputType.value === 'bolt11') return input.value.trim().length > 20
  return false
})

const insufficientBalance = computed(() => effectiveAmount.value > 0 && effectiveAmount.value > balanceStore.total_sats)

const amountOutOfRange = computed(() => {
  if (inputType.value !== 'lnaddr' || !lnAddrMeta.value || effectiveAmount.value <= 0) return null
  if (lnAddrMeta.value.min_sats && effectiveAmount.value < lnAddrMeta.value.min_sats) return `Minimum: ${lnAddrMeta.value.min_sats.toLocaleString()} sats`
  if (lnAddrMeta.value.max_sats && effectiveAmount.value > lnAddrMeta.value.max_sats) return `Maximum: ${lnAddrMeta.value.max_sats.toLocaleString()} sats`
  return null
})

// ── Presets ──────────────────────────────────────────────────────────────
const presets = [100, 500, 1000, 5000, 10000, 50000]
function setPreset(val) { lnAmount.value = val }

// ── Actions ─────────────────────────────────────────────────────────────
async function submitPayment() {
  const val = input.value.trim()
  if (!val) { addToast('Paste an invoice or enter a Lightning Address', 'error'); return }

  paying.value = true
  payResult.value = null
  payError.value = null

  try {
    var body = { invoice: val }
    if (inputType.value === 'lnaddr') body.amount_sats = Number(lnAmount.value)
    const result = await api.post('/api/v1/pay', body)
    payResult.value = result
    balanceStore.fetch()
    addToast('Payment sent', 'success')
  } catch (err) {
    payError.value = err.message || 'Payment failed'
    addToast(payError.value, 'error')
  } finally { paying.value = false }
}

function reset() {
  input.value = ''; lnAmount.value = ''; payResult.value = null; payError.value = null
  lnAddrMeta.value = null; lnAddrError.value = null; showAdvancedMeta.value = false
}

const activeMintName = computed(() => statusStore.status?.mint?.name || null)

balanceStore.fetch()
statusStore.fetch()
</script>

<template>
  <div class="max-w-xl mx-auto space-y-4">
    <!-- ── PAYING STATE ─────────────────────────────────────────────── -->
    <div v-if="paying" class="bg-nutbits-900 border border-nutbits-700 rounded-xl p-12 flex flex-col items-center gap-4">
      <Spinner />
      <p class="text-nutbits-300 text-sm">
        {{ inputType === 'lnaddr' ? 'Resolving address and sending...' : 'Sending payment...' }}
      </p>
    </div>

    <!-- ── SUCCESS STATE ────────────────────────────────────────────── -->
    <div v-else-if="payResult" class="space-y-4">
      <div class="bg-nutbits-900 border border-emerald-500/30 rounded-xl overflow-hidden">
        <span class="block h-0.5 bg-emerald-500" />
        <div class="p-6 space-y-5">
          <div class="flex items-center gap-3">
            <span class="w-10 h-10 rounded-full bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
              <svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
              </svg>
            </span>
            <div>
              <h2 class="text-lg font-semibold text-nutbits-100">Payment Sent</h2>
              <p v-if="payResult.lud16" class="text-xs text-nutbits-500">to {{ payResult.lud16 }}</p>
              <p v-else class="text-xs text-nutbits-500">Lightning payment completed</p>
            </div>
          </div>

          <div class="text-center py-2">
            <p class="text-3xl font-bold text-nutbits-100 tabular-nums">{{ (payResult.amount_sats || 0).toLocaleString() }}</p>
            <p class="text-xs text-nutbits-500 mt-1">sats sent</p>
          </div>

          <div class="bg-nutbits-800/60 rounded-lg divide-y divide-nutbits-700/50">
            <div v-if="payResult.fees_paid || payResult.routing_fee" class="flex items-center justify-between px-4 py-2.5 text-sm">
              <span class="text-nutbits-500">Routing fee</span>
              <span class="text-nutbits-200 tabular-nums">{{ Math.floor((payResult.fees_paid || payResult.routing_fee || 0) / 1000) }} sats</span>
            </div>
            <div v-if="payResult.service_fee_sats" class="flex items-center justify-between px-4 py-2.5 text-sm">
              <span class="text-nutbits-500">Service fee</span>
              <span class="text-nutbits-200 tabular-nums">{{ payResult.service_fee_sats }} sats</span>
            </div>
            <div class="flex items-center justify-between px-4 py-2.5 text-sm">
              <span class="text-nutbits-500">Remaining balance</span>
              <span class="text-nutbits-100 font-semibold tabular-nums">{{ (payResult.balance_sats || 0).toLocaleString() }} sats</span>
            </div>
          </div>

          <div v-if="payResult.preimage" class="text-xs">
            <span class="text-nutbits-600">Preimage</span>
            <p class="text-nutbits-400 font-mono break-all mt-1 bg-nutbits-800 rounded px-3 py-2 select-all">{{ payResult.preimage }}</p>
          </div>
        </div>
      </div>

      <button
        class="w-full bg-nutbits-800 hover:bg-nutbits-700 text-nutbits-100 font-medium rounded-lg px-4 py-2.5 transition-all border border-nutbits-700 text-sm"
        @click="reset"
      >
        Pay Another
      </button>
    </div>

    <!-- ── INPUT STATE ──────────────────────────────────────────────── -->
    <template v-else>
      <div class="bg-nutbits-900 border border-nutbits-700 rounded-xl overflow-hidden">
        <!-- Header -->
        <div class="px-5 pt-5 pb-3 flex items-center justify-between">
          <h1 class="text-lg font-semibold text-nutbits-100">Send</h1>
          <div class="text-right">
            <p class="text-xs text-nutbits-500">{{ activeMintName || 'Balance' }}</p>
            <p class="text-sm font-semibold text-nutbits-100 tabular-nums">{{ balanceStore.formattedTotal }} sats</p>
          </div>
        </div>

        <div class="px-5 pb-5 space-y-4">
          <!-- Input -->
          <div>
            <label class="block text-xs text-nutbits-500 mb-1.5">Invoice or Lightning Address</label>
            <textarea
              v-model="input"
              rows="3"
              placeholder="lnbc... or user@domain.com"
              class="w-full bg-nutbits-800 border border-nutbits-700 rounded-lg px-4 py-3 text-nutbits-100 font-mono text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 outline-none placeholder:text-nutbits-600 resize-none leading-relaxed"
              @keydown.ctrl.enter="submitPayment"
              @keydown.meta.enter="submitPayment"
            />
            <div class="flex items-center gap-2 mt-1.5">
              <Badge v-if="inputType === 'lnaddr'" variant="info" label="Lightning Address" />
              <Badge v-else-if="inputType === 'bolt11'" variant="warning" label="BOLT11 Invoice" />
              <span v-if="inputType === 'unknown' && input.trim()" class="text-[10px] text-red-400">Not recognized</span>
            </div>
          </div>

          <!-- ── Lightning Address: resolved metadata ──────────────── -->
          <template v-if="inputType === 'lnaddr'">
            <!-- Resolving spinner -->
            <div v-if="lnAddrResolving" class="flex items-center gap-2 text-nutbits-400 text-xs py-2">
              <span class="w-3 h-3 border-2 border-nutbits-600 border-t-amber-500 rounded-full animate-spin" />
              Resolving {{ input.trim().split('@')[1] }}...
            </div>

            <!-- Resolution error -->
            <div v-else-if="lnAddrError" class="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
              <p class="text-red-400 text-sm">{{ lnAddrError }}</p>
            </div>

            <!-- Resolved metadata card -->
            <div v-else-if="lnAddrMeta" class="space-y-4">
              <div class="bg-nutbits-800/60 border border-emerald-500/20 rounded-lg overflow-hidden">
                <!-- Resolved header -->
                <div class="px-4 py-3 flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full bg-emerald-500" />
                    <span class="text-sm text-nutbits-100 font-medium">{{ lnAddrMeta.address }}</span>
                  </div>
                  <span class="text-[10px] text-nutbits-500">{{ lnAddrMeta.domain }}</span>
                </div>

                <!-- Key info -->
                <div class="px-4 pb-3 space-y-1.5">
                  <div v-if="lnAddrMeta.description" class="text-xs text-nutbits-300">
                    {{ lnAddrMeta.description }}
                  </div>
                  <div class="flex items-center gap-3 text-[10px] text-nutbits-500">
                    <span>{{ lnAddrMeta.min_sats.toLocaleString() }} - {{ lnAddrMeta.max_sats.toLocaleString() }} sats</span>
                    <Badge v-if="lnAddrMeta.allows_nostr" variant="info" label="Nostr" />
                    <span v-if="lnAddrMeta.comment_allowed">comments OK</span>
                  </div>
                </div>

                <!-- Advanced metadata (collapsed) -->
                <div class="border-t border-nutbits-700/50">
                  <button
                    class="w-full px-4 py-2 text-[10px] text-nutbits-500 hover:text-nutbits-300 transition-colors text-left"
                    @click="showAdvancedMeta = !showAdvancedMeta"
                  >
                    {{ showAdvancedMeta ? 'Hide details' : 'Show details' }}
                  </button>
                  <div v-if="showAdvancedMeta" class="px-4 pb-3 space-y-1 text-[10px]">
                    <div class="flex justify-between">
                      <span class="text-nutbits-500">Min sendable</span>
                      <span class="text-nutbits-300 tabular-nums">{{ lnAddrMeta.min_sats.toLocaleString() }} sats</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-nutbits-500">Max sendable</span>
                      <span class="text-nutbits-300 tabular-nums">{{ lnAddrMeta.max_sats.toLocaleString() }} sats</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-nutbits-500">Nostr zaps</span>
                      <span class="text-nutbits-300">{{ lnAddrMeta.allows_nostr ? 'Supported' : 'Not supported' }}</span>
                    </div>
                    <div v-if="lnAddrMeta.nostr_pubkey" class="flex justify-between">
                      <span class="text-nutbits-500">Nostr pubkey</span>
                      <span class="text-nutbits-300 font-mono truncate max-w-[200px]">{{ lnAddrMeta.nostr_pubkey }}</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-nutbits-500">Comments</span>
                      <span class="text-nutbits-300">{{ lnAddrMeta.comment_allowed ? `Up to ${lnAddrMeta.comment_allowed} chars` : 'Not supported' }}</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-nutbits-500">LNURL callback</span>
                      <span class="text-nutbits-300">{{ lnAddrMeta.callback ? 'Valid' : 'Missing' }}</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Amount input -->
              <div>
                <label class="block text-xs text-nutbits-500 mb-1.5">Amount to send (sats)</label>
                <input
                  v-model.number="lnAmount"
                  type="number"
                  :min="lnAddrMeta.min_sats || 1"
                  :max="lnAddrMeta.max_sats"
                  placeholder="0"
                  class="w-full bg-nutbits-800 border border-nutbits-700 rounded-lg px-4 py-4 text-nutbits-100 text-3xl font-bold text-center tabular-nums focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 outline-none placeholder:text-nutbits-700"
                />
              </div>

              <!-- Quick presets -->
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="p in presets"
                  :key="p"
                  class="flex-1 min-w-[60px] bg-nutbits-800 hover:bg-nutbits-700 text-nutbits-300 text-xs font-medium rounded-lg py-2 transition-all border"
                  :class="[
                    Number(lnAmount) === p ? 'border-amber-500/50 text-amber-400' : 'border-nutbits-700',
                    (lnAddrMeta.min_sats && p < lnAddrMeta.min_sats) || (lnAddrMeta.max_sats && p > lnAddrMeta.max_sats) ? 'opacity-30 cursor-not-allowed' : ''
                  ]"
                  :disabled="(lnAddrMeta.min_sats && p < lnAddrMeta.min_sats) || (lnAddrMeta.max_sats && p > lnAddrMeta.max_sats)"
                  @click="setPreset(p)"
                >
                  {{ p >= 1000 ? `${p / 1000}k` : p }}
                </button>
              </div>

              <!-- Range / balance warnings -->
              <div v-if="amountOutOfRange" class="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-2.5">
                <p class="text-amber-400 text-xs">{{ amountOutOfRange }}</p>
              </div>
              <div v-if="insufficientBalance && effectiveAmount > 0" class="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5">
                <p class="text-red-400 text-xs">Insufficient balance. You have {{ balanceStore.formattedTotal }} sats.</p>
              </div>
            </div>
          </template>

          <!-- ── BOLT11: decoded preview ───────────────────────────── -->
          <div
            v-if="inputType === 'bolt11' && decodedInfo"
            class="flex items-center justify-between bg-nutbits-800/60 border rounded-lg px-4 py-3"
            :class="insufficientBalance ? 'border-red-500/40' : 'border-nutbits-700'"
          >
            <div>
              <p class="text-xs text-nutbits-500">Invoice amount</p>
              <p class="text-xl font-bold tabular-nums" :class="insufficientBalance ? 'text-red-400' : 'text-nutbits-100'">
                {{ decodedInfo.amount_sats.toLocaleString() }} <span class="text-sm font-normal text-nutbits-500">sats</span>
              </p>
            </div>
            <Badge v-if="insufficientBalance" variant="error" label="Insufficient balance" />
          </div>

          <!-- Error -->
          <div v-if="payError" class="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
            <p class="text-red-400 text-sm">{{ payError }}</p>
          </div>

          <!-- Pay button -->
          <button
            class="w-full bg-amber-500 hover:bg-amber-600 text-nutbits-950 font-semibold rounded-lg py-3.5 text-base transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            :disabled="!canPay || insufficientBalance"
            @click="submitPayment"
          >
            <template v-if="inputType === 'lnaddr' && effectiveAmount > 0 && lnAddrMeta">
              Send {{ effectiveAmount.toLocaleString() }} sats to {{ input.trim().split('@')[0] }}
            </template>
            <template v-else-if="inputType === 'lnaddr' && lnAddrResolving">
              Resolving...
            </template>
            <template v-else-if="decodedInfo">
              Send {{ decodedInfo.amount_sats.toLocaleString() }} sats
            </template>
            <template v-else>
              Pay
            </template>
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
