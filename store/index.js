// Store factory — selects backend based on config
// Dynamic imports so unused backends don't require their dependencies

var backends = {
    file:   () => import('./file-store.js').then(m => m.FileStore),
    sqlite: () => import('./sqlite-store.js').then(m => m.SqliteStore),
    mysql:  () => import('./mysql-store.js').then(m => m.MysqlStore),
};

export async function createStore(config) {
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
    return store;
}
