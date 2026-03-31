import { c } from '../colors.js';
import { table, sats, kv, heading, print, jsonOut } from '../render.js';

// Try to load QR code renderer (optional dependency)
var qrGenerate = null;
try {
    var qrt = await import('qrcode-terminal');
    qrGenerate = (text) => new Promise(resolve => {
        qrt.default.generate(text, { small: true }, resolve);
    });
} catch (e) { /* qrcode-terminal not installed - skip QR */ }

export async function run(client, args) {
    var id = args._positional?.[0] || null;

    // ── Single connection detail: nutbits connections <id> ─────────
    if (id) {
        var query = { id };
        var data = await client.get('/api/v1/connections/export', query);
        if (args?.json) return jsonOut(data);

        if (!data.connections?.length) {
            print(`  ${c.red}Connection not found: ${id}${c.reset}\n`);
            return;
        }

        var conn = data.connections[0];
        var status = conn.revoked ? `${c.red}revoked${c.reset}` : `${c.green}active${c.reset}`;

        print('');
        print(`  ${c.purple}${c.bold}#${conn.id}${c.reset}  ${c.white}${c.bold}${conn.label}${c.reset}  ${status}`);
        print('');

        var permLabel = p => {
            if (p === 'pay_invoice') return `${c.red}pay${c.reset}`;
            if (p === 'make_invoice') return `${c.green}recv${c.reset}`;
            if (p === 'get_balance') return `${c.yellow}bal${c.reset}`;
            if (p === 'list_transactions' || p === 'lookup_invoice') return `${c.muted}hist${c.reset}`;
            if (p === 'get_info') return `${c.muted}info${c.reset}`;
            return '';
        };
        var perms = (conn.permissions || []).map(permLabel).filter((v, i, a) => a.indexOf(v) === i).filter(Boolean);
        print(kv('  Permissions', perms.join(`${c.dim} | ${c.reset}`)));
        if (conn.mint) print(kv('  Mint', `${c.dim}${conn.mint.replace(/^https?:\/\//, '')}${c.reset}`));
        if (conn.max_daily_sats) print(kv('  Daily limit', `${c.muted}${conn.max_daily_sats.toLocaleString()} sats${c.reset}`));
        if (conn.max_payment_sats) print(kv('  Per payment', `${c.muted}${conn.max_payment_sats.toLocaleString()} sats${c.reset}`));
        if (conn.service_fee_ppm || conn.service_fee_base) {
            var feeStr = [];
            if (conn.service_fee_ppm) feeStr.push(`${(conn.service_fee_ppm / 10000).toFixed(2)}%`);
            if (conn.service_fee_base) feeStr.push(`${conn.service_fee_base} sat base`);
            print(kv('  Service fee', `${c.muted}${feeStr.join(' + ')}${c.reset}`));
        }
        if (conn.lud16) print(kv('  Lightning Address', `${c.cyan}${conn.lud16}${c.reset}`));
        if (conn.created_at) print(kv('  Created', `${c.dim}${new Date(conn.created_at * 1000).toLocaleString()}${c.reset}`));
        print('');

        if (conn.nwc_string) {
            print(`  ${c.dim}${'─'.repeat(50)}${c.reset}`);
            print('');

            // QR Code
            if (qrGenerate) {
                print(`  ${c.muted}Scan to connect:${c.reset}`);
                print('');
                var qrText = await qrGenerate(conn.nwc_string);
                for (var line of qrText.split('\n')) {
                    if (line.trim()) print('    ' + line);
                }
                print('');
            }

            // NWC string (wrapped)
            print(`  ${c.muted}NWC connection string:${c.reset}`);
            print('');
            var lineWidth = Math.min(68, (process.stdout.columns || 80) - 8);
            var nwc = conn.nwc_string;
            for (var i = 0; i < nwc.length; i += lineWidth) {
                print(`    ${c.white}${nwc.slice(i, i + lineWidth)}${c.reset}`);
            }
            print('');
            print(`  ${c.dim}Paste this string into LNbits, Alby, or any NWC-compatible app.${c.reset}`);
        } else {
            print(`  ${c.dim}NWC string not available (connection may have been restored from backup)${c.reset}`);
        }
        print('');
        return;
    }

    // ── Connection list: nutbits connections ───────────────────────
    var d = await client.get('/api/v1/connections');
    if (args?.json) return jsonOut(d);

    if (d.connections.length === 0) {
        print(heading('Connections'));
        print(`  ${c.muted}No active connections.${c.reset}`);
        print(`  ${c.dim}Run ${c.white}nutbits connect${c.dim} to create one.${c.reset}`);
        print('');
        return;
    }

    var headers = ['ID', 'Label', 'Permissions', 'Balance', 'Tx', 'Created'];
    var rows = d.connections.map(conn => {
        var permShort = (conn.permissions || []).map(p => {
            if (p === 'pay_invoice') return 'pay';
            if (p === 'make_invoice') return 'recv';
            if (p === 'get_balance') return 'bal';
            if (p === 'list_transactions') return 'hist';
            if (p === 'lookup_invoice') return 'hist';
            if (p === 'get_info') return 'info';
            return p;
        }).filter((v, i, a) => a.indexOf(v) === i).join(' ');

        var created = conn.created_at ? new Date(conn.created_at * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';

        return [
            `${c.purple}#${conn.id}${c.reset}`,
            `${c.white}${conn.label}${c.reset}`,
            `${c.muted}${permShort}${c.reset}`,
            sats(Math.floor((conn.balance_msat || 0) / 1000)),
            `${c.muted}${conn.tx_count}${c.reset}`,
            `${c.dim}${created}${c.reset}`,
        ];
    });

    print(heading('NWC Connections'));
    print(table(headers, rows, { alignRight: [3, 4] }));
    print('');
    print(`  ${c.dim}${d.connections.length} active.${c.reset}  ${c.dim}Show details: ${c.white}nutbits connections <id>${c.dim} · Manage: ${c.white}nutbits connect${c.dim} (new) · ${c.white}nutbits revoke${c.dim} (remove)${c.reset}`);
    print('');
}
