<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useBalanceStore } from '@/stores/balance.js'
import { useStatusStore } from '@/stores/status.js'
import { useMintsStore } from '@/stores/mints.js'
import { useToast } from '@/composables/useToast.js'
import api from '@/api/client.js'
import Spinner from '@/components/ui/Spinner.vue'

const balanceStore = useBalanceStore()
const statusStore = useStatusStore()
const mintsStore = useMintsStore()
const { addToast } = useToast()

const amountSats = ref('')
const selectedMint = ref('')
const creating = ref(false)
const createError = ref(null)
const invoiceData = ref(null)
const checkingPayment = ref(false)
const paymentReceived = ref(false)
const pollTimer = ref(null)

const canCreate = computed(() => Number(amountSats.value) > 0 && !creating.value)
const mintUrl = computed(() => statusStore.status?.mint?.url || '--')
const isMultiMint = computed(() => (mintsStore.mints || []).length > 1)
const mintOptions = computed(() => (mintsStore.mints || []).filter((m) => m.healthy !== false))

// ── Preset amounts ──────────────────────────────────────────────────────
const presets = [100, 500, 1000, 5000, 10000, 50000]

function setPreset(val) { amountSats.value = val }

// ── Invoice creation ────────────────────────────────────────────────────
async function createInvoice() {
  const amt = Number(amountSats.value)
  if (!amt || amt <= 0) { addToast('Enter an amount', 'error'); return }
  creating.value = true
  createError.value = null
  invoiceData.value = null
  paymentReceived.value = false
  try {
    const body = { amount_sats: amt }
    if (selectedMint.value) body.mint = selectedMint.value
    const result = await api.post('/api/v1/receive', body)
    invoiceData.value = result
    addToast('Invoice created', 'success')
    startPolling()
  } catch (err) {
    createError.value = err.message || 'Failed to create invoice'
    addToast(createError.value, 'error')
  } finally { creating.value = false }

  if (invoiceData.value) { await nextTick(); renderQR() }
}

// ── Payment polling ─────────────────────────────────────────────────────
function startPolling() { stopPolling(); pollTimer.value = setInterval(checkPayment, 5000) }
function stopPolling() { if (pollTimer.value) { clearInterval(pollTimer.value); pollTimer.value = null } }

async function checkPayment() {
  if (!invoiceData.value || paymentReceived.value) { stopPolling(); return }
  checkingPayment.value = true
  try {
    const result = await api.post('/api/v1/receive/check', {
      quote_id: invoiceData.value.quote_id,
      invoice: invoiceData.value.invoice,
      mint: invoiceData.value.mint,
    })
    if (result.paid) {
      paymentReceived.value = true
      stopPolling()
      balanceStore.fetch()
      addToast('Payment received!', 'success')
    }
  } catch { /* retry on next poll */ }
  finally { checkingPayment.value = false }
}

async function manualCheck() { checkingPayment.value = true; await checkPayment() }

// ── QR rendering ────────────────────────────────────────────────────────
async function renderQR() {
  if (!invoiceData.value?.invoice) return
  const canvas = document.getElementById('qr-canvas')
  if (!canvas) return
  try {
    const QRModule = await import('qrcode')
    const QRCode = QRModule.default || QRModule
    await QRCode.toCanvas(canvas, invoiceData.value.invoice.toUpperCase(), {
      width: 240,
      margin: 2,
      color: { dark: '#e8e0d8', light: '#1a1918' },
    })
  } catch {
    const ctx = canvas.getContext('2d')
    if (ctx) {
      canvas.width = 240; canvas.height = 240
      ctx.fillStyle = '#252321'; ctx.fillRect(0, 0, 240, 240)
      ctx.fillStyle = '#8a8078'; ctx.font = '12px monospace'; ctx.textAlign = 'center'
      ctx.fillText('QR unavailable', 120, 120)
    }
  }
}

async function copyToClipboard(text) {
  try { await navigator.clipboard.writeText(text); addToast('Copied', 'success') }
  catch { addToast('Failed to copy', 'error') }
}

function reset() {
  stopPolling(); amountSats.value = ''; invoiceData.value = null
  paymentReceived.value = false; createError.value = null; selectedMint.value = ''
}

onUnmounted(() => stopPolling())
onMounted(() => {
  balanceStore.fetch()
  statusStore.fetch()
  mintsStore.fetch()
})
</script>

<template>
  <div class="max-w-xl mx-auto space-y-4">
    <!-- ── CREATING STATE ───────────────────────────────────────────── -->
    <div v-if="creating" class="bg-nutbits-900 border border-nutbits-700 rounded-xl p-12 flex flex-col items-center gap-4">
      <Spinner />
      <p class="text-nutbits-300 text-sm">Creating invoice...</p>
    </div>

    <!-- ── PAYMENT RECEIVED ─────────────────────────────────────────── -->
    <div v-else-if="paymentReceived" class="space-y-4">
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
              <h2 class="text-lg font-semibold text-nutbits-100">Payment Received</h2>
              <p class="text-xs text-nutbits-500">Funds added to your wallet</p>
            </div>
          </div>

          <div class="text-center py-2">
            <p class="text-3xl font-bold text-emerald-400 tabular-nums">+{{ (invoiceData?.amount_sats || 0).toLocaleString() }}</p>
            <p class="text-xs text-nutbits-500 mt-1">sats received</p>
          </div>

          <div class="bg-nutbits-800/60 rounded-lg px-4 py-3 flex items-center justify-between text-sm">
            <span class="text-nutbits-500">Updated balance</span>
            <span class="text-nutbits-100 font-semibold tabular-nums">{{ balanceStore.formattedTotal }} sats</span>
          </div>
        </div>
      </div>

      <button
        class="w-full bg-nutbits-800 hover:bg-nutbits-700 text-nutbits-100 font-medium rounded-lg px-4 py-2.5 transition-all border border-nutbits-700 text-sm"
        @click="reset"
      >
        Receive More
      </button>
    </div>

    <!-- ── INVOICE CREATED, WAITING ─────────────────────────────────── -->
    <div v-else-if="invoiceData" class="space-y-4">
      <div class="bg-nutbits-900 border border-amber-500/30 rounded-xl overflow-hidden">
        <span class="block h-0.5 bg-amber-500" />

        <div class="p-5 space-y-4">
          <!-- Header -->
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-lg font-semibold text-nutbits-100">Waiting for Payment</h2>
              <p class="text-xs text-nutbits-500 font-mono mt-0.5">{{ (invoiceData.mint || mintUrl).replace(/^https?:\/\//, '') }}</p>
            </div>
            <div class="text-right">
              <p class="text-xl font-bold text-nutbits-100 tabular-nums">{{ (invoiceData.amount_sats || 0).toLocaleString() }}</p>
              <p class="text-[10px] text-nutbits-500">sats</p>
            </div>
          </div>

          <!-- QR Code - centered, prominent -->
          <div class="flex justify-center py-2">
            <div class="bg-nutbits-800 border border-nutbits-700 rounded-xl p-3">
              <canvas id="qr-canvas" />
            </div>
          </div>

          <!-- Invoice string -->
          <div class="relative">
            <div class="bg-nutbits-800 border border-nutbits-700 rounded-lg p-3 font-mono text-[11px] text-nutbits-300 break-all select-all leading-relaxed max-h-24 overflow-y-auto">
              {{ invoiceData.invoice }}
            </div>
            <button
              class="absolute top-2 right-2 bg-nutbits-700 hover:bg-nutbits-600 text-nutbits-100 rounded-md px-2.5 py-1 text-xs transition-all"
              @click="copyToClipboard(invoiceData.invoice)"
            >
              Copy
            </button>
          </div>

          <!-- Polling status -->
          <div class="flex items-center justify-between bg-nutbits-800/60 rounded-lg px-4 py-2.5">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span class="text-nutbits-400 text-xs">Checking every 5s...</span>
            </div>
            <button
              class="text-amber-400 hover:text-amber-300 text-xs font-medium transition-colors disabled:opacity-50"
              :disabled="checkingPayment"
              @click="manualCheck"
            >
              {{ checkingPayment ? 'Checking...' : 'Check now' }}
            </button>
          </div>
        </div>
      </div>

      <button
        class="w-full text-nutbits-500 hover:text-nutbits-300 text-xs transition-colors py-2"
        @click="reset"
      >
        Cancel and start over
      </button>
    </div>

    <!-- ── INPUT STATE ──────────────────────────────────────────────── -->
    <template v-else>
      <div class="bg-nutbits-900 border border-nutbits-700 rounded-xl overflow-hidden">
        <!-- Header -->
        <div class="px-5 pt-5 pb-3 flex items-center justify-between">
          <h1 class="text-lg font-semibold text-nutbits-100">Receive</h1>
          <div class="text-right">
            <p class="text-xs text-nutbits-500">Balance</p>
            <p class="text-sm font-semibold text-nutbits-100 tabular-nums">{{ balanceStore.formattedTotal }} sats</p>
          </div>
        </div>

        <div class="px-5 pb-5 space-y-4">
          <!-- Amount input -->
          <div>
            <label class="block text-xs text-nutbits-500 mb-1.5">Amount (sats)</label>
            <input
              v-model.number="amountSats"
              type="number"
              min="1"
              placeholder="0"
              class="w-full bg-nutbits-800 border border-nutbits-700 rounded-lg px-4 py-4 text-nutbits-100 text-3xl font-bold text-center tabular-nums focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 outline-none placeholder:text-nutbits-700"
              @keydown.enter="createInvoice"
            />
          </div>

          <!-- Quick amount presets -->
          <div class="flex flex-wrap gap-2">
            <button
              v-for="p in presets"
              :key="p"
              class="flex-1 min-w-[60px] bg-nutbits-800 hover:bg-nutbits-700 text-nutbits-300 text-xs font-medium rounded-lg py-2 transition-all border"
              :class="Number(amountSats) === p ? 'border-amber-500/50 text-amber-400' : 'border-nutbits-700'"
              @click="setPreset(p)"
            >
              {{ p >= 1000 ? `${p / 1000}k` : p }}
            </button>
          </div>

          <!-- Mint selector (multi-mint only) -->
          <div v-if="isMultiMint">
            <label class="block text-xs text-nutbits-500 mb-1.5">Receive at mint</label>
            <select
              v-model="selectedMint"
              class="w-full bg-nutbits-800 border border-nutbits-700 rounded-lg px-4 py-2.5 text-nutbits-100 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 outline-none"
            >
              <option value="">Active mint (default)</option>
              <option v-for="mint in mintOptions" :key="mint.url" :value="mint.url">
                {{ mint.name || mint.url }} {{ mint.active ? '(active)' : '' }}
              </option>
            </select>
          </div>

          <!-- Error -->
          <div v-if="createError" class="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
            <p class="text-red-400 text-sm">{{ createError }}</p>
          </div>

          <!-- Create button -->
          <button
            class="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-lg py-3.5 text-base transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            :disabled="!canCreate"
            @click="createInvoice"
          >
            {{ Number(amountSats) > 0 ? `Create Invoice for ${Number(amountSats).toLocaleString()} sats` : 'Create Invoice' }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
