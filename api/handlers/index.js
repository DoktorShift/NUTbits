// NUTbits API - Handler registry
// Registers all routes on the router with service context bound

import { sumProofs } from '@cashu/cashu-ts';
import { validateLightningAddress, fetchPayRequest, requestLnurlInvoice } from 'nostr-core';
import bolt11Lib from 'bolt11';
import fs from 'node:fs';
import dns from 'node:dns/promises';

// ── SSRF protection — reject private/internal IPs ──────────────────────────

async function assertPublicHost(hostname) {
    var addrs;
    try { addrs = await dns.resolve4(hostname); } catch (e) {
        throw apiError(422, `cannot resolve hostname: ${hostname}`);
    }
    for (var ip of addrs) {
        if (isPrivateIp(ip)) {
            throw apiError(422, `hostname resolves to private IP (${hostname})`);
        }
    }
}

function isPrivateIp(ip) {
    var parts = ip.split('.').map(Number);
    if (parts.length !== 4) return true; // not IPv4 — block by default
    // 10.0.0.0/8
    if (parts[0] === 10) return true;
    // 172.16.0.0/12
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 127.0.0.0/8 (loopback)
    if (parts[0] === 127) return true;
    // 169.254.0.0/16 (link-local)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 0.0.0.0/8
    if (parts[0] === 0) return true;
    return false;
}

// Valid hex pubkey pattern
var HEX_PUBKEY = /^[0-9a-f]{64}$/;

// ── lud16 (Lightning Address) validation ────────────────────────────────────

var LUD16_MAX_LEN = 320;

// Validate format, resolve via LNURL-pay, return normalized address.
async function validateAndResolveLud16(lud16) {
    if (typeof lud16 !== 'string' || lud16.length > LUD16_MAX_LEN) {
        throw apiError(400, 'lud16 must be a valid Lightning Address (max 320 chars)');
    }
    var normalized = lud16.toLowerCase().trim();
    if (!validateLightningAddress(normalized)) {
        throw apiError(400, 'lud16 must be in format user@domain.com');
    }
    // Resolve via LNURL-pay (LUD-16) to verify the address actually works
    var [name, domain] = normalized.split('@');
    // SSRF check — reject private/internal IPs before making outbound request
    await assertPublicHost(domain);
    var lnurlPayUrl = `https://${domain}/.well-known/lnurlp/${name}`;
    try {
        await fetchPayRequest(lnurlPayUrl);
    } catch (e) {
        throw apiError(422, `Lightning Address could not be resolved: ${domain} (${e.message})`);
    }
    return normalized;
}

// Allowed NWC permission names
var PERM_MAP = {
    pay: 'pay_invoice',
    receive: 'make_invoice',
    balance: 'get_balance',
    history: 'list_transactions',
    info: 'get_info',
    lookup: 'lookup_invoice',
};
var ALLOWED_PERMS = new Set([...Object.keys(PERM_MAP), ...Object.values(PERM_MAP)]);

// Parse LNURL metadata JSON string into a readable description
function parseLnurlMeta(metadataStr) {
    try {
        var entries = JSON.parse(metadataStr);
        if (!Array.isArray(entries)) return null;
        var text = entries.find(e => e[0] === 'text/plain');
        return text ? text[1] : null;
    } catch { return null; }
}

// Sensitive fields to redact from log data (recursive)
var REDACT_KEYS = new Set(['secret', 'C', 'nwc_string', 'app_privkey', 'user_secret', 'statePassphrase', 'invoice', 'bolt11', 'preimage', 'seed']);

function redactLogData(data, depth = 0) {
    if (!data || typeof data !== 'object' || depth > 4) return data;
    if (Array.isArray(data)) return data.map(item => redactLogData(item, depth + 1));
    var clean = {};
    for (var [k, v] of Object.entries(data)) {
        if (REDACT_KEYS.has(k)) clean[k] = '***';
        else if (v && typeof v === 'object') clean[k] = redactLogData(v, depth + 1);
        else clean[k] = v;
    }
    return clean;
}

// Build a current NWC string from connection parts, always reflecting latest lud16 and relays
function buildNwcString(info, relays) {
    if (!info.app_pubkey || !info.user_secret) return info.nwc_string || null;
    var rls = relays && relays.length ? relays : (info.relay ? [info.relay] : []);
    var relayParams = rls.map(r => `relay=${encodeURIComponent(r)}`).join('&');
    var nwc = `nostr+walletconnect://${info.app_pubkey}?${relayParams}&secret=${info.user_secret}`;
    if (info.lud16) nwc += `&lud16=${encodeURIComponent(info.lud16)}`;
    return nwc;
}

// ── Per-connection balance lock (prevents race conditions on fund/withdraw) ──

var balanceLocks = new Map();

function withBalanceLock(pubkey, fn) {
    var prev = balanceLocks.get(pubkey) || Promise.resolve();
    var release;
    var next = new Promise(r => { release = r; });
    balanceLocks.set(pubkey, next);
    return prev.then(() => fn()).finally(release);
}

// ── Deeplink connection creator (used by API server for /connect) ────────

var deeplinkLock = Promise.resolve();

export async function createDeeplinkConnection(ctx, { appName, permissions, maxPaymentSats, maxDailySats }) {
    var { nutbits, store, mintManager, config } = ctx;

    var perms = (permissions || ['pay_invoice', 'make_invoice', 'get_balance', 'list_transactions', 'get_info', 'lookup_invoice'])
        .map(p => PERM_MAP[p] || p);

    var mintUrl = mintManager.activeMintUrl;

    // Serialize to prevent key-diff races
    var prev = deeplinkLock;
    var release;
    deeplinkLock = new Promise(r => { release = r; });
    await prev;

    try {
        var keysBefore = new Set(Object.keys(nutbits.state.nostr_state.nwc_info));
        var nwcString = await nutbits.createNWCconnection(mintUrl, perms, config.relays, undefined, true);

        var newPk = null;
        for (var key of Object.keys(nutbits.state.nostr_state.nwc_info)) {
            if (!keysBefore.has(key)) { newPk = key; break; }
        }
        if (!newPk) throw new Error('failed to create connection');

        var conn = nutbits.state.nostr_state.nwc_info[newPk];
        conn.label = `${appName} (deep link)`;
        conn.created_at = Math.floor(Date.now() / 1000);
        conn.max_daily_sats = Math.max(0, Number(maxDailySats) || 0);
        conn.max_payment_sats = Math.max(0, Number(maxPaymentSats) || 0);
        // Deeplink connections are ALWAYS dedicated — no opt-out
        conn.dedicated = true;
        conn.dedicated_balance_msat = 0;

        await store.updateConnection(newPk, {
            label: conn.label,
            created_at: conn.created_at,
            max_daily_sats: conn.max_daily_sats,
            max_payment_sats: conn.max_payment_sats,
            dedicated: true,
            dedicated_balance_msat: 0,
        });

        return {
            nwc_string: nwcString,
            app_pubkey: newPk,
            label: conn.label,
            permissions: perms,
            dedicated: true,
            mint: mintUrl,
        };
    } finally {
        release();
    }
}

export function registerHandlers(router, ctx) {
    var { nutbits, store, mintManager, config, log, createWalletForMint, detectMintCaps } = ctx;

    // ── GET /api/v1/status ───────────────────────────────────────────

    router.get('/api/v1/status', async () => {
        var mintInfo = nutbits.wallet?.getMintInfo?.();
        var caps = mintManager.mintCaps.get(mintManager.activeMintUrl) || {};
        var pools = nutbits.state.nostr_state.pools;
        var relayCount = 0;
        var relayTotal = 0;
        for (var pk in pools) {
            if (Array.isArray(pools[pk])) {
                relayTotal = pools[pk].length;
                relayCount = pools[pk].filter(r => r.connected).length;
            }
        }
        var connections = Object.keys(nutbits.state.nostr_state.nwc_info);

        return {
            version: config.version || '0.8.0',
            uptime_ms: Date.now() - ctx.startedAt,
            mint: {
                name: mintInfo?.name || 'unknown',
                url: mintManager.activeMintUrl,
                version: mintInfo?.version || '?',
                motd: mintInfo?.motd || null,
                healthy: mintManager.mintHealth.get(mintManager.activeMintUrl)?.healthy ?? true,
            },
            balance_sats: await nutbits.getBalance(),
            relays: { connected: relayCount, total: relayTotal },
            connections_count: connections.filter(pk => pk !== '__api__' && !nutbits.state.nostr_state.nwc_info[pk]?.revoked).length,
            nuts: caps,
            storage: config.stateBackend,
            seed_configured: !!config.seed,
            seed_in_env: !!ctx.seedFromEnv,
            limits: {
                max_payment_sats: config.maxPaymentSats,
                daily_limit_sats: config.dailyLimitSats,
                fee_reserve_pct: Math.round(config.feeReservePct * 100),
            },
        };
    });

    // ── GET /api/v1/balance ──────────────────────────────────────────

    router.get('/api/v1/balance', async () => {
        var mints = [];
        var total = 0;
        for (var url of mintManager.orderedMints) {
            var proofs = await store.getProofs(url);
            var sats = sumProofs(proofs);
            total += sats;
            var health = mintManager.mintHealth.get(url);
            mints.push({
                url,
                sats,
                proofs: proofs.length,
                active: url === mintManager.activeMintUrl,
                healthy: health?.healthy ?? true,
            });
        }
        return { total_sats: total, mints };
    });

    // ── GET /api/v1/connections ──────────────────────────────────────

    router.get('/api/v1/connections', async () => {
        var all = await store.getAllConnections();
        var list = [];
        var idx = 1;
        for (var [pk, info] of Object.entries(all)) {
            if (pk === '__api__') continue;
            if (info.revoked) continue;
            var txCount = info.tx_history ? Object.keys(info.tx_history).length : 0;
            list.push({
                id: idx++,
                app_pubkey: pk,
                label: info.label || `connection-${idx - 1}`,
                permissions: info.permissions || [],
                balance_msat: info.balance || 0,
                tx_count: txCount,
                relay: info.relay,
                created_at: info.created_at || null,
                max_daily_sats: info.max_daily_sats || 0,
                max_payment_sats: info.max_payment_sats || 0,
                mint: info.mymint,
                lud16: info.lud16 || null,
                dedicated: !!info.dedicated,
                dedicated_balance_msat: info.dedicated ? (info.dedicated_balance_msat || 0) : null,
            });
        }
        return { connections: list };
    });

    // ── GET /api/v1/connections/export ──────────────────────────────────
    // Returns connection details INCLUDING NWC strings (sensitive!)

    router.get('/api/v1/connections/export', async ({ query }) => {
        var all = await store.getAllConnections();
        var includeRevoked = query.include_revoked === 'true';
        var targetId = query.id || null;
        var list = [];
        var idx = 1;
        for (var [pk, info] of Object.entries(all)) {
            if (pk === '__api__') continue;
            if (info.revoked && !includeRevoked) { idx++; continue; }
            if (targetId && idx !== Number(targetId) && info.label !== targetId) { idx++; continue; }
            var txCount = info.tx_history ? Object.keys(info.tx_history).length : 0;
            list.push({
                id: idx,
                app_pubkey: pk,
                label: info.label || `connection-${idx}`,
                nwc_string: buildNwcString(info, config.relays),
                permissions: info.permissions || [],
                balance_msat: info.balance || 0,
                tx_count: txCount,
                relay: info.relay,
                mint: info.mymint,
                created_at: info.created_at || null,
                revoked: !!info.revoked,
                revoked_at: info.revoked_at || null,
                max_daily_sats: info.max_daily_sats || 0,
                max_payment_sats: info.max_payment_sats || 0,
                service_fee_ppm: info.service_fee_ppm ?? null,
                service_fee_base: info.service_fee_base ?? null,
                lud16: info.lud16 || null,
                dedicated: !!info.dedicated,
                dedicated_balance_msat: info.dedicated ? (info.dedicated_balance_msat || 0) : null,
            });
            idx++;
        }
        return { connections: list, exported_at: new Date().toISOString() };
    });

    // ── POST /api/v1/connections ─────────────────────────────────────

    // Mutex for connection creation to prevent key-diff races
    var connectLock = Promise.resolve();

    router.post('/api/v1/connections', async ({ body }) => {
        if (!body?.label) throw apiError(400, 'label is required');
        if (typeof body.label !== 'string' || body.label.length > 128) throw apiError(400, 'label must be 1-128 characters');
        if (/[\x00<>]/.test(body.label)) throw apiError(400, 'label contains invalid characters');

        // Validate permissions - reject unknown values
        var rawPerms = body.permissions || ['pay', 'receive', 'balance', 'history', 'info', 'lookup'];
        for (var p of rawPerms) {
            if (!ALLOWED_PERMS.has(p)) throw apiError(400, `unknown permission: "${p}"`);
        }
        var perms = rawPerms.map(p => PERM_MAP[p] || p);

        var mintUrl = body.mint || mintManager.activeMintUrl;

        // Validate and resolve lud16 (Lightning Address) if provided
        var lud16 = null;
        if (body.lud16) {
            lud16 = await validateAndResolveLud16(body.lud16);
        }

        // Serialize connection creation to prevent key-diff race conditions
        var prev = connectLock;
        var release;
        connectLock = new Promise(r => { release = r; });
        await prev;

        try {
            var keysBefore = new Set(Object.keys(nutbits.state.nostr_state.nwc_info));
            var nwcString = await nutbits.createNWCconnection(mintUrl, perms, config.relays, undefined, true, lud16);

            var newPk = null;
            for (var key of Object.keys(nutbits.state.nostr_state.nwc_info)) {
                if (!keysBefore.has(key)) { newPk = key; break; }
            }
            if (!newPk) throw apiError(500, 'failed to create connection');

            var conn = nutbits.state.nostr_state.nwc_info[newPk];
            conn.label = body.label;
            conn.created_at = Math.floor(Date.now() / 1000);
            conn.max_daily_sats = Math.max(0, Number(body.max_daily_sats) || 0);
            conn.max_payment_sats = Math.max(0, Number(body.max_payment_sats) || 0);
            // All connections are dedicated by default (own isolated balance).
            // Shared balance (dedicated: false) is only for the operator's own
            // trusted apps — never for external deeplink connections.
            if (body.dedicated === false) {
                conn.dedicated = false;
            } else {
                conn.dedicated = true;
                conn.dedicated_balance_msat = 0;
            }
            // Per-connection fee override (null = use global default)
            if (body.service_fee_ppm !== undefined) conn.service_fee_ppm = Math.max(0, Math.floor(Number(body.service_fee_ppm) || 0));
            if (body.service_fee_base !== undefined) conn.service_fee_base = Math.max(0, Math.floor(Number(body.service_fee_base) || 0));
            if (lud16) conn.lud16 = lud16;
            await store.updateConnection(newPk, {
                label: conn.label,
                created_at: conn.created_at,
                max_daily_sats: conn.max_daily_sats,
                max_payment_sats: conn.max_payment_sats,
                dedicated: conn.dedicated || false,
                dedicated_balance_msat: conn.dedicated_balance_msat ?? null,
                service_fee_ppm: conn.service_fee_ppm,
                service_fee_base: conn.service_fee_base,
                lud16: conn.lud16 || null,
            });

            // Calculate the connection's display ID (1-based index of non-revoked connections)
            var allConns = await store.getAllConnections();
            var connId = 1;
            for (var [pk] of Object.entries(allConns)) {
                if (pk === newPk) break;
                if (!allConns[pk].revoked) connId++;
            }

            return {
                id: connId,
                nwc_string: nwcString,
                app_pubkey: newPk,
                label: conn.label,
                permissions: perms,
                lud16: lud16 || null,
                dedicated: !!conn.dedicated,
                dedicated_balance_msat: conn.dedicated ? 0 : null,
            };
        } finally {
            release();
        }
    });

    // ── DELETE /api/v1/connections/:pubkey ────────────────────────────

    router.delete('/api/v1/connections/:pubkey', async ({ params }) => {
        var pubkey = params.pubkey;
        if (!HEX_PUBKEY.test(pubkey)) throw apiError(400, 'invalid pubkey format');

        var conn = nutbits.state.nostr_state.nwc_info[pubkey];
        if (!conn) throw apiError(404, 'connection not found');

        // Close relay subscriptions
        var pools = nutbits.state.nostr_state.pools[pubkey];
        if (Array.isArray(pools)) {
            pools.forEach(r => { try { r.close(); } catch (e) { /* ignore */ } });
        }
        delete nutbits.state.nostr_state.pools[pubkey];

        // Release dedicated balance back to main wallet on revoke
        var releasedSats = 0;
        if (conn.dedicated && conn.dedicated_balance_msat > 0) {
            releasedSats = Math.floor(conn.dedicated_balance_msat / 1000);
            conn.dedicated_balance_msat = 0;
            conn.balance = 0;
        }

        // Mark as revoked (keep history)
        conn.revoked = true;
        conn.revoked_at = Math.floor(Date.now() / 1000);
        await store.updateConnection(pubkey, {
            revoked: true,
            revoked_at: conn.revoked_at,
            dedicated_balance_msat: conn.dedicated_balance_msat,
            balance: conn.balance,
        });

        return { revoked: true, pubkey, released_sats: releasedSats };
    });

    // ── PATCH /api/v1/connections/:pubkey ──────────────────────────────

    router.patch('/api/v1/connections/:pubkey', async ({ params, body }) => {
        var pubkey = params.pubkey;
        if (!HEX_PUBKEY.test(pubkey)) throw apiError(400, 'invalid pubkey format');

        var conn = nutbits.state.nostr_state.nwc_info[pubkey];
        if (!conn) throw apiError(404, 'connection not found');
        if (conn.revoked) throw apiError(400, 'cannot update a revoked connection');

        var updates = {};

        // Update lud16 (set or clear)
        if (body.lud16 !== undefined) {
            if (body.lud16 === null || body.lud16 === '') {
                conn.lud16 = null;
                updates.lud16 = null;
            } else {
                var normalized = await validateAndResolveLud16(body.lud16);
                conn.lud16 = normalized;
                updates.lud16 = normalized;
            }

            // Rebuild the NWC string so it reflects the new lud16
            var newNwc = buildNwcString(conn, config.relays);
            conn.nwc_string = newNwc;
            updates.nwc_string = newNwc;
        }

        if (Object.keys(updates).length === 0) {
            throw apiError(400, 'no updatable fields provided');
        }

        await store.updateConnection(pubkey, updates);
        return { updated: true, pubkey, ...updates };
    });

    // ── POST /api/v1/connections/:pubkey/fund ───────────────────────
    // Transfer sats from main wallet into a dedicated connection's balance

    router.post('/api/v1/connections/:pubkey/fund', async ({ params, body }) => {
        var pubkey = params.pubkey;
        if (!HEX_PUBKEY.test(pubkey)) throw apiError(400, 'invalid pubkey format');

        var conn = nutbits.state.nostr_state.nwc_info[pubkey];
        if (!conn) throw apiError(404, 'connection not found');
        if (conn.revoked) throw apiError(400, 'cannot fund a revoked connection');
        if (!conn.dedicated) throw apiError(400, 'only dedicated connections can be funded');

        var amountSats = Math.floor(Number(body.amount_sats) || 0);
        if (amountSats <= 0) throw apiError(400, 'amount_sats must be positive');
        if (amountSats > 2_100_000_000_000_000) throw apiError(400, 'amount out of range');

        return withBalanceLock(pubkey, async () => {
            // Check main wallet has enough unallocated balance
            var walletBalance = await nutbits.getBalance();
            var allConns = await store.getAllConnections();
            var totalAllocated = 0;
            for (var [pk, info] of Object.entries(allConns)) {
                if (info.dedicated && !info.revoked) totalAllocated += (info.dedicated_balance_msat || 0);
            }
            var unallocatedSats = walletBalance - Math.floor(totalAllocated / 1000);
            if (amountSats > unallocatedSats) throw apiError(400, `insufficient unallocated balance (${Math.max(0, unallocatedSats)} sats available)`);

            conn.dedicated_balance_msat = (conn.dedicated_balance_msat || 0) + (amountSats * 1000);
            conn.balance = conn.dedicated_balance_msat;
            await store.updateConnection(pubkey, {
                dedicated_balance_msat: conn.dedicated_balance_msat,
                balance: conn.dedicated_balance_msat,
            });

            return {
                pubkey,
                funded_sats: amountSats,
                dedicated_balance_msat: conn.dedicated_balance_msat,
                dedicated_balance_sats: Math.floor(conn.dedicated_balance_msat / 1000),
            };
        });
    });

    // ── POST /api/v1/connections/:pubkey/withdraw ───────────────────
    // Pull sats from a dedicated connection's balance back to main wallet

    router.post('/api/v1/connections/:pubkey/withdraw', async ({ params, body }) => {
        var pubkey = params.pubkey;
        if (!HEX_PUBKEY.test(pubkey)) throw apiError(400, 'invalid pubkey format');

        var conn = nutbits.state.nostr_state.nwc_info[pubkey];
        if (!conn) throw apiError(404, 'connection not found');
        if (!conn.dedicated) throw apiError(400, 'only dedicated connections can be withdrawn from');

        return withBalanceLock(pubkey, async () => {
            var currentMsat = conn.dedicated_balance_msat || 0;
            var amountSats = Math.floor(Number(body.amount_sats) || 0);

            // 0 or omitted = withdraw all
            if (amountSats <= 0) amountSats = Math.floor(currentMsat / 1000);
            if (amountSats <= 0) throw apiError(400, 'nothing to withdraw');

            var amountMsat = amountSats * 1000;
            if (amountMsat > currentMsat) throw apiError(400, `only ${Math.floor(currentMsat / 1000)} sats available`);

            conn.dedicated_balance_msat = currentMsat - amountMsat;
            conn.balance = conn.dedicated_balance_msat;
            await store.updateConnection(pubkey, {
                dedicated_balance_msat: conn.dedicated_balance_msat,
                balance: conn.dedicated_balance_msat,
            });

            return {
                pubkey,
                withdrawn_sats: amountSats,
                dedicated_balance_msat: conn.dedicated_balance_msat,
                dedicated_balance_sats: Math.floor(conn.dedicated_balance_msat / 1000),
            };
        });
    });

    // ── GET /api/v1/history ──────────────────────────────────────────

    router.get('/api/v1/history', async ({ query }) => {
        var limit = Math.min(Number(query.limit) || 20, 100);
        var type = query.type || null;
        var connectionId = query.connection || null;
        var unpaid = query.unpaid === 'true';

        var allTxs = [];
        var all = await store.getAllConnections();
        var connIdx = {};
        var idx = 1;
        for (var [pk, info] of Object.entries(all)) {
            if (pk === '__api__') {
                connIdx[pk] = { id: 0, label: 'API', dedicated: false };
                continue;
            }
            if (info.revoked) continue;
            connIdx[pk] = { id: idx, label: info.label || `connection-${idx}`, dedicated: !!info.dedicated };
            idx++;
        }

        for (var [pk, info] of Object.entries(all)) {
            if (pk !== '__api__' && info.revoked) continue;
            if (connectionId && connIdx[pk]?.id !== Number(connectionId) && connIdx[pk]?.label !== connectionId) continue;
            var txs = await store.listTxs(pk, { type, unpaid, limit: limit });
            for (var tx of txs) {
                allTxs.push({ ...tx, connection_id: connIdx[pk]?.id, connection_label: connIdx[pk]?.label, connection_dedicated: connIdx[pk]?.dedicated });
            }
        }

        allTxs.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
        if (query.from) allTxs = allTxs.filter(tx => tx.created_at >= Number(query.from));
        if (query.until) allTxs = allTxs.filter(tx => tx.created_at <= Number(query.until));

        return { transactions: allTxs.slice(0, limit), total: allTxs.length };
    });

    // ── GET /api/v1/history/export ──────────────────────────────────────

    router.get('/api/v1/history/export', async ({ query }) => {
        var type = query.type || null;
        var connectionId = query.connection || null;
        var unpaid = query.unpaid === 'true';
        var includeRevoked = query.include_revoked === 'true';
        var format = query.format || 'json';

        var allTxs = [];
        var all = await store.getAllConnections();
        var connIdx = {};
        var idx = 1;
        for (var [pk, info] of Object.entries(all)) {
            if (pk === '__api__') {
                connIdx[pk] = { id: 0, label: 'API', revoked: false };
                continue;
            }
            if (info.revoked && !includeRevoked) { idx++; continue; }
            connIdx[pk] = { id: idx, label: info.label || `connection-${idx}`, revoked: !!info.revoked, dedicated: !!info.dedicated };
            idx++;
        }

        for (var [pk, info] of Object.entries(all)) {
            if (!connIdx[pk]) continue;
            if (connectionId && connIdx[pk].id !== Number(connectionId) && connIdx[pk].label !== connectionId) continue;
            var txs = await store.listTxs(pk, { type, unpaid, limit: 0 });
            for (var tx of txs) {
                allTxs.push({
                    ...tx,
                    connection_id: connIdx[pk].id,
                    connection_label: connIdx[pk].label,
                    connection_revoked: connIdx[pk].revoked,
                    connection_dedicated: connIdx[pk].dedicated,
                });
            }
        }

        allTxs.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
        if (query.from) allTxs = allTxs.filter(tx => tx.created_at >= Number(query.from));
        if (query.until) allTxs = allTxs.filter(tx => tx.created_at <= Number(query.until));

        if (format === 'csv') {
            var csvHeader = 'date,time,type,amount_sats,routing_fee_sats,service_fee_sats,status,connection,description,payment_hash';
            var csvRows = allTxs.map(tx => {
                var dt = tx.settled_at || tx.created_at;
                var d = dt ? new Date(dt * 1000) : null;
                var date = d ? d.toISOString().slice(0, 10) : '';
                var time = d ? d.toISOString().slice(11, 19) : '';
                var amountSats = Math.floor((tx.amount || 0) / 1000);
                var routingFee = Math.floor((tx.fees_paid || 0) / 1000);
                var serviceFee = Math.floor((tx.service_fee || 0) / 1000);
                var status = tx.err_msg ? 'failed' : tx.settled_at ? 'settled' : 'pending';
                var desc = csvEscape(tx.description || '');
                var hash = tx.payment_hash || '';
                return `${date},${time},${tx.type || ''},${amountSats},${routingFee},${serviceFee},${status},${csvEscape(tx.connection_label || '')},${desc},${hash}`;
            });
            var csv = csvHeader + '\n' + csvRows.join('\n');
            var filename = `nutbits-export-${new Date().toISOString().slice(0, 10)}.csv`;
            return { csv, filename, records: allTxs.length };
        }

        return {
            transactions: allTxs,
            total: allTxs.length,
            exported_at: new Date().toISOString(),
        };
    });

    // ── GET /api/v1/mints ────────────────────────────────────────────

    router.get('/api/v1/mints', async () => {
        var mints = [];
        for (var url of mintManager.orderedMints) {
            var wallet = mintManager.wallets.get(url);
            var info = null;
            try { info = wallet?.getMintInfo?.(); } catch (e) { /* ignore */ }
            var health = mintManager.mintHealth.get(url);
            var proofs = await store.getProofs(url);
            var caps = mintManager.mintCaps.get(url) || {};
            mints.push({
                url,
                name: info?.name || 'unknown',
                version: info?.version || '?',
                motd: info?.motd || null,
                active: url === mintManager.activeMintUrl,
                healthy: health?.healthy ?? null,
                last_check: health?.lastCheck || null,
                consecutive_failures: health?.consecutiveFailures || 0,
                balance_sats: sumProofs(proofs),
                nuts: caps,
            });
        }
        return { mints, active_mint: mintManager.activeMintUrl };
    });

    // ── POST /api/v1/mints/active ───────────────────────────────────

    router.post('/api/v1/mints/active', async ({ body }) => {
        if (!body?.url || typeof body.url !== 'string') throw apiError(400, 'url is required');

        var url = body.url.trim();
        if (!mintManager.orderedMints.includes(url)) throw apiError(404, 'mint not configured');

        if (url === mintManager.activeMintUrl) {
            return { active_mint: mintManager.activeMintUrl, changed: false };
        }

        var wallet = mintManager.wallets.get(url);
        if (!wallet) {
            if (typeof createWalletForMint !== 'function') throw apiError(500, 'mint switch unavailable');
            wallet = createWalletForMint(url);
            mintManager.wallets.set(url, wallet);
        }

        try {
            await wallet.loadMint();
            if (typeof detectMintCaps === 'function') detectMintCaps(wallet, url);
        } catch (e) {
            mintManager.mintHealth.set(url, {
                healthy: false,
                lastCheck: Date.now(),
                consecutiveFailures: (mintManager.mintHealth.get(url)?.consecutiveFailures || 0) + 1,
                lastError: e.message,
            });
            throw apiError(502, `mint is not reachable: ${e.message}`);
        }

        var oldMint = mintManager.activeMintUrl;
        mintManager.activeMintUrl = url;
        mintManager.mintHealth.set(url, {
            healthy: true,
            lastCheck: Date.now(),
            consecutiveFailures: 0,
            lastError: null,
        });
        await store.setActiveMintUrl(url);
        try { await nutbits.refreshBalance(); } catch (e) { /* ignore */ }
        log.info('API: active mint changed', { from: oldMint, to: url });

        return { active_mint: mintManager.activeMintUrl, previous_mint: oldMint, changed: true };
    });

    // ── GET /api/v1/nuts ─────────────────────────────────────────────

    router.get('/api/v1/nuts', async () => {
        var NUT_NAMES = {
            '00': 'Cryptography', '01': 'Mint Public Keys', '02': 'Keysets',
            '03': 'Swap', '04': 'Mint (BOLT11)', '05': 'Melt (BOLT11)',
            '06': 'Mint Info', '07': 'Proof State Check', '08': 'Fee Return',
            '09': 'Signature Restore', '12': 'DLEQ Proofs',
            '13': 'Deterministic Secrets', '15': 'Partial Multi-Path',
            '17': 'WebSocket Subscriptions', '20': 'Signature on Mint',
        };
        var coreNuts = ['00', '01', '02', '03', '04', '05', '06', '07', '08'];

        var result = { nuts: NUT_NAMES, mints: {} };
        for (var url of mintManager.orderedMints) {
            var caps = mintManager.mintCaps.get(url) || {};
            var mintNuts = {};
            for (var n of coreNuts) mintNuts[n] = true;
            mintNuts['09'] = !!caps.nut09;
            mintNuts['12'] = !!caps.nut12;
            mintNuts['13'] = !!config.seed;
            mintNuts['15'] = !!caps.nut15;
            mintNuts['17'] = !!caps.nut17;
            mintNuts['20'] = !!caps.nut20;
            result.mints[url] = { nuts: mintNuts, active: url === mintManager.activeMintUrl };
        }
        return result;
    });

    // ── GET /api/v1/relays ───────────────────────────────────────────

    router.get('/api/v1/relays', async () => {
        var relays = [];
        var pools = nutbits.state.nostr_state.pools;
        var connectionCount = Object.keys(pools).length;

        var firstPk = Object.keys(pools)[0];
        if (firstPk && Array.isArray(pools[firstPk])) {
            for (var r of pools[firstPk]) {
                var connected = r.connected || false;
                relays.push({
                    url: r.url,
                    connected,
                    subscriptions: connected ? connectionCount : 0,
                });
            }
        }

        var connectedCount = relays.filter(r => r.connected).length;
        return { relays, connected: connectedCount, total: relays.length };
    });

    // ── GET /api/v1/config ───────────────────────────────────────────

    router.get('/api/v1/config', async () => {
        return {
            mint_urls: config.mintUrls,
            active_mint: mintManager.activeMintUrl,
            relays: config.relays,
            storage: config.stateBackend,
            log_level: config.logLevel,
            fee_reserve_pct: Math.round(config.feeReservePct * 100),
            max_payment_sats: config.maxPaymentSats,
            daily_limit_sats: config.dailyLimitSats,
            health_check_interval_ms: config.healthCheckInterval,
            failover_cooldown_ms: config.failoverCooldown,
            seed_configured: !!config.seed,
            seed_in_env: !!ctx.seedFromEnv,
            service_fee_ppm: config.serviceFeePpm,
            service_fee_base: config.serviceFeeBase,
            reloadable: ['log_level', 'max_payment_sats', 'daily_limit_sats', 'fee_reserve_pct', 'service_fee_ppm', 'service_fee_base'],
        };
    });

    // ── GET /api/v1/config/env - all .env options with state ────────

    var ENV_DESCRIPTIONS = new Map([
        ['NUTBITS_MINT_URL', { desc: 'Cashu mint URL', restart: true }],
        ['NUTBITS_MINT_URLS', { desc: 'Comma-separated mint URLs used for connections and failover', restart: true }],
        ['NUTBITS_RELAYS', { desc: 'Comma-separated Nostr relays', restart: true }],
        ['NUTBITS_STATE_PASSPHRASE', { desc: 'Encryption passphrase', restart: true, sensitive: true }],
        ['NUTBITS_SEED', { desc: 'Deterministic seed (NUT-13)', restart: true, sensitive: true }],
        ['NUTBITS_STATE_BACKEND', { desc: 'Storage backend: file, sqlite, mysql', restart: true }],
        ['NUTBITS_SQLITE_PATH', { desc: 'SQLite database path', restart: true }],
        ['NUTBITS_MYSQL_URL', { desc: 'MySQL connection URL', restart: true, sensitive: true }],
        ['NUTBITS_STATE_FILE', { desc: 'Encrypted state file path', restart: true }],
        ['NUTBITS_LOG_LEVEL', { desc: 'Log level: error, warn, info, debug', restart: false }],
        ['NUTBITS_FEE_RESERVE_PCT', { desc: 'Fee reserve percentage (1-50)', restart: false }],
        ['NUTBITS_MAX_PAYMENT_SATS', { desc: 'Max sats per payment (0 = no limit)', restart: false }],
        ['NUTBITS_DAILY_LIMIT_SATS', { desc: 'Max sats per day (0 = no limit)', restart: false }],
        ['NUTBITS_SERVICE_FEE_PPM', { desc: 'Service fee parts per million (0 = disabled)', restart: false }],
        ['NUTBITS_SERVICE_FEE_BASE', { desc: 'Service fee base in sats (0 = disabled)', restart: false }],
        ['NUTBITS_HEALTH_CHECK_INTERVAL_MS', { desc: 'Mint health check interval ms', restart: true }],
        ['NUTBITS_FAILOVER_COOLDOWN_MS', { desc: 'Failover cooldown ms', restart: true }],
        ['NUTBITS_API_ENABLED', { desc: 'Enable management API (true/false)', restart: true }],
        ['NUTBITS_API_SOCKET', { desc: 'Unix socket path for API', restart: true }],
        ['NUTBITS_API_PORT', { desc: 'Optional HTTP port for API', restart: true }],
        ['NUTBITS_API_TOKEN', { desc: 'API auth token (auto-generated)', restart: true, sensitive: true }],
        ['NUTBITS_INVOICE_CHECK_MAX_RETRIES', { desc: 'Max retries for invoice polling', restart: true }],
        ['NUTBITS_INVOICE_CHECK_INTERVAL_SECS', { desc: 'Seconds between invoice checks', restart: true }],
        ['NUTBITS_FETCH_TIMEOUT_MS', { desc: 'Mint API request timeout ms', restart: true }],
    ]);

    router.get('/api/v1/config/env', async () => {
        var envPath = '.env';
        var options = [];

        try {
            if (!fs.existsSync(envPath)) return { options, file_exists: false };
            var content = fs.readFileSync(envPath, 'utf8');
            var lines = content.split('\n');

            // Track what we've seen from the file
            var seen = new Set();

            for (var line of lines) {
                var trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#!')) continue;

                var isComment = trimmed.startsWith('#');
                var cleanLine = isComment ? trimmed.replace(/^#\s*/, '') : trimmed;

                // Must be a NUTBITS_ key=value line
                var match = cleanLine.match(/^(NUTBITS_\w+)=(.*)/);
                if (!match) continue;

                var key = match[1];
                var value = match[2];
                var meta = ENV_DESCRIPTIONS.get(key) || { desc: '', restart: true };

                seen.add(key);
                options.push({
                    key,
                    value: meta.sensitive ? (value ? '***' : '') : value,
                    active: !isComment,
                    desc: meta.desc,
                    restart: meta.restart,
                    sensitive: !!meta.sensitive,
                });
            }

            // Add known options that aren't in the file at all
            for (var [key, meta] of ENV_DESCRIPTIONS) {
                if (!seen.has(key) && !meta.sensitive) {
                    options.push({
                        key,
                        value: '',
                        active: false,
                        desc: meta.desc,
                        restart: meta.restart,
                        sensitive: false,
                        missing: true,
                    });
                }
            }
        } catch (e) {
            return { options: [], file_exists: false, error: e.message };
        }

        return { options, file_exists: true };
    });

    // ── POST /api/v1/config/env - activate/set a .env option ─────

    router.post('/api/v1/config/env', async ({ body }) => {
        if (!body?.key || typeof body.key !== 'string') throw apiError(400, 'key is required');
        if (!body.key.startsWith('NUTBITS_')) throw apiError(400, 'key must start with NUTBITS_');
        // Whitelist: only allow known config keys
        if (!ENV_DESCRIPTIONS.has(body.key)) throw apiError(400, 'unknown config key');
        if (body.value === undefined) throw apiError(400, 'value is required');
        // Sanitize: strip newlines to prevent env injection
        var safeValue = String(body.value).replace(/[\r\n]/g, '');

        var meta = ENV_DESCRIPTIONS.get(body.key);
        if (meta?.sensitive && !body.confirm_sensitive) {
            throw apiError(400, 'sensitive value - pass confirm_sensitive: true');
        }

        persistToEnv(body.key, safeValue);

        // If it's hot-reloadable, also apply in-memory via the config reload logic
        var reloadMap = new Map([
            ['NUTBITS_LOG_LEVEL', v => { var levels = { error: 0, warn: 1, info: 2, debug: 3 }; if (v in levels) { config.logLevel = v; log._level = levels[v]; } }],
            ['NUTBITS_MAX_PAYMENT_SATS', v => { var n = Number(v); if (Number.isFinite(n) && n >= 0) config.maxPaymentSats = Math.floor(n); }],
            ['NUTBITS_DAILY_LIMIT_SATS', v => { var n = Number(v); if (Number.isFinite(n) && n >= 0) config.dailyLimitSats = Math.floor(n); }],
            ['NUTBITS_FEE_RESERVE_PCT', v => { var n = Number(v); if (Number.isFinite(n) && n >= 0 && n <= 50) config.feeReservePct = n / 100; }],
            ['NUTBITS_SERVICE_FEE_PPM', v => { var n = Number(v); if (Number.isFinite(n) && n >= 0) config.serviceFeePpm = Math.floor(n); }],
            ['NUTBITS_SERVICE_FEE_BASE', v => { var n = Number(v); if (Number.isFinite(n) && n >= 0) config.serviceFeeBase = Math.floor(n); }],
        ]);
        var reloader = reloadMap.get(body.key);
        var applied = false;
        if (reloader) {
            try { reloader(safeValue); applied = true; } catch (e) { /* non-fatal */ }
        }

        return {
            key: body.key,
            value: meta?.sensitive ? '***' : body.value,
            persisted: true,
            applied_live: applied,
            restart_required: meta?.restart ?? true,
        };
    });

    // ── POST /api/v1/config ──────────────────────────────────────────

    router.post('/api/v1/config', async ({ body }) => {
        if (!body?.key || body.value === undefined) throw apiError(400, 'key and value required');
        if (typeof body.key !== 'string') throw apiError(400, 'key must be a string');
        if (typeof body.value === 'object') throw apiError(400, 'value must be a string or number');

        var LOG_LEVELS_MAP = { error: 0, warn: 1, info: 2, debug: 3 };

        // Use a Map to prevent prototype property bypass (__proto__, constructor)
        var reloadable = new Map([
            ['log_level', v => {
                if (!(v in LOG_LEVELS_MAP)) throw apiError(400, 'log_level must be: error, warn, info, debug');
                config.logLevel = v;
                log._level = LOG_LEVELS_MAP[v];
            }],
            ['max_payment_sats', v => {
                var n = Number(v);
                if (!Number.isFinite(n) || n < 0) throw apiError(400, 'must be a non-negative number');
                config.maxPaymentSats = Math.floor(n);
            }],
            ['daily_limit_sats', v => {
                var n = Number(v);
                if (!Number.isFinite(n) || n < 0) throw apiError(400, 'must be a non-negative number');
                config.dailyLimitSats = Math.floor(n);
            }],
            ['fee_reserve_pct', v => {
                var n = Number(v);
                if (!Number.isFinite(n) || n < 0 || n > 50) throw apiError(400, 'fee_reserve_pct must be 0-50');
                config.feeReservePct = n / 100;
            }],
            ['service_fee_ppm', v => {
                var n = Number(v);
                if (!Number.isFinite(n) || n < 0 || n > 100000) throw apiError(400, 'service_fee_ppm must be 0-100000 (0-10%)');
                config.serviceFeePpm = Math.floor(n);
            }],
            ['service_fee_base', v => {
                var n = Number(v);
                if (!Number.isFinite(n) || n < 0) throw apiError(400, 'service_fee_base must be non-negative');
                config.serviceFeeBase = Math.floor(n);
            }],
        ]);

        if (!reloadable.has(body.key)) throw apiError(400, `"${body.key}" is not hot-reloadable`);

        // Read old value before applying
        var keyToCamel = new Map([['log_level', 'logLevel'], ['max_payment_sats', 'maxPaymentSats'], ['daily_limit_sats', 'dailyLimitSats'], ['fee_reserve_pct', 'feeReservePct'], ['service_fee_ppm', 'serviceFeePpm'], ['service_fee_base', 'serviceFeeBase']]);
        var camelKey = keyToCamel.get(body.key) || body.key;
        var oldValue = config[camelKey];
        if (camelKey === 'feeReservePct') oldValue = Math.round(oldValue * 100);

        reloadable.get(body.key)(body.value);

        // Persist to .env file so the change survives restarts
        var envKey = 'NUTBITS_' + body.key.toUpperCase();
        persistToEnv(envKey, String(body.value));

        return { key: body.key, old_value: oldValue, new_value: body.value, applied: true, persisted: true };
    });

    // ── GET /api/v1/fees ───────────────────────────────────────────

    router.get('/api/v1/fees', async () => {
        var today = new Date().toISOString().slice(0, 10);
        var all = await store.getAllConnections();
        var totalToday = 0;
        var totalAll = 0;
        var byConnection = [];

        for (var [pk, info] of Object.entries(all)) {
            if (pk === '__api__') continue;
            if (info.revoked) continue;
            var connFeeToday = 0;
            var connFeeAll = 0;
            for (var tx of Object.values(info.tx_history || {})) {
                var fee = tx.service_fee || 0;
                if (fee > 0) {
                    connFeeAll += fee;
                    if (tx.settled_at) {
                        var txDate = new Date(tx.settled_at * 1000).toISOString().slice(0, 10);
                        if (txDate === today) connFeeToday += fee;
                    }
                }
            }
            if (connFeeAll > 0) {
                byConnection.push({
                    label: info.label || pk.slice(0, 8),
                    today_msat: connFeeToday,
                    total_msat: connFeeAll,
                });
            }
            totalToday += connFeeToday;
            totalAll += connFeeAll;
        }

        return {
            enabled: !!(config.serviceFeePpm || config.serviceFeeBase),
            fee_ppm: config.serviceFeePpm,
            fee_base_sats: config.serviceFeeBase,
            today_sats: Math.floor(totalToday / 1000),
            total_sats: Math.floor(totalAll / 1000),
            today_msat: totalToday,
            total_msat: totalAll,
            by_connection: byConnection,
        };
    });

    // ── GET /api/v1/lnurl/resolve ──────────────────────────────────────
    // Resolves a Lightning Address to LNURL-pay metadata for the GUI

    router.get('/api/v1/lnurl/resolve', async ({ query }) => {
        var address = (query.address || '').trim().toLowerCase();
        if (!address) throw apiError(400, 'address query parameter is required');
        if (!validateLightningAddress(address)) throw apiError(400, 'invalid Lightning Address format');

        var [name, domain] = address.split('@');
        await assertPublicHost(domain);
        var lnurlPayUrl = `https://${domain}/.well-known/lnurlp/${name}`;
        var payRequest;
        try {
            payRequest = await fetchPayRequest(lnurlPayUrl);
        } catch (e) {
            throw apiError(422, `could not resolve: ${e.message}`);
        }

        return {
            address,
            domain,
            callback: !!payRequest.callback,
            min_sats: Math.ceil((payRequest.minSendable || 1000) / 1000),
            max_sats: Math.floor((payRequest.maxSendable || 100000000000) / 1000),
            description: payRequest.metadata ? parseLnurlMeta(payRequest.metadata) : null,
            allows_nostr: !!payRequest.allowsNostr,
            nostr_pubkey: payRequest.nostrPubkey || null,
            comment_allowed: payRequest.commentAllowed || 0,
        };
    });

    // ── POST /api/v1/pay ─────────────────────────────────────────────

    router.post('/api/v1/pay', async ({ body }) => {
        if (!body?.invoice) throw apiError(400, 'invoice is required');
        if (typeof body.invoice !== 'string' || body.invoice.length > 8192) throw apiError(400, 'invalid invoice');

        var invoiceToPay = body.invoice.trim();
        var resolvedFromLud16 = false;

        // Lightning Address resolution: user@domain -> fetch LNURL-pay -> get invoice
        if (validateLightningAddress(invoiceToPay)) {
            var lnAmount = Number(body.amount_sats);
            if (!lnAmount || lnAmount <= 0) throw apiError(400, 'amount_sats is required when paying a Lightning Address');

            var [lnUser, lnDomain] = invoiceToPay.toLowerCase().split('@');
            await assertPublicHost(lnDomain);
            var lnurlPayUrl = `https://${lnDomain}/.well-known/lnurlp/${lnUser}`;
            var payRequest;
            try {
                payRequest = await fetchPayRequest(lnurlPayUrl);
            } catch (e) {
                throw apiError(422, `could not resolve Lightning Address: ${e.message}`);
            }

            var amountMsats = lnAmount * 1000;
            if (payRequest.minSendable && amountMsats < payRequest.minSendable) {
                throw apiError(400, `amount below minimum: ${Math.ceil(payRequest.minSendable / 1000)} sats`);
            }
            if (payRequest.maxSendable && amountMsats > payRequest.maxSendable) {
                throw apiError(400, `amount above maximum: ${Math.floor(payRequest.maxSendable / 1000)} sats`);
            }

            var callbackResult;
            try {
                callbackResult = await requestLnurlInvoice(payRequest, amountMsats);
            } catch (e) {
                throw apiError(422, `Lightning Address callback failed: ${e.message}`);
            }
            if (!callbackResult?.pr) throw apiError(422, 'Lightning Address did not return an invoice');
            invoiceToPay = callbackResult.pr;
            resolvedFromLud16 = true;
        }

        // Decode and validate the BOLT11 invoice
        var decoded;
        try { decoded = bolt11Lib.decode(invoiceToPay); }
        catch (e) { throw apiError(400, `cannot decode invoice: ${e.message}`); }

        var amountSats = decoded.satoshis;
        if (!amountSats) {
            // For LNURL-resolved invoices, use the requested amount
            if (resolvedFromLud16 && body.amount_sats) {
                amountSats = Number(body.amount_sats);
            } else {
                throw apiError(400, 'amountless invoices not supported');
            }
        }

        // Enforce spending limits at API level (same logic as NWC handler)
        if (config.maxPaymentSats && amountSats > config.maxPaymentSats) {
            throw apiError(403, `exceeds per-payment limit of ${config.maxPaymentSats} sats`);
        }

        // Daily limit enforcement
        if (config.dailyLimitSats) {
            var today = new Date().toISOString().slice(0, 10);
            // Use '__api__' as the connection key for API-initiated payments
            var spent = await store.getDailySpend('__api__', today);
            if ((spent + amountSats) > config.dailyLimitSats) {
                throw apiError(403, `exceeds daily limit of ${config.dailyLimitSats} sats (${spent} already spent today)`);
            }
        }

        // Service fee (outgoing only)
        var serviceFee = Math.floor(amountSats * config.serviceFeePpm / 1_000_000) + config.serviceFeeBase;
        if (!config.serviceFeePpm && !config.serviceFeeBase) serviceFee = 0;
        var totalNeeded = amountSats + serviceFee;

        var balance = await nutbits.getBalance();
        if (totalNeeded > balance) {
            throw apiError(400, `insufficient balance: ${balance} sats available, ${totalNeeded} sats needed${serviceFee ? ` (incl. ${serviceFee} service fee)` : ''}`);
        }

        // Extract payment hash from invoice for tx tracking
        var pmthash = decoded.tags?.find(t => t.tagName === 'payment_hash')?.data || 'pay_' + Date.now();
        var description = decoded.tags?.find(t => t.tagName === 'description')?.data || '';

        var result;
        try {
            result = await nutbits.payInvoice(invoiceToPay);
        } catch (e) {
            throw apiError(502, `payment failed: ${e.message}`);
        }

        // Track daily spend + service fee for API payments
        if (result.success) {
            var todayDate = new Date().toISOString().slice(0, 10);
            await store.addDailySpend('__api__', todayDate, amountSats);
        }

        // Store tx record for API-initiated pays
        await store.setTx('__api__', pmthash, {
            type: 'outgoing',
            amount: amountSats * 1000,
            description: description || (resolvedFromLud16 ? `Pay ${amountSats} sats to ${body.invoice}` : `Pay ${amountSats} sats`),
            payment_hash: pmthash,
            invoice: invoiceToPay,
            created_at: Math.floor(Date.now() / 1000),
            settled_at: result.success ? Math.floor(Date.now() / 1000) : null,
            paid: !!result.success,
            preimage: result.preimage || null,
            fees_paid: (result.fee || 0) * 1000,
            service_fee: serviceFee * 1000,
            err_msg: result.error || null,
        });

        var newBalance = await nutbits.getBalance();
        var response = {
            ...result,
            amount_sats: amountSats,
            service_fee_sats: serviceFee,
            balance_sats: newBalance,
        };
        if (resolvedFromLud16) response.lud16 = body.invoice.trim().toLowerCase();
        return response;
    });

    // ── POST /api/v1/receive ─────────────────────────────────────────

    router.post('/api/v1/receive', async ({ body }) => {
        if (!body?.amount_sats) throw apiError(400, 'amount_sats is required');
        var amount = Number(body.amount_sats);
        if (!Number.isFinite(amount) || amount <= 0) throw apiError(400, 'amount_sats must be positive');
        if (amount > 2_100_000_000_000_000) throw apiError(400, 'amount exceeds maximum (21M BTC)');

        var quote = await nutbits.createInvoice(Math.floor(amount));

        // Store pending tx record for API-initiated receives
        await store.setTx('__api__', quote.quote, {
            type: 'incoming',
            amount: Math.floor(amount) * 1000,
            description: `Receive ${Math.floor(amount)} sats`,
            payment_hash: quote.quote,
            invoice: quote.request,
            created_at: Math.floor(Date.now() / 1000),
            settled_at: null,
            paid: false,
        });

        return {
            invoice: quote.request,
            quote_id: quote.quote,
            amount_sats: Math.floor(amount),
            mint: mintManager.activeMintUrl,
        };
    });

    // ── POST /api/v1/receive/check ───────────────────────────────────

    router.post('/api/v1/receive/check', async ({ body }) => {
        if (!body?.quote_id) throw apiError(400, 'quote_id is required');
        if (typeof body.quote_id !== 'string' || body.quote_id.length > 256) throw apiError(400, 'invalid quote_id');
        if (body.mint && (typeof body.mint !== 'string' || !/^https:\/\/.+/.test(body.mint))) throw apiError(400, 'mint must be a valid https:// URL');
        var minted = await nutbits.checkAndMintTokens({ quote: body.quote_id, request: body.invoice, _mintUrl: body.mint });
        var balance = await nutbits.getBalance();

        // Update tx record when payment settles
        if (minted) {
            await store.updateTx('__api__', body.quote_id, {
                settled_at: Math.floor(Date.now() / 1000),
                paid: true,
            });
        }

        return { paid: minted, balance_sats: balance };
    });

    // ── GET /api/v1/backup ───────────────────────────────────────────
    // Returns the already-encrypted state file (AES-256-GCM) - NOT raw proofs
    // The passphrase is required to decrypt, and is never sent over the API

    router.get('/api/v1/backup', async () => {
        await store.saveAll();
        var stateFile = config.stateFile;
        if (!fs.existsSync(stateFile)) throw apiError(404, 'state file not found');
        var blob = fs.readFileSync(stateFile);
        var proofCount = 0;
        var totalSats = 0;
        for (var url of mintManager.orderedMints) {
            var proofs = await store.getProofs(url);
            proofCount += proofs.length;
            totalSats += sumProofs(proofs);
        }
        return {
            data_b64: blob.toString('base64'),
            size_bytes: blob.length,
            proofs: proofCount,
            total_sats: totalSats,
            mints: mintManager.orderedMints.length,
            connections: Object.keys(nutbits.state.nostr_state.nwc_info).filter(pk => !nutbits.state.nostr_state.nwc_info[pk]?.revoked).length,
            timestamp: new Date().toISOString(),
        };
    });

    // ── POST /api/v1/restore ─────────────────────────────────────────

    var restoreInProgress = false;

    router.post('/api/v1/restore', async ({ body }) => {
        if (restoreInProgress) throw apiError(409, 'restore already in progress');
        if (body?.mint && (typeof body.mint !== 'string' || !/^https:\/\/.+/.test(body.mint))) throw apiError(400, 'mint must be a valid https:// URL');
        restoreInProgress = true;

        try {
            var results = [];
            var targetMints = body?.mint ? [body.mint] : mintManager.orderedMints;
            for (var url of targetMints) {
                var proofs = await nutbits.restoreFromSeed(url);
                results.push({ mint: url, proofs_restored: proofs.length, sats: sumProofs(proofs) });
            }
            var totalSats = results.reduce((sum, r) => sum + r.sats, 0);
            return { results, total_sats: totalSats };
        } finally {
            restoreInProgress = false;
        }
    });

    // ── GET /api/v1/logs ─────────────────────────────────────────────

    // Log buffer — per-level ring buffers to prevent one noisy level from evicting others
    if (!ctx._logBuffers) {
        var MAX_PER_LEVEL = 150;
        ctx._logBuffers = { error: [], warn: [], info: [], debug: [] };
        var origLog = { ...log };
        for (var lvl of ['error', 'warn', 'info', 'debug']) {
            var origFn = origLog[lvl];
            if (origFn) {
                log[lvl] = ((level, fn) => (msg, data) => {
                    fn(msg, data);
                    var buf = ctx._logBuffers[level];
                    buf.push({ level, msg, data: redactLogData(data), ts: Date.now() });
                    if (buf.length > MAX_PER_LEVEL) buf.shift();
                })(lvl, origFn);
            }
        }
    }

    router.get('/api/v1/logs', async ({ query }) => {
        var level = query.level || 'info';
        var limit = Math.min(Number(query.limit) || 50, 200);
        var levels = { error: 0, warn: 1, info: 2, debug: 3 };
        var minLevel = levels[level] ?? 2;
        // Merge per-level buffers, filter by requested level, sort by timestamp
        var all = [];
        for (var [lvl, buf] of Object.entries(ctx._logBuffers)) {
            if ((levels[lvl] ?? 2) <= minLevel) all.push(...buf);
        }
        all.sort((a, b) => a.ts - b.ts);
        return { logs: all.slice(-limit) };
    });
}

// ── Error Helper ─────────────────────────────────────────────────────────

// ── .env Persistence ─────────────────────────────────────────────────────
// Updates or adds a key=value in the .env file

function persistToEnv(key, value) {
    // Sanitize: prevent newline injection and shell expansion if .env is sourced
    value = String(value).replace(/[\r\n]/g, '');
    var quoted = '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`') + '"';
    var envPath = '.env';
    try {
        if (!fs.existsSync(envPath)) {
            fs.writeFileSync(envPath, `${key}=${quoted}\n`, { mode: 0o600 });
            return;
        }
        var content = fs.readFileSync(envPath, 'utf8');
        var lines = content.split('\n');
        var found = false;

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            // Match both active and commented-out versions
            if (line.startsWith(`${key}=`) || line.startsWith(`# ${key}=`)) {
                lines[i] = `${key}=${quoted}`;
                found = true;
                break;
            }
        }

        if (!found) {
            // Append to end
            lines.push(`${key}=${quoted}`);
        }

        fs.writeFileSync(envPath, lines.join('\n'), { mode: 0o600 });
    } catch (e) {
        // Non-fatal - in-memory change still applied
    }
}

function csvEscape(val) {
    var s = String(val);
    // Prevent formula injection — prefix dangerous first characters
    if (s.length > 0 && '=+-@'.includes(s[0])) s = "'" + s;
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}

function apiError(statusCode, message) {
    var err = new Error(message);
    err.statusCode = statusCode;
    return err;
}
