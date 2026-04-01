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
