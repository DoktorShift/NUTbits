/**
 * Deeplink App Registry — apps that connect to NUTbits via deep link URL.
 *
 * Each deeplink connection is DEDICATED — own balance starting at 0,
 * funded by the user. The app developer implements the deeplink on
 * their side, NUTbits handles the rest.
 *
 * HOW TO ADD YOUR APP:
 *   1. Implement the deeplink flow (see docs/NWC-DEEPLINK-INTEGRATION.md)
 *   2. Add an entry to the array below
 *   3. Drop your icon at gui/public/app-icons/{id}.png (256x256 PNG)
 *   4. Submit a PR — see docs/DEEPLINK-APPS.md for the full guide
 *
 * Required fields:
 *   id             - unique, lowercase, kebab-case
 *   name           - display name (matched against ?appname= in the URL)
 *   desc           - one-line description
 *   category       - social | wallet | platform | merchant | media | other
 *   permissions    - array of NWC methods the app needs
 *   budget         - { maxPaymentSats, maxDailySats }
 *   callbackScheme - the app's URI scheme (e.g. 'myapp://')
 *
 * Optional fields:
 *   links          - { web, apple, play, chrome, firefox }
 *
 * Icon: drop {id}.png in gui/public/app-icons/
 */

// ── Permission presets (same as appCatalog — keep in sync) ──────────

var ALL_PERMISSIONS = [
  'pay_invoice', 'make_invoice', 'get_balance',
  'list_transactions', 'get_info', 'lookup_invoice',
]

var SPEND_ONLY = ['pay_invoice', 'get_balance', 'get_info']
var SOCIAL = ['pay_invoice', 'get_balance', 'get_info', 'lookup_invoice']
var FULL = ALL_PERMISSIONS

// ── Budget presets ──────────────────────────────────────────────────

var BUDGET_LOW    = { maxPaymentSats: 1000,  maxDailySats: 5000 }
var BUDGET_MEDIUM = { maxPaymentSats: 10000, maxDailySats: 50000 }
var BUDGET_HIGH   = { maxPaymentSats: 0,     maxDailySats: 0 }

// ── Registry ────────────────────────────────────────────────────────

export var deeplinkApps = [
  {
    id: 'buho-jump',
    name: 'Buho Jump',
    desc: 'Browser extension for digital Identity & Lightning payments on the web',
    category: 'wallet',
    permissions: FULL,
    budget: BUDGET_HIGH,
    callbackScheme: 'chrome-extension://',
    links: {
      web: 'https://home.mybuho.de/jump',
    },
  },

  // ── Add your deeplink app above this line ───────────────────────
  // See docs/DEEPLINK-APPS.md for the step-by-step guide.
]

// ── Lookup ──────────────────────────────────────────────────────────

/**
 * Validate a callback URI against the deeplink app registry.
 * Known apps: callback must match their registered scheme.
 * Unknown apps: only non-http(s) schemes allowed (app deep links like myapp://).
 * Empty callback is always allowed (NWC string shown on screen).
 * Returns { valid, reason }.
 */
export function validateCallback(callbackUri, appMatch) {
  if (!callbackUri) return { valid: true }
  // Known app — callback must match registered scheme
  if (appMatch?.callbackScheme) {
    if (callbackUri.startsWith(appMatch.callbackScheme)) return { valid: true }
    return { valid: false, reason: `Callback must use ${appMatch.callbackScheme}` }
  }
  // Unknown app — block http(s) to prevent open redirect to arbitrary web servers
  try {
    var url = new URL(callbackUri)
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return { valid: false, reason: 'HTTP callbacks not allowed for unregistered apps' }
    }
  } catch (e) {
    // Not a parseable URL — likely an app scheme like myapp://path, allow it
  }
  return { valid: true }
}

/**
 * Find a deeplink app by the appname from the deep link URL.
 * Case-insensitive match against id or name.
 * Returns null for unknown apps (they still work, just without pre-config).
 */
export function findDeeplinkApp(appname) {
  if (!appname) return null
  var lower = appname.toLowerCase()
  return deeplinkApps.find(a =>
    a.id === lower ||
    a.name.toLowerCase() === lower ||
    a.name.toLowerCase().replace(/\s+/g, '') === lower
  ) || null
}
