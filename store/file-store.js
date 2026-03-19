// FileStore — encrypted flat file storage with write mutex
// Wraps the original .enc approach with serialized writes

import fs from 'fs';
import { encryptState, decryptState } from './crypto-utils.js';

export class FileStore {
    #state = { mints: {}, nostr_state: { nwc_info: {} }, activeMintUrl: null, counters: {}, dailySpend: {} };
    #passphrase;
    #stateFile;
    #writeLock = Promise.resolve();

    constructor({ stateFile, passphrase }) {
        this.#stateFile = stateFile;
        this.#passphrase = passphrase;
    }

    // ── Lifecycle ─────────────────────────────────────────────────────

    async init() {
        if (!this.#passphrase) throw new Error('Passphrase is required');
        if (fs.existsSync(this.#stateFile)) {
            var blob = fs.readFileSync(this.#stateFile);
            var plaintext = decryptState(this.#passphrase, blob);
            var restored = JSON.parse(plaintext);
            this.#state.mints = restored.mints || {};
            this.#state.activeMintUrl = restored.activeMintUrl || null;
            this.#state.nostr_state.nwc_info = restored.nostr_state?.nwc_info || {};
            this.#state.counters = restored.counters || {};
            this.#state.dailySpend = restored.dailySpend || {};
            // Migration: old flat proofs format
            var flatProofs = restored.proofs || restored.utxos || [];
            var hasMintProofs = Object.values(this.#state.mints).some(m => m.proofs?.length > 0);
            if (flatProofs.length > 0 && !hasMintProofs && this.#state.activeMintUrl) {
                this.#state.mints[this.#state.activeMintUrl] = { proofs: flatProofs, lastHealthy: null };
            }
        }
    }

    async close() {
        await this.saveAll();
    }

    // ── Write Lock ────────────────────────────────────────────────────

    async #withLock(fn) {
        var prev = this.#writeLock;
        var release;
        this.#writeLock = new Promise(r => { release = r; });
        await prev;
        try { return await fn(); }
        finally { release(); }
    }

    #flush() {
        var nwcInfoClean = {};
        for (var [pk, info] of Object.entries(this.#state.nostr_state.nwc_info)) {
            var { user_secret, ...rest } = info;
            nwcInfoClean[pk] = rest;
        }
        var activeMint = this.#state.activeMintUrl;
        var stateToSave = {
            proofs: this.#state.mints[activeMint]?.proofs || [],
            mints: this.#state.mints,
            activeMintUrl: activeMint,
            nostr_state: { nwc_info: nwcInfoClean },
            counters: this.#state.counters,
            dailySpend: this.#state.dailySpend,
        };
        var blob = encryptState(this.#passphrase, JSON.stringify(stateToSave));
        var tmpFile = this.#stateFile + '.tmp';
        fs.writeFileSync(tmpFile, blob, { mode: 0o600 });
        fs.renameSync(tmpFile, this.#stateFile);
    }

    // ── Proofs ────────────────────────────────────────────────────────

    async getProofs(mintUrl) {
        return this.#state.mints[mintUrl]?.proofs || [];
    }

    async setProofs(mintUrl, proofs) {
        return this.#withLock(() => {
            this.#ensureMintState(mintUrl);
            this.#state.mints[mintUrl].proofs = proofs;
            this.#flush();
        });
    }

    async addProofs(mintUrl, proofs) {
        return this.#withLock(() => {
            this.#ensureMintState(mintUrl);
            this.#state.mints[mintUrl].proofs.push(...proofs);
            this.#flush();
        });
    }

    async swapProofs(mintUrl, { remove, add }) {
        return this.#withLock(() => {
            this.#ensureMintState(mintUrl);
            var secrets = new Set(remove.map(p => p.secret));
            var current = this.#state.mints[mintUrl].proofs;
            this.#state.mints[mintUrl].proofs = current.filter(p => !secrets.has(p.secret)).concat(add);
            this.#flush();
        });
    }

    // ── Mint Config ───────────────────────────────────────────────────

    async getActiveMintUrl() {
        return this.#state.activeMintUrl;
    }

    async setActiveMintUrl(url) {
        return this.#withLock(() => {
            this.#state.activeMintUrl = url;
            this.#flush();
        });
    }

    async getMintInfo(mintUrl) {
        return { lastHealthy: this.#state.mints[mintUrl]?.lastHealthy || null };
    }

    async setMintInfo(mintUrl, data) {
        return this.#withLock(() => {
            this.#ensureMintState(mintUrl);
            Object.assign(this.#state.mints[mintUrl], data);
            this.#flush();
        });
    }

    async ensureMint(mintUrl) {
        return this.#withLock(() => {
            if (!this.#state.mints[mintUrl]) {
                this.#ensureMintState(mintUrl);
                this.#flush();
            }
        });
    }

    // ── NWC Connections ───────────────────────────────────────────────

    async getConnection(appPubkey) {
        return this.#state.nostr_state.nwc_info[appPubkey] || null;
    }

    async getAllConnections() {
        return { ...this.#state.nostr_state.nwc_info };
    }

    async setConnection(appPubkey, info) {
        return this.#withLock(() => {
            this.#state.nostr_state.nwc_info[appPubkey] = info;
            this.#flush();
        });
    }

    async updateConnection(appPubkey, fields) {
        return this.#withLock(() => {
            var conn = this.#state.nostr_state.nwc_info[appPubkey];
            if (!conn) return;
            Object.assign(conn, fields);
            this.#flush();
        });
    }

    // ── Transactions ──────────────────────────────────────────────────

    async getTx(appPubkey, pmthash) {
        return this.#state.nostr_state.nwc_info[appPubkey]?.tx_history?.[pmthash] || null;
    }

    async setTx(appPubkey, pmthash, tx) {
        return this.#withLock(() => {
            var conn = this.#state.nostr_state.nwc_info[appPubkey];
            if (conn) {
                if (!conn.tx_history) conn.tx_history = {};
                conn.tx_history[pmthash] = tx;
            }
            this.#flush();
        });
    }

    async updateTx(appPubkey, pmthash, fields) {
        return this.#withLock(() => {
            var tx = this.#state.nostr_state.nwc_info[appPubkey]?.tx_history?.[pmthash];
            if (!tx) return;
            Object.assign(tx, fields);
            this.#flush();
        });
    }

    async listTxs(appPubkey, filters = {}) {
        var conn = this.#state.nostr_state.nwc_info[appPubkey];
        if (!conn?.tx_history) return [];
        var txs = Object.values(conn.tx_history);
        if (!filters.unpaid) txs = txs.filter(tx => tx.paid);
        if (filters.type) txs = txs.filter(tx => tx.type === filters.type);
        txs.sort((a, b) => b.created_at - a.created_at);
        if (filters.from) txs = txs.filter(tx => tx.created_at >= filters.from);
        if (filters.until) txs = txs.filter(tx => tx.created_at <= filters.until);
        if (filters.offset) txs = txs.slice(filters.offset);
        if (filters.limit) txs = txs.slice(0, filters.limit);
        return txs;
    }

    // ── Counters (NUT-13) ───────────────────────────────────────────

    async getCounter(keysetId) {
        return this.#state.counters[keysetId] || null;
    }

    async setCounter(keysetId, next) {
        return this.#withLock(() => {
            this.#state.counters[keysetId] = next;
            this.#flush();
        });
    }

    // ── Daily Spend Tracking ─────────────────────────────────────────

    async getDailySpend(appPubkey, date) {
        var key = `${appPubkey}:${date}`;
        return this.#state.dailySpend[key] || 0;
    }

    async addDailySpend(appPubkey, date, amountSats) {
        return this.#withLock(() => {
            var key = `${appPubkey}:${date}`;
            this.#state.dailySpend[key] = (this.#state.dailySpend[key] || 0) + amountSats;
            // Clean up old dates (keep only today and yesterday)
            for (var k of Object.keys(this.#state.dailySpend)) {
                var d = k.split(':').pop();
                if (d < date) delete this.#state.dailySpend[k];
            }
            this.#flush();
        });
    }

    // ── Bulk ──────────────────────────────────────────────────────────

    async saveAll() {
        return this.#withLock(() => this.#flush());
    }

    // ── Internal ──────────────────────────────────────────────────────

    #ensureMintState(mintUrl) {
        if (!this.#state.mints[mintUrl]) {
            this.#state.mints[mintUrl] = { proofs: [], lastHealthy: null };
        }
    }
}
