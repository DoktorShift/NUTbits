<script setup>
/**
 * StepFinalize — Shows QR code, copy button, and per-app instructions.
 *
 * The QR is blurred by default (privacy-first, like Alby Hub).
 * Per-app finalize instructions guide the user through the paste step.
 */
import { ref, watch, onMounted, nextTick } from 'vue'
import { useToast } from '@/composables/useToast.js'

var props = defineProps({
  /** The created NWC pairing string. */
  nwcString: { type: String, required: true },
  /** The app catalog entry (null for custom). */
  app: { type: Object, default: null },
  /** Created connection metadata from the API response. */
  connection: { type: Object, default: null },
})

var emit = defineEmits(['done'])

var { addToast } = useToast()
var qrRevealed = ref(false)
var qrRendered = ref(false)

async function renderQr() {
  var canvas = document.getElementById('wizard-qr')
  if (!canvas || !props.nwcString) return
  try {
    var QRModule = await import('qrcode')
    var QRCode = QRModule.default || QRModule
    await QRCode.toCanvas(canvas, props.nwcString.toUpperCase(), {
      width: 240,
      margin: 3,
      color: { dark: '#1a1a2e', light: '#f5f0e8' },
    })
    qrRendered.value = true
  } catch {
    canvas.width = 240
    canvas.height = 50
    var ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.fillStyle = '#625a52'
      ctx.font = '12px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('QR unavailable', 120, 30)
    }
  }
}

async function copy() {
  try {
    await navigator.clipboard.writeText(props.nwcString)
    addToast('Connection string copied', 'success')
  } catch {
    addToast('Copy failed', 'error')
  }
}

onMounted(() => {
  nextTick(() => setTimeout(renderQr, 100))
})

// Re-render if nwcString changes (shouldn't, but safe)
watch(() => props.nwcString, () => {
  if (props.nwcString) nextTick(() => setTimeout(renderQr, 50))
})
</script>

<template>
  <div class="step-finalize">
    <!-- Per-app instructions -->
    <div v-if="app?.finalize" class="instructions">
      <h3 class="instructions-title">How to connect {{ app.name }}</h3>
      <ol class="instructions-list">
        <li v-for="(step, i) in app.finalize" :key="i">{{ step }}</li>
      </ol>

      <!-- Install links -->
      <div v-if="app.links" class="install-links">
        <a
          v-for="(url, platform) in app.links"
          :key="platform"
          :href="url"
          target="_blank"
          rel="noopener"
          class="install-link"
        >
          {{ platform === 'apple' ? 'App Store' : platform === 'play' ? 'Google Play' : platform === 'chrome' ? 'Chrome' : platform === 'firefox' ? 'Firefox' : platform === 'web' ? 'Open Website' : platform }}
        </a>
      </div>
    </div>

    <!-- Generic instructions for custom connections -->
    <div v-else class="instructions">
      <h3 class="instructions-title">Connect your app</h3>
      <ol class="instructions-list">
        <li>Open the app you want to connect</li>
        <li>Find the wallet settings (look for <strong>NWC</strong> or <strong>Nostr Wallet Connect</strong>)</li>
        <li>Scan the QR code below or paste the connection string</li>
      </ol>
    </div>

    <!-- Connection secret card -->
    <div class="secret-card">
      <div class="secret-header">Connection Secret</div>

      <!-- QR Code (blurred until revealed) -->
      <div class="qr-wrap" :class="{ blurred: !qrRevealed }" @click="qrRevealed = true">
        <canvas id="wizard-qr" />
        <button v-if="!qrRevealed" class="qr-reveal-btn">
          <svg viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
            <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
            <path fill-rule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd" />
          </svg>
          Reveal QR
        </button>
      </div>

      <!-- Copy string -->
      <div class="string-row">
        <code class="string-preview" @click="copy">
          {{ nwcString.slice(0, 36) }}...{{ nwcString.slice(-12) }}
        </code>
        <button class="btn-copy" @click="copy">
          <svg viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
            <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
            <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
          </svg>
          Copy
        </button>
      </div>
    </div>

    <!-- Connection metadata -->
    <div v-if="connection" class="meta-card">
      <div class="meta-row">
        <span class="meta-key">Label</span>
        <span class="meta-val">{{ connection.label }}</span>
      </div>
      <div v-if="connection.app_pubkey" class="meta-row">
        <span class="meta-key">Pubkey</span>
        <span class="meta-val mono">{{ connection.app_pubkey.slice(0, 12) }}...{{ connection.app_pubkey.slice(-8) }}</span>
      </div>
      <div v-if="connection.permissions" class="meta-row">
        <span class="meta-key">Permissions</span>
        <span class="meta-val">{{ connection.permissions.length }} granted</span>
      </div>
    </div>

    <!-- Done -->
    <button class="btn-done" @click="emit('done')">Go to Connections</button>
  </div>
</template>

<style scoped>
.step-finalize {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

/* ── Instructions ── */

.instructions {
  background: #1a1918;
  border: 1px solid #2a2827;
  border-radius: 0.5rem;
  padding: 0.85rem 1rem;
}

.instructions-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: #e8e0d8;
  margin-bottom: 0.5rem;
}

.instructions-list {
  list-style: decimal;
  padding-left: 1.2rem;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.8rem;
  color: #a99f96;
}

.instructions-list strong { color: #c8beb4; }

.install-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.65rem;
  padding-top: 0.65rem;
  border-top: 1px solid #252321;
}

.install-link {
  padding: 0.3rem 0.6rem;
  font-size: 0.72rem;
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.06);
  border: 1px solid rgba(245, 158, 11, 0.15);
  border-radius: 0.35rem;
  text-decoration: none;
  transition: background 0.15s ease;
}

.install-link:hover { background: rgba(245, 158, 11, 0.12); }

/* ── Secret card ── */

.secret-card {
  border: 1px solid #2a2827;
  border-radius: 0.5rem;
  overflow: hidden;
}

.secret-header {
  padding: 0.55rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: #625a52;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: #1a1918;
  border-bottom: 1px solid #252321;
  text-align: center;
}

.qr-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
  background: #1a1918;
  position: relative;
  cursor: pointer;
}

.qr-wrap.blurred canvas {
  filter: blur(10px);
  transition: filter 0.3s ease;
}

.qr-reveal-btn {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.45rem 0.85rem;
  font-size: 0.8rem;
  font-weight: 500;
  color: #e8e0d8;
  background: rgba(15, 14, 13, 0.85);
  border: 1px solid #3a3735;
  border-radius: 0.4rem;
  cursor: pointer;
  transition: background 0.15s ease;
}

.qr-reveal-btn:hover { background: rgba(15, 14, 13, 0.95); }

.string-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 0.75rem;
  background: #161514;
  border-top: 1px solid #252321;
}

.string-preview {
  flex: 1;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: #8a8078;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.btn-copy {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.35rem 0.65rem;
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

/* ── Metadata ── */

.meta-card {
  border: 1px solid #2a2827;
  border-radius: 0.5rem;
  overflow: hidden;
}

.meta-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.45rem 0.75rem;
  background: #1a1918;
  font-size: 0.76rem;
}

.meta-row + .meta-row { border-top: 1px solid #252321; }

.meta-key { color: #625a52; }
.meta-val { color: #c8beb4; }
.meta-val.mono { font-family: var(--font-mono); font-size: 0.7rem; }

/* ── Done button ── */

.btn-done {
  padding: 0.6rem 1.2rem;
  font-size: 0.88rem;
  font-weight: 500;
  color: #8a8078;
  background: none;
  border: 1px solid #2a2827;
  border-radius: 0.5rem;
  cursor: pointer;
  align-self: center;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.btn-done:hover { border-color: #3a3735; color: #a99f96; }
</style>
