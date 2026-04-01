<script setup>
/**
 * DeepLinkConnect.vue — NIP-47 Deep Link Connection Handler
 *
 * Handles incoming NWC deep link requests from client apps.
 * URL formats:
 *   /connect?appname=X&appicon=URL&callback=SCHEME
 *   /connect?deeplink=web%2Bnostrnwc%3A%2F%2Fconnect%3F...  (protocol handler)
 *
 * Flow:
 *   1. Parse query params → show approval UI with app identity
 *   2. User reviews permissions, optionally configures limits
 *   3. Approve → POST /api/v1/connections (existing API, no backend changes)
 *   4. Redirect to callback?value={nwc_string}  (or show string if no callback)
 *
 * NUTbits is the NWC server (wallet side). It receives the deep link,
 * creates the connection keypair, and returns the pairing code.
 */
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useConnectionsStore } from '@/stores/connections.js'
import { useMintsStore } from '@/stores/mints.js'
import { useStatusStore } from '@/stores/status.js'
import { useToast } from '@/composables/useToast.js'
import api from '@/api/client.js'

const route = useRoute()
const vueRouter = useRouter()
const connectionsStore = useConnectionsStore()
const mintsStore = useMintsStore()
const statusStore = useStatusStore()
const { addToast } = useToast()

// ── Deep link param parsing ──────────────────────────────────────────
// Two entry modes:
//   1. Direct:           /connect?appname=X&appicon=URL&callback=SCHEME
//   2. Protocol handler: /connect?deeplink=web%2Bnostrnwc%3A%2F%2Fconnect%3Fappname%3DX...
const parsedParams = computed(() => {
  var q = route.query
  if (q.deeplink) {
    try {
      var decoded = decodeURIComponent(q.deeplink)
      var queryPart = decoded.includes('?') ? decoded.split('?').slice(1).join('?') : ''
      var params = new URLSearchParams(queryPart)
      return {
        appname: params.get('appname') || params.get('appName') || '',
        appicon: params.get('appicon') || params.get('appIcon') || '',
        callback: params.get('callback') || '',
      }
    } catch {
      return { appname: '', appicon: '', callback: '' }
    }
  }
  return {
    appname: q.appname || q.appName || '',
    appicon: q.appicon || q.appIcon || '',
    callback: q.callback || '',
  }
})

const appName = computed(() => parsedParams.value.appname || 'Unknown App')
const appIcon = computed(() => parsedParams.value.appicon)
const callbackUri = computed(() => parsedParams.value.callback)
const hasCallback = computed(() => !!callbackUri.value)

const nutbitsLogo = '/nutbits-logo.svg'

// ── Phase state machine ─────────────────────────────────────────────
//   idle → connecting → connected → redirecting
//   idle → denied
//   connecting → error
const phase = ref('idle')
const errorMsg = ref('')
const createdNwcString = ref('')
const createdConnection = ref(null)

// ── Permissions ─────────────────────────────────────────────────────
const PERMISSIONS = [
  { key: 'pay_invoice',        label: 'Pay Invoice',        desc: 'Send payments on your behalf' },
  { key: 'make_invoice',       label: 'Make Invoice',       desc: 'Create invoices to receive funds' },
  { key: 'get_balance',        label: 'Get Balance',        desc: 'Read current wallet balance' },
  { key: 'list_transactions',  label: 'List Transactions',  desc: 'View payment history' },
  { key: 'get_info',           label: 'Get Info',           desc: 'Read wallet and node metadata' },
  { key: 'lookup_invoice',     label: 'Lookup Invoice',     desc: 'Check status of specific invoices' },
]

var selected = ref(PERMISSIONS.map(p => p.key))

function isSelected(key) { return selected.value.includes(key) }
function toggle(key) {
  var i = selected.value.indexOf(key)
  if (i === -1) selected.value.push(key)
  else selected.value.splice(i, 1)
}

// ── Optional limits ─────────────────────────────────────────────────
var showLimits = ref(false)
var maxPaymentSats = ref(0)
var maxDailySats = ref(0)

// ── Mint selection ──────────────────────────────────────────────────
var selectedMint = ref('')

var mintOptions = computed(() => {
  var list = Array.isArray(mintsStore.mints) ? mintsStore.mints : []
  return list.map(m => ({
    url: m.url,
    label: m.name && m.name !== 'unknown' ? m.name : m.url,
    active: !!m.active || mintsStore.activeMint === m.url,
  }))
})

// ── Connection metadata for display after creation ──────────────────
var connectionMeta = computed(() => {
  var c = createdConnection.value
  if (!c) return null
  return {
    id: c.id,
    pubkey: c.app_pubkey,
    label: c.label,
    permissions: c.permissions || selected.value,
    mint: selectedMint.value || mintsStore.activeMint,
    lud16: c.lud16,
    maxPayment: maxPaymentSats.value || null,
    maxDaily: maxDailySats.value || null,
  }
})

// ── Actions ─────────────────────────────────────────────────────────

async function approve() {
  if (selected.value.length === 0) return
  phase.value = 'connecting'

  try {
    if (!mintsStore.mints?.length) await mintsStore.fetch()
    var mint = selectedMint.value || mintsStore.activeMint || mintsStore.mints?.[0]?.url || ''

    var payload = {
      label: `${appName.value} (deep link)`,
      permissions: selected.value,
      mint,
    }
    if (maxPaymentSats.value > 0) payload.max_payment_sats = Number(maxPaymentSats.value)
    if (maxDailySats.value > 0) payload.max_daily_sats = Number(maxDailySats.value)

    var result = await connectionsStore.create(payload)
    if (!result?.nwc_string) throw new Error('No NWC string in response')

    createdNwcString.value = result.nwc_string
    createdConnection.value = result
    phase.value = 'connected'

    // Auto-redirect after showing the success state
    if (hasCallback.value) {
      await new Promise(r => setTimeout(r, 1800))
      phase.value = 'redirecting'
      await new Promise(r => setTimeout(r, 400))
      var sep = callbackUri.value.includes('?') ? '&' : '?'
      window.location.href = `${callbackUri.value}${sep}value=${encodeURIComponent(result.nwc_string)}`
    }
  } catch (err) {
    phase.value = 'error'
    errorMsg.value = err.message || 'Connection failed'
    addToast(errorMsg.value, 'error')
  }
}

function deny() {
  phase.value = 'denied'
  setTimeout(() => vueRouter.push('/connections'), 1200)
}

function retry() {
  phase.value = 'idle'
  errorMsg.value = ''
}

async function copyNwc() {
  try {
    await navigator.clipboard.writeText(createdNwcString.value)
    addToast('NWC string copied', 'success')
  } catch {
    addToast('Copy failed', 'error')
  }
}

// ── Init ────────────────────────────────────────────────────────────

onMounted(async () => {
  var tokenResult = await api.autoDetectToken()
  if (tokenResult.ok) {
    await Promise.allSettled([mintsStore.fetch(), statusStore.fetch()])
    selectedMint.value = mintsStore.activeMint || mintsStore.mints?.[0]?.url || ''
  }
})
</script>

<template>
  <div class="dl">
    <div class="dl-bg" />

    <div class="dl-container">

      <!-- ── SVG: Connection Bridge ─────────────────────────────── -->
      <div class="bridge" :class="phase">
        <svg viewBox="0 0 400 160" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="b-path" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#f59e0b" />
              <stop offset="100%" stop-color="#d97706" />
            </linearGradient>
            <linearGradient id="b-done" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#34d399" />
              <stop offset="100%" stop-color="#10b981" />
            </linearGradient>
            <linearGradient id="b-fail" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#ef4444" />
              <stop offset="100%" stop-color="#dc2626" />
            </linearGradient>
          </defs>

          <!-- Background track (always visible) -->
          <path
            d="M 80 80 C 160 80, 160 80, 200 80 C 240 80, 240 80, 320 80"
            stroke="#2a2827" stroke-width="2" stroke-linecap="round"
          />

          <!-- Animated connection path -->
          <path
            class="bridge-path"
            d="M 80 80 C 160 80, 160 80, 200 80 C 240 80, 240 80, 320 80"
            :stroke="(phase === 'connected' || phase === 'redirecting') ? 'url(#b-done)' : phase === 'error' ? 'url(#b-fail)' : 'url(#b-path)'"
            stroke-width="2" stroke-linecap="round"
            fill="none"
          />

          <!-- Signal pulse traveling the path (connected only) -->
          <circle v-if="phase === 'connected' || phase === 'redirecting'" class="signal-dot" r="4">
            <animateMotion
              dur="1.6s" repeatCount="indefinite"
              path="M 80 80 C 160 80, 160 80, 200 80 C 240 80, 240 80, 320 80"
            />
          </circle>

          <!-- Left node: requesting app -->
          <g class="node node-left">
            <circle cx="80" cy="80" r="28" fill="#1a1918" stroke="#2a2827" stroke-width="1.5" />
            <circle cx="80" cy="80" r="28" class="node-ring" />
            <foreignObject x="58" y="58" width="44" height="44">
              <div class="node-icon-wrap">
                <img
                  :src="appIcon || nutbitsLogo"
                  :alt="appName"
                  @error="$event.target.src = nutbitsLogo"
                />
              </div>
            </foreignObject>
          </g>

          <!-- Right node: NUTbits -->
          <g class="node node-right">
            <circle cx="320" cy="80" r="28" fill="#1a1918" stroke="#2a2827" stroke-width="1.5" />
            <circle cx="320" cy="80" r="28" class="node-ring" />
            <foreignObject x="298" y="58" width="44" height="44">
              <div class="node-icon-wrap">
                <img :src="nutbitsLogo" alt="NUTbits" />
              </div>
            </foreignObject>
          </g>

          <!-- Node labels -->
          <text x="80" y="122" text-anchor="middle" fill="#625a52" font-size="11">{{ appName.length > 14 ? appName.slice(0, 14) + '...' : appName }}</text>
          <text x="320" y="122" text-anchor="middle" fill="#625a52" font-size="11">NUTbits</text>

          <!-- Center status icon -->
          <g v-if="phase === 'connecting'" transform="translate(200, 80)" class="center-spinner">
            <circle r="10" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="16 48" stroke-linecap="round" />
          </g>
          <g v-if="phase === 'connected' || phase === 'redirecting'" transform="translate(200, 80)">
            <path d="M -6 1 L -2 5 L 6 -4" stroke="#34d399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" class="check-draw" />
          </g>
          <g v-if="phase === 'denied'" transform="translate(200, 80)">
            <line x1="-5" y1="-5" x2="5" y2="5" stroke="#ef4444" stroke-width="2" stroke-linecap="round" class="x-draw" />
            <line x1="5" y1="-5" x2="-5" y2="5" stroke="#ef4444" stroke-width="2" stroke-linecap="round" class="x-draw-2" />
          </g>
          <g v-if="phase === 'error'" transform="translate(200, 80)">
            <text text-anchor="middle" dominant-baseline="central" fill="#ef4444" font-size="18" font-weight="700">!</text>
          </g>
        </svg>
      </div>

      <!-- ── IDLE: Review & approve ─────────────────────────────── -->
      <template v-if="phase === 'idle'">
        <h1 class="title">Connection Request</h1>
        <p class="subtitle"><strong>{{ appName }}</strong> wants to connect to your NUTbits wallet via Nostr Wallet Connect.</p>

        <!-- Permissions -->
        <section class="section">
          <h2 class="section-heading">Permissions</h2>
          <div class="perm-list">
            <label v-for="p in PERMISSIONS" :key="p.key" class="perm-row" :class="{ on: isSelected(p.key) }">
              <input type="checkbox" :checked="isSelected(p.key)" @change="toggle(p.key)" class="sr-only" />
              <span class="perm-toggle">
                <svg v-if="isSelected(p.key)" viewBox="0 0 16 16" fill="currentColor"><path d="M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2.5-2.5a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z"/></svg>
              </span>
              <span class="perm-text">
                <span class="perm-name">{{ p.label }}</span>
                <span class="perm-desc">{{ p.desc }}</span>
              </span>
            </label>
          </div>
        </section>

        <!-- Mint selection -->
        <section v-if="mintOptions.length > 1" class="section">
          <h2 class="section-heading">Mint</h2>
          <select v-model="selectedMint" class="select-field">
            <option v-for="m in mintOptions" :key="m.url" :value="m.url">
              {{ m.label }}{{ m.active ? ' (active)' : '' }}
            </option>
          </select>
        </section>

        <!-- Spending limits (collapsible) -->
        <section class="section">
          <button class="limits-toggle" @click="showLimits = !showLimits">
            <span>Spending Limits</span>
            <svg :class="{ rotated: showLimits }" viewBox="0 0 20 20" fill="currentColor" class="chevron"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd"/></svg>
          </button>
          <div v-if="showLimits" class="limits-fields">
            <div class="field">
              <label class="field-label">Max per payment (sats)</label>
              <input v-model.number="maxPaymentSats" type="number" min="0" placeholder="0 = unlimited" class="field-input" />
            </div>
            <div class="field">
              <label class="field-label">Max daily total (sats)</label>
              <input v-model.number="maxDailySats" type="number" min="0" placeholder="0 = unlimited" class="field-input" />
            </div>
          </div>
        </section>

        <!-- No callback notice -->
        <div v-if="!hasCallback" class="notice">
          No callback URI. The NWC pairing string will be shown here for manual copy.
        </div>

        <!-- Actions -->
        <div class="actions">
          <button class="btn-ghost" @click="deny">Deny</button>
          <button class="btn-primary" @click="approve" :disabled="selected.length === 0">Approve</button>
        </div>
      </template>

      <!-- ── CONNECTING ─────────────────────────────────────────── -->
      <template v-if="phase === 'connecting'">
        <h1 class="title">Connecting</h1>
        <p class="subtitle">Generating keypair and establishing NWC channel...</p>
      </template>

      <!-- ── CONNECTED / REDIRECTING ────────────────────────────── -->
      <template v-if="phase === 'connected' || phase === 'redirecting'">
        <h1 class="title title-ok">{{ phase === 'redirecting' ? 'Redirecting' : 'Connected' }}</h1>
        <p v-if="phase === 'redirecting'" class="subtitle">Returning pairing code to {{ appName }}...</p>
        <p v-else class="subtitle">NWC channel established successfully.</p>

        <!-- Connection metadata -->
        <div v-if="connectionMeta" class="meta-card">
          <div class="meta-row">
            <span class="meta-key">Label</span>
            <span class="meta-val">{{ connectionMeta.label }}</span>
          </div>
          <div v-if="connectionMeta.pubkey" class="meta-row">
            <span class="meta-key">Pubkey</span>
            <span class="meta-val mono">{{ connectionMeta.pubkey.slice(0, 12) }}...{{ connectionMeta.pubkey.slice(-8) }}</span>
          </div>
          <div class="meta-row">
            <span class="meta-key">Permissions</span>
            <span class="meta-val">{{ connectionMeta.permissions.length }} granted</span>
          </div>
          <div v-if="connectionMeta.mint" class="meta-row">
            <span class="meta-key">Mint</span>
            <span class="meta-val mono">{{ connectionMeta.mint.replace(/^https?:\/\//, '').replace(/\/+$/, '') }}</span>
          </div>
          <div v-if="connectionMeta.maxPayment" class="meta-row">
            <span class="meta-key">Max payment</span>
            <span class="meta-val">{{ connectionMeta.maxPayment.toLocaleString() }} sats</span>
          </div>
          <div v-if="connectionMeta.maxDaily" class="meta-row">
            <span class="meta-key">Daily limit</span>
            <span class="meta-val">{{ connectionMeta.maxDaily.toLocaleString() }} sats</span>
          </div>
        </div>

        <!-- NWC string (shown if no callback) -->
        <div v-if="!hasCallback && createdNwcString" class="nwc-box">
          <code @click="copyNwc">{{ createdNwcString.slice(0, 48) }}...{{ createdNwcString.slice(-12) }}</code>
          <button class="btn-copy" @click="copyNwc">Copy</button>
        </div>

        <button v-if="!hasCallback" class="btn-ghost btn-below" @click="vueRouter.push('/connections')">
          Go to Connections
        </button>
      </template>

      <!-- ── DENIED ─────────────────────────────────────────────── -->
      <template v-if="phase === 'denied'">
        <h1 class="title title-err">Denied</h1>
        <p class="subtitle">Connection request declined. Returning to connections...</p>
      </template>

      <!-- ── ERROR ──────────────────────────────────────────────── -->
      <template v-if="phase === 'error'">
        <h1 class="title title-err">Failed</h1>
        <p class="subtitle subtitle-err">{{ errorMsg }}</p>
        <div class="actions">
          <button class="btn-ghost" @click="vueRouter.push('/connections')">Cancel</button>
          <button class="btn-primary" @click="retry">Retry</button>
        </div>
      </template>

    </div>
  </div>
</template>

<style scoped>
/* ── Layout ──────────────────────────────────────────────────────── */

.dl {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.dl-bg {
  position: absolute;
  inset: 0;
  background: #0f0e0d;
  background-image: radial-gradient(ellipse at 50% 20%, rgba(245, 158, 11, 0.05) 0%, transparent 70%);
}

.dl-container {
  position: relative;
  z-index: 1;
  max-width: 440px;
  width: 100%;
  padding: 2.5rem 1.5rem 3rem;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* ── Bridge SVG ──────────────────────────────────────────────────── */

.bridge {
  width: 100%;
  max-width: 400px;
  margin-bottom: 2rem;
}

.bridge svg {
  width: 100%;
  height: auto;
  display: block;
}

/* Connection path — draws in on 'connecting', stays on 'connected' */
.bridge-path {
  stroke-dasharray: 240;
  stroke-dashoffset: 240;
  transition: stroke-dashoffset 1.4s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.4s ease;
}

.bridge.connecting .bridge-path,
.bridge.connected .bridge-path,
.bridge.redirecting .bridge-path {
  stroke-dashoffset: 0;
}

.bridge.error .bridge-path {
  stroke-dashoffset: 120;
  transition: stroke-dashoffset 0.6s ease;
}

.bridge.denied .bridge-path {
  stroke-dashoffset: 240;
}

/* Signal pulse */
.signal-dot {
  fill: #34d399;
  opacity: 0.9;
}

/* Node rings — subtle breathing */
.node-ring {
  fill: none;
  stroke: #2a2827;
  stroke-width: 1;
  transition: stroke 0.6s ease, stroke-width 0.6s ease;
}

.bridge.connected .node-left .node-ring,
.bridge.redirecting .node-left .node-ring {
  stroke: #34d399;
  stroke-width: 2;
  animation: ring-settle 0.8s ease-out;
}

.bridge.connected .node-right .node-ring,
.bridge.redirecting .node-right .node-ring {
  stroke: #34d399;
  stroke-width: 2;
  animation: ring-settle 0.8s ease-out 0.15s both;
}

.bridge.connecting .node-left .node-ring {
  stroke: #f59e0b;
  stroke-width: 1.5;
}

.bridge.connecting .node-right .node-ring {
  stroke: #f59e0b;
  stroke-width: 1.5;
  animation: ring-settle 0.8s ease-out 0.3s both;
}

.bridge.denied .node-ring,
.bridge.error .node-ring {
  stroke: #3a3735;
  opacity: 0.5;
  transition: opacity 0.4s ease;
}

@keyframes ring-settle {
  0%   { stroke-width: 0; opacity: 0; }
  50%  { stroke-width: 3; }
  100% { stroke-width: 2; opacity: 1; }
}

.node-icon-wrap {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.node-icon-wrap img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

/* Center spinner — transform-box needed for SVG rotation */
.center-spinner circle {
  animation: spin 1s linear infinite;
  transform-origin: center;
  transform-box: fill-box;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Checkmark draw-in */
.check-draw {
  stroke-dasharray: 24;
  stroke-dashoffset: 24;
  animation: draw 0.5s ease-out 0.3s forwards;
}

.x-draw {
  stroke-dasharray: 14;
  stroke-dashoffset: 14;
  animation: draw 0.3s ease-out 0.1s forwards;
}

.x-draw-2 {
  stroke-dasharray: 14;
  stroke-dashoffset: 14;
  animation: draw 0.3s ease-out 0.2s forwards;
}

@keyframes draw {
  to { stroke-dashoffset: 0; }
}

/* ── Typography ──────────────────────────────────────────────────── */

.title {
  font-size: 1.35rem;
  font-weight: 700;
  color: #e8e0d8;
  text-align: center;
  margin-bottom: 0.35rem;
  animation: fade-in 0.4s ease;
}

.title-ok { color: #34d399; }
.title-err { color: #ef4444; }

.subtitle {
  font-size: 0.85rem;
  color: #8a8078;
  text-align: center;
  margin-bottom: 1.5rem;
  line-height: 1.5;
  animation: fade-in 0.4s ease 0.05s both;
}

.subtitle strong { color: #c8beb4; font-weight: 600; }
.subtitle-err { color: #f87171; }

@keyframes fade-in {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ── Sections ────────────────────────────────────────────────────── */

.section {
  width: 100%;
  margin-bottom: 1rem;
  animation: fade-in 0.4s ease 0.1s both;
}

.section-heading {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #625a52;
  margin-bottom: 0.5rem;
}

/* ── Permission list ─────────────────────────────────────────────── */

.perm-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  border: 1px solid #2a2827;
  border-radius: 0.5rem;
  overflow: hidden;
}

.perm-row {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.55rem 0.75rem;
  background: #1a1918;
  cursor: pointer;
  transition: background 0.15s ease;
}

.perm-row:hover { background: #1f1e1c; }

.perm-toggle {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 1.5px solid #3a3735;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s ease;
  color: transparent;
}

.perm-row.on .perm-toggle {
  background: #f59e0b;
  border-color: #f59e0b;
  color: #0f0e0d;
}

.perm-toggle svg { width: 12px; height: 12px; }

.perm-text {
  display: flex;
  flex-direction: column;
  gap: 0.05rem;
}

.perm-name {
  font-size: 0.82rem;
  font-weight: 500;
  color: #c8beb4;
}

.perm-desc {
  font-size: 0.7rem;
  color: #625a52;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

/* ── Select / Inputs ─────────────────────────────────────────────── */

.select-field {
  width: 100%;
  padding: 0.5rem 0.75rem;
  background: #1a1918;
  border: 1px solid #2a2827;
  border-radius: 0.5rem;
  color: #c8beb4;
  font-size: 0.82rem;
  appearance: none;
}

.select-field:focus {
  border-color: rgba(245, 158, 11, 0.4);
}

/* ── Limits toggle ───────────────────────────────────────────────── */

.limits-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0;
  background: none;
  border: none;
  color: #8a8078;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  cursor: pointer;
}

.chevron {
  width: 16px;
  height: 16px;
  transition: transform 0.2s ease;
}

.chevron.rotated { transform: rotate(180deg); }

.limits-fields {
  display: flex;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.field { flex: 1; }

.field-label {
  display: block;
  font-size: 0.7rem;
  color: #625a52;
  margin-bottom: 0.25rem;
}

.field-input {
  width: 100%;
  padding: 0.45rem 0.65rem;
  background: #1a1918;
  border: 1px solid #2a2827;
  border-radius: 0.4rem;
  color: #c8beb4;
  font-size: 0.82rem;
}

.field-input:focus { border-color: rgba(245, 158, 11, 0.4); }

/* ── Notice ──────────────────────────────────────────────────────── */

.notice {
  width: 100%;
  padding: 0.6rem 0.75rem;
  background: rgba(245, 158, 11, 0.04);
  border: 1px solid rgba(245, 158, 11, 0.12);
  border-radius: 0.4rem;
  font-size: 0.75rem;
  color: #a99f96;
  margin-bottom: 1.25rem;
}

/* ── Buttons ─────────────────────────────────────────────────────── */

.actions {
  display: flex;
  gap: 0.75rem;
  width: 100%;
  margin-top: 0.25rem;
  animation: fade-in 0.4s ease 0.15s both;
}

.btn-primary {
  flex: 1;
  padding: 0.65rem 1.25rem;
  font-size: 0.9rem;
  font-weight: 600;
  color: #0f0e0d;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  border: none;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.btn-primary:hover:not(:disabled) { opacity: 0.9; }
.btn-primary:active:not(:disabled) { transform: scale(0.98); }
.btn-primary:disabled { opacity: 0.35; cursor: not-allowed; }

.btn-ghost {
  padding: 0.65rem 1.25rem;
  font-size: 0.9rem;
  font-weight: 500;
  color: #8a8078;
  background: none;
  border: 1px solid #2a2827;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.btn-ghost:hover { border-color: #3a3735; color: #a99f96; }

.btn-below { margin-top: 0.75rem; }

/* ── Connection metadata card ────────────────────────────────────── */

.meta-card {
  width: 100%;
  border: 1px solid #2a2827;
  border-radius: 0.5rem;
  overflow: hidden;
  margin-bottom: 1rem;
  animation: fade-in 0.4s ease 0.1s both;
}

.meta-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0.75rem;
  background: #1a1918;
  font-size: 0.78rem;
}

.meta-row + .meta-row { border-top: 1px solid #252321; }

.meta-key { color: #625a52; }
.meta-val { color: #c8beb4; text-align: right; }
.meta-val.mono { font-family: var(--font-mono); font-size: 0.72rem; }

/* ── NWC string box ──────────────────────────────────────────────── */

.nwc-box {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 0.75rem;
  background: #1a1918;
  border: 1px solid #2a2827;
  border-radius: 0.5rem;
  margin-bottom: 0.5rem;
  animation: fade-in 0.4s ease 0.15s both;
}

.nwc-box code {
  flex: 1;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: #8a8078;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.btn-copy {
  padding: 0.3rem 0.6rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.15);
  border-radius: 0.35rem;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s ease;
}

.btn-copy:hover { background: rgba(245, 158, 11, 0.14); }

/* ── Responsive ──────────────────────────────────────────────────── */

@media (max-width: 480px) {
  .dl-container { padding: 2rem 1rem 2.5rem; }
  .title { font-size: 1.2rem; }
  .limits-fields { flex-direction: column; }
}
</style>
