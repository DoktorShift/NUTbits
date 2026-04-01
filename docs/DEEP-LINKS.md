# NWC Deep Links (NIP-47)

NUTbits supports the NIP-47 deep link protocol, allowing client apps to request
NWC connections without QR scanning or manual paste. The user taps one button,
approves in NUTbits, and the pairing code is sent back automatically.

## How it works

NUTbits acts as the **wallet side** (NWC server). When a client app wants to
connect, it opens a deep link pointing at NUTbits. NUTbits shows an approval
screen, creates the connection using the existing `POST /api/v1/connections`
endpoint, and returns the NWC pairing string to the client via a callback URI.

```
Client App                              NUTbits
──────────                              ───────
1. Opens deep link URL  ──────────────►
                                        2. Parses params (appname, appicon, callback)
                                        3. Shows approval screen with permissions
                                        4. User approves
                                        5. Creates NWC connection (keypair + relay sub)
                                        6. Opens callback URI with pairing code
                        ◄──────────────
7. Receives NWC string, connection live
```

## URL format

### Direct URL (recommended for web-to-web)

```
https://<nutbits-host>/connect?appname=<name>&appicon=<url>&callback=<uri>
```

### Protocol handler (native app → browser)

```
nostrnwc://connect?appname=<name>&appicon=<url>&callback=<scheme>
```

On the web, browsers require the `web+` prefix. NUTbits registers
`web+nostrnwc://` via `navigator.registerProtocolHandler` on startup. The
browser rewrites this to:

```
/connect?deeplink=web%2Bnostrnwc%3A%2F%2Fconnect%3Fappname%3D...
```

NUTbits parses both formats transparently.

## Query parameters

All values must be URI-encoded.

| Parameter  | Required | Description                                         |
|------------|----------|-----------------------------------------------------|
| `appname`  | Yes      | Display name of the requesting client app            |
| `appicon`  | No       | URL to the client's icon (shown in approval screen)  |
| `callback` | No       | URI scheme NUTbits opens to return the NWC string    |

If `callback` is omitted, NUTbits displays the NWC string on-screen for manual
copy. This is useful for testing or browser-only flows where no URI scheme is
available.

## Callback response

On approval, NUTbits opens:

```
<callback>?value=<nwc_string>
```

Where `value` is the full URI-encoded NWC pairing code:

```
nostr+walletconnect://<app_pubkey>?relay=<relay>&secret=<secret>&lud16=<optional>
```

## What gets created

The deep link creates a standard NWC connection identical to one created via
the Connections page or API. It includes:

- **Keypair**: fresh app private key, user secret, derived public keys
- **Relay subscriptions**: connection starts listening on configured relays
- **Full permissions by default**: `pay_invoice`, `make_invoice`, `get_balance`,
  `list_transactions`, `get_info`, `lookup_invoice` (user can toggle any off)
- **Optional limits**: max per-payment sats, max daily sats
- **Mint binding**: connection is bound to the selected (or active) mint
- **Label**: `"<appname> (deep link)"` for identification in the connections list

The connection supports all NIP-47 request types including `get_info` (wallet
metadata/info events) and `lookup_invoice` (invoice status notifications).

## Approval screen

The `/connect` route renders a full-screen view (no sidebar/header) with:

1. **Bridge visualization** - SVG showing the two endpoints (client app and
   NUTbits) with a connection path that draws in during the linking process
2. **App identity** - name and icon from the deep link params
3. **Permission checkboxes** - all 6 NWC capabilities, individually toggleable
4. **Mint selector** - if multiple mints are configured
5. **Spending limits** - optional max-per-payment and max-daily-sats fields
6. **Approve / Deny** buttons

After approval, a metadata card shows the created connection details (pubkey,
permissions, mint, limits) before redirecting.

## Integration guide for client apps

### Web app (simplest)

```javascript
// Build the deep link URL pointing at the user's NUTbits instance
var nutbitsUrl = 'https://nutbits.example.com'  // user provides this
var params = new URLSearchParams({
  appname: 'My App',
  appicon: 'https://myapp.com/icon.png',
  callback: window.location.origin + '/nwc-callback',
})

// Open NUTbits connect page
window.location.href = `${nutbitsUrl}/connect?${params}`
```

Handle the callback on your `/nwc-callback` route:

```javascript
var url = new URL(window.location.href)
var nwcString = url.searchParams.get('value')
if (nwcString) {
  // Parse and store the NWC connection
  var decoded = decodeURIComponent(nwcString)
  console.log('Connected:', decoded)
}
```

### Mobile app (native deep link)

```
nostrnwc://connect?appname=MyApp&appicon=https%3A%2F%2F...&callback=myapp%3A%2F%2Fnwc
```

Register `myapp://nwc` as a URI handler in your app. When NUTbits opens it,
parse the `value` query parameter to get the NWC string.

### Desktop app (protocol handler)

If the user's NUTbits is running locally with the GUI server, `nostrnwc://` can
be registered as a system protocol handler. The NUTbits GUI registers
`web+nostrnwc://` in the browser on startup via `registerProtocolHandler`.

## Files

| File | Purpose |
|------|---------|
| `gui/src/views/DeepLinkConnect.vue` | Full-screen connection approval view |
| `gui/src/router.js` | `/connect` route with `meta: { fullscreen: true }` |
| `gui/src/App.vue` | Conditional layout bypass for fullscreen routes |
| `gui/src/main.js` | `web+nostrnwc://` protocol handler registration |
| `gui/public/nutbits-logo.svg` | NUTbits logo for static serving in the bridge SVG |

## Architecture notes

- **Zero backend changes** - reuses the existing `POST /api/v1/connections` API
  and the `createNWCconnection()` function in `nutbits.js`
- **Fullscreen route** - `/connect` sets `meta.fullscreen = true`, which causes
  `App.vue` to render `<router-view>` without the `AppLayout` wrapper
- **CSS-driven animation** - the bridge path uses `stroke-dashoffset` transitions
  instead of `requestAnimationFrame` loops. Only the signal dot uses SVG
  `<animateMotion>`. No external animation libraries.
- **Protocol handler** - `navigator.registerProtocolHandler` is called in
  `main.js` on startup. It is wrapped in try/catch since some browsers restrict
  it. The deep link param parser handles both direct URLs and the `?deeplink=`
  wrapper format from the protocol handler.

## Security considerations

- The `callback` URI is opened via `window.location.href` after the user
  explicitly clicks "Approve". NUTbits never auto-approves connections.
- The `appname` and `appicon` values are only used for display (text content
  and `<img src>`). They are not injected into HTML or executed.
- The NWC pairing secret is only sent to the `callback` URI and never stored
  in browser history or local storage by the deep link view.
- Connections created via deep link are identical to manual connections and
  can be revoked at any time from the Connections page.
