<script setup>
/**
 * StepConfigure — Permissions, budget, mint, and label configuration.
 *
 * Receives initial values from the selected app (or blank for custom).
 * Emits the final config when user clicks "Create Connection".
 */
import { ref, computed, watch, onMounted } from 'vue'
import { useMintsStore } from '@/stores/mints.js'
import { PERMISSIONS } from '@/data/appCatalog.js'

var props = defineProps({
  /** Pre-selected app from catalog, or null for custom. */
  app: { type: Object, default: null },
  /** Whether the create request is in flight. */
  loading: { type: Boolean, default: false },
})

var emit = defineEmits(['create', 'back'])

var mintsStore = useMintsStore()

// ── Form state ──────────────────────────────────────────────────────

var label = ref(props.app ? props.app.name : '')
var selectedPerms = ref(props.app ? [...props.app.permissions] : PERMISSIONS.map(p => p.key))
var maxPaymentSats = ref(props.app?.budget?.maxPaymentSats || 0)
var maxDailySats = ref(props.app?.budget?.maxDailySats || 0)
var dedicated = ref(true)
var selectedMint = ref('')
var lud16 = ref('')
var showAdvanced = ref(false)
var serviceFee = ref('')
var serviceFeeBase = ref('')

function isPerm(key) { return selectedPerms.value.includes(key) }
function togglePerm(key) {
  var i = selectedPerms.value.indexOf(key)
  if (i === -1) selectedPerms.value.push(key)
  else selectedPerms.value.splice(i, 1)
}

var mintOptions = computed(() => {
  var list = Array.isArray(mintsStore.mints) ? mintsStore.mints : []
  return list.map(m => ({
    url: m.url,
    label: m.name && m.name !== 'unknown' ? m.name : m.url,
    active: !!m.active || mintsStore.activeMint === m.url,
  }))
})

var canCreate = computed(() => {
  return label.value.trim().length > 0 && selectedPerms.value.length > 0
})

function handleCreate() {
  if (!canCreate.value) return
  emit('create', {
    label: label.value.trim(),
    permissions: selectedPerms.value,
    mint: selectedMint.value,
    max_payment_sats: Number(maxPaymentSats.value) || 0,
    max_daily_sats: Number(maxDailySats.value) || 0,
    dedicated: dedicated.value,
    lud16: lud16.value.trim() || undefined,
    service_fee_ppm: serviceFee.value !== '' ? Number(serviceFee.value) : undefined,
    service_fee_base: serviceFeeBase.value !== '' ? Number(serviceFeeBase.value) : undefined,
  })
}

onMounted(async () => {
  if (!mintsStore.mints?.length) await mintsStore.fetch()
  selectedMint.value = mintsStore.activeMint || mintsStore.mints?.[0]?.url || ''
})
</script>

<template>
  <div class="step-configure">
    <!-- Label -->
    <div class="field">
      <label class="field-label">Connection Label</label>
      <input
        v-model="label"
        type="text"
        class="field-input"
        placeholder="e.g. My Damus, Shop POS, Testing"
        maxlength="128"
        autofocus
      />
      <p class="field-hint">A name to identify this connection in your list.</p>
    </div>

    <!-- Balance Type -->
    <div class="field">
      <label class="field-label">
        Balance Type
        <span class="tooltip-trigger" tabindex="0">
          <svg viewBox="0 0 20 20" fill="currentColor" class="info-icon"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clip-rule="evenodd" /></svg>
          <span class="tooltip">
            <strong>Dedicated:</strong> This connection gets its own separate balance, starting at 0 sats. You fund it explicitly. The app can only spend what you put in — it never touches your main wallet.<br /><br />
            <strong>Shared:</strong> This connection can access your full wallet balance. Use this only for apps you fully trust and control (e.g. your own wallet interface).
          </span>
        </span>
      </label>
      <div class="balance-type-selector">
        <button
          class="balance-type-option"
          :class="{ active: dedicated }"
          @click="dedicated = true"
        >
          <span class="balance-type-icon">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clip-rule="evenodd" /></svg>
          </span>
          <span class="balance-type-text">
            <span class="balance-type-name">Dedicated balance</span>
            <span class="balance-type-desc">Own balance, starts at 0 sats. You fund it.</span>
          </span>
        </button>
        <button
          class="balance-type-option"
          :class="{ active: !dedicated }"
          @click="dedicated = false"
        >
          <span class="balance-type-icon shared-icon">
            <svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5a3 3 0 10-6 0V9h6z" /></svg>
          </span>
          <span class="balance-type-text">
            <span class="balance-type-name">Shared balance</span>
            <span class="balance-type-desc">Full wallet access. Only for apps you fully trust.</span>
          </span>
        </button>
        <div v-if="!dedicated" class="balance-warning">
          <svg viewBox="0 0 20 20" fill="currentColor" class="balance-warning-icon"><path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" /></svg>
          <span>This connection can spend your <strong>entire wallet balance</strong>. Only use this for your own apps that you fully control. Never share this NWC string with third parties.</span>
        </div>
      </div>
    </div>

    <!-- Permissions -->
    <div class="field">
      <label class="field-label">Permissions</label>
      <div class="perm-list">
        <label
          v-for="p in PERMISSIONS"
          :key="p.key"
          class="perm-row"
          :class="{ on: isPerm(p.key) }"
        >
          <input
            type="checkbox"
            :checked="isPerm(p.key)"
            @change="togglePerm(p.key)"
            class="sr-only"
          />
          <span class="perm-check">
            <svg v-if="isPerm(p.key)" viewBox="0 0 16 16" fill="currentColor"><path d="M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2.5-2.5a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z"/></svg>
          </span>
          <span class="perm-text">
            <span class="perm-name">{{ p.label }}</span>
            <span class="perm-desc">{{ p.desc }}</span>
          </span>
        </label>
      </div>
    </div>

    <!-- Budget -->
    <div class="field-row">
      <div class="field">
        <label class="field-label">Max per payment (sats)</label>
        <input v-model.number="maxPaymentSats" type="number" min="0" class="field-input" placeholder="0 = unlimited" />
      </div>
      <div class="field">
        <label class="field-label">Max daily total (sats)</label>
        <input v-model.number="maxDailySats" type="number" min="0" class="field-input" placeholder="0 = unlimited" />
      </div>
    </div>

    <!-- Mint -->
    <div v-if="mintOptions.length > 1" class="field">
      <label class="field-label">Mint</label>
      <select v-model="selectedMint" class="field-input">
        <option v-for="m in mintOptions" :key="m.url" :value="m.url">
          {{ m.label }}{{ m.active ? ' (active)' : '' }}
        </option>
      </select>
    </div>

    <!-- Advanced (collapsible) -->
    <button class="adv-toggle" @click="showAdvanced = !showAdvanced">
      <span>Advanced</span>
      <svg :class="{ rotated: showAdvanced }" viewBox="0 0 20 20" fill="currentColor" class="adv-chevron"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd"/></svg>
    </button>
    <div v-if="showAdvanced" class="adv-fields">
      <div class="field">
        <label class="field-label">Lightning Address (lud16)</label>
        <input v-model="lud16" type="text" class="field-input" placeholder="user@domain.com" />
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Service fee (ppm)</label>
          <input v-model="serviceFee" type="number" min="0" class="field-input" placeholder="Default" />
        </div>
        <div class="field">
          <label class="field-label">Service fee base (sats)</label>
          <input v-model="serviceFeeBase" type="number" min="0" class="field-input" placeholder="Default" />
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="actions">
      <button class="btn-back" @click="emit('back')">Back</button>
      <button
        class="btn-create"
        :disabled="!canCreate || loading"
        @click="handleCreate"
      >
        {{ loading ? 'Creating...' : 'Create Connection' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.step-configure {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.field { display: flex; flex-direction: column; gap: 0.25rem; }
.field-row { display: flex; gap: 0.75rem; }
.field-row .field { flex: 1; }

.field-label {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #625a52;
}

.field-input {
  width: 100%;
  padding: 0.5rem 0.7rem;
  background: #1a1918;
  border: 1px solid #2a2827;
  border-radius: 0.4rem;
  color: #c8beb4;
  font-size: 0.82rem;
  appearance: none;
}

.field-input:focus { border-color: rgba(245, 158, 11, 0.4); outline: none; }

.field-hint {
  font-size: 0.7rem;
  color: #625a52;
}

/* ── Tooltip ── */

.tooltip-trigger {
  position: relative;
  display: inline-flex;
  align-items: center;
  cursor: help;
  vertical-align: middle;
  margin-left: 0.25rem;
}

.info-icon {
  width: 14px;
  height: 14px;
  color: #625a52;
  transition: color 0.15s ease;
}

.tooltip-trigger:hover .info-icon,
.tooltip-trigger:focus .info-icon { color: #f59e0b; }

.tooltip {
  display: none;
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  width: 280px;
  padding: 0.65rem 0.75rem;
  background: #1a1918;
  border: 1px solid #2a2827;
  border-radius: 0.5rem;
  font-size: 0.72rem;
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  line-height: 1.5;
  color: #a99f96;
  z-index: 100;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.tooltip strong { color: #e8e0d8; font-weight: 600; }

.tooltip-trigger:hover .tooltip,
.tooltip-trigger:focus .tooltip { display: block; }

/* ── Balance type selector ── */

.balance-type-selector {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.balance-type-option {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.6rem 0.75rem;
  background: #1a1918;
  border: 1.5px solid #2a2827;
  border-radius: 0.5rem;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.balance-type-option:hover {
  border-color: #3a3735;
  background: #1f1e1c;
}

.balance-type-option.active {
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.04);
}

.balance-type-icon {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #34d399;
}

.balance-type-icon svg { width: 18px; height: 18px; }

.shared-icon { color: #f59e0b; }

.balance-type-text {
  display: flex;
  flex-direction: column;
  gap: 0.05rem;
}

.balance-type-name {
  font-size: 0.82rem;
  font-weight: 600;
  color: #e8e0d8;
}

.balance-type-desc {
  font-size: 0.68rem;
  color: #625a52;
}

/* ── Balance warning ── */

.balance-warning {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.6rem 0.75rem;
  background: rgba(239, 68, 68, 0.06);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 0.4rem;
  font-size: 0.72rem;
  line-height: 1.5;
  color: #f87171;
}

.balance-warning strong { color: #fca5a5; font-weight: 600; }

.balance-warning-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: #ef4444;
  margin-top: 1px;
}

/* ── Permissions ── */

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
  gap: 0.6rem;
  padding: 0.5rem 0.7rem;
  background: #1a1918;
  cursor: pointer;
  transition: background 0.15s ease;
}

.perm-row:hover { background: #1f1e1c; }

.perm-check {
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

.perm-row.on .perm-check {
  background: #f59e0b;
  border-color: #f59e0b;
  color: #0f0e0d;
}

.perm-check svg { width: 12px; height: 12px; }

.perm-text { display: flex; flex-direction: column; gap: 0.05rem; }
.perm-name { font-size: 0.8rem; font-weight: 500; color: #c8beb4; }
.perm-desc { font-size: 0.68rem; color: #625a52; }

.sr-only {
  position: absolute; width: 1px; height: 1px;
  padding: 0; margin: -1px; overflow: hidden;
  clip: rect(0,0,0,0); border: 0;
}

/* ── Advanced ── */

.adv-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0;
  background: none;
  border: none;
  color: #8a8078;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
}

.adv-chevron {
  width: 16px; height: 16px;
  transition: transform 0.2s ease;
}

.adv-chevron.rotated { transform: rotate(180deg); }

.adv-fields {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-left: 0.25rem;
}

/* ── Actions ── */

.actions {
  display: flex;
  gap: 0.75rem;
  padding-top: 0.5rem;
}

.btn-back {
  padding: 0.6rem 1.2rem;
  font-size: 0.88rem;
  font-weight: 500;
  color: #8a8078;
  background: none;
  border: 1px solid #2a2827;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.btn-back:hover { border-color: #3a3735; color: #a99f96; }

.btn-create {
  flex: 1;
  padding: 0.6rem 1.2rem;
  font-size: 0.88rem;
  font-weight: 600;
  color: #0f0e0d;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  border: none;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.btn-create:hover:not(:disabled) { opacity: 0.9; }
.btn-create:active:not(:disabled) { transform: scale(0.98); }
.btn-create:disabled { opacity: 0.35; cursor: not-allowed; }

@media (max-width: 480px) {
  .field-row { flex-direction: column; }
}
</style>
