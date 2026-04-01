/**
 * App Catalog — curated directory of NWC-compatible apps.
 *
 * Each entry pre-configures permissions, budget defaults, and provides
 * per-app finalize instructions so users know exactly where to paste
 * the connection string.
 *
 * This file is the single source of truth for the connection wizard's
 * "Select App" step. Add new apps here as the ecosystem grows.
 */

// ── Permission presets ──────────────────────────────────────────────

export const PERMISSIONS = [
  { key: 'pay_invoice',       label: 'Pay Invoice',       desc: 'Send payments on your behalf' },
  { key: 'make_invoice',      label: 'Make Invoice',      desc: 'Create invoices to receive funds' },
  { key: 'get_balance',       label: 'Get Balance',       desc: 'Read current wallet balance' },
  { key: 'list_transactions', label: 'List Transactions', desc: 'View payment history' },
  { key: 'get_info',          label: 'Get Info',          desc: 'Read wallet metadata' },
  { key: 'lookup_invoice',    label: 'Lookup Invoice',    desc: 'Check invoice status' },
]

export const ALL_PERMISSIONS = PERMISSIONS.map(p => p.key)

const SPEND_ONLY = ['pay_invoice', 'get_balance', 'get_info']
const SOCIAL = ['pay_invoice', 'get_balance', 'get_info', 'lookup_invoice']
const FULL = ALL_PERMISSIONS

// ── Budget presets ──────────────────────────────────────────────────

const BUDGET_LOW    = { maxPaymentSats: 1000,  maxDailySats: 5000 }
const BUDGET_MEDIUM = { maxPaymentSats: 10000, maxDailySats: 50000 }
const BUDGET_HIGH   = { maxPaymentSats: 0,     maxDailySats: 0 }

// ── Categories ──────────────────────────────────────────────────────

export const CATEGORIES = {
  'social':         { label: 'Social & Nostr',    priority: 1 },
  'wallet':         { label: 'Wallets',           priority: 2 },
  'platform':       { label: 'Platforms',         priority: 3 },
  'merchant':       { label: 'Merchant Tools',    priority: 4 },
  'media':          { label: 'Media & Content',   priority: 5 },
  'other':          { label: 'Other',             priority: 10 },
}

export var sortedCategories = Object.entries(CATEGORIES)
  .sort((a, b) => a[1].priority - b[1].priority)

// ── App entries ─────────────────────────────────────────────────────

export var apps = [
  // ── Wallets & Interfaces (BuhoGO first) ──────────────
  {
    id: 'buho-go',
    name: 'BuhoGO',
    desc: 'Mobile NWC wallet for ecash payments on the go',
    category: 'wallet',
    icon: 'buho-go',
    permissions: FULL,
    budget: BUDGET_HIGH,
    links: {
      web: 'https://buho.app',
    },
    finalize: [
      'Open BuhoGO and go to Wallet Settings',
      'Tap "Add Wallet" → "Nostr Wallet Connect"',
      'Scan the QR code or paste the connection string',
    ],
  },

  // ── Social & Nostr ──────────────────────────────────
  {
    id: 'damus',
    name: 'Damus',
    desc: 'Nostr client for iOS — zaps, DMs, and social',
    category: 'social',
    icon: 'damus',
    permissions: SOCIAL,
    budget: BUDGET_LOW,
    links: {
      apple: 'https://apps.apple.com/app/damus/id1628663131',
    },
    finalize: [
      'Open Damus and go to Settings',
      'Tap Wallet → Nostr Wallet Connect',
      'Paste the connection string',
    ],
  },
  {
    id: 'amethyst',
    name: 'Amethyst',
    desc: 'Nostr client for Android — zaps, feeds, and communities',
    category: 'social',
    icon: 'amethyst',
    permissions: SOCIAL,
    budget: BUDGET_LOW,
    links: {
      play: 'https://play.google.com/store/apps/details?id=com.vitorpamplona.amethyst',
    },
    finalize: [
      'Open Amethyst and go to Settings',
      'Scroll to Wallet → External Signer (NWC)',
      'Paste the connection string',
    ],
  },
  {
    id: 'primal',
    name: 'Primal',
    desc: 'Nostr client with built-in wallet — iOS, Android, Web',
    category: 'social',
    icon: 'primal',
    permissions: SOCIAL,
    budget: BUDGET_LOW,
    links: {
      web: 'https://primal.net',
      apple: 'https://apps.apple.com/app/primal/id1673134517',
      play: 'https://play.google.com/store/apps/details?id=net.primal.android',
    },
    finalize: [
      'Open Primal and go to Settings → Wallet',
      'Select "Use NWC Wallet"',
      'Paste the connection string',
    ],
  },
  {
    id: 'nostrudel',
    name: 'noStrudel',
    desc: 'Power-user Nostr web client',
    category: 'social',
    icon: 'nostrudel',
    permissions: SOCIAL,
    budget: BUDGET_LOW,
    links: {
      web: 'https://nostrudel.ninja',
    },
    finalize: [
      'Open noStrudel settings',
      'Go to Lightning → NWC',
      'Paste the connection string',
    ],
  },
  {
    id: 'yakihonne',
    name: 'YakiHonne',
    desc: 'Long-form content on Nostr with tipping',
    category: 'social',
    icon: 'yakihonne',
    permissions: SOCIAL,
    budget: BUDGET_LOW,
    links: {
      web: 'https://yakihonne.com',
    },
    finalize: [
      'Open YakiHonne and go to Settings',
      'Find Wallet / NWC section',
      'Paste the connection string',
    ],
  },

  // ── Wallets & Interfaces ────────────────────────────
  {
    id: 'alby-go',
    name: 'Alby Go',
    desc: 'Mobile NWC wallet — pay and receive anywhere',
    category: 'wallet',
    icon: 'alby-go',
    permissions: FULL,
    budget: BUDGET_HIGH,
    links: {
      apple: 'https://apps.apple.com/app/alby-go/id6471335774',
      play: 'https://play.google.com/store/apps/details?id=com.getalby.mobile',
    },
    finalize: [
      'Open Alby Go and tap "Add Wallet"',
      'Select "Nostr Wallet Connect"',
      'Scan the QR code or paste the connection string',
    ],
  },
  {
    id: 'alby-extension',
    name: 'Alby Extension',
    desc: 'Browser extension for Lightning payments on the web',
    category: 'wallet',
    icon: 'alby-ext',
    permissions: FULL,
    budget: BUDGET_MEDIUM,
    links: {
      web: 'https://getalby.com',
      chrome: 'https://chrome.google.com/webstore/detail/alby/iokeahhehimjnekafflcihljlcjccdbe',
      firefox: 'https://addons.mozilla.org/en-US/firefox/addon/alby/',
    },
    finalize: [
      'Click the Alby extension icon in your browser',
      'Go to Settings → Connection',
      'Select "Nostr Wallet Connect" and paste the string',
    ],
  },

  // ── Platforms ───────────────────────────────────────
  {
    id: 'lnbits',
    name: 'LNbits',
    desc: 'Lightning accounts system with 60+ extensions',
    category: 'platform',
    icon: 'lnbits',
    permissions: FULL,
    budget: BUDGET_HIGH,
    links: {
      web: 'https://lnbits.com',
    },
    finalize: [
      'Open LNbits Admin → Funding Sources',
      'Select "NWC" as the funding source',
      'Paste the connection string and save',
    ],
  },
  {
    id: 'btcpay',
    name: 'BTCPay Server',
    desc: 'Self-hosted payment processor for merchants',
    category: 'platform',
    icon: 'btcpay',
    permissions: ['pay_invoice', 'make_invoice', 'get_balance', 'get_info', 'lookup_invoice'],
    budget: BUDGET_HIGH,
    links: {
      web: 'https://btcpayserver.org',
    },
    finalize: [
      'Open BTCPay Server → Lightning Settings',
      'Select NWC connection type',
      'Paste the connection string',
    ],
  },

  // ── Media & Content ────────────────────────────────
  {
    id: 'wavlake',
    name: 'Wavlake',
    desc: 'Music streaming with Lightning — boost artists',
    category: 'media',
    icon: 'wavlake',
    permissions: SPEND_ONLY,
    budget: BUDGET_LOW,
    links: {
      web: 'https://wavlake.com',
      apple: 'https://apps.apple.com/app/wavlake/id6477352172',
    },
    finalize: [
      'Open Wavlake mobile app → Settings',
      'Tap the + icon next to NWC',
      'Scan the QR code or paste the string',
    ],
  },
  {
    id: 'fountain',
    name: 'Fountain',
    desc: 'Podcast app with per-minute Lightning streaming',
    category: 'media',
    icon: 'fountain',
    permissions: SPEND_ONLY,
    budget: BUDGET_LOW,
    links: {
      apple: 'https://apps.apple.com/app/fountain-podcasts/id1514867067',
      play: 'https://play.google.com/store/apps/details?id=fm.fountain.apps',
    },
    finalize: [
      'Open Fountain → Settings → Wallet',
      'Select "Nostr Wallet Connect"',
      'Paste the connection string',
    ],
  },
  {
    id: 'zapstream',
    name: 'Zap.Stream',
    desc: 'Live streaming with Lightning zaps',
    category: 'media',
    icon: 'zapstream',
    permissions: SOCIAL,
    budget: BUDGET_LOW,
    links: {
      web: 'https://zap.stream',
    },
    finalize: [
      'Open zap.stream and log in',
      'Go to Settings → Wallet',
      'Paste the NWC connection string',
    ],
  },

  // ── Merchant Tools ─────────────────────────────────
  {
    id: 'wavespace',
    name: 'wavecard by wave.space',
    desc: 'Bitcoin VISA debit card — spend sats at 150M+ merchants',
    category: 'merchant',
    icon: 'wavespace',
    permissions: SPEND_ONLY,
    budget: BUDGET_MEDIUM,
    links: {
      web: 'https://app.wave.space/spend',
    },
    finalize: [
      'Open wave.space/spend and sign up or log in',
      'Go to Wallet Connection settings',
      'Paste the NWC connection string',
    ],
  },
  {
    id: 'zapple-pay',
    name: 'Zapple Pay',
    desc: 'Auto-zap when you like Nostr posts',
    category: 'other',
    icon: 'zapple-pay',
    permissions: ['pay_invoice', 'get_balance', 'get_info'],
    budget: BUDGET_LOW,
    links: {
      web: 'https://www.zapplepay.com',
    },
    finalize: [
      'Open zapplepay.com and log in with Nostr',
      'Go to Settings → Connect Wallet',
      'Paste the NWC connection string',
    ],
  },
]

// ── Helpers ─────────────────────────────────────────────────────────

/** Get apps filtered by category. */
export function appsByCategory(categoryId) {
  return apps.filter(a => a.category === categoryId)
}

/** Find app by id. */
export function findApp(id) {
  return apps.find(a => a.id === id) || null
}
