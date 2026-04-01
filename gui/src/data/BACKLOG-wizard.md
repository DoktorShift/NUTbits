# Connection Wizard & Deep Links — Backlog

Paused as of 2026-04-01. Pick up when NUTbits goes live with a domain or NUTbits Cloud launches.

## Wizard — Ready Now

- [ ] Add real app icons (SVG or PNG) to the catalog grid — currently showing first-letter fallback
- [ ] Verify BuhoGO finalize instructions match their actual settings path once BuhoGO ships NWC support
- [ ] Test the full modal flow end-to-end against a running NUTbits backend
- [ ] Add `notifications` permission to the catalog (NIP-47 notification types) once backend supports it
- [ ] Consider code-splitting the wizard steps out of the Connections chunk if bundle size matters

## Wizard — Future

- [ ] Connection auto-detection: poll `GET /api/v1/connections` after creation, show "Connected!" badge when the app's first request comes through (like Alby Hub's `lastUsedAt` check)
- [ ] Per-app icons: either ship small PNGs in `gui/public/app-icons/` or use external URLs from the catalog
- [ ] Search/filter in the app grid (useful once catalog exceeds ~20 apps)
- [ ] "Suggested for you" section based on which apps the user already has connections to
- [ ] Budget presets as radio buttons ("Low / Medium / Unlimited") before showing raw number inputs

## Deep Links — Parked Until Domain Exists

- [ ] `/connect` route works but has no practical entry point without a public URL
- [ ] When NUTbits Cloud launches (fixed domain), deep links become the primary connection method
- [ ] Add a "Share connect link" button on the Connections page that generates a `/connect?appname=...` URL for the operator to share
- [ ] Register NUTbits in the NWC ecosystem directory at nwc.dev
- [ ] Implement NWA (Nostr Wallet Auth, NIP PR #1818) — the one-click flow where the secret stays on the client device
- [ ] Protocol handler `web+nostrnwc://` only works if the GUI tab is already open — explore service worker registration for PWA mode

## App Catalog — Apps to Add

- [ ] Zeus (mobile Lightning wallet)
- [ ] Coracle (Nostr web client)
- [ ] Snort (Nostr web client)
- [ ] Nostur (iOS Nostr client)
- [ ] Stacker News
- [ ] Bitrefill (gift cards with Lightning)
- [ ] Zap.Store (app store)
- [ ] Boardwalk Cash (web Cashu wallet)
- [ ] Minibits (mobile Cashu wallet)
- [ ] Clams (accounting)

## Files to Know

```
gui/src/data/appCatalog.js              ← add new apps here
gui/src/components/wizard/StepSelectApp.vue
gui/src/components/wizard/StepConfigure.vue  ← unused standalone, kept for future
gui/src/components/wizard/StepFinalize.vue
gui/src/components/ui/Stepper.vue            ← unused standalone, kept for future
gui/src/views/Connections.vue                ← modal wizard lives here
gui/src/views/DeepLinkConnect.vue            ← parked deep link page
docs/DEEP-LINKS.md                          ← deep link documentation
blog/09-one-tap-to-a-wallet.md              ← blog post (publish when deep links go live)
```
