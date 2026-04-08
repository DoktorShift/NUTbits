<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useConfigStore } from '@/stores/config.js'
import { useToast } from '@/composables/useToast.js'
import api from '@/api/client.js'
import Badge from '@/components/ui/Badge.vue'
import HelpTip from '@/components/ui/HelpTip.vue'
import Modal from '@/components/ui/Modal.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { presets as bgPresets, getSelectedPresetId, setSelectedPresetId } from '@/config/backgrounds.js'

const configStore = useConfigStore()
const { addToast } = useToast()

const config = computed(() => configStore.config || {})
const envOptions = computed(() => configStore.envOptions || [])

// ── Tabs ────────────────────────────────────────────────────────────────

const tabs = [
  { id: 'wallet',   label: 'Wallet' },
  { id: 'network',  label: 'Network' },
  { id: 'limits',   label: 'Limits' },
  { id: 'fees',     label: 'Fees' },
  { id: 'api',      label: 'API' },
  { id: 'advanced', label: 'Advanced' },
]

const activeTab = ref('wallet')

// ── Setting definitions per tab ─────────────────────────────────────────

const settingsByTab = {
  wallet: [
    {
      envKey: 'NUTBITS_MINT_URL',
      label: 'Mint URL',
      hint: 'Only used when Mint URLs (multi-mint) is empty.',
      help: 'This is the single-mint shortcut. NUTbits only reads this value when the multi-mint list (Mint URLs) is empty. Once you add mints to the multi-mint list, this field is completely ignored -- even if it contains a different mint. If you want to keep using this mint alongside others, add it to the Mint URLs list instead.',
      type: 'text',
    },
    {
      envKey: 'NUTBITS_MINT_URLS',
      label: 'Mint URLs',
      hint: 'When set, this replaces Mint URL above.',
      help: 'Your primary mint list. When this field has any value, the single Mint URL above is ignored entirely. NUTbits uses these mints for new NWC connections, manual mint selection, and automatic failover. The first mint in the list is your main mint. Manage individual mints more easily on the Mints page.',
      type: 'text',
    },
    {
      envKey: 'NUTBITS_SEED',
      label: 'Seed',
      hint: 'Auto-generated on first run. Back this up!',
      help: 'Deterministic wallet seed used for seed-based recovery and deterministic secret generation. Once generated, paste it here so it survives restarts.',
      type: 'text',
      sensitive: true,
    },
    {
      envKey: 'NUTBITS_STATE_PASSPHRASE',
      label: 'State Passphrase',
      hint: 'Encrypts your wallet data.',
      help: 'Encryption passphrase for the state file. Without the correct passphrase, stored state cannot be read.',
      type: 'text',
      sensitive: true,
    },
    {
      envKey: 'NUTBITS_STATE_BACKEND',
      label: 'Storage Backend',
      hint: 'file, sqlite, or mysql.',
      help: 'Chooses where NUTbits stores its state. File is simplest. SQLite is local database storage. MySQL is for external database setups.',
      type: 'select',
      options: ['file', 'sqlite', 'mysql'],
    },
    {
      envKey: 'NUTBITS_STATE_FILE',
      label: 'State File Path',
      hint: 'Only used with the file backend.',
      help: 'Path to the encrypted state file when using the file backend.',
      type: 'text',
      showWhen: 'file',
    },
    {
      envKey: 'NUTBITS_SQLITE_PATH',
      label: 'SQLite Path',
      hint: 'Only used with the sqlite backend.',
      help: 'Filesystem path for the SQLite database file when using the sqlite backend.',
      type: 'text',
      showWhen: 'sqlite',
    },
    {
      envKey: 'NUTBITS_MYSQL_URL',
      label: 'MySQL URL',
      hint: 'Only used with the mysql backend.',
      help: 'Connection string for a MySQL database when using the mysql backend.',
      type: 'text',
      sensitive: true,
      showWhen: 'mysql',
    },
  ],
  network: [
    {
      envKey: 'NUTBITS_RELAYS',
      label: 'Nostr Relays',
      hint: 'Comma-separated NWC-friendly relays.',
      help: 'These Nostr relays are used for NWC communication. More relays can improve reachability, but dead relays add noise and reconnect attempts. Manage individual relays on the Relays page.',
      type: 'text',
    },
    {
      envKey: 'NUTBITS_HEALTH_CHECK_INTERVAL_MS',
      label: 'Health Check Interval',
      hint: 'Milliseconds between mint health checks.',
      help: 'How often NUTbits checks mint health in the background. Lower values react faster but create more network traffic.',
      type: 'number',
      suffix: 'ms',
    },
    {
      envKey: 'NUTBITS_FAILOVER_COOLDOWN_MS',
      label: 'Failover Cooldown',
      hint: 'Milliseconds before retrying a failed mint.',
      help: 'How long NUTbits waits before retrying a mint that was marked unhealthy. This avoids bouncing too quickly between broken mints.',
      type: 'number',
      suffix: 'ms',
    },
    {
      envKey: 'NUTBITS_FETCH_TIMEOUT_MS',
      label: 'Fetch Timeout',
      hint: 'Milliseconds before a mint request times out.',
      help: 'How long NUTbits waits for mint API requests before treating them as timed out.',
      type: 'number',
      suffix: 'ms',
    },
  ],
  limits: [
    {
      envKey: 'NUTBITS_MAX_PAYMENT_SATS',
      label: 'Max Payment',
      hint: 'Your NUTbits rule, not a mint limit. 0 means no limit.',
      help: 'This is your own NUTbits spending rule, not a limit imposed by the mint. It caps the maximum size of one outgoing payment in sats. Use it to prevent one large payment from going through by mistake. Set to 0 to allow any size.',
      type: 'number',
      suffix: 'sats',
      hot: true,
      configKey: 'max_payment_sats',
      runtimeKey: 'max_payment_sats',
    },
    {
      envKey: 'NUTBITS_DAILY_LIMIT_SATS',
      label: 'Daily Limit',
      hint: 'Your NUTbits rule, not a mint limit. 0 means no limit.',
      help: 'This is your own NUTbits spending rule, not a limit imposed by the mint. It caps the total outgoing sats per day across all payments. It is a safety limit, not a balance limit. Set to 0 to remove.',
      type: 'number',
      suffix: 'sats',
      hot: true,
      configKey: 'daily_limit_sats',
      runtimeKey: 'daily_limit_sats',
    },
    {
      envKey: 'NUTBITS_FEE_RESERVE_PCT',
      label: 'Fee Reserve',
      hint: 'Your NUTbits rule. Allowed range: 0 to 50.',
      help: 'This is your own NUTbits setting, not a mint parameter. NUTbits keeps this extra percentage aside when paying Lightning invoices so routing fees do not cause the payment to fail. Higher values are safer but can reduce how much is available to spend.',
      type: 'number',
      suffix: '%',
      hot: true,
      configKey: 'fee_reserve_pct',
      runtimeKey: 'fee_reserve_percent',
    },
  ],
  fees: [
    {
      envKey: 'NUTBITS_SERVICE_FEE_PPM',
      label: 'Service Fee PPM',
      hint: '10000 = 1%. 0 to disable.',
      help: 'Optional service fee charged on outgoing payments, measured in parts per million. Receiving is always free. Set to 0 to disable.',
      type: 'number',
      suffix: 'ppm',
      hot: true,
      configKey: 'service_fee_ppm',
      runtimeKey: 'service_fee_ppm',
    },
    {
      envKey: 'NUTBITS_SERVICE_FEE_BASE',
      label: 'Base Fee',
      hint: 'Fixed fee per outgoing payment. 0 to disable.',
      help: 'Optional fixed service fee in sats added to outgoing payments. Set to 0 to disable.',
      type: 'number',
      suffix: 'sats',
      hot: true,
      configKey: 'service_fee_base',
      runtimeKey: 'service_fee_base',
    },
  ],
  api: [
    {
      envKey: 'NUTBITS_API_ENABLED',
      label: 'API Enabled',
      hint: 'The GUI and CLI depend on this.',
      help: 'Turns the local management API on or off. The GUI, local tools, and automatic local login depend on this being enabled.',
      type: 'boolean',
    },
    {
      envKey: 'NUTBITS_API_PORT',
      label: 'HTTP Port',
      hint: 'Leave empty for Unix socket only.',
      help: 'Optional HTTP port for the local API. Leave empty if you only want the Unix socket.',
      type: 'number',
    },
    {
      envKey: 'NUTBITS_API_SOCKET',
      label: 'Socket Path',
      hint: 'Default: ~/.nutbits/nutbits.sock',
      help: 'Path to the local Unix socket used by CLI tools and local integrations on the same machine.',
      type: 'text',
    },
    {
      envKey: 'NUTBITS_API_TOKEN',
      label: 'API Token',
      hint: 'Set explicitly for VPS/browser use. Leave empty for local auto-token.',
      help: 'Set this explicitly when accessing NUTbits through a browser or reverse proxy (VPS). If left empty, NUTbits auto-generates a local token for same-machine CLI tools.',
      type: 'text',
      sensitive: true,
    },
  ],
  advanced: [
    {
      envKey: 'NUTBITS_LOG_LEVEL',
      label: 'Log Level',
      hint: 'error, warn, info, or debug.',
      help: 'Controls backend log volume. Error only shows failures. Warn adds important problems. Info is the normal daily setting. Debug is only for troubleshooting.',
      type: 'select',
      options: ['error', 'warn', 'info', 'debug'],
      hot: true,
      configKey: 'log_level',
      runtimeKey: 'log_level',
    },
    {
      envKey: 'NUTBITS_INVOICE_CHECK_MAX_RETRIES',
      label: 'Invoice Check Retries',
      hint: 'How many times to re-check a pending invoice.',
      help: 'Maximum number of times NUTbits will re-check a pending invoice before giving up.',
      type: 'number',
    },
    {
      envKey: 'NUTBITS_INVOICE_CHECK_INTERVAL_SECS',
      label: 'Invoice Check Interval',
      hint: 'Seconds between pending invoice checks.',
      help: 'Delay between pending invoice checks. Smaller values update faster but poll more often.',
      type: 'number',
      suffix: 's',
    },
  ],
}

// ── Env value helpers ───────────────────────────────────────────────────

function envOption(envKey) {
  return envOptions.value.find((o) => o.key === envKey)
}

function envValue(envKey) {
  return envOption(envKey)?.value || ''
}

function shortUrl(url) {
  if (!url) return '--'
  try {
    var u = new URL(url)
    var host = u.hostname.replace(/^www\./, '')
    var path = u.pathname.replace(/\/+$/, '')
    return path && path !== '/' ? host + path : host
  } catch {
    return url.replace(/^(wss?|https?):\/\//, '').replace(/\/+$/, '')
  }
}

function displayValue(setting) {
  if (setting.sensitive) {
    const val = envValue(setting.envKey)
    return val ? '***' : '--'
  }
  const val = envValue(setting.envKey)
  return val || '--'
}

function currentStorageBackend() {
  return envValue('NUTBITS_STATE_BACKEND') || 'file'
}

function shouldShow(setting) {
  if (!setting.showWhen) return true
  return currentStorageBackend() === setting.showWhen
}

// ── Modal editing ───────────────────────────────────────────────────────

const showEditModal = ref(false)
const editingSetting = ref(null)
const editValue = ref('')
const savingEdit = ref(false)
const restartNotice = ref(null)

function startEdit(setting) {
  editingSetting.value = setting
  editValue.value = setting.sensitive ? '' : (envValue(setting.envKey) || '')
  showEditModal.value = true
}

function editPlaceholder(setting) {
  if (!setting) return ''
  if (setting.envKey === 'NUTBITS_API_TOKEN') {
    return 'Leave empty to auto-generate on startup'
  }
  if (setting.sensitive) {
    return 'Enter new value'
  }
  return envValue(setting.envKey) || ''
}

async function saveEdit() {
  const setting = editingSetting.value
  if (!setting) return

  savingEdit.value = true
  try {
    // For hot-reloadable settings, also update runtime config
    if (setting.hot && setting.configKey) {
      const val = setting.type === 'number' ? Number(editValue.value) : editValue.value
      await configStore.updateConfig(setting.configKey, val)
    }

    const result = await configStore.updateEnv(setting.envKey, editValue.value, setting.sensitive)
    if (result?.restart_required) {
      restartNotice.value = `${setting.label} was saved. Restart NUTbits to apply this change.`
    } else {
      restartNotice.value = null
    }
    addToast(`${setting.label} updated`, 'success')
    showEditModal.value = false
    editingSetting.value = null
  } catch (err) {
    addToast(err.message, 'error')
  } finally {
    savingEdit.value = false
  }
}

async function toggleBoolean(setting) {
  try {
    const current = envValue(setting.envKey)
    const nextValue = String(current).toLowerCase() === 'true' ? 'false' : 'true'
    const result = await configStore.updateEnv(setting.envKey, nextValue, false)
    if (result?.restart_required) {
      restartNotice.value = `${setting.label} was saved. Restart NUTbits to apply this change.`
    }
    addToast(`${setting.label} set to ${nextValue}`, 'success')
  } catch (err) {
    addToast(err.message, 'error')
  }
}

function boolValue(setting) {
  return String(envValue(setting.envKey)).toLowerCase() === 'true'
}

// ── Runtime value for display ───────────────────────────────────────────

function liveValue(setting) {
  if (!setting.runtimeKey) return null
  const val = config.value[setting.runtimeKey]
  return val != null ? val : null
}

// ── Backup & Restore ────────────────────────────────────────────────────

const backupLoading = ref(false)
const backupInfo = ref(null)
const restoreLoading = ref(false)
const restoreResult = ref(null)
const showRestoreModal = ref(false)

async function downloadBackup() {
  backupLoading.value = true
  try {
    const data = await api.get('/api/v1/backup')
    backupInfo.value = data

    if (data.data || data.backup) {
      const raw = data.data || data.backup
      const blob = new Blob([atob(raw)], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `nutbits-backup-${Date.now()}.bin`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      addToast('Backup downloaded', 'success')
    }
  } catch (err) {
    addToast(err.message, 'error')
  } finally {
    backupLoading.value = false
  }
}

async function confirmRestore() {
  restoreLoading.value = true
  try {
    const data = await api.post('/api/v1/restore', {})
    restoreResult.value = data
    addToast('Restore completed', 'success')
  } catch (err) {
    addToast(err.message, 'error')
  } finally {
    restoreLoading.value = false
    showRestoreModal.value = false
  }
}

// ── GUI Connection ──────────────────────────────────────────────────────

const apiUrl = ref(localStorage.getItem('nutbits_api_url') || '')
const apiToken = ref(localStorage.getItem('nutbits_api_token') || '')
const testResult = ref(null)
const testLoading = ref(false)

function saveApiConnection() {
  localStorage.setItem('nutbits_api_url', apiUrl.value)
  localStorage.setItem('nutbits_api_token', apiToken.value)
  addToast('API connection saved', 'success')
}

async function testConnection() {
  testLoading.value = true
  testResult.value = null
  try {
    await api.get('/api/v1/status')
    testResult.value = { ok: true }
    addToast('Connection successful', 'success')
  } catch (err) {
    testResult.value = { ok: false, error: err.message }
    addToast('Connection failed: ' + err.message, 'error')
  } finally {
    testLoading.value = false
  }
}

async function autoConnectLocal() {
  testLoading.value = true
  testResult.value = null
  try {
    const result = await api.recoverAuth()
    if (!result.ok) throw new Error(result.error || 'Local bootstrap unavailable')

    apiUrl.value = localStorage.getItem('nutbits_api_url') || result.apiUrl || 'http://127.0.0.1:3338'
    apiToken.value = localStorage.getItem('nutbits_api_token') || ''
    testResult.value = { ok: true }
    addToast('Connected to local NUTbits', 'success')
  } catch (err) {
    testResult.value = { ok: false, error: err.message }
    addToast('Local connect failed: ' + err.message, 'error')
  } finally {
    testLoading.value = false
  }
}

// ── Lock screen background ─────────────────────────────────────────────

const selectedBg = ref(getSelectedPresetId())

function selectBackground(id) {
  selectedBg.value = id
  setSelectedPresetId(id)
  addToast('Lock screen background updated', 'success')
}

// ── Init ────────────────────────────────────────────────────────────────

onMounted(async () => {
  await Promise.all([configStore.fetch(), configStore.fetchEnv()])
})
</script>

<template>
  <div class="space-y-8">
    <div>
      <h1 class="text-2xl font-bold text-nutbits-100">Settings</h1>
      <p class="text-sm text-nutbits-400 mt-1">All NUTbits configuration in one place. Changes marked with a restart badge require a service restart.</p>
    </div>

    <div v-if="configStore.loading && !Object.keys(config).length" class="flex justify-center py-20">
      <Spinner />
    </div>

    <template v-else>
      <!-- No .env warning -->
      <div v-if="!configStore.envFileExists" class="bg-amber-500/10 border border-amber-500/30 rounded-xl px-5 py-3">
        <p class="text-amber-400 text-sm font-medium">No .env file was found</p>
        <p class="text-nutbits-400 text-xs mt-1">
          NUTbits will create one the first time you save a value here.
        </p>
      </div>

      <!-- Restart notice -->
      <div v-if="restartNotice" class="bg-amber-500/10 border border-amber-500/30 rounded-xl px-5 py-3 flex items-start justify-between gap-3">
        <div>
          <p class="text-amber-400 text-sm font-medium">Restart needed</p>
          <p class="text-nutbits-400 text-xs mt-1">{{ restartNotice }}</p>
        </div>
        <button
          class="text-nutbits-400 hover:text-nutbits-100 text-sm transition-colors shrink-0"
          @click="restartNotice = null"
        >
          Dismiss
        </button>
      </div>

      <!-- Status cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div class="bg-nutbits-900 border border-nutbits-700 rounded-xl p-5 space-y-2">
          <div class="flex items-center gap-1.5">
            <p class="text-xs text-nutbits-400 uppercase tracking-wide">Active Mint</p>
            <HelpTip text="The Cashu mint NUTbits is currently connected to. This is where your ecash lives. You can add backup mints on the Mints page for automatic failover." />
          </div>
          <p class="text-sm text-nutbits-100 font-mono" :title="config.mint_url">{{ shortUrl(config.mint_url) }}</p>
        </div>
        <div class="bg-nutbits-900 border border-nutbits-700 rounded-xl p-5 space-y-2">
          <div class="flex items-center gap-1.5">
            <p class="text-xs text-nutbits-400 uppercase tracking-wide">Storage</p>
            <HelpTip text="How NUTbits saves your wallet state. 'file' is the default encrypted file. 'sqlite' and 'mysql' are database options for more advanced setups. Change this in the Wallet tab below." />
          </div>
          <p class="text-sm text-nutbits-100">{{ config.storage_backend || '--' }}</p>
        </div>
        <div class="bg-nutbits-900 border border-nutbits-700 rounded-xl p-5 space-y-2">
          <div class="flex items-center gap-1.5">
            <p class="text-xs text-nutbits-400 uppercase tracking-wide">Seed</p>
            <HelpTip text="Your wallet seed enables deterministic secret generation and proof recovery. If your seed is missing, you cannot recover funds if your state file is lost. Set it in the Wallet tab below and back it up somewhere safe." />
          </div>
          <Badge :type="config.seed_configured ? 'success' : 'warning'">
            {{ config.seed_configured ? 'Configured' : 'Missing' }}
          </Badge>
        </div>
        <div class="bg-nutbits-900 border border-nutbits-700 rounded-xl p-5 space-y-2">
          <div class="flex items-center gap-1.5">
            <p class="text-xs text-nutbits-400 uppercase tracking-wide">Relays</p>
            <HelpTip text="Nostr relays carry NWC messages between NUTbits and your connected apps. More relays can improve reachability but dead relays add reconnect noise. Manage them in the Network tab or on the Relays page." />
          </div>
          <p class="text-sm text-nutbits-100">{{ Array.isArray(config.relays) ? config.relays.length : 0 }}</p>
        </div>
      </div>

      <!-- Tab bar -->
      <div class="bg-nutbits-900 border border-nutbits-700 rounded-xl overflow-hidden">
        <div class="flex border-b border-nutbits-700 overflow-x-auto">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            class="px-5 py-3 text-sm font-medium transition-all whitespace-nowrap relative"
            :class="activeTab === tab.id
              ? 'text-amber-500'
              : 'text-nutbits-400 hover:text-nutbits-100 hover:bg-nutbits-800/50'"
            @click="activeTab = tab.id"
          >
            {{ tab.label }}
            <span
              v-if="activeTab === tab.id"
              class="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500"
            />
          </button>
        </div>

        <!-- Tab content -->
        <div class="p-6">
          <div class="divide-y divide-nutbits-800">
            <template v-for="setting in settingsByTab[activeTab]" :key="setting.envKey">
              <div
                v-if="shouldShow(setting)"
                class="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <!-- Label & help -->
                <div class="min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <p class="text-sm font-medium text-nutbits-100">{{ setting.label }}</p>
                    <HelpTip :text="setting.help" />
                    <Badge v-if="setting.sensitive" type="error">Sensitive</Badge>
                    <span
                      v-if="!setting.hot"
                      class="text-[10px] text-amber-500/70 border border-amber-500/30 rounded px-1.5 py-0.5"
                    >
                      restart
                    </span>
                  </div>
                  <p v-if="setting.hint" class="text-xs text-nutbits-400 mt-0.5">{{ setting.hint }}</p>
                </div>

                <!-- Value + edit button -->
                <div class="flex items-center gap-3 flex-wrap lg:justify-end">
                  <!-- Boolean toggle -->
                  <template v-if="setting.type === 'boolean'">
                    <span class="text-sm text-nutbits-300">{{ boolValue(setting) ? 'On' : 'Off' }}</span>
                    <button
                      class="relative inline-flex h-7 w-12 items-center rounded-full border transition-colors"
                      :class="boolValue(setting)
                        ? 'bg-amber-500/90 border-amber-400'
                        : 'bg-nutbits-700 border-nutbits-600'"
                      @click="toggleBoolean(setting)"
                    >
                      <span
                        class="inline-block h-5 w-5 transform rounded-full bg-white transition-transform"
                        :class="boolValue(setting) ? 'translate-x-6' : 'translate-x-1'"
                      />
                    </button>
                  </template>

                  <!-- Display value + Edit button -->
                  <template v-else>
                    <span class="text-sm text-nutbits-300 font-mono break-all max-w-[340px] text-right">
                      {{ displayValue(setting) }}
                      <span v-if="setting.suffix && envValue(setting.envKey)" class="text-nutbits-500 text-xs ml-1">{{ setting.suffix }}</span>
                    </span>
                    <span
                      v-if="setting.hot && liveValue(setting) != null"
                      class="text-[10px] text-nutbits-500"
                      title="Live runtime value"
                    >
                      live: {{ liveValue(setting) }}{{ setting.suffix ? ' ' + setting.suffix : '' }}
                    </span>
                    <button
                      class="bg-nutbits-800 hover:bg-nutbits-700 text-nutbits-100 text-sm rounded-lg px-3 py-1.5 transition-all"
                      @click="startEdit(setting)"
                    >
                      Edit
                    </button>
                  </template>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- Lock Screen Background -->
      <div class="bg-nutbits-900 border border-nutbits-700 rounded-xl p-6 space-y-4">
        <div>
          <h2 class="text-lg font-semibold text-nutbits-100">Lock Screen</h2>
          <p class="text-xs text-nutbits-400 mt-1">Choose the animated background for the login screen. Lock with <kbd class="px-1.5 py-0.5 rounded bg-nutbits-800 border border-nutbits-700 text-nutbits-300 text-[10px] font-mono">Ctrl+L</kbd></p>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          <button
            v-for="preset in bgPresets"
            :key="preset.id"
            class="group relative rounded-xl overflow-hidden transition-all duration-200"
            :class="selectedBg === preset.id
              ? 'ring-2 ring-amber-500 ring-offset-2 ring-offset-nutbits-900 scale-[1.02]'
              : 'ring-1 ring-nutbits-700 hover:ring-nutbits-500 hover:scale-[1.01]'"
            @click="selectBackground(preset.id)"
          >
            <!-- Preview gradient -->
            <div
              class="aspect-[16/10] w-full"
              :style="{ background: preset.preview }"
            />

            <!-- Label -->
            <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2.5 py-2">
              <span class="text-[11px] font-medium text-nutbits-100 block leading-tight">{{ preset.name }}</span>
              <span class="text-[9px] text-nutbits-500 uppercase tracking-wider">{{ preset.type }}</span>
            </div>

            <!-- Selected check -->
            <div
              v-if="selectedBg === preset.id"
              class="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center shadow-lg"
            >
              <svg viewBox="0 0 24 24" class="w-3 h-3 text-nutbits-950" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12l5 5L20 7" />
              </svg>
            </div>
          </button>
        </div>
      </div>

      <!-- Backup & Restore / GUI Connection -->
      <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div class="bg-nutbits-900 border border-nutbits-700 rounded-xl p-6 space-y-5">
          <h2 class="text-lg font-semibold text-nutbits-100">Backup & Restore</h2>

          <div class="space-y-4">
            <div class="bg-nutbits-800 rounded-lg p-4 space-y-3">
              <h3 class="text-sm font-medium text-nutbits-100">Download Backup</h3>
              <p class="text-xs text-nutbits-400">
                Export wallet proofs and connection data as a backup file.
              </p>
              <button
                class="bg-amber-500 hover:bg-amber-600 text-nutbits-950 font-medium rounded-lg px-4 py-2.5 transition-all text-sm"
                :disabled="backupLoading"
                @click="downloadBackup"
              >
                {{ backupLoading ? 'Downloading...' : 'Download Backup' }}
              </button>
              <div v-if="backupInfo" class="text-xs text-nutbits-400 space-y-1 mt-2">
                <p v-if="backupInfo.size">Size: {{ backupInfo.size }}</p>
                <p v-if="backupInfo.proofs != null">Proofs: {{ backupInfo.proofs }}</p>
                <p v-if="backupInfo.sats != null">Sats: {{ backupInfo.sats }}</p>
                <p v-if="backupInfo.connections != null">Connections: {{ backupInfo.connections }}</p>
              </div>
            </div>

            <div class="bg-nutbits-800 rounded-lg p-4 space-y-3">
              <h3 class="text-sm font-medium text-nutbits-100">Restore from Seed</h3>
              <p class="text-xs text-nutbits-400">
                Recover wallet proofs from the configured mints using your seed.
              </p>
              <button
                class="bg-red-500/80 hover:bg-red-500 text-white font-medium rounded-lg px-4 py-2.5 transition-all text-sm"
                :disabled="restoreLoading"
                @click="showRestoreModal = true"
              >
                {{ restoreLoading ? 'Restoring...' : 'Restore from Seed' }}
              </button>
              <div v-if="restoreResult" class="text-xs text-nutbits-400 space-y-1 mt-2">
                <p v-if="restoreResult.total_sats != null">
                  Recovered: <span class="text-emerald-400 font-medium">{{ restoreResult.total_sats }} sats</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        <div class="bg-nutbits-900 border border-nutbits-700 rounded-xl p-6 space-y-5">
          <h2 class="text-lg font-semibold text-nutbits-100">GUI Connection</h2>
          <p class="text-xs text-nutbits-400">
            Control how this GUI connects to the local NUTbits backend.
          </p>

          <div class="space-y-4">
            <div>
              <label class="block text-sm text-nutbits-400 mb-1.5">API URL</label>
              <input
                v-model="apiUrl"
                type="text"
                placeholder="http://127.0.0.1:3338 or leave empty for same-origin proxy"
                class="w-full bg-nutbits-800 border border-nutbits-700 rounded-lg px-4 py-2.5 text-nutbits-100 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 outline-none text-sm"
              />
            </div>

            <div>
              <label class="block text-sm text-nutbits-400 mb-1.5">API Token</label>
              <input
                v-model="apiToken"
                type="password"
                placeholder="Bearer token"
                class="w-full bg-nutbits-800 border border-nutbits-700 rounded-lg px-4 py-2.5 text-nutbits-100 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 outline-none text-sm"
              />
            </div>

            <div class="flex flex-wrap items-center gap-3">
              <button
                class="bg-nutbits-800 hover:bg-nutbits-700 text-nutbits-100 font-medium rounded-lg px-4 py-2.5 transition-all text-sm"
                :disabled="testLoading"
                @click="autoConnectLocal"
              >
                Use Local Backend
              </button>
              <button
                class="bg-amber-500 hover:bg-amber-600 text-nutbits-950 font-medium rounded-lg px-4 py-2.5 transition-all text-sm"
                @click="saveApiConnection"
              >
                Save
              </button>
              <button
                class="bg-nutbits-800 hover:bg-nutbits-700 text-nutbits-100 font-medium rounded-lg px-4 py-2.5 transition-all text-sm"
                :disabled="testLoading"
                @click="testConnection"
              >
                {{ testLoading ? 'Testing...' : 'Test Connection' }}
              </button>
              <div v-if="testResult" class="flex items-center gap-2 text-sm">
                <span
                  class="inline-block w-2.5 h-2.5 rounded-full"
                  :class="testResult.ok ? 'bg-emerald-500' : 'bg-red-500'"
                />
                <span :class="testResult.ok ? 'text-emerald-400' : 'text-red-400'">
                  {{ testResult.ok ? 'Connected' : testResult.error }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Edit setting modal -->
      <Modal
        :show="showEditModal"
        :title="editingSetting ? `Edit ${editingSetting.label}` : 'Edit Setting'"
        @close="showEditModal = false"
      >
        <form v-if="editingSetting" class="space-y-4" @submit.prevent="saveEdit">
          <p class="text-sm text-nutbits-400">{{ editingSetting.help }}</p>

          <div>
            <label class="block text-xs text-nutbits-500 mb-1.5 font-mono">{{ editingSetting.envKey }}</label>

            <!-- Select input -->
            <select
              v-if="editingSetting.type === 'select'"
              v-model="editValue"
              class="w-full bg-nutbits-800 border border-nutbits-700 rounded-lg px-4 py-2.5 text-nutbits-100 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 outline-none text-sm"
            >
              <option v-for="opt in editingSetting.options" :key="opt" :value="opt">{{ opt }}</option>
            </select>

            <!-- Text / number / password input -->
            <div v-else class="flex items-center gap-2">
              <input
                v-model="editValue"
                :type="editingSetting.sensitive ? 'password' : (editingSetting.type === 'number' ? 'number' : 'text')"
                :min="editingSetting.type === 'number' ? 0 : undefined"
                class="flex-1 bg-nutbits-800 border border-nutbits-700 rounded-lg px-4 py-2.5 text-nutbits-100 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 outline-none text-sm"
                :placeholder="editPlaceholder(editingSetting)"
                autofocus
              />
              <span v-if="editingSetting.suffix" class="text-nutbits-500 text-sm">{{ editingSetting.suffix }}</span>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <span
              v-if="!editingSetting.hot"
              class="text-[10px] text-amber-500/70 border border-amber-500/30 rounded px-1.5 py-0.5"
            >
              requires restart
            </span>
            <span
              v-else
              class="text-[10px] text-emerald-500/70 border border-emerald-500/30 rounded px-1.5 py-0.5"
            >
              applies live
            </span>
            <Badge v-if="editingSetting.sensitive" type="error">Sensitive</Badge>
          </div>

          <div class="flex justify-end gap-3 pt-2">
            <button
              type="button"
              class="bg-nutbits-800 hover:bg-nutbits-700 text-nutbits-100 font-medium rounded-lg px-4 py-2.5 transition-all text-sm border border-nutbits-700"
              @click="showEditModal = false"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="bg-amber-500 hover:bg-amber-600 text-nutbits-950 font-medium rounded-lg px-4 py-2.5 transition-all text-sm disabled:opacity-50"
              :disabled="savingEdit"
            >
              {{ savingEdit ? 'Saving...' : 'Save' }}
            </button>
          </div>
        </form>
      </Modal>

      <!-- Restore confirmation modal -->
      <Modal
        :open="showRestoreModal"
        title="Confirm Restore"
        @close="showRestoreModal = false"
      >
        <div class="space-y-4">
          <p class="text-sm text-nutbits-300">
            This will try to recover all wallet proofs from the configured mints using your seed.
          </p>
          <p class="text-sm text-yellow-400">
            Make sure your seed is correct before you continue.
          </p>
          <div class="flex justify-end gap-3 pt-2">
            <button
              class="bg-nutbits-800 hover:bg-nutbits-700 text-nutbits-100 font-medium rounded-lg px-4 py-2.5 transition-all text-sm"
              @click="showRestoreModal = false"
            >
              Cancel
            </button>
            <button
              class="bg-red-500/80 hover:bg-red-500 text-white font-medium rounded-lg px-4 py-2.5 transition-all text-sm"
              :disabled="restoreLoading"
              @click="confirmRestore"
            >
              {{ restoreLoading ? 'Restoring...' : 'Yes, Restore' }}
            </button>
          </div>
        </div>
      </Modal>
    </template>
  </div>
</template>
