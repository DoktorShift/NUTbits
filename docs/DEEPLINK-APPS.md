# Deeplink Apps

> **Audience:** Developers who want to **add their app** to the NUTbits deeplink registry.
> This is a step-by-step guide for submitting a PR — what files to touch, what fields to set, where to put your icon.
>
> Looking for the **full protocol spec** (how deeplinks work, the dedicated balance model, callback handling)? See [NWC-DEEPLINK-INTEGRATION.md](./NWC-DEEPLINK-INTEGRATION.md).

**[Registered Apps](#registered-apps) · [Two Flows](#two-connection-flows-in-nutbits) · [Add Your App](#how-to-add-your-deeplink-app) · [What Happens](#what-happens-when-your-app-connects) · [File Map](#file-map)**

Apps that connect to NUTbits automatically via deep link. Each app gets a **dedicated NWC connection** with its own balance, starting at 0 sats.

---

## Registered Apps

| App | Category | Permissions | Callback Scheme |
|-----|----------|-------------|-----------------|
| Buho Jump | wallet | full | `chrome-extension://` |

> This table is for quick reference. The source of truth is `api/deeplink-apps.js`.

---

## Two Connection Flows in NUTbits

NUTbits supports two ways for apps to connect:

### Wizard (manual)

The user creates an NWC string inside NUTbits and pastes it into the app.

- **Dedicated balance by default** (own balance, starts at 0) — user can opt into shared
- The user chooses the balance type during connection setup
- App entries live in `wizardApps` in `gui/src/data/appCatalog.js`
- No work needed from the app developer — it's a NUTbits-side convenience

### Deeplink (automatic)

The app opens a NUTbits URL, a dedicated connection is created automatically, and the NWC string goes back via callback. The user stays in your app — no manual switching needed.

- **Always dedicated** — own isolated balance, starts at 0, no opt-out
- The app developer builds the deeplink flow on their side
- App entries live in `deeplinkApps` in `api/deeplink-apps.js`
- Each app gets its own trace — permissions, budget, callback scheme

**This guide is for the deeplink flow.**

---

## How to Add Your Deeplink App

### Step 1: Implement the deeplink in your app

Your app needs to:
1. Build a URL: `https://<nutbits-host>/connect?appname=YourApp&appicon=<url>&callback=<your-scheme>`
2. Open it (browser navigation, not API call)
3. Handle the callback: parse the `value` query parameter to get the NWC string
4. Store the NWC string and use it for NIP-47 communication

See [NWC-DEEPLINK-INTEGRATION.md](./NWC-DEEPLINK-INTEGRATION.md) for full details, code examples, and error handling.

### Step 2: Add your entry to `deeplink-apps.js`

Open `api/deeplink-apps.js` and add to the `deeplinkApps` array:

```javascript
  {
    id: 'your-app',           // lowercase, kebab-case, unique
    name: 'Your App',         // must match the ?appname= you send in the deeplink
    desc: 'What your app does in one line',
    category: 'wallet',       // social | wallet | platform | merchant | media | other
    permissions: ['pay_invoice', 'get_balance', 'get_info'],
    budget: { maxPaymentSats: 1000, maxDailySats: 5000 },
    callbackScheme: 'yourapp://',
    links: {
      web: 'https://yourapp.com',
    },
  },
```

**Fields explained:**

| Field | Required | What it does |
|-------|----------|-------------|
| `id` | Yes | Unique identifier. Lowercase, kebab-case. Also used for icon filename. |
| `name` | Yes | Display name. This is matched against `?appname=` in the deeplink URL (case-insensitive). |
| `desc` | Yes | One-line description shown in the UI. |
| `category` | Yes | Groups your app in the catalog. |
| `permissions` | Yes | NWC methods your app needs. Only request what you use. |
| `budget` | Yes | Recommended spending limits. `{ maxPaymentSats: 0, maxDailySats: 0 }` = unlimited. |
| `callbackScheme` | Yes | Your app's URI scheme for the return redirect. |
| `links` | No | URLs to your app's website, app store listings, etc. |

**Permission presets (use the constants in the file):**

| Preset | Methods | Typical use |
|--------|---------|-------------|
| `SPEND_ONLY` | pay, balance, info | Send-only apps |
| `SOCIAL` | pay, balance, info, lookup | Nostr clients |
| `FULL` | All 6 methods | Full wallet interfaces |

**Budget presets:**

| Preset | Per payment | Per day |
|--------|-----------|---------|
| `BUDGET_LOW` | 1,000 sats | 5,000 sats |
| `BUDGET_MEDIUM` | 10,000 sats | 50,000 sats |
| `BUDGET_HIGH` | Unlimited | Unlimited |

### Step 3: Add your app icon

Drop a PNG in `gui/public/app-icons/`:

```
gui/public/app-icons/your-app.png
```

The filename **must match** your `id` field.

| Property | Requirement |
|----------|-------------|
| Format | PNG, transparent background preferred |
| Size | 256x256 px (minimum 128x128) |
| Shape | Square — the UI renders it in a circle |
| File size | Under 50 KB |

If no icon is provided, the UI falls back to the first letter of your app name.

### Step 4: Submit your PR

Your PR should contain exactly:
- One new entry in the `deeplinkApps` array in `api/deeplink-apps.js`
- One icon file at `gui/public/app-icons/{id}.png`
- Nothing else

Use the existing `buho-jump` entry as reference.

---

## What Happens When Your App Connects

1. Your app opens `https://<nutbits>/connect?appname=YourApp&callback=yourapp://...`
2. NUTbits matches `YourApp` against the `deeplinkApps` registry
3. If matched: permissions and budget are applied from the catalog (verified app)
4. If not matched: default permissions are used
5. NUTbits creates a **dedicated** NWC connection (balance: 0 sats)
6. Redirects to your callback with the NWC string — the user stays in your app
7. The user funds the connection through NUTbits when ready

---

## File Map

```
api/deeplink-apps.js              ← your entry goes here (deeplinkApps array)
gui/public/app-icons/{id}.png     ← your icon goes here
api/server.js                     ← GET /connect handler (serves deeplink page)
api/deeplink-page.js              ← standalone HTML5 connection page
api/handlers/index.js             ← createDeeplinkConnection() logic
docs/NWC-DEEPLINK-INTEGRATION.md  ← full protocol spec
docs/DEEPLINK-APPS.md             ← this file (contributor guide)
gui/public/app-icons/README.md    ← icon spec
```
