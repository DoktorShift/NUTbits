import fs from 'node:fs';
import { c } from '../colors.js';
import { kv, heading, print, jsonOut } from '../render.js';
import { select, input, confirm, spinner } from '../prompts.js';

// Try to load QR code renderer (optional dependency)
var qrGenerate = null;
try {
    var qrt = await import('qrcode-terminal');
    qrGenerate = (text) => new Promise(resolve => {
        qrt.default.generate(text, { small: true }, resolve);
    });
} catch (e) { /* qrcode-terminal not installed - skip QR */ }

// ── Entry Point ─────────────────────────────────────────────────────────

export async function run(client, args) {
    var subcommand = args._positional?.[0] || null;

    // Scripted sub-commands
    if (subcommand === 'history')     return await historyExport(client, args, false);
    if (subcommand === 'connections') return await connectionsExport(client, args, false);
    if (subcommand === 'mints')       return await mintsExport(client, args, false);

    // Scripted shortcut: --format implies history export
    if (args.format || args.out) return await historyExport(client, args, false);

    // JSON passthrough
    if (args?.json) return jsonOut(await client.get('/api/v1/history/export'));

    // ── Interactive hub ──────────────────────────────────────────

    print(heading('Export'));
    print(`  ${c.muted}Download data from your NUTbits instance.${c.reset}`);
    print('');

    // Show quick stats
    try {
        var stats = await client.get('/api/v1/history', { limit: '1', unpaid: 'true' });
        var conns = await client.get('/api/v1/connections');
        var mints = await client.get('/api/v1/mints');
        print(kv('Transactions', `${c.white}${stats.total}${c.reset}`));
        print(kv('Connections', `${c.white}${conns.connections?.length || 0}${c.reset}${c.muted} active${c.reset}`));
        print(kv('Mints', `${c.white}${mints.mints?.length || 0}${c.reset}${c.muted} configured${c.reset}`));
        print('');
    } catch (e) { /* skip */ }

    var choice = await select({
        message: 'What do you want to export?',
        options: [
            { label: 'Transaction history', hint: 'CSV or JSON of all payments, fees, and metadata', value: 'history' },
            { label: 'NWC connections',     hint: 'connection strings, permissions, and limits',     value: 'connections' },
            { label: 'Mint info',           hint: 'mint details, capabilities, and balances',        value: 'mints' },
        ],
    });
    if (choice === null) { print(`  ${c.dim}Cancelled.${c.reset}\n`); return; }
    print('');

    if (choice.value === 'history')     return await historyExport(client, args, true);
    if (choice.value === 'connections') return await connectionsExport(client, args, true);
    if (choice.value === 'mints')       return await mintsExport(client, args, true);
}

// ── History Export ───────────────────────────────────────────────────────

var DATE_PRESETS = [
    { label: 'All time', hint: 'every transaction', value: 'all' },
    { label: 'Last 7 days', value: '7d' },
    { label: 'Last 30 days', value: '30d' },
    { label: 'Last 90 days', value: '90d' },
    { label: 'Custom range', hint: 'enter start and end dates', value: 'custom' },
];

async function historyExport(client, args, interactive) {
    // Scripted
    if (!interactive) {
        var format = args.format || 'csv';
        var query = { format, unpaid: 'true', include_revoked: 'true' };
        if (args.type) query.type = args.type;
        if (args.from) query.from = args.from;
        if (args.until) query.until = args.until;
        if (args.connection) query.connection = args.connection;

        var data = await client.get('/api/v1/history/export', query);
        if (args?.json) return jsonOut(data);

        var outPath = args.out || `nutbits-history-${today()}.${format}`;
        writeExport(outPath, format === 'csv' ? data.csv : JSON.stringify(data, null, 2));

        print('');
        print(`  ${c.ok} ${c.green}Exported ${format === 'csv' ? data.records : data.total} transactions${c.reset} → ${c.white}${c.bold}${outPath}${c.reset}`);
        print('');
        return;
    }

    // Interactive
    print(`  ${c.purple}${c.bold}Export Transaction History${c.reset}`);
    print(`  ${c.muted}Download payments, fees, and metadata as a file.${c.reset}`);
    print('');

    // Format
    var formatChoice = await select({
        message: 'Export format',
        description: 'CSV works with spreadsheets. JSON has full data.',
        options: [
            { label: 'CSV', hint: 'Excel, Google Sheets, accounting tools', value: 'csv' },
            { label: 'JSON', hint: 'complete data, developer-friendly', value: 'json' },
        ],
    });
    if (formatChoice === null) { print(`  ${c.dim}Cancelled.${c.reset}\n`); return; }
    var format = formatChoice.value;
    print('');

    // Type
    var typeChoice = await select({
        message: 'Which transactions?',
        options: [
            { label: 'All transactions', value: null },
            { label: 'Incoming only', hint: 'received payments', value: 'incoming' },
            { label: 'Outgoing only', hint: 'sent payments', value: 'outgoing' },
        ],
    });
    if (typeChoice === null) { print(`  ${c.dim}Cancelled.${c.reset}\n`); return; }
    var type = typeChoice.value;
    print('');

    // Date range
    var dateChoice = await select({ message: 'Time period', options: DATE_PRESETS });
    if (dateChoice === null) { print(`  ${c.dim}Cancelled.${c.reset}\n`); return; }

    var from = null, until = null, fromStr = '', untilStr = '';

    if (dateChoice.value === '7d')  from = Math.floor((Date.now() - 7 * 86400000) / 1000);
    if (dateChoice.value === '30d') from = Math.floor((Date.now() - 30 * 86400000) / 1000);
    if (dateChoice.value === '90d') from = Math.floor((Date.now() - 90 * 86400000) / 1000);
    if (dateChoice.value === 'custom') {
        fromStr = await input({
            message: 'Start date:', placeholder: 'YYYY-MM-DD',
            description: 'Leave empty for no start limit.',
            validate: validateDate,
        });
        if (fromStr === null) { print(`  ${c.dim}Cancelled.${c.reset}\n`); return; }
        if (fromStr) from = Math.floor(new Date(fromStr).getTime() / 1000);

        untilStr = await input({
            message: 'End date:', placeholder: 'YYYY-MM-DD',
            description: 'Leave empty for no end limit.',
            validate: validateDate,
        });
        if (untilStr === null) { print(`  ${c.dim}Cancelled.${c.reset}\n`); return; }
        if (untilStr) until = Math.floor(new Date(untilStr + 'T23:59:59').getTime() / 1000);
    }
    print('');

    // Confirm
    print(`  ${c.dim}${'─'.repeat(50)}${c.reset}`);
    print(kv('Format', `${c.white}${c.bold}${format.toUpperCase()}${c.reset}`));
    print(kv('Type', `${c.muted}${type || 'all'}${c.reset}`));
    print(kv('Period', `${c.muted}${dateChoice.value === 'all' ? 'all time' : dateChoice.value === 'custom' ? `${fromStr || 'start'} → ${untilStr || 'now'}` : dateChoice.label}${c.reset}`));
    print('');

    var ok = await confirm({ message: 'Export now?', initial: true });
    if (ok === null || !ok) { print(`  ${c.dim}Cancelled.${c.reset}\n`); return; }

    // Fetch and write
    var sp = spinner('Exporting transactions');
    sp.start();

    try {
        var query = { format, unpaid: 'true', include_revoked: 'true' };
        if (type) query.type = type;
        if (from) query.from = String(from);
        if (until) query.until = String(until);

        var data = await client.get('/api/v1/history/export', query);
        var outPath = args.out || `nutbits-history-${today()}.${format}`;
        var content = format === 'csv' ? data.csv : JSON.stringify(data, null, 2);
        var count = format === 'csv' ? data.records : data.total;

        writeExport(outPath, content);

        sp.stop(`${c.ok} ${c.green}${c.bold}Export complete!${c.reset}`);
        printFileSummary(outPath, count, 'transactions', format);
    } catch (e) {
        sp.stop(`${c.fail} ${c.red}${c.bold}Export failed${c.reset}`);
        print(`  ${c.red}${e.message}${c.reset}\n`);
    }
}

// ── Connections Export ───────────────────────────────────────────────────

async function connectionsExport(client, args, interactive) {
    // Scripted
    if (!interactive) {
        var query = {};
        if (args.id || args._positional?.[1]) query.id = args.id || args._positional[1];
        if (args['include-revoked']) query.include_revoked = 'true';

        var data = await client.get('/api/v1/connections/export', query);
        if (args?.json) return jsonOut(data);

        // Single connection: print NWC string directly
        if (data.connections.length === 1) {
            var conn = data.connections[0];
            print('');
            print(`  ${c.purple}${c.bold}#${conn.id}${c.reset} ${c.white}${c.bold}${conn.label}${c.reset}`);
            print('');
            if (conn.nwc_string) {
                print(`  ${c.white}${conn.nwc_string}${c.reset}`);
            } else {
                print(`  ${c.dim}NWC string not available (connection may have been restored from backup)${c.reset}`);
            }
            print('');
            return;
        }

        // Multiple: write to file
        var format = args.format || 'json';
        var outPath = args.out || `nutbits-connections-${today()}.${format}`;
        if (format === 'csv') {
            var csv = 'id,label,nwc_string,permissions,mint,max_daily_sats,max_payment_sats,created_at,revoked\n';
            for (var cn of data.connections) {
                csv += `${cn.id},${csvEscape(cn.label)},${csvEscape(cn.nwc_string || '')},${csvEscape((cn.permissions || []).join(' '))},${csvEscape(cn.mint || '')},${cn.max_daily_sats},${cn.max_payment_sats},${cn.created_at || ''},${cn.revoked}\n`;
            }
            writeExport(outPath, csv);
        } else {
            writeExport(outPath, JSON.stringify(data, null, 2));
        }

        print('');
        print(`  ${c.ok} ${c.green}Exported ${data.connections.length} connections${c.reset} → ${c.white}${c.bold}${outPath}${c.reset}`);
        print('');
        return;
    }

    // Interactive
    print(`  ${c.purple}${c.bold}Export NWC Connections${c.reset}`);
    print(`  ${c.muted}Export connection strings, permissions, and settings.${c.reset}`);
    print('');

    var conns;
    try { conns = await client.get('/api/v1/connections'); }
    catch (e) { print(`  ${c.red}${e.message}${c.reset}\n`); return; }

    if (!conns.connections?.length) {
        print(`  ${c.muted}No active connections.${c.reset}\n`);
        return;
    }

    // Choose scope
    var scopeOptions = [
        { label: 'All connections', hint: `${conns.connections.length} active`, value: 'all' },
        ...conns.connections.map(cn => ({
            label: `#${cn.id}  ${cn.label}`,
            hint: (cn.permissions || []).map(shortPerm).join(', '),
            value: String(cn.id),
        })),
    ];

    var scopeChoice = await select({
        message: 'Which connections?',
        description: 'Select a single connection to see its NWC string, or export all.',
        options: scopeOptions,
    });
    if (scopeChoice === null) { print(`  ${c.dim}Cancelled.${c.reset}\n`); return; }
    print('');

    var sp = spinner('Fetching connection data');
    sp.start();

    try {
        var query = scopeChoice.value === 'all' ? {} : { id: scopeChoice.value };
        var data = await client.get('/api/v1/connections/export', query);

        sp.stop(`${c.ok} ${c.green}Done${c.reset}`);

        if (data.connections.length === 0) {
            print(`  ${c.muted}No connections found.${c.reset}\n`);
            return;
        }

        // Single connection: display inline
        if (data.connections.length === 1) {
            var conn = data.connections[0];
            await printConnectionDetail(conn);
            return;
        }

        // Multiple: display summary + offer file export
        for (var conn of data.connections) {
            await printConnectionDetail(conn);
        }

        print(`  ${c.dim}${'─'.repeat(50)}${c.reset}`);
        print('');

        var saveChoice = await confirm({
            message: 'Save to file?',
            initial: true,
            description: 'Exports all connection data including NWC strings.',
        });
        if (saveChoice === null || !saveChoice) { print(''); return; }

        var outPath = args.out || `nutbits-connections-${today()}.json`;
        writeExport(outPath, JSON.stringify(data, null, 2));
        printFileSummary(outPath, data.connections.length, 'connections', 'json');
    } catch (e) {
        sp.stop(`${c.fail} ${c.red}${c.bold}Export failed${c.reset}`);
        print(`  ${c.red}${e.message}${c.reset}\n`);
    }
}

// ── Mints Export ────────────────────────────────────────────────────────

async function mintsExport(client, args, interactive) {
    // Scripted
    if (!interactive) {
        var data = await client.get('/api/v1/mints');
        if (args?.json) return jsonOut(data);

        var format = args.format || 'json';
        var outPath = args.out || `nutbits-mints-${today()}.${format}`;

        if (format === 'csv') {
            var csv = 'name,url,version,active,healthy,balance_sats,nut09,nut12,nut15,nut17,nut20\n';
            for (var m of data.mints) {
                csv += `${csvEscape(m.name)},${csvEscape(m.url)},${csvEscape(m.version || '')},${m.active},${m.healthy ?? ''},${m.balance_sats},${!!m.nuts?.nut09},${!!m.nuts?.nut12},${!!m.nuts?.nut15},${!!m.nuts?.nut17},${!!m.nuts?.nut20}\n`;
            }
            writeExport(outPath, csv);
        } else {
            writeExport(outPath, JSON.stringify(data, null, 2));
        }

        print('');
        print(`  ${c.ok} ${c.green}Exported ${data.mints.length} mints${c.reset} → ${c.white}${c.bold}${outPath}${c.reset}`);
        print('');
        return;
    }

    // Interactive
    print(`  ${c.purple}${c.bold}Export Mint Info${c.reset}`);
    print(`  ${c.muted}Export mint details, NUT capabilities, and balances.${c.reset}`);
    print('');

    var sp = spinner('Fetching mint data');
    sp.start();

    try {
        var data = await client.get('/api/v1/mints');
        var nutData = await client.get('/api/v1/nuts');

        sp.stop(`${c.ok} ${c.green}Done${c.reset}`);

        if (!data.mints?.length) {
            print(`  ${c.muted}No mints configured.${c.reset}\n`);
            return;
        }

        // Display each mint
        for (var m of data.mints) {
            var health = m.healthy !== false ? `${c.green}● healthy${c.reset}` : `${c.red}● down${c.reset}`;
            var active = m.active ? `${c.green}active${c.reset}` : `${c.dim}standby${c.reset}`;

            print(`  ${c.white}${c.bold}${m.name || 'unknown'}${c.reset}  ${active}  ${health}`);
            print(kv('  URL', `${c.dim}${m.url}${c.reset}`));
            print(kv('  Version', `${c.muted}${m.version || '?'}${c.reset}`));
            print(kv('  Balance', `${c.yellow}${c.bold}${(m.balance_sats || 0).toLocaleString()}${c.reset}${c.muted} sats${c.reset}`));

            if (m.motd) print(kv('  MOTD', `${c.yellow}"${m.motd}"${c.reset}`));

            // NUTs
            var caps = m.nuts || {};
            var nutLine = ['00','01','02','03','04','05','06','07','08'].map(n => `${c.green}${n}${c.reset}`);
            for (var n of ['09','12','15','17','20']) {
                nutLine.push(caps[`nut${n}`] ? `${c.green}${n}${c.reset}` : `${c.dim}${n}${c.reset}`);
            }
            print(kv('  NUTs', nutLine.join(' ')));
            print('');
        }

        print(`  ${c.dim}${'─'.repeat(50)}${c.reset}`);
        print('');

        var saveChoice = await confirm({
            message: 'Save to file?',
            initial: true,
        });
        if (saveChoice === null || !saveChoice) { print(''); return; }

        var outPath = args.out || `nutbits-mints-${today()}.json`;
        var exportData = { mints: data.mints, nuts: nutData, exported_at: new Date().toISOString() };
        writeExport(outPath, JSON.stringify(exportData, null, 2));
        printFileSummary(outPath, data.mints.length, 'mints', 'json');
    } catch (e) {
        sp.stop(`${c.fail} ${c.red}${c.bold}Export failed${c.reset}`);
        print(`  ${c.red}${e.message}${c.reset}\n`);
    }
}

// ── Shared Helpers ──────────────────────────────────────────────────────

function today() {
    return new Date().toISOString().slice(0, 10);
}

function writeExport(path, content) {
    fs.writeFileSync(path, content, { encoding: 'utf8', mode: 0o600 });
}

function printFileSummary(path, count, label, format) {
    print('');
    print(kv('File', `${c.white}${c.bold}${path}${c.reset}`));
    print(kv('Records', `${c.white}${count}${c.reset}${c.muted} ${label}${c.reset}`));
    print(kv('Format', `${c.muted}${format.toUpperCase()}${c.reset}`));
    var bytes = fs.statSync(path).size;
    print(kv('Size', `${c.dim}${bytes > 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} bytes`}${c.reset}`));
    print('');
}

async function printConnectionDetail(conn) {
    var status = conn.revoked ? `${c.red}revoked${c.reset}` : `${c.green}active${c.reset}`;
    print(`  ${c.purple}${c.bold}#${conn.id}${c.reset}  ${c.white}${c.bold}${conn.label}${c.reset}  ${status}`);
    print(kv('  Permissions', `${c.muted}${(conn.permissions || []).map(shortPerm).join(', ')}${c.reset}`));
    if (conn.mint) print(kv('  Mint', `${c.dim}${conn.mint.replace(/^https?:\/\//, '')}${c.reset}`));
    if (conn.max_daily_sats) print(kv('  Daily limit', `${c.muted}${conn.max_daily_sats.toLocaleString()} sats${c.reset}`));
    if (conn.max_payment_sats) print(kv('  Per payment', `${c.muted}${conn.max_payment_sats.toLocaleString()} sats${c.reset}`));
    if (conn.service_fee_ppm || conn.service_fee_base) {
        var feeStr = [];
        if (conn.service_fee_ppm) feeStr.push(`${(conn.service_fee_ppm / 10000).toFixed(2)}%`);
        if (conn.service_fee_base) feeStr.push(`${conn.service_fee_base} sat base`);
        print(kv('  Service fee', `${c.muted}${feeStr.join(' + ')}${c.reset}`));
    }
    print('');

    if (conn.nwc_string) {
        // QR Code (if qrcode-terminal is installed)
        if (qrGenerate) {
            print(`  ${c.muted}Scan to connect:${c.reset}`);
            print('');
            var qrText = await qrGenerate(conn.nwc_string);
            for (var line of qrText.split('\n')) {
                if (line.trim()) print('    ' + line);
            }
            print('');
        }

        // NWC string (wrapped for readability)
        print(`  ${c.muted}NWC connection string:${c.reset}`);
        print('');
        var lineWidth = Math.min(68, (process.stdout.columns || 80) - 8);
        var nwc = conn.nwc_string;
        for (var i = 0; i < nwc.length; i += lineWidth) {
            print(`    ${c.white}${nwc.slice(i, i + lineWidth)}${c.reset}`);
        }
    } else {
        print(`    ${c.dim}NWC string not available (connection may have been restored from backup)${c.reset}`);
    }
    print('');
}

function shortPerm(p) {
    if (p === 'pay_invoice') return 'pay';
    if (p === 'make_invoice') return 'receive';
    if (p === 'get_balance') return 'balance';
    if (p === 'list_transactions') return 'history';
    if (p === 'lookup_invoice') return 'lookup';
    if (p === 'get_info') return 'info';
    return p;
}

function csvEscape(val) {
    var s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}

function validateDate(v) {
    if (!v) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'Use YYYY-MM-DD format';
    if (isNaN(new Date(v).getTime())) return 'Invalid date';
    return null;
}
