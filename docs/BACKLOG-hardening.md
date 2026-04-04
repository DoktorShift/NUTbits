# Security Hardening Backlog

> Remaining items from the security audit. None are actively exploitable.
> All CRITICAL and HIGH items have been resolved.
> These are defense-in-depth improvements for the stable/cloud release.

---

## Medium — Before Stable Release

### M6. Event Replay After Restart
- **File:** `nutbits.js` — event dedup map
- **Issue:** The dedup set is in-memory only. After restart, old NWC events could be replayed if the relay delivers them again within the `since` window.
- **Fix:** Persist last-seen event timestamps per connection, or reject events with `created_at` older than the boot timestamp minus a small tolerance.
- **Complexity:** Medium — needs design decision on persistence format. Consider combining with the relay pooling refactor.

### M7. Weak Passphrase Enforcement
- **File:** `nutbits.js` — boot passphrase check
- **Issue:** Passphrases under 8 chars trigger a warning but are accepted. Short passphrases weaken AES-256-GCM encryption.
- **Fix:** Enforce minimum 12 characters. Reject weak passphrases on first run. Existing users with weak passphrases: warn with a migration path (re-encrypt with a stronger passphrase).
- **Complexity:** Low code, but policy decision — could break existing setups.

### M8. No Route Guards in GUI
- **File:** `gui/src/router.js`
- **Issue:** GUI pages render even when no API token is configured. Users see empty/error states instead of a setup prompt.
- **Fix:** Add a global `beforeEach` route guard. If no token in localStorage, redirect to Settings/Setup page.
- **Complexity:** Low.

### M9. `v-html` in Sidebar
- **File:** `gui/src/components/layout/Sidebar.vue:159`
- **Issue:** `v-html="iconSvg(item.icon)"` is technically an XSS vector, though the source is static constants (not user input).
- **Fix:** Replace with inline SVG components, or add a code comment documenting that the source must remain static and never accept user input.
- **Complexity:** Low. Risk is theoretical.

### M10. Vite Dev Middleware Serves Token Without Origin Check
- **File:** `gui/vite.config.js:16-27`
- **Issue:** The `/__nutbits/token` dev middleware serves the API token to any request without checking origin. A malicious page could fetch it during development.
- **Fix:** Check `Origin` or `Referer` header matches the Vite dev server's own port before serving.
- **Complexity:** Low. Only affects development mode, never production.

---

## Low — Address When Convenient

### L1. API Token in localStorage
- **File:** `gui/src/api/client.js`
- **Issue:** The API token is stored in `localStorage`, which is accessible to any script on the same origin.
- **Status:** Acceptable for a local management tool. Revisit for NUTbits Cloud where multi-user auth is needed.

### L2. No Rate Limiting on NWC Event Processing
- **File:** `nutbits.js` — NWC event handler
- **Issue:** A malicious client could flood the relay with NWC requests. No per-connection rate limit on event processing.
- **Fix:** Add a per-connection rate limiter (e.g., 10 requests/second). Drop excess events with a warning.

### L5. Sequential Connection IDs Leak Count
- **File:** `api/handlers/index.js` — connection listing
- **Issue:** Connection IDs (1, 2, 3...) reveal how many connections exist. Minimal information value.
- **Status:** Accepted. The numeric IDs are a CLI convenience (`nutbits fund 3`). Changing to random IDs would require refactoring all CLI commands, GUI views, and API filters. The pubkey is the real identifier.

### L7. `var` Instead of `const`/`let`
- **File:** All files
- **Issue:** Project convention uses `var` everywhere. No functional or security impact.
- **Status:** Intentional project style. Not a bug.
