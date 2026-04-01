# L402 Integration — Backlog

Paused as of 2026-04-01. Implementation order reflects value vs complexity.

## Phase 1 — L402 Fetch (Client Side)

Highest immediate value. Makes NUTbits an L402 consumer — agents pay for any L402-gated API using ecash.

- [ ] `POST /api/v1/l402/fetch` endpoint: accepts URL + method + headers, auto-detects 402, pays invoice via mint, retries with credential, returns response
- [ ] Macaroon/token cache: store paid L402 tokens per-connection, reuse until caveats expire
- [ ] Budget enforcement: respect connection's max_payment_sats and max_daily_sats for L402 payments
- [ ] CLI command: `nutbits l402 fetch <url>` for scripting
- [ ] TUI: L402 fetch panel with URL input, response display, token cache view

## Phase 2 — MCP Server (Agent Interface)

Makes NUTbits directly usable by AI agents (Claude Code, Codex, Goose, etc.)

- [ ] NUTbits MCP server exposing tools: `l402_fetch`, `pay_invoice`, `make_invoice`, `get_balance`, `list_transactions`
- [ ] NWC connection string as the only credential (no stored keys)
- [ ] Compatible with MCP stdio and HTTP transport
- [ ] Package as `npx @nutbits/mcp` for easy agent setup

## Phase 3 — L402 Proxy (Server Side)

Operators gate their own API endpoints behind L402, receive payments as ecash.

- [ ] Reverse proxy mode: NUTbits sits in front of any backend
- [ ] Route config: path patterns, price per request, macaroon caveats
- [ ] Macaroon issuance with configurable caveats (expiry, request count, tier, IP binding)
- [ ] Stateless verification (HMAC chain + preimage, no database)
- [ ] Payments received → ecash on operator's mint
- [ ] Per-connection fee override for L402 revenue

## Phase 4 — Token Management (GUI/TUI)

- [ ] GUI: L402 token cache viewer (active tokens, expiry, usage count)
- [ ] GUI: L402 proxy config editor (routes, prices, caveats)
- [ ] TUI: L402 status panel
- [ ] CLI: `nutbits l402 tokens` to list/inspect/revoke cached tokens

## Phase 5 — Selling NWC Connections via L402

- [ ] Gate the NWC connection creation endpoint behind L402
- [ ] Client pays an invoice → receives a fresh NWC connection string as the response
- [ ] Configurable tiers: different prices for different permission sets / budget limits
- [ ] Automated provisioning: no operator intervention needed

## Phase 6 — NUT-24: Cashu-Native HTTP 402

Cashu's own 402 protocol. Ecash proofs as payment — no Lightning round-trip.

- [ ] Support `X-Cashu` header on NUTbits API endpoints (NUT-18 payment requests + cashuB token validation)
- [ ] Dual-mode 402: endpoints accept BOTH classic L402 (macaroon + Lightning) and NUT-24 (ecash proofs)
- [ ] Server specifies accepted mints in the 402 response — operator controls which mints are trusted
- [ ] Sell NWC connections via NUT-24: agent sends ecash, gets NWC string back — zero Lightning, instant
- [ ] NUT-24 client support in `l402/fetch`: detect `X-Cashu` 402 responses, pay with ecash from mint balance
- [ ] Sub-satoshi pricing possible (ecash tokens can represent any denomination)

## Phase 7 — NUT-22: Blind Authentication

Access control via blind auth tokens (BATs). For rate-limiting and gating without linking identity to requests.

- [ ] Evaluate NUT-22 for "hide behind L402" use case — restrict API access to BAT holders only
- [ ] BATs are single-use ecash tokens (unit `auth`, amount 1) — consumed per request
- [ ] Users authenticate once (OAuth/nostr login), receive batch of BATs, use them for subsequent requests
- [ ] Combine with NUT-24: BAT for access control + ecash for payment = full auth + payment layer
- [ ] Explore using NUT-22 BATs as rate-limit tokens for NWC connections (anti-spam without IP tracking)

## Architecture Notes

- L402 client uses existing `createNWCconnection` + `pay_invoice` NWC flow — no new Lightning integration
- L402 server issues macaroons using Node.js `macaroons.js` or similar — lightweight, no LND dependency
- MCP server is a thin wrapper around the NUTbits API — reuses all existing endpoints
- Token cache stored alongside connection state in the existing store layer
- NUT-24 reuses the existing Cashu token handling in `@cashu/cashu-ts` — already a dependency
- NUT-22 BATs use the same blind signature flow as regular ecash — mint infrastructure already exists
- Dual-mode 402 (L402 + NUT-24) maximizes compatibility: Lightning clients and Cashu clients both served

## Three 402 Strategies

| Strategy | Settlement | Token | Best for |
|---|---|---|---|
| Classic L402 | Lightning (macaroon + preimage) | Macaroon | External API interop, agent tools ecosystem |
| NUT-24 | Ecash (X-Cashu header) | Cashu proof | Selling NWC strings, Cashu-native services, instant |
| Dual mode | Both | Either | Maximum reach — operator doesn't have to choose |

## Key Sources

### L402 (Lightning-settled)
- Protocol spec: https://github.com/lightninglabs/L402/blob/master/protocol-specification.md
- Lightning Labs L402 docs: https://docs.lightning.engineering/the-lightning-network/l402
- L402 for Agents (March 2026): https://lightning.engineering/posts/2026-03-11-L402-for-agents/
- Lightning Agent Tools (lnget, aperture, MCP): https://github.com/lightninglabs/lightning-agent-tools
- Alby MCP Server (NWC + L402): https://github.com/getAlby/mcp
- Aperture reverse proxy: https://github.com/lightninglabs/aperture
- ngx_l402 Nginx module (NWC + Cashu backends): https://github.com/DhananjayPurohit/ngx_l402
- docs.l402.org (payment models): https://docs.l402.org/
- bLIP-0026 formal spec: https://github.com/lightning/blips/pull/26

### NUT-24 (Cashu-settled 402)
- NUT-24 landing page: https://402fordummies.dev/
- NUT-18 payment requests: https://github.com/cashubtc/nuts/blob/main/18.md
- Cashu NUTs index: https://cashubtc.github.io/nuts/

### NUT-22 (Blind authentication)
- NUT-22 spec: https://cashubtc.github.io/nuts/22/
- Depends on NUT-21 (clear auth) and NUT-12 (DLEQ proofs)

### Comparison
- x402 vs L402: https://ln.bot/learn/x402-vs-l402
- x402 (Coinbase, stablecoin-settled): https://github.com/coinbase/x402
