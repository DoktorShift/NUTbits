// NUTbits — Cashu ecash mint to NWC bridge
// Inspired by https://github.com/supertestnet/bankify
// License: AGPL-3.0 (https://www.gnu.org/licenses/agpl-3.0.html)

import {
    generateSecretKey, getPublicKey,
    finalizeEvent, verifyEvent,
    Relay,
    nip04, nip44,
    bytesToHex, hexToBytes
} from 'nostr-core';
import { Wallet, sumProofs, MintQuoteState, NetworkError, HttpResponseError, MintOperationError, hasValidDleq } from '@cashu/cashu-ts';
import { createStore } from './store/index.js';
import { startApiServer } from './api/server.js';
import bolt11Lib from 'bolt11';
import crypto from 'crypto';
import fs from 'fs';
import 'dotenv/config';

// ── Configuration ──────────────────────────────────────────────────────────

var config = {
    mintUrls:        (process.env.NUTBITS_MINT_URLS || process.env.NUTBITS_MINT_URL || 'https://mint.coinos.io').split(',').map(s => s.trim()).filter(Boolean),
    relays:          (process.env.NUTBITS_RELAYS || 'wss://nostrue.com').split(',').map(s => s.trim()).filter(Boolean),
    stateFile:       process.env.NUTBITS_STATE_FILE || './nutbits_state.enc',
    statePassphrase: process.env.NUTBITS_STATE_PASSPHRASE || '',
    logLevel:        process.env.NUTBITS_LOG_LEVEL || 'info',
    feeReservePct:   Number(process.env.NUTBITS_FEE_RESERVE_PCT || 1) / 100,
    maxRetries:      Number(process.env.NUTBITS_INVOICE_CHECK_MAX_RETRIES || 60),
    checkInterval:   Number(process.env.NUTBITS_INVOICE_CHECK_INTERVAL_SECS || 20),
    fetchTimeout:    Number(process.env.NUTBITS_FETCH_TIMEOUT_MS || 15000),
    maxPaymentSats:  Number(process.env.NUTBITS_MAX_PAYMENT_SATS || 0),
    dailyLimitSats:  Number(process.env.NUTBITS_DAILY_LIMIT_SATS || 0),
    healthCheckInterval: Number(process.env.NUTBITS_HEALTH_CHECK_INTERVAL_MS || 60000),
    failoverCooldown:    Number(process.env.NUTBITS_FAILOVER_COOLDOWN_MS || 10000),
    stateBackend:        process.env.NUTBITS_STATE_BACKEND || 'file',
    sqlitePath:          process.env.NUTBITS_SQLITE_PATH || null,
    mysqlUrl:            process.env.NUTBITS_MYSQL_URL || null,
    seed:                process.env.NUTBITS_SEED || null,
    serviceFeePpm:       Math.max(0, Math.floor(Number(process.env.NUTBITS_SERVICE_FEE_PPM || 0))),
    serviceFeeBase:      Math.max(0, Math.floor(Number(process.env.NUTBITS_SERVICE_FEE_BASE || 0))),
    apiEnabled:          process.env.NUTBITS_API_ENABLED !== 'false',
    apiSocket:           process.env.NUTBITS_API_SOCKET || null,
    apiPort:             process.env.NUTBITS_API_PORT || null,
    apiToken:            process.env.NUTBITS_API_TOKEN || null,
};
// Backward compat: mintUrl = first configured mint
config.mintUrl = config.mintUrls[0];

// ── Logging ────────────────────────────────────────────────────────────────

var LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
var log = {
    _level: LOG_LEVELS[config.logLevel] ?? 2,
    _fmt: (level, msg, data) => {
        var ts = new Date().toISOString();
        var line = `[${ts}] [${level.toUpperCase()}] ${msg}`;
        if (data !== undefined) line += ' ' + JSON.stringify(data);
        return line;
    },
    error: (msg, data) => { if (log._level >= 0) console.error(log._fmt('error', msg, data)); },
    warn:  (msg, data) => { if (log._level >= 1) console.warn(log._fmt('warn', msg, data)); },
    info:  (msg, data) => { if (log._level >= 2) console.log(log._fmt('info', msg, data)); },
    debug: (msg, data) => { if (log._level >= 3) console.log(log._fmt('debug', msg, data)); },
};

// ── Utilities ──────────────────────────────────────────────────────────────

var wait = ms => new Promise(r => setTimeout(r, ms));

// Service fee calculation (outgoing payments only)
var calcServiceFee = (amountSats, connState) => {
    var ppm = connState?.service_fee_ppm ?? config.serviceFeePpm;
    var base = connState?.service_fee_base ?? config.serviceFeeBase;
    if (!ppm && !base) return 0;
    return Math.floor(amountSats * ppm / 1_000_000) + base;
};

var validateMintUrl = url => {
    try {
        var parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('not http(s)');
        return parsed.origin + parsed.pathname.replace(/\/+$/, '');
    } catch (e) {
        throw new Error('Invalid mint URL: ' + url);
    }
};

// ── Security: Event Deduplication ───────────────────────────────────────────

var processedEvents = new Set();
var DEDUP_MAX = 10000;
var isDuplicate = eventId => {
    if (processedEvents.has(eventId)) return true;
    processedEvents.add(eventId);
    if (processedEvents.size > DEDUP_MAX) {
        var arr = [...processedEvents];
        processedEvents = new Set(arr.slice(-Math.floor(DEDUP_MAX / 2)));
    }
    return false;
};

// ── NIP-04 / NIP-44 Encryption Layer ───────────────────────────────────────

var nwcEncrypt = async (privkeyHex, pubkeyHex, plaintext, useNip44 = true) => {
    if (useNip44) {
        var convKey = nip44.getConversationKey(hexToBytes(privkeyHex), pubkeyHex);
        return nip44.encrypt(plaintext, convKey);
    }
    return await nip04.encrypt(privkeyHex, pubkeyHex, plaintext);
};

var nwcDecrypt = async (privkeyHex, pubkeyHex, ciphertext) => {
    // Auto-detect: NIP-04 ciphertext contains "?iv=", NIP-44 does not
    var isNip04 = ciphertext.includes('?iv=');
    if (isNip04) {
        return { plaintext: await nip04.decrypt(privkeyHex, pubkeyHex, ciphertext), nip44: false };
    }
    var convKey = nip44.getConversationKey(hexToBytes(privkeyHex), pubkeyHex);
    return { plaintext: nip44.decrypt(ciphertext, convKey), nip44: true };
};

// ── Invoice Helpers ────────────────────────────────────────────────────────

var getInvoicePmthash = invoice => {
    var decoded = bolt11Lib.decode(invoice);
    for (var i = 0; i < decoded.tags.length; i++) {
        if (decoded.tags[i].tagName == 'payment_hash') return decoded.tags[i].data.toString();
    }
};

var getInvoiceDescription = invoice => {
    try {
        var decoded = bolt11Lib.decode(invoice);
        for (var i = 0; i < decoded.tags.length; i++) {
            if (decoded.tags[i].tagName == 'description') return decoded.tags[i].data.toString();
        }
    } catch (e) {}
    return '';
};

var getInvoiceDeschash = invoice => {
    try {
        var decoded = bolt11Lib.decode(invoice);
        for (var i = 0; i < decoded.tags.length; i++) {
            if (decoded.tags[i].tagName == 'purpose_commit_hash') return decoded.tags[i].data.toString();
        }
    } catch (e) {}
    return '';
};

// ── Multi-Mint Manager ────────────────────────────────────────────────────

var mintManager = {
    wallets: new Map(),       // mintUrl -> Wallet instance
    activeMintUrl: null,      // currently active mint URL
    mintHealth: new Map(),    // mintUrl -> { healthy, lastCheck, consecutiveFailures, lastError }
    mintCaps: new Map(),      // mintUrl -> { nut09, nut12, nut15, nut17, nut20 }
    orderedMints: [],         // validated mint URLs in priority order
    getActiveWallet: () => mintManager.wallets.get(mintManager.activeMintUrl),
};

var isMintDownError = e => {
    // MintOperationError extends HttpResponseError, so check it first — if the mint
    // responded with a protocol error, it's actually up (not a connectivity issue)
    if (e instanceof MintOperationError) return false;
    if (e instanceof NetworkError) return true;
    if (e instanceof HttpResponseError) return true;
    var msg = e?.message || '';
    return msg.includes('ECONNREFUSED') || msg.includes('fetch failed') || msg.includes('ETIMEDOUT') || msg.includes('ENOTFOUND');
};

var checkMintHealth = async mintUrl => {
    try {
        var w = mintManager.wallets.get(mintUrl);
        if (!w) return false;
        await w.mint.getInfo();
        mintManager.mintHealth.set(mintUrl, { healthy: true, lastCheck: Date.now(), consecutiveFailures: 0, lastError: null });
        return true;
    } catch (e) {
        var prev = mintManager.mintHealth.get(mintUrl) || { consecutiveFailures: 0 };
        mintManager.mintHealth.set(mintUrl, {
            healthy: false, lastCheck: Date.now(),
            consecutiveFailures: prev.consecutiveFailures + 1,
            lastError: e.message,
        });
        return false;
    }
};

var failoverToNextMint = async failedMintUrl => {
    log.warn('FAILOVER: mint is down, attempting switch', { failed: failedMintUrl });
    mintManager.mintHealth.set(failedMintUrl, {
        healthy: false, lastCheck: Date.now(), consecutiveFailures: 999, lastError: 'triggered failover',
    });

    for (var url of mintManager.orderedMints) {
        if (url === failedMintUrl) continue;
        var health = mintManager.mintHealth.get(url);
        if (health && !health.healthy && (Date.now() - health.lastCheck) < config.failoverCooldown) continue;

        try {
            var wallet = mintManager.wallets.get(url);
            if (!wallet) {
                wallet = createWalletForMint(url);
                mintManager.wallets.set(url, wallet);
            }
            await wallet.loadMint();
            detectMintCaps(wallet, url);
            var oldMint = mintManager.activeMintUrl;
            mintManager.activeMintUrl = url;
            mintManager.mintHealth.set(url, { healthy: true, lastCheck: Date.now(), consecutiveFailures: 0, lastError: null });
            log.warn('FAILOVER: switched mint', { from: oldMint, to: url });
            await store.setActiveMintUrl(url);
            return true;
        } catch (e) {
            log.warn('FAILOVER: candidate mint also down', { mint: url, error: e.message });
            mintManager.mintHealth.set(url, { healthy: false, lastCheck: Date.now(), consecutiveFailures: 1, lastError: e.message });
        }
    }
    log.error('FAILOVER: ALL MINTS DOWN — no healthy mint available');
    return false;
};

var withFailover = async (operation, operationName) => {
    try {
        return await operation();
    } catch (e) {
        if (isMintDownError(e) && mintManager.orderedMints.length > 1) {
            log.warn(`${operationName}: mint error, attempting failover`, { error: e.message });
            var switched = await failoverToNextMint(mintManager.activeMintUrl);
            if (switched) return await operation();
        }
        throw e;
    }
};

var getWalletForMint = mintUrl => {
    return mintManager.wallets.get(mintUrl) || mintManager.getActiveWallet();
};

// ── NUT Helpers ───────────────────────────────────────────────────────────

// NUT-06: Detect mint capabilities after loadMint
var detectMintCaps = (wallet, mintUrl) => {
    try {
        var info = wallet.getMintInfo();
        var caps = {
            nut09: !!info.isSupported(9)?.supported,
            nut12: !!info.isSupported(12)?.supported,
            nut15: !!info.isSupported(15)?.supported,
            nut17: !!info.isSupported(17)?.supported,
            nut20: !!info.isSupported(20)?.supported,
        };
        mintManager.mintCaps.set(mintUrl, caps);
        log.info('NUT-06: mint capabilities', { mint: mintUrl, ...caps });
        if (info.motd) log.info('mint MOTD', { mint: mintUrl, motd: info.motd });
        return caps;
    } catch (e) {
        log.debug('NUT-06: could not detect capabilities', { mint: mintUrl, error: e.message });
        return {};
    }
};

// NUT-12: Verify DLEQ proofs on minted/received tokens
var verifyProofsDleq = (proofs, wallet, mintUrl) => {
    var caps = mintManager.mintCaps.get(mintUrl);
    if (!caps?.nut12) return proofs;

    var verified = [];
    for (var p of proofs) {
        if (!p.dleq) {
            verified.push(p); // accept proofs without DLEQ (mint may omit it)
            continue;
        }
        try {
            if (hasValidDleq(p, wallet.getKeyset(p.id))) {
                verified.push(p);
            } else {
                log.error('NUT-12: INVALID DLEQ — proof rejected', { mint: mintUrl, amount: p.amount });
            }
        } catch (e) {
            log.warn('NUT-12: DLEQ check failed, accepting proof', { error: e.message, amount: p.amount });
            verified.push(p);
        }
    }
    return verified;
};

// NUT-13: Counter source for deterministic secrets (backed by store)
var createCounterSource = () => ({
    reserve: async (keysetId, n) => {
        var current = (await store.getCounter(keysetId)) || 0;
        if (n > 0) await store.setCounter(keysetId, current + n);
        return { start: current, count: n };
    },
    advanceToAtLeast: async (keysetId, minNext) => {
        var current = (await store.getCounter(keysetId)) || 0;
        if (minNext > current) await store.setCounter(keysetId, minNext);
    },
    snapshot: async () => ({}),
});

// NUT-13: Create wallet with seed if configured
var createWalletForMint = (mintUrl) => {
    var opts = config.seed ? {
        bip39seed: hexToBytes(config.seed),
        secretsPolicy: 'deterministic',
        counterSource: createCounterSource(),
    } : {};
    return new Wallet(mintUrl, opts);
};

// ── Store + Payment Lock ──────────────────────────────────────────────────

var store = null; // initialized at startup

var paymentLocks = new Map();
var withPaymentLock = async (mintUrl, fn) => {
    var prev = paymentLocks.get(mintUrl) || Promise.resolve();
    var release;
    paymentLocks.set(mintUrl, new Promise(r => { release = r; }));
    await prev;
    try { return await fn(); }
    finally { release(); }
};

// ── NUTbits Core ───────────────────────────────────────────────────────────

var nutbits = {
    state: {
        nostr_state: {
            pools: {},
            nwc_info: {},   // In-memory cache, synced with store
        },
    },
    get wallet() { return mintManager.getActiveWallet(); },

    // ── NWC Notifications (NIP-47) ────────────────────────────────────

    broadcastToConnection: async (event, app_pubkey) => {
        var relays = nutbits.state.nostr_state.pools[app_pubkey];
        if (!relays || !Array.isArray(relays)) return 0;
        var sent = 0;
        for (var relay of relays) {
            try {
                if (relay.connected) { await relay.publish(event); sent++; }
            } catch (e) {
                log.warn('notification publish failed', { url: relay.url, error: e.message });
            }
        }
        return sent;
    },

    sendNotification: async (app_pubkey, notificationType, transaction) => {
        var info = nutbits.state.nostr_state.nwc_info[app_pubkey];
        if (!info) return;
        var payload = JSON.stringify({
            notification_type: notificationType,
            notification: transaction,
        });
        var useNip44 = info.useNip44 ?? true;
        var encrypted = await nwcEncrypt(info.app_privkey, info.user_pubkey, payload, useNip44);
        var event = finalizeEvent({
            kind: useNip44 ? 23197 : 23196,
            content: encrypted,
            tags: [['p', info.user_pubkey]],
            created_at: Math.floor(Date.now() / 1000),
        }, hexToBytes(info.app_privkey));
        var sent = await nutbits.broadcastToConnection(event, app_pubkey);
        log.info('NWC notification sent', { type: notificationType, nip44: useNip44, relaysSent: sent });
    },

    formatTx: tx => {
        var result = {
            type: tx.type,
            state: tx.err_msg ? 'failed' : tx.settled_at ? 'settled' : 'pending',
            invoice: tx.invoice,
            description: tx.description || '',
            description_hash: tx.description_hash || '',
            preimage: tx.preimage || '',
            payment_hash: tx.payment_hash,
            amount: tx.amount,
            fees_paid: tx.fees_paid || 0,
            created_at: tx.created_at,
            expires_at: tx.expires_at,
            settled_at: tx.settled_at || null,
            metadata: tx.metadata || {},
        };
        // Optional: include service_fee if present (non-standard NIP-47 extension)
        if (tx.service_fee) result.service_fee = tx.service_fee;
        return result;
    },

    // ── Cashu Wallet (via cashu-ts SDK) ────────────────────────────────

    initWallet: async () => {
        mintManager.orderedMints = config.mintUrls.map(validateMintUrl);

        // Ensure each mint has a store entry
        for (var url of mintManager.orderedMints) {
            await store.ensureMint(url);
        }

        // Restore activeMintUrl from store (may have been persisted)
        var savedActiveMint = await store.getActiveMintUrl();
        if (savedActiveMint && mintManager.orderedMints.includes(savedActiveMint)) {
            mintManager.activeMintUrl = savedActiveMint;
        }

        // Populate in-memory NWC connection cache from store
        nutbits.state.nostr_state.nwc_info = await store.getAllConnections();

        // Try mints in priority order until one responds
        for (var url of mintManager.orderedMints) {
            try {
                var wallet = createWalletForMint(url);
                await wallet.loadMint();
                mintManager.wallets.set(url, wallet);
                mintManager.activeMintUrl = url;
                mintManager.mintHealth.set(url, { healthy: true, lastCheck: Date.now(), consecutiveFailures: 0, lastError: null });
                await store.setMintInfo(url, { lastHealthy: Date.now() });
                await store.setActiveMintUrl(url);
                var info = wallet.getMintInfo();
                detectMintCaps(wallet, url);
                log.info('cashu wallet initialized', { mint: url, name: info.name, version: info.version, keyset: wallet.keysetId });
                break;
            } catch (e) {
                log.warn('mint unreachable at startup, trying next', { mint: url, error: e.message });
                mintManager.mintHealth.set(url, { healthy: false, lastCheck: Date.now(), consecutiveFailures: 1, lastError: e.message });
            }
        }

        if (!mintManager.activeMintUrl) {
            log.error('ALL MINTS UNREACHABLE AT STARTUP');
            process.exit(1);
        }

        // Pre-create remaining wallets (loaded on demand / failover)
        for (var url of mintManager.orderedMints) {
            if (!mintManager.wallets.has(url)) {
                mintManager.wallets.set(url, createWalletForMint(url));
            }
        }

        if (mintManager.orderedMints.length > 1) {
            log.info('multi-mint failover configured', {
                active: mintManager.activeMintUrl,
                total: mintManager.orderedMints.length,
                mints: mintManager.orderedMints,
            });
        }
    },

    getBalance: async () => sumProofs(await store.getProofs(mintManager.activeMintUrl)),

    getBalanceMsat: async () => sumProofs(await store.getProofs(mintManager.activeMintUrl)) * 1000,

    // Sync versions for non-async contexts (uses cached proofs from last store read)
    _cachedBalance: 0,
    getBalanceSync: () => nutbits._cachedBalance,
    getBalanceMsatSync: () => nutbits._cachedBalance * 1000,
    refreshBalance: async () => {
        nutbits._cachedBalance = sumProofs(await store.getProofs(mintManager.activeMintUrl));
        return nutbits._cachedBalance;
    },

    // Create a Lightning invoice via the mint (NUT-4)
    createInvoice: async amountSats => {
        var quote = await withFailover(
            () => nutbits.wallet.createMintQuoteBolt11(amountSats),
            'createInvoice'
        );
        // Tag quote with originating mint so we can check it on the right wallet
        quote._mintUrl = mintManager.activeMintUrl;
        log.info('mint quote created', { amount: amountSats, quote: quote.quote, mint: mintManager.activeMintUrl });
        return quote;
    },

    // Check if a mint quote has been paid, and mint tokens if so (NUT-4)
    // Uses the originating mint's wallet (not necessarily the active one)
    checkAndMintTokens: async (quote, app_pubkey, maxRetries = 3) => {
        var quoteMintUrl = quote._mintUrl || mintManager.activeMintUrl;
        var quoteWallet = getWalletForMint(quoteMintUrl);
        for (var attempt = 0; attempt < maxRetries; attempt++) {
            try {
                var status = await quoteWallet.checkMintQuoteBolt11(quote.quote);
                if (status.state === MintQuoteState.PAID) {
                    var proofs = await quoteWallet.mintProofsBolt11(amountFromQuote(quote), quote.quote);
                    // NUT-12: verify DLEQ proofs
                    proofs = verifyProofsDleq(proofs, quoteWallet, quoteMintUrl);
                    // Store proofs under the originating mint
                    await store.addProofs(quoteMintUrl, proofs);
                    await nutbits.refreshBalance();
                    log.info('tokens minted', { amount: sumProofs(proofs), proofs: proofs.length, mint: quoteMintUrl });
                    // Update NWC balance + send payment_received notification
                    if (app_pubkey && nutbits.state.nostr_state.nwc_info[app_pubkey]) {
                        var pmthash = getInvoicePmthash(quote.request);
                        var txEntry = nutbits.state.nostr_state.nwc_info[app_pubkey].tx_history[pmthash];
                        if (txEntry) {
                            txEntry.settled_at = Math.floor(Date.now() / 1000);
                            txEntry.paid = true;
                            await store.updateTx(app_pubkey, pmthash, { settled_at: txEntry.settled_at, paid: true });
                            // NIP-47 notification: payment_received
                            nutbits.sendNotification(app_pubkey, 'payment_received', nutbits.formatTx(txEntry)).catch(e =>
                                log.debug('payment_received notification failed', { error: e.message })
                            );
                        }
                        var bal = await nutbits.getBalanceMsat();
                        nutbits.state.nostr_state.nwc_info[app_pubkey].balance = bal;
                        await store.updateConnection(app_pubkey, { balance: bal });
                    }
                    return true;
                }
                return false;
            } catch (e) {
                log.error('checkAndMintTokens failed', { error: e.message, attempt: attempt + 1, mint: quoteMintUrl });
                if (attempt < maxRetries - 1) await wait(3000 * (attempt + 1));
            }
        }
        log.error('checkAndMintTokens: ALL RETRIES EXHAUSTED', { quote: quote.quote, mint: quoteMintUrl });
        return false;
    },

    // Poll for invoice payment (NUT-4)
    pollInvoice: async (quote, app_pubkey, attempt = 0) => {
        if (attempt >= config.maxRetries) {
            log.warn('pollInvoice: max retries', { quote: quote.quote });
            return;
        }
        try {
            var minted = await nutbits.checkAndMintTokens(quote, app_pubkey);
            if (minted) return;
        } catch (e) {
            log.error('pollInvoice error', { error: e.message });
        }
        // Check expiry
        var pmthash = getInvoicePmthash(quote.request);
        var txEntry = nutbits.state.nostr_state.nwc_info[app_pubkey]?.tx_history?.[pmthash];
        if (txEntry?.expires_at && Math.floor(Date.now() / 1000) >= txEntry.expires_at) {
            log.info('pollInvoice: invoice expired', { pmthash });
            return;
        }
        await wait(config.checkInterval * 1000);
        return nutbits.pollInvoice(quote, app_pubkey, attempt + 1);
    },

    // NUT-17: Wait for invoice payment via WebSocket (with polling fallback)
    waitForPayment: async (quote, app_pubkey) => {
        var quoteMintUrl = quote._mintUrl || mintManager.activeMintUrl;
        var quoteWallet = getWalletForMint(quoteMintUrl);
        var caps = mintManager.mintCaps.get(quoteMintUrl);

        if (caps?.nut17) {
            try {
                log.debug('NUT-17: subscribing to mint quote', { quote: quote.quote, mint: quoteMintUrl });
                await quoteWallet.on.onceMintPaid(quote.quote, {
                    timeoutMs: config.maxRetries * config.checkInterval * 1000,
                });
                log.info('NUT-17: invoice paid (WebSocket)', { quote: quote.quote });
                await nutbits.checkAndMintTokens(quote, app_pubkey, 5);
            } catch (e) {
                log.warn('NUT-17: WebSocket subscription failed, trying poll fallback', { error: e.message });
                await nutbits.pollInvoice(quote, app_pubkey);
            }
        } else {
            await nutbits.pollInvoice(quote, app_pubkey);
        }
    },

    // NUT-09: Restore proofs from seed for a specific mint
    restoreFromSeed: async (mintUrl) => {
        if (!config.seed) return [];
        var caps = mintManager.mintCaps.get(mintUrl);
        if (!caps?.nut09) {
            log.debug('NUT-09: mint does not support restore', { mint: mintUrl });
            return [];
        }
        try {
            var wallet = getWalletForMint(mintUrl);
            var result = await wallet.batchRestore();
            if (result.proofs.length > 0) {
                await store.addProofs(mintUrl, result.proofs);
                await nutbits.refreshBalance();
                log.info('NUT-09: restored proofs from seed', { mint: mintUrl, count: result.proofs.length, sats: sumProofs(result.proofs) });
            } else {
                log.debug('NUT-09: no proofs to restore', { mint: mintUrl });
            }
            return result.proofs;
        } catch (e) {
            log.error('NUT-09: restore failed', { mint: mintUrl, error: e.message });
            return [];
        }
    },

    // Pay a Lightning invoice via the mint (NUT-5)
    // Wrapped in per-mint payment lock to prevent concurrent proof selection
    payInvoice: async (invoice, app_pubkey) => {
        // Snapshot mint URL and wallet BEFORE entering lock — these must not change mid-payment
        var payMintUrl = mintManager.activeMintUrl;
        var payWallet = mintManager.wallets.get(payMintUrl);
        if (!payWallet) throw new Error('no wallet for active mint');

        return withPaymentLock(payMintUrl, async () => {
            var decoded = bolt11Lib.decode(invoice);
            var amountSats = decoded.satoshis;
            if (!amountSats) throw new Error('amountless invoices not supported');

            // Get melt quote — use snapshotted wallet, no failover mid-payment
            var meltQuote;
            try {
                meltQuote = await payWallet.createMeltQuoteBolt11(invoice);
            } catch (e) {
                if (isMintDownError(e) && mintManager.orderedMints.length > 1) {
                    await failoverToNextMint(payMintUrl);
                }
                throw e; // let caller retry on new mint
            }
            var totalNeeded = meltQuote.amount + meltQuote.fee_reserve;

            var activeProofs = await store.getProofs(payMintUrl);
            var balance = sumProofs(activeProofs);
            if (totalNeeded > balance) {
                throw new Error(`insufficient balance: need ${totalNeeded} sats (inc. ${meltQuote.fee_reserve} fee reserve), have ${balance}`);
            }

            // Select proofs and pay (bound to snapshotted mint)
            var { keep, send } = await payWallet.send(totalNeeded, activeProofs);

            // Atomic swap: remove all original proofs, add back keep
            await store.swapProofs(payMintUrl, { remove: activeProofs, add: keep });

            // Helper: restore proofs on failure — MUST NEVER THROW (funds safety)
            var restoreProofs = async (proofsToRestore) => {
                try {
                    await store.addProofs(payMintUrl, proofsToRestore);
                } catch (restoreErr) {
                    // Last resort: log the proofs so they can be manually recovered
                    log.error('CRITICAL: failed to restore proofs after payment failure', {
                        error: restoreErr.message,
                        mint: payMintUrl,
                        proofCount: proofsToRestore.length,
                        totalSats: sumProofs(proofsToRestore),
                        proofs: JSON.stringify(proofsToRestore),
                    });
                }
                await nutbits.refreshBalance();
            };

            try {
                var meltResult = await payWallet.meltProofsBolt11(meltQuote, send);
                if (meltResult.quote.state === 'PAID') {
                    if (meltResult.change && meltResult.change.length) {
                        var verifiedChange = verifyProofsDleq(meltResult.change, payWallet, payMintUrl);
                        await store.addProofs(payMintUrl, verifiedChange);
                    }
                    await nutbits.refreshBalance();
                    log.info('payment succeeded', { preimage: meltResult.quote.payment_preimage, paid: amountSats, mint: payMintUrl });
                    return {
                        success: true,
                        preimage: meltResult.quote.payment_preimage,
                        fees_paid: (totalNeeded - amountSats - sumProofs(meltResult.change || [])) * 1000,
                    };
                } else {
                    await restoreProofs(send);
                    return { success: false, error: 'mint reported payment not paid' };
                }
            } catch (e) {
                log.error('melt failed, restoring proofs', { error: e.message, stack: e.stack, name: e.name, status: e.status, code: e.code });
                await restoreProofs(send);
                return { success: false, error: e.message };
            }
        });
    },


    // ── NWC Connection ─────────────────────────────────────────────────────

    createNWCconnection: async (mymint, permissions = ['pay_invoice', 'get_balance', 'make_invoice', 'lookup_invoice', 'list_transactions', 'get_info'], myrelays = config.relays, app_pubkey) => {
        mymint = validateMintUrl(mymint);

        var getRecipientFromNostrEvent = event => {
            for (var i = 0; i < event.tags.length; i++) {
                if (event.tags[i]?.[0] === 'p' && event.tags[i][1]) return event.tags[i][1];
            }
        };

        // ── NIP-47 Response Helpers ─────────────────────────────────────

        var nwcResult = (method, result) => ({ result_type: method, error: null, result });
        var nwcError = (method, code, message) => ({ result_type: method, error: { code, message }, result: null });

        var getTxState = tx => {
            if (tx.err_msg) return 'failed';
            if (tx.settled_at) return 'settled';
            return 'pending';
        };

        var formatTransaction = tx => ({
            type: tx.type,
            state: getTxState(tx),
            invoice: tx.invoice,
            description: tx.description || '',
            description_hash: tx.description_hash || '',
            preimage: tx.preimage || '',
            payment_hash: tx.payment_hash,
            amount: tx.amount,
            fees_paid: tx.fees_paid || 0,
            created_at: tx.created_at,
            expires_at: tx.expires_at,
            settled_at: tx.settled_at || null,
            metadata: tx.metadata || {},
        });

        // Track whether each client prefers NIP-44
        var clientUsesNip44 = {};

        var sendNWCResponse = async (state, replyObj, eventPubkey, eventId, app_pubkey) => {
            var reply = JSON.stringify(replyObj);
            var useNip44 = clientUsesNip44[eventPubkey] ?? true;
            log.info('NWC response', { method: replyObj.result_type, hasError: !!replyObj.error, nip44: useNip44 });
            var encrypted = await nwcEncrypt(state['app_privkey'], eventPubkey, reply, useNip44);
            var event = finalizeEvent({
                kind: 23195,
                content: encrypted,
                tags: [['p', eventPubkey], ['e', eventId]],
                created_at: Math.floor(Date.now() / 1000),
            }, hexToBytes(state['app_privkey']));
            var sent = await broadcastEvent(event, app_pubkey);
            log.debug('NWC response published', { relaysSent: sent, responseId: event.id });
        };

        // ── Daily spend tracking (persisted to store) ────────────────
        var trackSpend = async amountSats => {
            var today = new Date().toISOString().slice(0, 10);
            await store.addDailySpend(app_pubkey, today, amountSats);
        };
        var getDailySpend = async () => {
            var today = new Date().toISOString().slice(0, 10);
            return await store.getDailySpend(app_pubkey, today);
        };

        // ── Handle NWC Events ──────────────────────────────────────────
        var handleEvent = async event => {
            if (isDuplicate(event.id)) return;

            var evtAppPubkey = getRecipientFromNostrEvent(event);
            if (!evtAppPubkey || !(evtAppPubkey in nutbits.state.nostr_state.nwc_info)) return;
            var state = nutbits.state.nostr_state.nwc_info[evtAppPubkey];
            if (event.pubkey !== state['user_pubkey']) return;

            // Check NIP-40 expiration
            var expirationTag = event.tags.find(t => t[0] === 'expiration');
            if (expirationTag) {
                var expiry = Number(expirationTag[1]);
                if (expiry && expiry < Math.floor(Date.now() / 1000)) {
                    log.warn('expired event ignored', { eventId: event.id });
                    return;
                }
            }

            var command;
            try {
                var { plaintext, nip44: isNip44 } = await nwcDecrypt(state['app_privkey'], event.pubkey, event.content);
                clientUsesNip44[event.pubkey] = isNip44;
                state.useNip44 = isNip44; // persist for notifications
                command = JSON.parse(plaintext);
            } catch (e) {
                log.error('decrypt/parse failed', { error: e.message });
                return;
            }
            log.info('NWC command', { method: command.method, eventId: event.id, nip44: clientUsesNip44[event.pubkey] });
            log.debug('NWC command full', command);

            try {
                if (!state.permissions.includes(command.method)) {
                    return await sendNWCResponse(state,
                        nwcError(command.method, 'RESTRICTED', 'not allowed'),
                        event.pubkey, event.id, evtAppPubkey);
                }

                // ── get_info ───────────────────────────────────────────
                if (command.method === 'get_info') {
                    var blockheight = 0;
                    var blockhash = '';
                    try {
                        var bh = await fetch('https://mempool.space/api/blocks/tip/height', { signal: AbortSignal.timeout(5000) });
                        blockheight = Number(await bh.text());
                        var bhr = await fetch(`https://mempool.space/api/block-height/${blockheight}`, { signal: AbortSignal.timeout(5000) });
                        blockhash = await bhr.text();
                    } catch (e) { log.debug('blockheight fetch failed', { error: e.message }); }
                    // Build response — standard NIP-47 fields + optional service_fee metadata
                    var infoResult = {
                        alias: 'NUTbits',
                        color: '',
                        pubkey: '',
                        network: 'mainnet',
                        block_height: blockheight,
                        block_hash: blockhash,
                        methods: state.permissions,
                        notifications: ['payment_received', 'payment_sent'],
                    };

                    // Optional: advertise service fee policy so clients can display it
                    var connFeePpm = state.service_fee_ppm ?? config.serviceFeePpm;
                    var connFeeBase = state.service_fee_base ?? config.serviceFeeBase;
                    if (connFeePpm || connFeeBase) {
                        infoResult.service_fee = {
                            ppm: connFeePpm || 0,
                            base_msat: (connFeeBase || 0) * 1000,
                            applies_to: 'outgoing',
                        };
                    }

                    return await sendNWCResponse(state, nwcResult(command.method, infoResult),
                        event.pubkey, event.id, evtAppPubkey);
                }

                // ── get_balance ────────────────────────────────────────
                if (command.method === 'get_balance') {
                    var bal = await nutbits.getBalanceMsat();
                    nutbits.state.nostr_state.nwc_info[evtAppPubkey].balance = bal;
                    return await sendNWCResponse(state,
                        nwcResult(command.method, { balance: bal }),
                        event.pubkey, event.id, evtAppPubkey);
                }

                // ── make_invoice ───────────────────────────────────────
                if (command.method === 'make_invoice') {
                    var params = command.params || {};
                    if (!params.amount || !String(params.amount).endsWith('000')) {
                        return await sendNWCResponse(state,
                            nwcError(command.method, 'OTHER', 'amount must be in millisats and end in 000'),
                            event.pubkey, event.id, evtAppPubkey);
                    }
                    var amountSats = Math.floor(params.amount / 1000);
                    var quote = await nutbits.createInvoice(amountSats);
                    var decoded = bolt11Lib.decode(quote.request);
                    var pmthash = getInvoicePmthash(quote.request);
                    state.tx_history[pmthash] = {
                        quote,
                        quoteMintUrl: quote._mintUrl || mintManager.activeMintUrl,
                        amount: params.amount,
                        invoice: quote.request,
                        type: 'incoming',
                        description: params.description || '',
                        description_hash: params.description_hash || '',
                        preimage: '',
                        payment_hash: pmthash,
                        fees_paid: 0,
                        created_at: decoded.timestamp,
                        expires_at: decoded.timeExpireDate,
                        settled_at: null,
                        paid: false,
                        metadata: {},
                    };
                    await store.setTx(evtAppPubkey, pmthash, state.tx_history[pmthash]);
                    nutbits.waitForPayment(quote, evtAppPubkey);
                    return await sendNWCResponse(state,
                        nwcResult(command.method, formatTransaction(state.tx_history[pmthash])),
                        event.pubkey, event.id, evtAppPubkey);
                }

                // ── lookup_invoice ─────────────────────────────────────
                if (command.method === 'lookup_invoice') {
                    var params = command.params || {};
                    var invoice = params.invoice || params.bolt11 || null;
                    var pmthash = null;
                    if (invoice) {
                        try { pmthash = getInvoicePmthash(invoice); } catch (e) {}
                    }
                    if (!pmthash && params.payment_hash) pmthash = params.payment_hash;
                    log.debug('lookup_invoice', { hasInvoice: !!invoice, hasPmthash: !!pmthash, paramKeys: Object.keys(params), knownTxs: Object.keys(state.tx_history).length });
                    if (!pmthash || !(pmthash in state.tx_history)) {
                        return await sendNWCResponse(state,
                            nwcError(command.method, 'NOT_FOUND', 'invoice not found'),
                            event.pubkey, event.id, evtAppPubkey);
                    }
                    // Check if incoming invoice has been paid (use originating mint)
                    var tx = state.tx_history[pmthash];
                    if (tx.type === 'incoming' && !tx.settled_at && tx.quote) {
                        if (tx.quoteMintUrl) tx.quote._mintUrl = tx.quoteMintUrl;
                        await nutbits.checkAndMintTokens(tx.quote, evtAppPubkey);
                        tx = state.tx_history[pmthash]; // re-read after potential update
                    }
                    if (tx.err_msg) {
                        return await sendNWCResponse(state,
                            nwcError(command.method, 'OTHER', tx.err_msg),
                            event.pubkey, event.id, evtAppPubkey);
                    }
                    return await sendNWCResponse(state,
                        nwcResult(command.method, formatTransaction(tx)),
                        event.pubkey, event.id, evtAppPubkey);
                }

                // ── list_transactions ──────────────────────────────────
                if (command.method === 'list_transactions') {
                    var params = command.params || {};
                    var txs = Object.values(state.tx_history);
                    if (!params.unpaid) txs = txs.filter(tx => tx.paid);
                    if (params.type === 'incoming') txs = txs.filter(tx => tx.type === 'incoming');
                    if (params.type === 'outgoing') txs = txs.filter(tx => tx.type === 'outgoing');
                    txs.sort((a, b) => b.created_at - a.created_at);
                    if (params.from) txs = txs.filter(tx => tx.created_at >= params.from);
                    if (params.until) txs = txs.filter(tx => tx.created_at <= params.until);
                    if (params.offset) txs = txs.slice(params.offset);
                    if (params.limit) txs = txs.slice(0, params.limit);
                    return await sendNWCResponse(state,
                        nwcResult(command.method, { transactions: txs.map(formatTransaction) }),
                        event.pubkey, event.id, evtAppPubkey);
                }

                // ── pay_invoice ────────────────────────────────────────
                if (command.method === 'pay_invoice') {
                    var params = command.params || {};
                    var invoice = params.invoice || params.bolt11;
                    if (!invoice) {
                        return await sendNWCResponse(state,
                            nwcError(command.method, 'OTHER', 'missing invoice'),
                            event.pubkey, event.id, evtAppPubkey);
                    }
                    var decodedInvoice;
                    try {
                        decodedInvoice = bolt11Lib.decode(invoice);
                    } catch (e) {
                        return await sendNWCResponse(state,
                            nwcError(command.method, 'OTHER', 'cannot decode invoice'),
                            event.pubkey, event.id, evtAppPubkey);
                    }
                    var pmthash = getInvoicePmthash(invoice);
                    var invoice_amt = decodedInvoice.satoshis;

                    // Reject duplicate payment for same invoice
                    if (state.tx_history[pmthash]?.paid) {
                        return await sendNWCResponse(state,
                            nwcResult(command.method, { preimage: state.tx_history[pmthash].preimage, fees_paid: state.tx_history[pmthash].fees_paid || 0 }),
                            event.pubkey, event.id, evtAppPubkey);
                    }

                    // Store tx
                    state.tx_history[pmthash] = {
                        type: 'outgoing',
                        invoice,
                        description: getInvoiceDescription(invoice),
                        description_hash: getInvoiceDeschash(invoice),
                        preimage: '',
                        payment_hash: pmthash,
                        amount: Number(decodedInvoice.millisatoshis),
                        fees_paid: 0,
                        created_at: decodedInvoice.timestamp,
                        expires_at: decodedInvoice.timeExpireDate,
                        settled_at: null,
                        paid: false,
                        metadata: {},
                    };

                    await store.setTx(evtAppPubkey, pmthash, state.tx_history[pmthash]);

                    if (!invoice_amt) {
                        state.tx_history[pmthash].err_msg = 'amountless invoices not supported';
                        await store.updateTx(evtAppPubkey, pmthash, { err_msg: state.tx_history[pmthash].err_msg });
                        return await sendNWCResponse(state,
                            nwcError(command.method, 'NOT_IMPLEMENTED', 'amountless invoices not supported'),
                            event.pubkey, event.id, evtAppPubkey);
                    }

                    // Spend limits — enforce both global AND per-connection limits (stricter wins)
                    var effectiveMaxPayment = config.maxPaymentSats || 0;
                    var connMaxPayment = state.max_payment_sats || 0;
                    if (connMaxPayment && (!effectiveMaxPayment || connMaxPayment < effectiveMaxPayment)) effectiveMaxPayment = connMaxPayment;
                    if (effectiveMaxPayment && invoice_amt > effectiveMaxPayment) {
                        return await sendNWCResponse(state,
                            nwcError(command.method, 'QUOTA_EXCEEDED', `exceeds per-payment limit of ${effectiveMaxPayment} sats`),
                            event.pubkey, event.id, evtAppPubkey);
                    }

                    var effectiveDailyLimit = config.dailyLimitSats || 0;
                    var connDailyLimit = state.max_daily_sats || 0;
                    if (connDailyLimit && (!effectiveDailyLimit || connDailyLimit < effectiveDailyLimit)) effectiveDailyLimit = connDailyLimit;
                    if (effectiveDailyLimit && ((await getDailySpend()) + invoice_amt) > effectiveDailyLimit) {
                        return await sendNWCResponse(state,
                            nwcError(command.method, 'QUOTA_EXCEEDED', `exceeds daily limit of ${effectiveDailyLimit} sats`),
                            event.pubkey, event.id, evtAppPubkey);
                    }

                    // Service fee (outgoing only — 0 by default)
                    var serviceFee = calcServiceFee(invoice_amt, state);
                    var totalNeededWithFee = invoice_amt + serviceFee;

                    // Fee reserve check (includes service fee)
                    var maxSpendable = Math.floor((1 - config.feeReservePct) * (await nutbits.getBalanceMsat()));
                    if (maxSpendable - (totalNeededWithFee * 1000) < 0) {
                        var err_msg = `insufficient balance (${await nutbits.getBalance()} sats available, ${totalNeededWithFee} sats needed${serviceFee ? ` incl. ${serviceFee} service fee` : ''})`;
                        state.tx_history[pmthash].err_msg = err_msg;
                        await store.updateTx(evtAppPubkey, pmthash, { err_msg });
                        return await sendNWCResponse(state,
                            nwcError(command.method, 'INSUFFICIENT_BALANCE', err_msg),
                            event.pubkey, event.id, evtAppPubkey);
                    }

                    // Pay via cashu-ts
                    var result = await nutbits.payInvoice(invoice, evtAppPubkey);

                    if (!result.success) {
                        state.tx_history[pmthash].err_msg = result.error;
                        await store.updateTx(evtAppPubkey, pmthash, { err_msg: result.error });
                        return await sendNWCResponse(state,
                            nwcError(command.method, 'PAYMENT_FAILED', result.error),
                            event.pubkey, event.id, evtAppPubkey);
                    }

                    // fees_paid = Lightning routing fees ONLY (from the mint)
                    // service_fee = our operator fee, separate — never mixed
                    var routingFees = result.fees_paid || 0;
                    var serviceFeeMsat = serviceFee * 1000;

                    state.tx_history[pmthash].preimage = result.preimage;
                    state.tx_history[pmthash].settled_at = Math.floor(Date.now() / 1000);
                    state.tx_history[pmthash].paid = true;
                    state.tx_history[pmthash].fees_paid = routingFees;
                    state.tx_history[pmthash].service_fee = serviceFeeMsat;
                    var bal = await nutbits.getBalanceMsat();
                    state.balance = bal;
                    await store.updateTx(evtAppPubkey, pmthash, {
                        preimage: result.preimage,
                        settled_at: state.tx_history[pmthash].settled_at,
                        paid: true,
                        fees_paid: routingFees,
                        service_fee: serviceFeeMsat,
                    });
                    await store.updateConnection(evtAppPubkey, { balance: bal });
                    await trackSpend(invoice_amt);

                    if (serviceFee > 0) {
                        log.info('service fee collected', { sats: serviceFee, payment_hash: pmthash });
                    }

                    // NIP-47 notification: payment_sent
                    nutbits.sendNotification(evtAppPubkey, 'payment_sent', nutbits.formatTx(state.tx_history[pmthash])).catch(e =>
                        log.debug('payment_sent notification failed', { error: e.message })
                    );

                    // NWC response — fees_paid is routing only, service_fee is additional metadata
                    // Clients that understand service_fee can display the breakdown
                    // Clients that don't will just see the routing fees (standard NIP-47)
                    return await sendNWCResponse(state, nwcResult('pay_invoice', {
                        preimage: result.preimage,
                        fees_paid: routingFees,
                        service_fee: serviceFeeMsat,
                    }), event.pubkey, event.id, evtAppPubkey);
                }

            } catch (e) {
                log.error('handleEvent error', { method: command?.method, error: e.message });
                try {
                    await sendNWCResponse(state,
                        nwcError(command?.method || 'unknown', 'INTERNAL', 'internal error'),
                        event.pubkey, event.id, evtAppPubkey);
                } catch (e2) {
                    log.error('failed to send error response', { error: e2.message });
                }
            }
        };

        // ── Relay Management ───────────────────────────────────────────

        var broadcastEvent = async (event, pubkey) => {
            var sent = 0;
            var relays = nutbits.state.nostr_state.pools[pubkey];
            if (!relays || !Array.isArray(relays)) return 0;
            for (var relay of relays) {
                try {
                    if (relay.connected) { await relay.publish(event); sent++; }
                } catch (e) {
                    log.warn('publish failed', { url: relay.url, error: e.message });
                }
            }
            if (sent === 0) log.error('no connected relays for broadcast');
            return sent;
        };

        var connectRelay = async (relayUrl, pubkey) => {
            var relay = new Relay(relayUrl);
            try {
                await relay.connect({ timeout: 5000 });
                log.info('relay connected', { url: relayUrl });
                relay.subscribe([{
                    kinds: [23194],
                    '#p': [pubkey],
                    since: Math.floor(Date.now() / 1000),
                }], { onevent: handleEvent });
                // Publish NIP-47 info event
                var state = nutbits.state.nostr_state.nwc_info[pubkey];
                var infoEvent = finalizeEvent({
                    kind: 13194,
                    content: state.permissions.join(' '),
                    tags: [['encryption', 'nip44_v2 nip04']],
                    created_at: Math.floor(Date.now() / 1000),
                }, hexToBytes(state['app_privkey']));
                await relay.publish(infoEvent).catch(e => log.warn('info event failed', { error: e.message }));
            } catch (e) {
                log.warn('relay connection failed', { url: relayUrl, error: e.message });
            }
            return relay;
        };

        var startRelayLoop = async pubkey => {
            nutbits.state.nostr_state.pools[pubkey] = [];
            for (var url of myrelays) {
                var relay = await connectRelay(url, pubkey);
                nutbits.state.nostr_state.pools[pubkey].push(relay);
            }
            // Reconnection loop
            (async () => {
                while (true) {
                    try {
                        await wait(5000);
                        var relays = nutbits.state.nostr_state.pools[pubkey];
                        if (!relays) break;
                        for (var i = 0; i < relays.length; i++) {
                            if (!relays[i].connected) {
                                log.info('reconnecting relay', { url: myrelays[i] });
                                relays[i] = await connectRelay(myrelays[i], pubkey);
                            }
                        }
                    } catch (e) {
                        log.error('reconnect error', { error: e.message });
                    }
                }
            })();
        };

        // ── Create or Restore Connection ───────────────────────────────

        if (!app_pubkey) {
            var app_privkey = bytesToHex(generateSecretKey());
            var app_pubkey_new = getPublicKey(hexToBytes(app_privkey));
            var user_secret = bytesToHex(generateSecretKey());
            var user_pubkey = getPublicKey(hexToBytes(user_secret));
            var relayParams = myrelays.map(r => `relay=${encodeURIComponent(r)}`).join('&');
            var nwc_string = `nostr+walletconnect://${app_pubkey_new}?${relayParams}&secret=${user_secret}`;

            nutbits.state.nostr_state.nwc_info[app_pubkey_new] = {
                permissions,
                mymint,
                nwc_string,
                app_privkey,
                app_pubkey: app_pubkey_new,
                user_secret,
                user_pubkey,
                relay: myrelays[0],
                balance: 0,
                tx_history: {},
            };
            app_pubkey = app_pubkey_new;
            await store.setConnection(app_pubkey, nutbits.state.nostr_state.nwc_info[app_pubkey]);
        }

        await startRelayLoop(app_pubkey);

        var connected = false;
        for (var attempt = 0; attempt < 10; attempt++) {
            var relays = nutbits.state.nostr_state.pools[app_pubkey] || [];
            if (relays.some(r => r.connected)) { connected = true; break; }
            await wait(1000);
        }
        if (connected) log.info('NWC connection ready');
        else log.warn('no relays connected — retrying in background');

        return nutbits.state.nostr_state.nwc_info[app_pubkey]?.nwc_string;
    },
};

// ── Helper ─────────────────────────────────────────────────────────────────

var amountFromQuote = quote => {
    try { return bolt11Lib.decode(quote.request).satoshis; } catch (e) { return 0; }
};

// ── Startup ────────────────────────────────────────────────────────────────

var maskNwcString = str => str ? str.replace(/secret=[a-f0-9]+/, 'secret=****') : '';

// ── Terminal Colors ────────────────────────────────────────────────────────

var c = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    magenta: '\x1b[35m',
    white: '\x1b[37m',
    red: '\x1b[31m',
};

var box = (lines, color = c.cyan) => {
    var maxLen = Math.max(62, ...lines.map(l => l.replace(/\x1b\[[0-9;]*m/g, '').length));
    var w = Math.min(maxLen, 76);
    var hr = color + '+-' + '-'.repeat(w) + '-+' + c.reset;
    console.log(hr);
    for (var l of lines) {
        var plain = l.replace(/\x1b\[[0-9;]*m/g, '');
        var pad = Math.max(0, w - plain.length);
        console.log(color + '|' + c.reset + ' ' + l + ' '.repeat(pad) + ' ' + color + '|' + c.reset);
    }
    console.log(hr);
};

(async () => {
    // ── Pre-flight checks ─────────────────────────────────────────
    if (!config.statePassphrase) {
        console.log('');
        box([
            `${c.red}${c.bold}Missing NUTBITS_STATE_PASSPHRASE${c.reset}`,
            '',
            'Set it in your .env file:',
            '',
            `  ${c.bold}NUTBITS_STATE_PASSPHRASE=your-strong-passphrase${c.reset}`,
        ], c.red);
        process.exit(1);
    }

    console.log(`
${c.magenta}${c.bold}  _   _ _   _ _____ _     _ _
 | \\ | | | | |_   _| |   (_) |_ ___
 |  \\| | | | | | | | |__ | | __/ __|
 | |\\  | |_| | | | | '_ \\| | |_\\__ \\
 |_| \\_|\\___/  |_| |_.__/|_|\\__|___/${c.reset}

  ${c.cyan}Cashu ecash to NWC bridge${c.reset}
  Use any Cashu mint as a Lightning funding source for ${c.bold}LNbits${c.reset}

  ${c.dim}by DoktorShift | inspired by supertestnet/bankify${c.reset}
`);

    // ── Seed (NUT-13) ─────────────────────────────────────────────
    var seedGenerated = false;
    if (!config.seed) {
        config.seed = crypto.randomBytes(32).toString('hex');
        seedGenerated = true;
    }

    // Suppress verbose logs during startup — restore after
    var savedLogLevel = log._level;
    log._level = LOG_LEVELS['warn'];

    // ── Relay URL Validation ─────────────────────────────────────
    for (var relayUrl of config.relays) {
        try {
            var parsed = new URL(relayUrl);
            if (!['ws:', 'wss:'].includes(parsed.protocol)) {
                console.error(`${c.red}Invalid relay protocol: ${relayUrl} (must be ws:// or wss://)${c.reset}`);
                process.exit(1);
            }
        } catch (e) {
            console.error(`${c.red}Invalid relay URL: ${relayUrl}${c.reset}`);
            process.exit(1);
        }
    }

    // ── Storage ───────────────────────────────────────────────────
    store = await createStore(config, log);

    // ── Wallets ───────────────────────────────────────────────────
    await nutbits.initWallet();
    await nutbits.refreshBalance();

    // ── Proof recovery (NUT-09) ───────────────────────────────────
    if (config.seed) {
        for (var url of mintManager.orderedMints) {
            var existingProofs = await store.getProofs(url);
            if (existingProofs.length === 0) await nutbits.restoreFromSeed(url);
        }
    }

    // ── NWC connections ───────────────────────────────────────────
    var pubkeys = Object.keys(nutbits.state.nostr_state.nwc_info);
    var nwcString = null;
    if (pubkeys.length > 0) {
        for (var pk of pubkeys) {
            var info = nutbits.state.nostr_state.nwc_info[pk];
            await nutbits.createNWCconnection(info.mymint, info.permissions, config.relays, pk);
        }
    } else {
        nwcString = await nutbits.createNWCconnection(mintManager.activeMintUrl);
    }

    // Restore log level
    log._level = savedLogLevel;

    // ── Background tasks ──────────────────────────────────────────
    setInterval(() => { store.saveAll().catch(() => {}); }, 60_000);

    if (mintManager.orderedMints.length > 1) {
        setInterval(async () => {
            for (var hcUrl of mintManager.orderedMints) await checkMintHealth(hcUrl);
            var activeIdx = mintManager.orderedMints.indexOf(mintManager.activeMintUrl);
            for (var i = 0; i < activeIdx; i++) {
                var health = mintManager.mintHealth.get(mintManager.orderedMints[i]);
                if (health?.healthy) {
                    var oldMint = mintManager.activeMintUrl;
                    var recoveredMint = mintManager.orderedMints[i];
                    try { var w = mintManager.wallets.get(recoveredMint); if (w) await w.loadMint(); }
                    catch (e) { log.debug('RECOVERY: loadMint failed', { mint: recoveredMint }); continue; }
                    mintManager.activeMintUrl = recoveredMint;
                    await store.setActiveMintUrl(recoveredMint);
                    await store.setMintInfo(recoveredMint, { lastHealthy: Date.now() });
                    await nutbits.refreshBalance();
                    log.warn('RECOVERY: switched to higher-priority mint', { from: oldMint, to: recoveredMint });
                    break;
                }
            }
        }, config.healthCheckInterval);
    }

    // ── Startup summary ───────────────────────────────────────────
    var mintInfo = nutbits.wallet?.getMintInfo?.();
    var caps = mintManager.mintCaps.get(mintManager.activeMintUrl) || {};
    var relayCount = 0;
    var pools = nutbits.state.nostr_state.pools;
    for (var rpk in pools) { if (Array.isArray(pools[rpk])) relayCount = pools[rpk].filter(r => r.connected).length; }

    // Core NUTs (always supported) + optional NUTs (from mint)
    var coreNuts = ['00','01','02','03','04','05','06','07','08'].map(n => `${c.green}${n}${c.reset}`);
    var optNuts = [
        caps.nut09 ? `${c.green}09${c.reset}` : `${c.dim}09${c.reset}`,
        caps.nut12 ? `${c.green}12${c.reset}` : `${c.dim}12${c.reset}`,
        `${c.green}13${c.reset}`,
        caps.nut15 ? `${c.green}15${c.reset}` : `${c.dim}15${c.reset}`,
        caps.nut17 ? `${c.green}17${c.reset}` : `${c.dim}17${c.reset}`,
        caps.nut20 ? `${c.green}20${c.reset}` : `${c.dim}20${c.reset}`,
    ];
    var nutBadges = [...coreNuts, ...optNuts].join(' ');

    var lines = [
        `${c.green}${c.bold}NUTbits is running!${c.reset}`,
        '',
        `  ${c.bold}Mint${c.reset}       ${mintInfo?.name || 'unknown'}`,
        `  ${c.dim}${mintManager.activeMintUrl}${c.reset}`,
        `  ${c.bold}Version${c.reset}    ${mintInfo?.version || '?'}`,
        `  ${c.bold}Balance${c.reset}    ${c.yellow}${nutbits.getBalanceSync()} sats${c.reset}`,
        `  ${c.bold}Storage${c.reset}    ${config.stateBackend}`,
        `  ${c.bold}Relays${c.reset}     ${relayCount} connected`,
        `  ${c.bold}Seed${c.reset}       ${config.seed ? `${c.green}configured${c.reset}` : `${c.red}none${c.reset}`}`,
        '',
        `  ${c.bold}NUTs${c.reset}       ${nutBadges || `${c.dim}(none detected)${c.reset}`}`,
    ];

    if (mintInfo?.motd && mintInfo.motd !== 'Message to users') {
        lines.push('', `  ${c.yellow}Mint notice: "${mintInfo.motd}"${c.reset}`);
    }
    if (config.maxPaymentSats) lines.push(`  ${c.bold}Limit${c.reset}      ${config.maxPaymentSats} sats/payment`);
    if (config.dailyLimitSats) lines.push(`  ${c.bold}Limit${c.reset}      ${config.dailyLimitSats} sats/day`);
    if (mintManager.orderedMints.length > 1) {
        lines.push(`  ${c.bold}Failover${c.reset}   ${mintManager.orderedMints.length} mints configured`);
    }

    box(lines, c.cyan);

    // Show seed if newly generated
    if (seedGenerated) {
        console.log('');
        box([
            `${c.yellow}${c.bold}NEW SEED GENERATED — DO THESE 2 STEPS NOW${c.reset}`,
            '',
            `${c.bold}Step 1:${c.reset} Save this seed somewhere safe (password manager, paper):`,
            '',
            `  ${c.bold}${config.seed}${c.reset}`,
            '',
            `${c.bold}Step 2:${c.reset} Add this line to your .env file:`,
            '',
            `  ${c.bold}NUTBITS_SEED=${c.reset}`,
            `  ${c.bold}${config.seed}${c.reset}`,
            '',
            `${c.dim}This seed generates your ecash proofs deterministically.${c.reset}`,
            `${c.dim}If you lose your database, this seed recovers your funds.${c.reset}`,
            `${c.dim}Without it in .env, a new seed is generated every start.${c.reset}`,
        ], c.yellow);
    }

    // Show NWC connection string on first run
    if (nwcString) {
        console.log('');
        box([
            `${c.magenta}${c.bold}NWC CONNECTION STRING${c.reset}`,
            '',
            `Paste into ${c.bold}LNbits${c.reset}, ${c.bold}BuhoGO${c.reset}, ${c.bold}Alby${c.reset}, or any NWC-compatible wallet:`,
        ], c.magenta);
        console.log(`\n${c.bold}${nwcString}${c.reset}\n`);
    } else {
        console.log(`\n  ${c.green}NWC connections restored. Ready.${c.reset}\n`);
    }

    // ── Management API ───────────────────────────────────────────
    if (config.apiEnabled) {
        try {
            await startApiServer({ nutbits, store, mintManager, config, log, startedAt: Date.now(), seedFromEnv: !!process.env.NUTBITS_SEED });
            log.info('management API ready', { socket: config.apiSocket || '~/.nutbits/nutbits.sock' });
        } catch (e) {
            log.warn('management API failed to start (non-fatal)', { error: e.message });
        }
    } else {
        log.info('management API disabled (NUTBITS_API_ENABLED=false)');
    }
})();

// ── Graceful Shutdown ──────────────────────────────────────────────────────

var shutdown = async () => {
    log.info('shutting down...');
    if (store) await store.close().catch(() => {});
    for (var pk in nutbits.state.nostr_state.pools) {
        var relays = nutbits.state.nostr_state.pools[pk];
        if (Array.isArray(relays)) relays.forEach(r => { try { r.close(); } catch (e) {} });
    }
    process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', e => {
    log.error('uncaughtException', { error: e.message, stack: e.stack });
    if (store) store.saveAll().catch(() => {});
});
process.on('unhandledRejection', reason => {
    log.error('unhandledRejection', { reason: String(reason) });
});

export default nutbits;
