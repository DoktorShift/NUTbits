/**
 * App Catalog — wizard apps for the GUI connection flow.
 *
 * User picks an app from the catalog → NUTbits creates an NWC
 * string with pre-configured permissions and budget → user pastes
 * it into the app. Dedicated balance by default (user can opt
 * into shared balance for trusted apps).
 *
 * Deeplink apps are NOT here — they live in api/deeplink-apps.js
 * (part of the NUTbits core, not the GUI).
 *
 * Icons:
 *   Drop a 256x256 PNG in gui/public/app-icons/{id}.png
 *   The UI resolves icons by convention: appIconUrl(id) → /app-icons/{id}.png
 *   See gui/public/app-icons/README.md for the full spec.
 */

// ── Shared: permissions ─────────────────────────────────────────────

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

// ── Shared: budget presets ──────────────────────────────────────────

const BUDGET_LOW    = { maxPaymentSats: 1000,  maxDailySats: 5000 }
const BUDGET_MEDIUM = { maxPaymentSats: 10000, maxDailySats: 50000 }
const BUDGET_HIGH   = { maxPaymentSats: 0,     maxDailySats: 0 }

// ── Shared: categories ──────────────────────────────────────────────

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

// ── Shared: icon helper ─────────────────────────────────────────────

/**
 * Resolve an app icon URL by convention.
 * Place your PNG at: gui/public/app-icons/{id}.png
 */
export function appIconUrl(id) {
  return `/app-icons/${id}.png`
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
//  WIZARD APPS — manual connection flow
//
//  The user creates an NWC string inside NUTbits GUI, then copies
//  it into the app. Dedicated balance by default (user can opt
//  into shared balance for trusted apps).
//
//  These entries pre-configure permissions and budget so the wizard
//  can suggest the right settings for each app.
//
//  Each entry needs:
//    id          - unique, lowercase, kebab-case
//    name        - display name
//    desc        - one-line description
//    category    - social | wallet | platform | merchant | media | other
//    permissions - NWC methods the app needs
//    budget      - { maxPaymentSats, maxDailySats }
//    finalize    - steps the user follows to paste the NWC string
//    links       - { web, apple, play, chrome, firefox } (optional)
//
//  Icon: drop {id}.png in gui/public/app-icons/
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export var wizardApps = [

  // ── Social & Nostr ──────────────────────────────────
  {
    id: 'damus',
    name: 'Damus',
    desc: 'Nostr client for iOS — zaps, DMs, and social',
    category: 'social',
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
    id: 'buho-go',
    name: 'BuhoGO',
    desc: 'Mobile wallet for payments on the go',
    category: 'wallet',
    permissions: FULL,
    budget: BUDGET_HIGH,
    links: {
      web: 'https://home.mybuho.de/buhogo',
      play: 'https://play.google.com/store/apps/details?id=mybuho.buhogo',
    },
    finalize: [
      'Open BuhoGO and go to Wallet Settings',
      'Tap "Add Wallet" → "Nostr Wallet Connect"',
      'Scan the QR code or paste the connection string',
    ],
  },
  {
    id: 'buho-extension',
    name: 'Buho Jump',
    desc: 'Browser extension for digital Identity & Lightning payments on the web',
    category: 'wallet',
    permissions: FULL,
    budget: BUDGET_MEDIUM,
    links: {
      web: 'https://home.mybuho.de/jump',
    },
    finalize: [
      'Click the Buho Jump extension icon in your browser',
      'Go to → Connection',
      'Select "Nostr Wallet Connect" and paste the string',
    ],
  },
  {
    id: 'alby-go',
    name: 'Alby Go',
    desc: 'Mobile NWC wallet — pay and receive anywhere',
    category: 'wallet',
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
    permissions: SPEND_ONLY,
    budget: BUDGET_HIGH,
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


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Helpers — used by GUI wizard
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Get wizard apps filtered by category. */
export function appsByCategory(categoryId) {
  return wizardApps.filter(a => a.category === categoryId)
}

/** Find a wizard app by id. */
export function findApp(id) {
  return wizardApps.find(a => a.id === id) || null
}
