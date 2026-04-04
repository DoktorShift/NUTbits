# NWC Deep Link Integration

> **Audience:** App developers integrating their app with NUTbits via deep links.
> This is the full protocol spec — how the deeplink flow works, what your app needs to implement, and how the dedicated balance model works.
>
> Looking to **register your app** in the NUTbits catalog? See [DEEPLINK-APPS.md](./DEEPLINK-APPS.md) instead — it's a quick step-by-step for submitting a PR.

**[How It Works](#how-it-works) · [Dedicated Balance](#dedicated-balance-model) · [Integration Steps](#integration-steps) · [App Catalog](#the-nutbits-app-catalog) · [Funding](#funding-a-dedicated-connection) · [Errors](#error-handling) · [Local Dev](#local-development) · [Checklist](#checklist-for-app-developers)**

Connect your app to a NUTbits wallet in one tap. No QR codes, no copy-paste.

Every deeplink connection is **dedicated** — it gets its own isolated balance starting at 0 sats. The user funds it explicitly through NUTbits. Your app never has access to the full wallet.

---

## How It Works

```
Your App                              NUTbits
────────                              ───────

1. User taps "Connect Wallet"
2. Build deep link URL with your
   app identity + callback
3. Open URL ──────────────────────►
                                      4. NUTbits creates a dedicated
                                         NWC connection (balance: 0)
                                         with the requested permissions
                                      5. Redirects to your callback
              ◄──────────────────────    with NWC pairing string
6. Parse NWC string from callback
7. Store it, start using NIP-47

The entire flow happens in one redirect.
The user stays in your app — no manual
switching to NUTbits needed.

Your app can only spend what was
funded into its dedicated balance.
```

---

## Dedicated Balance Model

Deeplink connections are **sub-wallets**, not full wallet access.

| Property | Value |
|----------|-------|
| Starting balance | 0 sats |
| Balance source | User funds it |
| Spending scope | Only the dedicated balance |
| `get_balance` returns | The dedicated balance, not the wallet total |
| `pay_invoice` checks | The dedicated balance, not the wallet total |
| `make_invoice` credits | Incoming payments go to the dedicated balance |
| On revoke | Remaining balance returns to the main wallet |

This means your app cannot overdraw, cannot see the user's total funds, and cannot interfere with other connections.

---

## Integration Steps

### Step 1: Build the Deep Link URL

```
https://<nutbits-host>/connect?appname=<name>&appicon=<icon_url>&callback=<callback_uri>
```

#### Parameters

| Parameter  | Required | Description |
|------------|----------|-------------|
| `appname`  | **Yes**  | Your app's display name. If it matches a known app in NUTbits' catalog, permissions and limits are pre-configured. |
| `appicon`  | No       | URL to your app's icon (square, any size). Shown on the approval screen. |
| `callback` | No       | URI that NUTbits redirects to with the NWC string. Without it, the user copies manually. |

All values must be URI-encoded.

### Step 2: Open the URL

This is a navigation, not an API call.

```javascript
// Web app
var nutbitsUrl = localStorage.getItem('nutbits_url') || 'http://localhost:5173'

var params = new URLSearchParams({
  appname: 'MyApp',
  appicon: 'https://myapp.com/icon.png',
  callback: window.location.origin + '/nwc-callback'
})

window.location.href = nutbitsUrl + '/connect?' + params.toString()
```

```swift
// iOS — use your app's URI scheme as callback
let url = "nostrnwc://connect?appname=MyApp&appicon=https%3A%2F%2Fmyapp.com%2Ficon.png&callback=myapp%3A%2F%2Fnwc-connected"
UIApplication.shared.open(URL(string: url)!)
```

```kotlin
// Android
val intent = Intent(Intent.ACTION_VIEW, Uri.parse(
  "nostrnwc://connect?appname=MyApp&appicon=https%3A%2F%2Fmyapp.com%2Ficon.png&callback=myapp%3A%2F%2Fnwc-connected"
))
startActivity(intent)
```

### Step 3: Handle the Callback

NUTbits redirects to your callback with the NWC string:

```
<your-callback>?value=nostr%2Bwalletconnect%3A%2F%2F<pubkey>%3Frelay%3D...%26secret%3D...
```

Parse it:

```javascript
// Your callback route handler
var url = new URL(window.location.href)
var nwcString = url.searchParams.get('value')

if (nwcString) {
  var decoded = decodeURIComponent(nwcString)
  // decoded = nostr+walletconnect://<pubkey>?relay=wss://...&secret=<hex>

  var nwcUrl = new URL(decoded)
  var pubkey = nwcUrl.hostname || nwcUrl.pathname.replace('//', '')
  var relay  = nwcUrl.searchParams.get('relay')
  var secret = nwcUrl.searchParams.get('secret')

  // Store persistently and start using NIP-47
  localStorage.setItem('nwc_connection', decoded)
}
```

### Step 4: Use the Connection

Communicate via NIP-47 over the Nostr relay in the connection string.

| Method | What it does |
|--------|-------------|
| `pay_invoice` | Pay a bolt11 invoice (from the dedicated balance) |
| `make_invoice` | Create an invoice to receive sats (credited to the dedicated balance) |
| `get_balance` | Read the dedicated balance (not the full wallet) |
| `list_transactions` | Fetch this connection's payment history |
| `get_info` | Wallet metadata and supported methods |
| `lookup_invoice` | Check status of a specific invoice |

All messages are encrypted between your app's secret key and NUTbits' pubkey.

---

## The NUTbits App Catalog

NUTbits separates apps into two registries:

| Registry | File | Connection type |
|----------|------|-----------------|
| `wizardApps` | `gui/src/data/appCatalog.js` | Manual flow — dedicated by default (user can choose shared) |
| `deeplinkApps` | `api/deeplink-apps.js` | Automatic flow — always dedicated (own balance, starts at 0) |

When your `appname` matches an entry in `deeplinkApps`, the approval screen pre-fills your app's recommended permissions and budget limits, and shows a "Verified app" badge.

**Benefits of being in the deeplink registry:**
- Users see "Verified app — permissions pre-configured"
- Permissions and limits match what your app actually needs
- Consistent experience across all NUTbits installations

### Adding Your Deeplink App

Add an entry to the `deeplinkApps` array in `api/deeplink-apps.js`:

```javascript
{
  id: 'your-app',                          // lowercase, kebab-case
  name: 'Your App',                        // display name (matched against ?appname= in deeplink)
  desc: 'One-line description of your app',
  category: 'wallet',                      // social | wallet | platform | merchant | media | other
  icon: 'your-app',                        // icon identifier (letter-based for now)
  permissions: ['pay_invoice', 'get_balance', 'get_info'],  // what your app needs
  budget: { maxPaymentSats: 1000, maxDailySats: 5000 },     // recommended limits
  callbackScheme: 'yourapp://',            // your app's URI scheme for the return redirect
  links: {
    web: 'https://yourapp.com',            // optional
  },
}
```

Submit a PR to the NUTbits repo. Use `buho-jump` as reference.

### Permission Presets

| Preset | Permissions | Use case |
|--------|------------|----------|
| `SPEND_ONLY` | `pay_invoice`, `get_balance`, `get_info` | Apps that only send payments |
| `SOCIAL` | `pay_invoice`, `get_balance`, `get_info`, `lookup_invoice` | Nostr clients, zapping |
| `FULL` | All 6 methods | Wallets, full payment interfaces |

### Budget Presets

| Preset | Max payment | Max daily | Use case |
|--------|------------|-----------|----------|
| `BUDGET_LOW` | 1,000 sats | 5,000 sats | Social tipping, micro-payments |
| `BUDGET_MEDIUM` | 10,000 sats | 50,000 sats | Moderate commerce |
| `BUDGET_HIGH` | Unlimited | Unlimited | Full wallets, platforms |

---

## Funding a Dedicated Connection

After the deeplink connection is created, the balance is 0. The user funds it through NUTbits:

**API:**
```
POST /api/v1/connections/<pubkey>/fund
{ "amount_sats": 5000 }
```

Response:
```json
{
  "pubkey": "<pubkey>",
  "funded_sats": 5000,
  "dedicated_balance_msat": 5000000,
  "dedicated_balance_sats": 5000
}
```

**Withdraw (pull sats back to main wallet):**
```
POST /api/v1/connections/<pubkey>/withdraw
{ "amount_sats": 2000 }
```

Omit `amount_sats` or set to 0 to withdraw everything.

**On revoke:** remaining dedicated balance automatically returns to the main wallet.

---

## Error Handling

| Case | What happens |
|------|-------------|
| User denies | NUTbits does not call your callback. Handle as timeout or let the user retry. |
| Connection fails | NUTbits shows an error screen with retry. Your callback is not called. |
| No callback param | NUTbits displays the NWC string on screen for manual copy. |
| Insufficient balance | `pay_invoice` returns `INSUFFICIENT_BALANCE` with the available sats. The user needs to fund the connection. |
| Unknown app | Works fine — all permissions enabled by default, user configures manually. |

---

## Local Development

NUTbits runs locally until NUTbits Cloud ships with a public domain.

Deeplinks work directly on the **API port** — no GUI needed.

| Service | Default Port | Env Variable |
|---------|-------------|--------------|
| API (deeplinks work here) | `3338` | `NUTBITS_API_PORT` |
| GUI (optional) | `5173` / `8080` | `NUTBITS_GUI_PORT` |

**Quick test — open directly in browser:**
```
http://localhost:3338/connect?appname=TestApp&callback=
```

No callback means NUTbits shows the NWC string on screen for manual copy.

**Cross-device (phone testing against laptop):**
```
http://192.168.1.42:3338/connect?appname=TestApp&callback=myapp://nwc-connected
```

Your app should ask the user for their NUTbits URL once and store it. When NUTbits Cloud launches, default to the public domain.

---

## File Reference

| File | Purpose |
|------|---------|
| `api/server.js` | `GET /connect` — deeplink entry point, served by the API (no GUI needed) |
| `api/deeplink-page.js` | Self-contained HTML5 page with connection animation |
| `api/handlers/index.js` | `createDeeplinkConnection()`, `POST /api/v1/connections`, `/fund`, `/withdraw` |
| `api/deeplink-apps.js` | Deeplink app registry — permissions, budgets, callback schemes |
| `gui/src/data/appCatalog.js` | Wizard app catalog — manual paste flow (GUI only) |
| `nutbits.js` | NWC command handlers with dedicated balance logic |

---

## Checklist for App Developers

Before your deeplink integration works end-to-end:

- [ ] Deep link URL built with `appname` and `callback`
- [ ] Callback handler parses the `value` query parameter
- [ ] NWC string stored persistently
- [ ] NIP-47 client implementation (send/receive over Nostr relay)
- [ ] Handle `INSUFFICIENT_BALANCE` errors (tell user to fund via NUTbits)
- [ ] Fallback: manual NWC string paste input
- [ ] All query parameter values URI-encoded
- [ ] App icon hosted at a public URL (optional but recommended)

To register your app as a known deeplink partner:

- [ ] Add entry to `deeplinkApps` array in `api/deeplink-apps.js`
- [ ] Set `permissions` to only what your app actually needs
- [ ] Set `budget` to reasonable defaults for your use case
- [ ] Set `callbackScheme` matching your app's URI scheme
- [ ] Submit PR to the NUTbits repo (use `buho-jump` as reference)

---

## Security

- NUTbits never auto-approves. The user always sees and confirms.
- `appname` and `appicon` are display-only, never executed.
- Dedicated connections cannot access the main wallet balance.
- The NWC secret is only sent to the callback URI.
- Connections can be revoked at any time. Balance returns to main wallet.
- Non-dedicated connections (manual NWC) are protected — their available balance excludes funds allocated to dedicated connections.

---

## Internal Notes

> Not for app developers. Backend context for NUTbits maintainers.

**Auto-fund on connect (not implemented):** The deeplink app entry could carry a `defaultFundSats` field — a suggested amount to fund the connection with immediately after approval. The connection page would show "Fund with X sats?" before redirecting. This removes the manual funding step and improves first-use UX. Deferred until the funding flow is proven in production. When ready, add `defaultFundSats` to the deeplink app schema and wire it into `api/deeplink-page.js` post-connection.
