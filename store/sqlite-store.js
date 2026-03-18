// SqliteStore — SQLite backend with AES-256-GCM encrypted columns
// Atomic proof operations via SQLite transactions (the concurrency fix)

import crypto from 'crypto';
import fs from 'fs';
import { deriveKey, encryptValue, decryptValue, decryptState, proofId } from './crypto-utils.js';

var SCHEMA_VERSION = 1;

export class SqliteStore {
    #db;
    #key;       // AES-256 encryption key
    #dbPath;
    #passphrase;
    #stateFile; // .enc file path for migration

    constructor({ sqlitePath, passphrase, stateFile }) {
        this.#dbPath = sqlitePath;
        this.#passphrase = passphrase;
        this.#stateFile = stateFile;
    }

    // ── Lifecycle ─────────────────────────────────────────────────────

    async init() {
        if (!this.#passphrase) throw new Error('Passphrase is required');

        var Database = (await import('better-sqlite3')).default;
        this.#db = new Database(this.#dbPath);
        this.#db.pragma('journal_mode = WAL');
        this.#db.pragma('foreign_keys = ON');

        this.#createSchema();
        this.#initEncryptionKey();

        // Migrate from .enc if database is empty and .enc exists
        if (this.#isEmpty() && this.#stateFile && fs.existsSync(this.#stateFile)) {
            this.#migrateFromEncFile();
        }
    }

    async close() {
        if (this.#db) this.#db.close();
    }

    // ── Proofs ────────────────────────────────────────────────────────

    async getProofs(mintUrl) {
        var rows = this.#db.prepare('SELECT proof_enc FROM proofs WHERE mint_url = ?').all(mintUrl);
        return rows.map(r => JSON.parse(decryptValue(this.#key, r.proof_enc)));
    }

    async setProofs(mintUrl, proofs) {
        this.#db.transaction(() => {
            this.#db.prepare('INSERT OR IGNORE INTO mints (url) VALUES (?)').run(mintUrl);
            this.#db.prepare('DELETE FROM proofs WHERE mint_url = ?').run(mintUrl);
            var ins = this.#db.prepare('INSERT INTO proofs (proof_id, mint_url, amount, proof_enc) VALUES (?, ?, ?, ?)');
            for (var p of proofs) {
                ins.run(proofId(p), mintUrl, p.amount, encryptValue(this.#key, JSON.stringify(p)));
            }
        })();
    }

    async addProofs(mintUrl, proofs) {
        var ins = this.#db.prepare('INSERT OR IGNORE INTO proofs (proof_id, mint_url, amount, proof_enc) VALUES (?, ?, ?, ?)');
        this.#db.transaction(() => {
            this.#db.prepare('INSERT OR IGNORE INTO mints (url) VALUES (?)').run(mintUrl);
            for (var p of proofs) {
                ins.run(proofId(p), mintUrl, p.amount, encryptValue(this.#key, JSON.stringify(p)));
            }
        })();
    }

    async swapProofs(mintUrl, { remove, add }) {
        this.#db.transaction(() => {
            this.#db.prepare('INSERT OR IGNORE INTO mints (url) VALUES (?)').run(mintUrl);
            var del = this.#db.prepare('DELETE FROM proofs WHERE proof_id = ? AND mint_url = ?');
            for (var p of remove) del.run(proofId(p), mintUrl);

            var ins = this.#db.prepare('INSERT OR IGNORE INTO proofs (proof_id, mint_url, amount, proof_enc) VALUES (?, ?, ?, ?)');
            for (var p of add) {
                ins.run(proofId(p), mintUrl, p.amount, encryptValue(this.#key, JSON.stringify(p)));
            }
        })();
    }

    // ── Mint Config ───────────────────────────────────────────────────

    async getActiveMintUrl() {
        var row = this.#db.prepare("SELECT value FROM config WHERE key = 'active_mint_url'").get();
        return row?.value || null;
    }

    async setActiveMintUrl(url) {
        this.#db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('active_mint_url', ?)").run(url);
    }

    async getMintInfo(mintUrl) {
        var row = this.#db.prepare('SELECT last_healthy FROM mints WHERE url = ?').get(mintUrl);
        return { lastHealthy: row?.last_healthy || null };
    }

    async setMintInfo(mintUrl, data) {
        if (data.lastHealthy !== undefined) {
            this.#db.prepare('UPDATE mints SET last_healthy = ? WHERE url = ?').run(data.lastHealthy, mintUrl);
        }
    }

    async ensureMint(mintUrl) {
        this.#db.prepare('INSERT OR IGNORE INTO mints (url) VALUES (?)').run(mintUrl);
    }

    // ── NWC Connections ───────────────────────────────────────────────

    async getConnection(appPubkey) {
        var row = this.#db.prepare('SELECT data_enc, user_pubkey, balance FROM connections WHERE app_pubkey = ?').get(appPubkey);
        if (!row) return null;
        var data = JSON.parse(decryptValue(this.#key, row.data_enc));
        data.balance = row.balance;
        // Load tx_history
        data.tx_history = {};
        var txRows = this.#db.prepare('SELECT payment_hash, data_enc FROM transactions WHERE app_pubkey = ?').all(appPubkey);
        for (var tx of txRows) {
            data.tx_history[tx.payment_hash] = JSON.parse(decryptValue(this.#key, tx.data_enc));
        }
        return data;
    }

    async getAllConnections() {
        var rows = this.#db.prepare('SELECT app_pubkey FROM connections').all();
        var result = {};
        for (var row of rows) {
            result[row.app_pubkey] = await this.getConnection(row.app_pubkey);
        }
        return result;
    }

    async setConnection(appPubkey, info) {
        var { tx_history, balance, user_pubkey, ...rest } = info;
        this.#db.prepare(
            'INSERT OR REPLACE INTO connections (app_pubkey, data_enc, user_pubkey, balance) VALUES (?, ?, ?, ?)'
        ).run(appPubkey, encryptValue(this.#key, JSON.stringify({ ...rest, user_pubkey })), user_pubkey || '', balance || 0);

        // Persist tx_history
        if (tx_history) {
            for (var [pmthash, tx] of Object.entries(tx_history)) {
                await this.setTx(appPubkey, pmthash, tx);
            }
        }
    }

    async updateConnection(appPubkey, fields) {
        if (fields.balance !== undefined) {
            this.#db.prepare('UPDATE connections SET balance = ? WHERE app_pubkey = ?').run(fields.balance, appPubkey);
        }
        // For other fields, re-encrypt the data blob
        var keysNeedingReEncrypt = Object.keys(fields).filter(k => k !== 'balance' && k !== 'tx_history');
        if (keysNeedingReEncrypt.length > 0) {
            var row = this.#db.prepare('SELECT data_enc FROM connections WHERE app_pubkey = ?').get(appPubkey);
            if (row) {
                var data = JSON.parse(decryptValue(this.#key, row.data_enc));
                Object.assign(data, fields);
                delete data.balance;
                delete data.tx_history;
                this.#db.prepare('UPDATE connections SET data_enc = ? WHERE app_pubkey = ?')
                    .run(encryptValue(this.#key, JSON.stringify(data)), appPubkey);
            }
        }
    }

    // ── Transactions ──────────────────────────────────────────────────

    async getTx(appPubkey, pmthash) {
        var row = this.#db.prepare('SELECT data_enc FROM transactions WHERE payment_hash = ? AND app_pubkey = ?').get(pmthash, appPubkey);
        return row ? JSON.parse(decryptValue(this.#key, row.data_enc)) : null;
    }

    async setTx(appPubkey, pmthash, tx) {
        this.#db.prepare(
            `INSERT OR REPLACE INTO transactions (payment_hash, app_pubkey, type, amount, paid, created_at, settled_at, data_enc)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(pmthash, appPubkey, tx.type, tx.amount, tx.paid ? 1 : 0, tx.created_at, tx.settled_at, encryptValue(this.#key, JSON.stringify(tx)));
    }

    async updateTx(appPubkey, pmthash, fields) {
        var tx = await this.getTx(appPubkey, pmthash);
        if (!tx) return;
        Object.assign(tx, fields);
        await this.setTx(appPubkey, pmthash, tx);
    }

    async listTxs(appPubkey, filters = {}) {
        var conditions = ['app_pubkey = ?'];
        var params = [appPubkey];

        if (!filters.unpaid) { conditions.push('paid = 1'); }
        if (filters.type) { conditions.push('type = ?'); params.push(filters.type); }
        if (filters.from) { conditions.push('created_at >= ?'); params.push(filters.from); }
        if (filters.until) { conditions.push('created_at <= ?'); params.push(filters.until); }

        var sql = `SELECT data_enc FROM transactions WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`;
        if (filters.limit) { sql += ' LIMIT ?'; params.push(Number(filters.limit)); }
        if (filters.offset) { sql += ' OFFSET ?'; params.push(Number(filters.offset)); }

        var rows = this.#db.prepare(sql).all(...params);
        return rows.map(r => JSON.parse(decryptValue(this.#key, r.data_enc)));
    }

    // ── Counters (NUT-13) ───────────────────────────────────────────

    async getCounter(keysetId) {
        var row = this.#db.prepare('SELECT next_counter FROM counters WHERE keyset_id = ?').get(keysetId);
        return row?.next_counter || null;
    }

    async setCounter(keysetId, next) {
        this.#db.prepare('INSERT OR REPLACE INTO counters (keyset_id, next_counter) VALUES (?, ?)').run(keysetId, next);
    }

    // ── Bulk ──────────────────────────────────────────────────────────

    async saveAll() {
        // No-op — SQLite persists immediately
    }

    // ── Internal ──────────────────────────────────────────────────────

    #createSchema() {
        this.#db.exec(`
            CREATE TABLE IF NOT EXISTS config (
                key TEXT PRIMARY KEY,
                value TEXT
            );
            CREATE TABLE IF NOT EXISTS mints (
                url TEXT PRIMARY KEY,
                last_healthy INTEGER,
                is_active INTEGER DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS proofs (
                proof_id TEXT PRIMARY KEY,
                mint_url TEXT NOT NULL,
                amount INTEGER NOT NULL,
                proof_enc BLOB NOT NULL,
                FOREIGN KEY (mint_url) REFERENCES mints(url)
            );
            CREATE INDEX IF NOT EXISTS idx_proofs_mint ON proofs(mint_url);
            CREATE TABLE IF NOT EXISTS connections (
                app_pubkey TEXT PRIMARY KEY,
                data_enc BLOB NOT NULL,
                user_pubkey TEXT NOT NULL DEFAULT '',
                balance INTEGER DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS transactions (
                payment_hash TEXT NOT NULL,
                app_pubkey TEXT NOT NULL,
                type TEXT NOT NULL DEFAULT '',
                amount INTEGER NOT NULL DEFAULT 0,
                paid INTEGER DEFAULT 0,
                created_at INTEGER,
                settled_at INTEGER,
                data_enc BLOB NOT NULL,
                PRIMARY KEY (payment_hash, app_pubkey)
            );
            CREATE INDEX IF NOT EXISTS idx_tx_app ON transactions(app_pubkey, created_at DESC);
            CREATE TABLE IF NOT EXISTS counters (
                keyset_id TEXT PRIMARY KEY,
                next_counter INTEGER NOT NULL DEFAULT 0
            );
        `);
        this.#db.prepare("INSERT OR IGNORE INTO config (key, value) VALUES ('schema_version', ?)").run(String(SCHEMA_VERSION));
    }

    #initEncryptionKey() {
        var row = this.#db.prepare("SELECT value FROM config WHERE key = 'encryption_salt'").get();
        var salt;
        if (row) {
            salt = Buffer.from(row.value, 'hex');
        } else {
            salt = crypto.randomBytes(16);
            this.#db.prepare("INSERT INTO config (key, value) VALUES ('encryption_salt', ?)").run(salt.toString('hex'));
        }
        this.#key = deriveKey(this.#passphrase, salt);
    }

    #isEmpty() {
        var row = this.#db.prepare('SELECT COUNT(*) as count FROM connections').get();
        var row2 = this.#db.prepare('SELECT COUNT(*) as count FROM proofs').get();
        return row.count === 0 && row2.count === 0;
    }

    #migrateFromEncFile() {
        try {
            var blob = fs.readFileSync(this.#stateFile);
            var plaintext = decryptState(this.#passphrase, blob);
            var restored = JSON.parse(plaintext);

            this.#db.transaction(() => {
                // Migrate mints + proofs
                var mints = restored.mints || {};
                var flatProofs = restored.proofs || restored.utxos || [];
                var activeMint = restored.activeMintUrl;

                // Handle old flat proofs
                if (flatProofs.length > 0 && !Object.values(mints).some(m => m.proofs?.length > 0) && activeMint) {
                    mints[activeMint] = { proofs: flatProofs, lastHealthy: null };
                }

                for (var [mintUrl, mintData] of Object.entries(mints)) {
                    this.#db.prepare('INSERT OR IGNORE INTO mints (url, last_healthy) VALUES (?, ?)').run(mintUrl, mintData.lastHealthy || null);
                    var ins = this.#db.prepare('INSERT OR IGNORE INTO proofs (proof_id, mint_url, amount, proof_enc) VALUES (?, ?, ?, ?)');
                    for (var p of (mintData.proofs || [])) {
                        ins.run(proofId(p), mintUrl, p.amount, encryptValue(this.#key, JSON.stringify(p)));
                    }
                }

                if (activeMint) {
                    this.#db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('active_mint_url', ?)").run(activeMint);
                }

                // Migrate NWC connections
                var nwcInfo = restored.nostr_state?.nwc_info || {};
                for (var [appPk, info] of Object.entries(nwcInfo)) {
                    var { tx_history, balance, user_pubkey, ...rest } = info;
                    this.#db.prepare(
                        'INSERT OR REPLACE INTO connections (app_pubkey, data_enc, user_pubkey, balance) VALUES (?, ?, ?, ?)'
                    ).run(appPk, encryptValue(this.#key, JSON.stringify({ ...rest, user_pubkey })), user_pubkey || '', balance || 0);

                    if (tx_history) {
                        var txIns = this.#db.prepare(
                            `INSERT OR REPLACE INTO transactions (payment_hash, app_pubkey, type, amount, paid, created_at, settled_at, data_enc)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
                        );
                        for (var [pmthash, tx] of Object.entries(tx_history)) {
                            txIns.run(pmthash, appPk, tx.type || '', tx.amount || 0, tx.paid ? 1 : 0, tx.created_at, tx.settled_at, encryptValue(this.#key, JSON.stringify(tx)));
                        }
                    }
                }
            })();

            // Rename old .enc file as backup
            fs.renameSync(this.#stateFile, this.#stateFile + '.migrated');
            console.log(`[MIGRATION] Migrated .enc state to SQLite. Old file renamed to ${this.#stateFile}.migrated`);
        } catch (e) {
            console.error('[MIGRATION] Failed to migrate from .enc file:', e.message);
        }
    }
}
