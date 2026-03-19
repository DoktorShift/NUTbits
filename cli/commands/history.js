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
        print(`  ${c.muted}No transactions yet.${c.reset}\n`);
        return;
    }

    var headers = ['Time', 'Type', 'Amount', 'Status', 'Connection', 'Hash'];
    var rows = d.transactions.map(tx => {
        var time = tx.created_at ? relativeTime(tx.created_at * 1000) : '—';
        var type = tx.type === 'incoming' ? `${c.green}incoming${c.reset}` : `${c.red}outgoing${c.reset}`;
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
    print(`\n  ${c.dim}Showing ${d.transactions.length} of ${d.total} transactions${c.reset}\n`);
}
