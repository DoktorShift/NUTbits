// MysqlStore — MySQL backend with AES-256-GCM encrypted columns
// Uses mysql2/promise for async operations with connection pooling

import crypto from 'crypto';
import fs from 'fs';
import { deriveKey, encryptValue, decryptValue, decryptState, proofId } from './crypto-utils.js';

var SCHEMA_VERSION = 1;

export class MysqlStore {
    #pool;
    #key;       // AES-256 encryption key
    #mysqlUrl;
    #passphrase;
    #stateFile; // .enc file path for migration

    constructor({ mysqlUrl, passphrase, stateFile }) {
        this.#mysqlUrl = mysqlUrl;
        this.#passphrase = passphrase;
        this.#stateFile = stateFile;
    }

    // ── Lifecycle ─────────────────────────────────────────────────────

    async init() {
        if (!this.#passphrase) throw new Error('Passphrase is required');
        if (!this.#mysqlUrl) throw new Error('NUTBITS_MYSQL_URL is required for mysql backend');

        var mysql = await import('mysql2/promise');
        this.#pool = mysql.createPool(this.#mysqlUrl);

        await this.#createSchema();
        await this.#initEncryptionKey();

        // Migrate from .enc if database is empty and .enc exists
        if (await this.#isEmpty() && this.#stateFile && fs.existsSync(this.#stateFile)) {
            await this.#migrateFromEncFile();
        }
    }

    async close() {
        if (this.#pool) await this.#pool.end();
    }

    // ── Proofs ────────────────────────────────────────────────────────

    async getProofs(mintUrl) {
        var [rows] = await this.#pool.execute('SELECT proof_enc FROM proofs WHERE mint_url = ?', [mintUrl]);
        return rows.map(r => JSON.parse(decryptValue(this.#key, r.proof_enc)));
    }

    async setProofs(mintUrl, proofs) {
        var conn = await this.#pool.getConnection();
        try {
            await conn.beginTransaction();
            await conn.execute('INSERT IGNORE INTO mints (url) VALUES (?)', [mintUrl]);
            await conn.execute('DELETE FROM proofs WHERE mint_url = ?', [mintUrl]);
            for (var p of proofs) {
                await conn.execute('INSERT INTO proofs (proof_id, mint_url, amount, proof_enc) VALUES (?, ?, ?, ?)',
                    [proofId(p), mintUrl, p.amount, encryptValue(this.#key, JSON.stringify(p))]);
            }
            await conn.commit();
        } catch (e) {
            await conn.rollback();
            throw e;
        } finally {
            conn.release();
        }
    }

    async addProofs(mintUrl, proofs) {
        var conn = await this.#pool.getConnection();
        try {
            await conn.beginTransaction();
            await conn.execute('INSERT IGNORE INTO mints (url) VALUES (?)', [mintUrl]);
            for (var p of proofs) {
                await conn.execute(
                    'INSERT IGNORE INTO proofs (proof_id, mint_url, amount, proof_enc) VALUES (?, ?, ?, ?)',
                    [proofId(p), mintUrl, p.amount, encryptValue(this.#key, JSON.stringify(p))]
                );
            }
            await conn.commit();
        } catch (e) {
            await conn.rollback();
            throw e;
        } finally {
            conn.release();
        }
    }

    async swapProofs(mintUrl, { remove, add }) {
        var conn = await this.#pool.getConnection();
        try {
            await conn.beginTransaction();
            await conn.execute('INSERT IGNORE INTO mints (url) VALUES (?)', [mintUrl]);
            for (var p of remove) {
                await conn.execute('DELETE FROM proofs WHERE proof_id = ? AND mint_url = ?', [proofId(p), mintUrl]);
            }
            for (var p of add) {
                await conn.execute(
                    'INSERT IGNORE INTO proofs (proof_id, mint_url, amount, proof_enc) VALUES (?, ?, ?, ?)',
                    [proofId(p), mintUrl, p.amount, encryptValue(this.#key, JSON.stringify(p))]
                );
            }
            await conn.commit();
        } catch (e) {
            await conn.rollback();
            throw e;
        } finally {
            conn.release();
        }
    }

    // ── Mint Config ───────────────────────────────────────────────────

    async getActiveMintUrl() {
        var [rows] = await this.#pool.execute("SELECT v FROM config WHERE k = 'active_mint_url'");
        return rows[0]?.v || null;
    }

    async setActiveMintUrl(url) {
        await this.#pool.execute("INSERT INTO config (k, v) VALUES ('active_mint_url', ?) ON DUPLICATE KEY UPDATE v = ?", [url, url]);
    }

    async getMintInfo(mintUrl) {
        var [rows] = await this.#pool.execute('SELECT last_healthy FROM mints WHERE url = ?', [mintUrl]);
        return { lastHealthy: rows[0]?.last_healthy || null };
    }

    async setMintInfo(mintUrl, data) {
        if (data.lastHealthy !== undefined) {
            await this.#pool.execute('UPDATE mints SET last_healthy = ? WHERE url = ?', [data.lastHealthy, mintUrl]);
        }
    }

    async ensureMint(mintUrl) {
        await this.#pool.execute('INSERT IGNORE INTO mints (url) VALUES (?)', [mintUrl]);
    }

    // ── NWC Connections ───────────────────────────────────────────────

    async getConnection(appPubkey) {
        var [rows] = await this.#pool.execute('SELECT data_enc, user_pubkey, balance FROM connections WHERE app_pubkey = ?', [appPubkey]);
        if (!rows[0]) return null;
        var data = JSON.parse(decryptValue(this.#key, rows[0].data_enc));
        data.balance = rows[0].balance;
        // Load tx_history
        data.tx_history = {};
        var [txRows] = await this.#pool.execute('SELECT payment_hash, data_enc FROM transactions WHERE app_pubkey = ?', [appPubkey]);
        for (var tx of txRows) {
            data.tx_history[tx.payment_hash] = JSON.parse(decryptValue(this.#key, tx.data_enc));
        }
        return data;
    }

    async getAllConnections() {
        var [rows] = await this.#pool.execute('SELECT app_pubkey FROM connections');
        var result = {};
        for (var row of rows) {
            result[row.app_pubkey] = await this.getConnection(row.app_pubkey);
        }
        return result;
    }

    async setConnection(appPubkey, info) {
        var { tx_history, balance, user_pubkey, ...rest } = info;
        await this.#pool.execute(
            'INSERT INTO connections (app_pubkey, data_enc, user_pubkey, balance) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE data_enc = VALUES(data_enc), user_pubkey = VALUES(user_pubkey), balance = VALUES(balance)',
            [appPubkey, encryptValue(this.#key, JSON.stringify({ ...rest, user_pubkey })), user_pubkey || '', balance || 0]
        );
        if (tx_history) {
            for (var [pmthash, tx] of Object.entries(tx_history)) {
                await this.setTx(appPubkey, pmthash, tx);
            }
        }
    }

    async updateConnection(appPubkey, fields) {
        if (fields.balance !== undefined) {
            await this.#pool.execute('UPDATE connections SET balance = ? WHERE app_pubkey = ?', [fields.balance, appPubkey]);
        }
        var keysNeedingReEncrypt = Object.keys(fields).filter(k => k !== 'balance' && k !== 'tx_history');
        if (keysNeedingReEncrypt.length > 0) {
            var [rows] = await this.#pool.execute('SELECT data_enc FROM connections WHERE app_pubkey = ?', [appPubkey]);
            if (rows[0]) {
                var data = JSON.parse(decryptValue(this.#key, rows[0].data_enc));
                Object.assign(data, fields);
                delete data.balance;
                delete data.tx_history;
                await this.#pool.execute('UPDATE connections SET data_enc = ? WHERE app_pubkey = ?',
                    [encryptValue(this.#key, JSON.stringify(data)), appPubkey]);
            }
        }
    }

    // ── Transactions ──────────────────────────────────────────────────

    async getTx(appPubkey, pmthash) {
        var [rows] = await this.#pool.execute('SELECT data_enc FROM transactions WHERE payment_hash = ? AND app_pubkey = ?', [pmthash, appPubkey]);
        return rows[0] ? JSON.parse(decryptValue(this.#key, rows[0].data_enc)) : null;
    }

    async setTx(appPubkey, pmthash, tx) {
        await this.#pool.execute(
            `INSERT INTO transactions (payment_hash, app_pubkey, type, amount, paid, created_at, settled_at, data_enc)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE type = VALUES(type), amount = VALUES(amount), paid = VALUES(paid),
             created_at = VALUES(created_at), settled_at = VALUES(settled_at), data_enc = VALUES(data_enc)`,
            [pmthash, appPubkey, tx.type || '', tx.amount || 0, tx.paid ? 1 : 0, tx.created_at, tx.settled_at, encryptValue(this.#key, JSON.stringify(tx))]
        );
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

        var [rows] = await this.#pool.execute(sql, params);
        return rows.map(r => JSON.parse(decryptValue(this.#key, r.data_enc)));
    }

    // ── Counters (NUT-13) ───────────────────────────────────────────

    async getCounter(keysetId) {
        var [rows] = await this.#pool.execute('SELECT next_counter FROM counters WHERE keyset_id = ?', [keysetId]);
        return rows[0] ? Number(rows[0].next_counter) : null;
    }

    async setCounter(keysetId, next) {
        await this.#pool.execute(
            'INSERT INTO counters (keyset_id, next_counter) VALUES (?, ?) ON DUPLICATE KEY UPDATE next_counter = ?',
            [keysetId, next, next]
        );
    }

    // ── Bulk ──────────────────────────────────────────────────────────

    async saveAll() {
        // No-op — MySQL persists immediately
    }

    // ── Internal ──────────────────────────────────────────────────────

    async #createSchema() {
        await this.#pool.execute(`
            CREATE TABLE IF NOT EXISTS config (
                k VARCHAR(128) PRIMARY KEY,
                v TEXT
            )
        `);
        await this.#pool.execute(`
            CREATE TABLE IF NOT EXISTS mints (
                url VARCHAR(512) PRIMARY KEY,
                last_healthy BIGINT,
                is_active TINYINT DEFAULT 0
            )
        `);
        await this.#pool.execute(`
            CREATE TABLE IF NOT EXISTS proofs (
                proof_id VARCHAR(64) PRIMARY KEY,
                mint_url VARCHAR(512) NOT NULL,
                amount INT NOT NULL,
                proof_enc BLOB NOT NULL
            )
        `);
        // Index (ignore error if exists)
        await this.#pool.execute('CREATE INDEX idx_proofs_mint ON proofs(mint_url)').catch(() => {});
        await this.#pool.execute(`
            CREATE TABLE IF NOT EXISTS connections (
                app_pubkey VARCHAR(128) PRIMARY KEY,
                data_enc BLOB NOT NULL,
                user_pubkey VARCHAR(128) NOT NULL DEFAULT '',
                balance BIGINT DEFAULT 0
            )
        `);
        await this.#pool.execute(`
            CREATE TABLE IF NOT EXISTS transactions (
                payment_hash VARCHAR(128) NOT NULL,
                app_pubkey VARCHAR(128) NOT NULL,
                type VARCHAR(16) NOT NULL DEFAULT '',
                amount BIGINT NOT NULL DEFAULT 0,
                paid TINYINT DEFAULT 0,
                created_at BIGINT,
                settled_at BIGINT,
                data_enc BLOB NOT NULL,
                PRIMARY KEY (payment_hash, app_pubkey)
            )
        `);
        await this.#pool.execute('CREATE INDEX idx_tx_app ON transactions(app_pubkey, created_at DESC)').catch(() => {});
        await this.#pool.execute(`
            CREATE TABLE IF NOT EXISTS counters (
                keyset_id VARCHAR(128) PRIMARY KEY,
                next_counter INT NOT NULL DEFAULT 0
            )
        `);
    }

    async #initEncryptionKey() {
        var [rows] = await this.#pool.execute("SELECT v FROM config WHERE k = 'encryption_salt'");
        var salt;
        if (rows[0]) {
            salt = Buffer.from(rows[0].v, 'hex');
        } else {
            salt = crypto.randomBytes(16);
            await this.#pool.execute("INSERT INTO config (k, v) VALUES ('encryption_salt', ?)", [salt.toString('hex')]);
        }
        this.#key = deriveKey(this.#passphrase, salt);
    }

    async #isEmpty() {
        var [rows] = await this.#pool.execute('SELECT COUNT(*) as count FROM connections');
        var [rows2] = await this.#pool.execute('SELECT COUNT(*) as count FROM proofs');
        return Number(rows[0].count) === 0 && Number(rows2[0].count) === 0;
    }

    async #migrateFromEncFile() {
        var conn = await this.#pool.getConnection();
        try {
            var blob = fs.readFileSync(this.#stateFile);
            var plaintext = decryptState(this.#passphrase, blob);
            var restored = JSON.parse(plaintext);

            var mints = restored.mints || {};
            var flatProofs = restored.proofs || restored.utxos || [];
            var activeMint = restored.activeMintUrl;

            if (flatProofs.length > 0 && !Object.values(mints).some(m => m.proofs?.length > 0) && activeMint) {
                mints[activeMint] = { proofs: flatProofs, lastHealthy: null };
            }

            await conn.beginTransaction();

            for (var [mintUrl, mintData] of Object.entries(mints)) {
                await conn.execute('INSERT IGNORE INTO mints (url, last_healthy) VALUES (?, ?)', [mintUrl, mintData.lastHealthy || null]);
                for (var p of (mintData.proofs || [])) {
                    await conn.execute('INSERT IGNORE INTO proofs (proof_id, mint_url, amount, proof_enc) VALUES (?, ?, ?, ?)',
                        [proofId(p), mintUrl, p.amount, encryptValue(this.#key, JSON.stringify(p))]);
                }
            }

            if (activeMint) {
                await conn.execute("INSERT INTO config (k, v) VALUES ('active_mint_url', ?) ON DUPLICATE KEY UPDATE v = ?", [activeMint, activeMint]);
            }

            var nwcInfo = restored.nostr_state?.nwc_info || {};
            for (var [appPk, info] of Object.entries(nwcInfo)) {
                var { tx_history, balance, user_pubkey, ...rest } = info;
                await conn.execute(
                    'INSERT INTO connections (app_pubkey, data_enc, user_pubkey, balance) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE data_enc = VALUES(data_enc)',
                    [appPk, encryptValue(this.#key, JSON.stringify({ ...rest, user_pubkey })), user_pubkey || '', balance || 0]
                );
                if (tx_history) {
                    for (var [pmthash, tx] of Object.entries(tx_history)) {
                        await conn.execute(
                            `INSERT INTO transactions (payment_hash, app_pubkey, type, amount, paid, created_at, settled_at, data_enc)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE data_enc = VALUES(data_enc)`,
                            [pmthash, appPk, tx.type || '', tx.amount || 0, tx.paid ? 1 : 0, tx.created_at, tx.settled_at, encryptValue(this.#key, JSON.stringify(tx))]
                        );
                    }
                }
            }

            await conn.commit();
            fs.renameSync(this.#stateFile, this.#stateFile + '.migrated');
            console.log(`[MIGRATION] Migrated .enc state to MySQL. Old file renamed to ${this.#stateFile}.migrated`);
        } catch (e) {
            await conn.rollback().catch(() => {});
            console.error('[MIGRATION] Failed to migrate from .enc file:', e.message);
        } finally {
            conn.release();
        }
    }
}
