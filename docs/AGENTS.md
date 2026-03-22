# AGENTS.md

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
nutbits.js               # Core bridge: mint management, NWC protocol, payment flows (~1400 lines)
bin/nutbits.js           # CLI entry point, command dispatch, argument parsing
api/
  server.js              # HTTP/Unix socket server, request handler, auth
  router.js              # URL routing
  middleware/auth.js      # Bearer token auth
  handlers/index.js      # All REST API endpoints
cli/
  commands/              # One file per CLI command (status, pay, receive, connect, etc.)
  tui/                   # Terminal UI (app.js, layout.js, menu.js, panels.js)
  colors.js              # ANSI color helpers
  render.js              # Output formatting (tables, key-value, headings)
  prompts.js             # Interactive prompts (input, select, confirm, spinner)
  client.js              # API client for CLI-to-service communication
store/
  index.js               # Storage factory + audit logging wrapper
  file-store.js          # Encrypted file backend (AES-256-GCM)
  sqlite-store.js        # SQLite backend
  mysql-store.js         # MySQL backend
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

## API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/status` | Dashboard data (balance, connections, mint health) |
| GET | `/api/v1/balance` | Per-mint balance breakdown |
| GET | `/api/v1/connections` | List active NWC connections |
| GET | `/api/v1/connections/export` | Connection details including NWC strings (sensitive) |
| POST | `/api/v1/connections` | Create new NWC connection |
| DELETE | `/api/v1/connections/:pubkey` | Revoke a connection |
| POST | `/api/v1/pay` | Pay a Lightning invoice |
| POST | `/api/v1/receive` | Create a Lightning invoice |
| POST | `/api/v1/receive/check` | Check if invoice was paid |
| GET | `/api/v1/history` | Transaction history with filtering |
| GET | `/api/v1/history/export` | Export history as CSV/JSON |
| GET | `/api/v1/mints` | Mint info and health status |
| GET | `/api/v1/nuts` | NUT support matrix |
| GET | `/api/v1/relays` | Relay connection status |
| GET | `/api/v1/config` | Running configuration |
| POST | `/api/v1/config` | Update config at runtime |
| GET | `/api/v1/fees` | Service fee revenue tracking |
| GET | `/api/v1/logs` | Recent log entries |

Auth: Bearer token via `Authorization` header. Token auto-generated at startup, written to `~/.nutbits/nutbits.sock.token`.

## Boundaries

**Always:**
- Encrypt state at rest with AES-256-GCM. Never store raw proofs unencrypted.
- Handle ecash proofs atomically (all-or-nothing swaps). Never leave partial proof state.
- Deduplicate NWC events across relays to prevent double-payments.
- Mask NWC strings, private keys, and proof data in all log output.
- Validate mint URLs - HTTPS only, no private IP ranges, no localhost.

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
