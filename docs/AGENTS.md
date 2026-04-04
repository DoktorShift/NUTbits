# AGENTS.md

**[Overview](#project-overview) · [Setup](#setup-commands) · [Structure](#project-structure) · [Style](#code-style) · [Domain](#domain-knowledge) · [API](#api-endpoints) · [Boundaries](#boundaries) · [Security](#security-hardening-recent)**

## Project overview

NUTbits is a Cashu ecash to NWC (Nostr Wallet Connect) bridge. It connects to a Cashu mint, manages ecash proofs, and exposes a full NIP-47 wallet service over Nostr relays. Any NWC-compatible app (LNbits, Alby, Amethyst, etc.) can use it to send and receive Lightning payments through the mint.

- **Runtime:** Node.js >= 18, ES modules (`import`/`export`, `"type": "module"`)
- **Dependencies:** `@cashu/cashu-ts`, `nostr-core`, `bolt11`, `dotenv`
- **Optional deps:** `better-sqlite3` (SQLite backend), `mysql2` (MySQL backend), `qrcode-terminal` (QR display in CLI)
- **License:** AGPL-3.0

## Setup commands

```bash
git clone https://github.com/DoktorShift/nutbits.git && cd nutbits
npm install
cp .env.example .env
# Edit .env: set NUTBITS_MINT_URL and NUTBITS_STATE_PASSPHRASE
npm start                # Start the bridge service
nutbits                  # Launch interactive TUI (in another terminal)
```

## Project structure

```
nutbits.js               # Core bridge: mint management, NWC protocol, payment flows (~1500 lines)
bin/nutbits.js           # CLI entry point, command dispatch, argument parsing
api/
  server.js              # HTTP/Unix socket server, request handler, auth, deeplink /connect endpoint
  router.js              # URL routing with param matching
  middleware/auth.js      # Bearer token auth
  handlers/index.js      # All REST API endpoints + createDeeplinkConnection()
  deeplink-apps.js       # Deeplink app registry (known apps, permissions, budgets, callback schemes)
  deeplink-page.js       # Self-contained HTML5 connection page (served by API, no GUI needed)
cli/
  commands/              # One file per CLI command (status, pay, receive, connect, fund, withdraw, etc.)
  tui/                   # Terminal UI (app.js, layout.js, menu.js, panels.js)
  colors.js              # ANSI color helpers
  render.js              # Output formatting (tables, key-value, headings)
  prompts.js             # Interactive prompts (input, select, confirm, spinner)
  client.js              # API client for CLI-to-service communication
store/
  index.js               # Storage factory + audit logging wrapper
  file-store.js          # Encrypted file backend (AES-256-GCM)
  sqlite-store.js        # SQLite backend with scrypt migration
  mysql-store.js         # MySQL backend with scrypt migration
  crypto-utils.js        # Shared encryption: AES-256-GCM, scrypt key derivation (N=65536)
  connection-utils.js    # Connection key validation helpers
gui/
  src/views/             # Vue 3 pages: Dashboard, Mints, Relays, Connections, Pay, Receive, History, Fees, Settings
  src/stores/            # Pinia stores: mints, relays, connections, balance, history, fees, config, status, logs
  src/components/ui/     # Shared components: Badge, Modal, StatCard, BarChart, Sparkline, HelpTip, Spinner, EmptyState
  src/api/client.js      # API client (GET/POST/PATCH/DELETE with auto-detect/bootstrap)
```

## Code style

- ES modules everywhere. No CommonJS, no `require()`.
- `var` (not `let`/`const`) - this is an intentional project convention.
- Semicolons at line ends.
- Minimal dependencies - stdlib preferred over npm packages.
- No TypeScript, no build step. Raw JS, runs directly with `node`.
- Comments use `// ── Section Name ──` dividers for major blocks.

Example of project style:
```javascript
var calcServiceFee = (amountSats, connState) => {
    var ppm = connState?.service_fee_ppm ?? config.serviceFeePpm
    var base = connState?.service_fee_base ?? config.serviceFeeBase
    if (!ppm && !base) return 0
    return Math.floor(amountSats * ppm / 1_000_000) + base
}
```

## Domain knowledge

Agents working on this codebase need to understand these concepts:

**Cashu ecash:**
- Mints issue blind-signed ecash tokens (proofs). Proofs are bearer instruments; whoever holds them can spend them.
- Proofs are cryptographically bound to the issuing mint. Proofs from Mint A cannot be used at Mint B.
- Minting (NUT-04): user pays a Lightning invoice, receives ecash proofs.
- Melting (NUT-05): user surrenders ecash proofs, mint pays a Lightning invoice.
- Ecash is custodial. The mint operator can see all operations.

**NWC (Nostr Wallet Connect / NIP-47):**
- A protocol for wallet communication over Nostr relays.
- Client sends kind-23194 events (requests). Wallet responds with kind-23195 events (responses).
- Messages are encrypted (NIP-44 preferred, NIP-04 fallback).
- Supported methods: `get_info`, `get_balance`, `make_invoice`, `pay_invoice`, `lookup_invoice`, `list_transactions`.

**How NUTbits bridges them:**
- Incoming `pay_invoice` → melt ecash through mint → Lightning payment sent.
- Incoming `make_invoice` → create mint quote → return Lightning invoice → on payment, mint ecash.
- Service fees are deducted from the sender's ecash on outgoing payments only.

**Dedicated connections:**
- All NWC connections are dedicated by default — own isolated balance starting at 0 sats.
- Shared balance (full wallet access) requires explicit opt-in (`dedicated: false` in API).
- Deeplink connections are ALWAYS dedicated — external apps cannot request shared access.
- `get_balance` returns the dedicated balance, not the global wallet.
- `pay_invoice` checks both the dedicated balance and the global proof pool.
- Non-dedicated connections see global balance minus all dedicated allocations.
- The user funds dedicated connections via `POST /api/v1/connections/:pubkey/fund`.
- On revoke, remaining dedicated balance returns to the main wallet automatically.

## API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/status` | Dashboard data (balance, connections, mint health) |
| GET | `/api/v1/balance` | Per-mint balance breakdown |
| GET | `/api/v1/connections` | List active NWC connections (includes lud16) |
| GET | `/api/v1/connections/export` | Connection details including NWC strings (sensitive) |
| POST | `/api/v1/connections` | Create NWC connection (accepts lud16, resolves via LNURL) |
| PATCH | `/api/v1/connections/:pubkey` | Update connection metadata (lud16 set/clear) |
| DELETE | `/api/v1/connections/:pubkey` | Revoke a connection |
| POST | `/api/v1/connections/:pubkey/fund` | Fund a dedicated connection's balance |
| POST | `/api/v1/connections/:pubkey/withdraw` | Withdraw from a dedicated connection |
| GET | `/connect` | Deeplink entry — serves HTML connection page (public, no auth) |
| POST | `/connect` | Deeplink create — returns NWC string as JSON (called by the page) |
| POST | `/api/v1/pay` | Pay a Lightning invoice OR Lightning Address (auto-detects) |
| POST | `/api/v1/receive` | Create a Lightning invoice (accepts mint selection) |
| POST | `/api/v1/receive/check` | Check if invoice was paid |
| GET | `/api/v1/lnurl/resolve` | Resolve a Lightning Address to LNURL-pay metadata |
| GET | `/api/v1/history` | Transaction history with filtering |
| GET | `/api/v1/history/export` | Export history as CSV/JSON |
| GET | `/api/v1/mints` | Mint info and health status |
| POST | `/api/v1/mints/active` | Switch active mint at runtime |
| GET | `/api/v1/nuts` | NUT support matrix |
| GET | `/api/v1/relays` | Relay connection status |
| GET | `/api/v1/config` | Running configuration |
| POST | `/api/v1/config` | Update config at runtime (hot-reloadable keys) |
| GET | `/api/v1/config/env` | Read .env file variables and metadata |
| POST | `/api/v1/config/env` | Write to .env file |
| GET | `/api/v1/fees` | Service fee revenue tracking |
| GET | `/api/v1/logs` | Recent log entries |
| GET | `/api/v1/backup` | Download encrypted state backup |
| POST | `/api/v1/restore` | Restore wallet from seed |

Auth: Bearer token via `Authorization` header. Token auto-generated at startup, written to `~/.nutbits/nutbits.sock.token`.

## Lightning Address (lud16) support

NUTbits supports Lightning Addresses across all interfaces:

- **NWC connections:** lud16 can be attached at creation or updated via PATCH. It is appended to the NWC connection string as `&lud16=...` (non-standard NIP-47 extension). Format is validated and the address is resolved via LNURL-pay (LUD-16) using `nostr-core` before accepting.
- **Pay endpoint:** `POST /api/v1/pay` accepts `{ invoice: "user@domain.com", amount_sats: 1000 }`. It detects the Lightning Address, resolves it to a BOLT11 invoice via LNURL-pay, validates min/max sendable, and pays.
- **Resolve endpoint:** `GET /api/v1/lnurl/resolve?address=user@domain.com` returns LNURL-pay metadata (min/max sats, description, nostr zap support, comment length) without paying.
- **GUI:** The Send page auto-detects Lightning Addresses as you type, resolves them after 800ms debounce, and shows metadata (description, limits, nostr support) with an expandable details section.
- **CLI:** `nutbits connect --lud16 user@domain.com` and interactive Step 4 in `nutbits connect`.

## Boundaries

**Always:**
- Encrypt state at rest with AES-256-GCM (scrypt N=65536). Never store raw proofs unencrypted.
- Handle ecash proofs atomically (all-or-nothing swaps). Never leave partial proof state.
- Deduplicate NWC events across relays to prevent double-payments (time-windowed, 10min TTL).
- Mask NWC strings, private keys, and proof data in all log output.
- Validate mint URLs - HTTPS only, no private IP ranges, no localhost.
- On proof restore failure, write encrypted recovery file (never log proof secrets).
- Validate Lightning Addresses by resolving them via LNURL-pay before accepting.
- Reject revoked connections from processing NWC events.

**Ask first:**
- Changes to NWC protocol handling or supported methods.
- Modifications to state encryption or key derivation.
- Changes to the service fee calculation logic.
- Adding new dependencies.

**Never:**
- Log private keys, NWC connection strings, or raw ecash proof data.
- Skip event deduplication.
- Commit `.env` files, state files (`.enc`, `.db`), or socket token files.
- Store passwords or secrets in plaintext.
- Use `let` or `const` - project convention is `var`.

## Security hardening (recent)

- **Scrypt KDF:** Key derivation uses N=65536 (4x stronger than Node defaults). Existing databases auto-migrate on first startup; the version marker is written inside the same transaction as the re-encryption for crash safety.
- **DLEQ verification:** Invalid DLEQ proofs are rejected. Verification errors (e.g., missing keyset) still accept the proof with a warning to avoid losing funds.
- **Recovery files:** If proof restoration fails after a payment error, proofs are written to an encrypted `.recovery-*.enc` file (mode 0600) instead of being logged.
- **Event dedup:** Uses a time-windowed Map (10min TTL) with a hard cap fallback instead of arbitrary Set truncation.
- **Weak passphrase warning:** Boot warns if `NUTBITS_STATE_PASSPHRASE` is under 8 characters.
- **Revoked connections:** Blocked from NWC event processing and skipped during boot restoration.
- **Unknown NWC methods:** Return `NOT_IMPLEMENTED` error instead of being silently ignored.
- **list_transactions limit:** Capped at 200 results to prevent unbounded data retrieval.
- **make_invoice validation:** Rejects amounts <= 0 or > 21M BTC.
- **Blockheight cache:** mempool.space API responses cached for 2 minutes.
