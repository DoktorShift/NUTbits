import { c } from '../colors.js';
import { table, sats, heading, relativeTime, print, jsonOut } from '../render.js';

export async function run(client, args) {
    if (args?.json) {
        var query = {};
        if (args.limit) query.limit = args.limit;
        if (args.type) query.type = args.type;
        if (args.connection) query.connection = args.connection;
        if (args.unpaid) query.unpaid = 'true';
        return jsonOut(await client.get('/api/v1/history', query));
    }
    var query = {};
    if (args.limit) query.limit = args.limit;
    if (args.type) query.type = args.type;
    if (args.connection) query.connection = args.connection;
    if (args.from) query.from = args.from;
    if (args.until) query.until = args.until;
    if (args.unpaid) query.unpaid = 'true';

    var d = await client.get('/api/v1/history', query);

    if (d.transactions.length === 0) {
        print(heading('Transactions'));
        if (args.unpaid) {
            print(`  ${c.muted}No pending invoices.${c.reset}`);
        } else if (args.type) {
            print(`  ${c.muted}No ${args.type} transactions found.${c.reset}`);
        } else {
            print(`  ${c.muted}No transactions yet.${c.reset}`);
            print(`  ${c.dim}Start with: ${c.white}nutbits receive 1000${c.dim}  to receive your first sats.${c.reset}`);
        }
        print('');
        return;
    }

    var headers = ['Time', 'Type', 'Amount', 'Status', 'Connection', 'Hash'];
    var rows = d.transactions.map(tx => {
        var time = tx.created_at ? relativeTime(tx.created_at * 1000) : '—';
        var type = tx.type === 'incoming' ? `${c.green}← in${c.reset}` : `${c.red}→ out${c.reset}`;
        var amount = sats(Math.floor((tx.amount || 0) / 1000));
        var status = tx.settled_at ? `${c.green}settled${c.reset}`
            : tx.err_msg ? `${c.red}failed${c.reset}`
            : `${c.yellow}pending${c.reset}`;
        var conn = `${c.muted}${tx.connection_label || '—'}${c.reset}`;
        var hash = `${c.dim}${(tx.payment_hash || '').slice(0, 8)}…${c.reset}`;
        return [time, type, amount, status, conn, hash];
    });

    print(heading('Recent Transactions'));
    print(table(headers, rows, { alignRight: [2] }));
    print('');
    print(`  ${c.dim}Showing ${d.transactions.length} of ${d.total}${c.reset}`);
    if (d.total > 20) print(`  ${c.dim}Use ${c.white}nutbits export history${c.dim} to download all as CSV/JSON.${c.reset}`);
    print('');
}
