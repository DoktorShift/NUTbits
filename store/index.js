// Store factory - selects backend based on config
// Dynamic imports so unused backends don't require their dependencies

import { sumProofs } from '@cashu/cashu-ts';

var backends = {
    file:   () => import('./file-store.js').then(m => m.FileStore),
    sqlite: () => import('./sqlite-store.js').then(m => m.SqliteStore),
    mysql:  () => import('./mysql-store.js').then(m => m.MysqlStore),
};

export async function createStore(config, logger) {
    var backend = config.stateBackend || 'file';
    var loader = backends[backend];
    if (!loader) {
        throw new Error(`Unknown storage backend: "${backend}". Options: ${Object.keys(backends).join(', ')}`);
    }

    var Store;
    try {
        Store = await loader();
    } catch (e) {
        if (e.code === 'ERR_MODULE_NOT_FOUND') {
            var deps = { sqlite: 'better-sqlite3', mysql: 'mysql2' };
            throw new Error(`Storage backend "${backend}" requires "${deps[backend]}". Install it: npm install ${deps[backend]}`);
        }
        throw e;
    }

    var store = new Store({
        stateFile: config.stateFile,
        passphrase: config.statePassphrase,
        sqlitePath: config.sqlitePath || config.stateFile.replace(/\.enc$/, '.db'),
        mysqlUrl: config.mysqlUrl,
    });
    await store.init();

    if (logger) return wrapWithAudit(store, logger);
    return store;
}

// ── Audit Logging Wrapper ─────────────────────────────────────────────────
// Wraps proof-mutating and connection-mutating store operations with
// structured audit logs so balance changes are always traceable.

function wrapWithAudit(store, log) {
    var orig = {
        addProofs:        store.addProofs.bind(store),
        setProofs:        store.setProofs.bind(store),
        swapProofs:       store.swapProofs.bind(store),
        setConnection:    store.setConnection.bind(store),
        updateConnection: store.updateConnection.bind(store),
        setTx:            store.setTx.bind(store),
        updateTx:         store.updateTx.bind(store),
    };

    store.addProofs = async (mintUrl, proofs) => {
        var result = await orig.addProofs(mintUrl, proofs);
        log.info('AUDIT: proofs added', { mint: mintUrl, count: proofs.length, sats: sumProofs(proofs) });
        return result;
    };

    store.setProofs = async (mintUrl, proofs) => {
        var result = await orig.setProofs(mintUrl, proofs);
        log.info('AUDIT: proofs replaced', { mint: mintUrl, count: proofs.length, sats: sumProofs(proofs) });
        return result;
    };

    store.swapProofs = async (mintUrl, ops) => {
        var result = await orig.swapProofs(mintUrl, ops);
        log.info('AUDIT: proofs swapped', {
            mint: mintUrl,
            removed: ops.remove.length,
            removedSats: sumProofs(ops.remove),
            added: ops.add.length,
            addedSats: sumProofs(ops.add),
            delta: sumProofs(ops.add) - sumProofs(ops.remove),
        });
        return result;
    };

    store.setConnection = async (appPubkey, info) => {
        var result = await orig.setConnection(appPubkey, info);
        log.info('AUDIT: connection created', { pubkey: appPubkey.slice(0, 8) + '...', label: info.label || '(none)', permissions: info.permissions });
        return result;
    };

    store.updateConnection = async (appPubkey, fields) => {
        var result = await orig.updateConnection(appPubkey, fields);
        var safeFields = { ...fields };
        delete safeFields.balance; // don't log routine balance updates
        if (Object.keys(safeFields).length > 0) {
            log.info('AUDIT: connection updated', { pubkey: appPubkey.slice(0, 8) + '...', fields: Object.keys(safeFields) });
        }
        return result;
    };

    store.setTx = async (appPubkey, pmthash, tx) => {
        var result = await orig.setTx(appPubkey, pmthash, tx);
        log.debug('AUDIT: tx created', { pubkey: appPubkey.slice(0, 8) + '...', type: tx.type, amount: tx.amount, hash: pmthash.slice(0, 12) + '...' });
        return result;
    };

    store.updateTx = async (appPubkey, pmthash, fields) => {
        var result = await orig.updateTx(appPubkey, pmthash, fields);
        log.debug('AUDIT: tx updated', { pubkey: appPubkey.slice(0, 8) + '...', hash: pmthash.slice(0, 12) + '...', fields: Object.keys(fields) });
        return result;
    };

    return store;
}
