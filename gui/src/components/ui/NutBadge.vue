<script setup>
import { ref, nextTick, onBeforeUnmount } from 'vue'

const props = defineProps({
  num: { type: String, required: true },
  supported: { type: Boolean, default: false },
})

const NUT_INFO = {
  '00': {
    name: 'Cryptography',
    desc: 'The basic building blocks — how the mint and your wallet create and verify ecash tokens using blind signatures.',
  },
  '01': {
    name: 'Mint Public Keys',
    desc: 'How your wallet fetches the mint\'s signing keys. These keys prove that tokens are genuine and haven\'t been forged.',
  },
  '02': {
    name: 'Keysets',
    desc: 'Mints can rotate their signing keys over time. Keysets let your wallet know which key version each token belongs to.',
  },
  '03': {
    name: 'Swap',
    desc: 'Exchange tokens for new ones — used to split denominations, consolidate tokens, or refresh for better privacy.',
  },
  '04': {
    name: 'Mint Tokens',
    desc: 'Create new ecash by paying a Lightning invoice. You pay the invoice, the mint gives you tokens worth that amount.',
  },
  '05': {
    name: 'Melt Tokens',
    desc: 'Burn ecash to pay a Lightning invoice. You hand tokens to the mint, and it pays the invoice on your behalf.',
  },
  '06': {
    name: 'Mint Info',
    desc: 'Public information about the mint — its name, version, supported features, contact info, and message of the day.',
  },
  '07': {
    name: 'Proof State Check',
    desc: 'Ask the mint whether specific tokens have already been spent. Lets your wallet detect double-spend attempts.',
  },
  '08': {
    name: 'Fee Return',
    desc: 'When Lightning routing fees are lower than estimated, the mint returns the overpaid amount as new ecash tokens.',
  },
  '09': {
    name: 'Signature Restore',
    desc: 'Recover your ecash from a seed phrase. If you lose your wallet data, the mint can re-sign your tokens from backup.',
  },
  '12': {
    name: 'DLEQ Proofs',
    desc: 'Cryptographic proof that the mint signed your tokens correctly — without revealing which tokens are yours. Adds a trust-but-verify layer.',
  },
  '13': {
    name: 'Deterministic Secrets',
    desc: 'Generate token secrets from a seed phrase instead of randomly. This is what makes seed-based backup and recovery possible.',
  },
  '15': {
    name: 'Multi-Path Payments',
    desc: 'Split a payment across multiple smaller token sets. Useful when no single denomination is large enough to cover the amount.',
  },
  '17': {
    name: 'WebSocket Subscriptions',
    desc: 'Real-time updates from the mint over a persistent connection — know instantly when a payment settles or a token state changes.',
  },
  '20': {
    name: 'Signature on Mint',
    desc: 'The mint signs the minting response so your wallet can verify it wasn\'t tampered with during transit.',
  },
}

const wrapperRef = ref(null)
const tooltipRef = ref(null)
const show = ref(false)
const style = ref({})
var hideTimer = null

function onEnter() {
  clearTimeout(hideTimer)
  show.value = true
  nextTick(reposition)
}

function onLeave() {
  hideTimer = setTimeout(() => { show.value = false }, 120)
}

function reposition() {
  if (!wrapperRef.value || !tooltipRef.value) return

  var trigger = wrapperRef.value.getBoundingClientRect()
  var tip = tooltipRef.value.getBoundingClientRect()
  var pad = 12

  // Center above the badge
  var left = trigger.left + trigger.width / 2 - tip.width / 2
  var top = trigger.top - tip.height - 8

  // If it would go above viewport, show below
  if (top < pad) {
    top = trigger.bottom + 8
  }

  // Clamp horizontally
  if (left < pad) left = pad
  if (left + tip.width > window.innerWidth - pad) {
    left = window.innerWidth - pad - tip.width
  }

  style.value = {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
    zIndex: 9999,
  }
}

onBeforeUnmount(() => clearTimeout(hideTimer))

var info = NUT_INFO[props.num] || { name: 'Unknown', desc: 'No description available.' }
</script>

<template>
  <span
    ref="wrapperRef"
    class="inline-flex items-center justify-center w-6 h-5 rounded text-[10px] font-mono font-semibold cursor-help select-none"
    :class="supported
      ? 'bg-emerald-500/10 text-emerald-400'
      : 'bg-nutbits-800 text-nutbits-600'"
    @mouseenter="onEnter"
    @mouseleave="onLeave"
    @focusin="onEnter"
    @focusout="onLeave"
    tabindex="0"
  >{{ num }}

    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-150 ease-out"
        enter-from-class="opacity-0 translate-y-1"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition duration-100 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 translate-y-1"
      >
        <div
          v-if="show"
          ref="tooltipRef"
          :style="style"
          class="w-72 max-w-[calc(100vw-1.5rem)] rounded-xl border border-nutbits-700 bg-nutbits-900 shadow-2xl shadow-black/40 overflow-hidden"
          @mouseenter="onEnter"
          @mouseleave="onLeave"
        >
          <!-- Header -->
          <div class="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-nutbits-800">
            <span
              class="inline-flex items-center justify-center w-8 h-6 rounded-md text-xs font-mono font-bold"
              :class="supported
                ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20'
                : 'bg-nutbits-800 text-nutbits-500 ring-1 ring-nutbits-700'"
            >{{ num }}</span>
            <div class="min-w-0">
              <span class="text-sm font-semibold text-nutbits-100 block leading-tight">{{ info.name }}</span>
              <span class="text-[10px] font-mono leading-tight" :class="supported ? 'text-emerald-400/70' : 'text-nutbits-600'">
                {{ supported ? 'Supported' : 'Not supported' }}
              </span>
            </div>
          </div>
          <!-- Body -->
          <div class="px-3.5 py-2.5">
            <p class="text-xs leading-relaxed text-nutbits-300">{{ info.desc }}</p>
          </div>
        </div>
      </Transition>
    </Teleport>
  </span>
</template>
