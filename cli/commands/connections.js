import { c } from '../colors.js';
import { table, sats, heading, print, jsonOut } from '../render.js';

export async function run(client, args) {
    var d = await client.get('/api/v1/connections');
    if (args?.json) return jsonOut(d);

    if (d.connections.length === 0) {
        print(heading('Connections'));
        print(`  ${c.muted}No active connections.${c.reset}`);
        print(`  ${c.dim}Run ${c.white}nutbits connect${c.dim} to create one.${c.reset}`);
        print('');
        return;
    }

    var headers = ['ID', 'Label', 'Permissions', 'Balance', 'Txs', 'Created'];
    var rows = d.connections.map(conn => {
        var permShort = (conn.permissions || []).map(p => {
            if (p === 'pay_invoice') return 'pay';
            if (p === 'make_invoice') return 'receive';
            if (p === 'get_balance') return 'balance';
            if (p === 'list_transactions') return 'history';
            if (p === 'lookup_invoice') return 'history';
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

    print(heading('Connections'));
    print(table(headers, rows, { alignRight: [3, 4] }));
    print('');
}
