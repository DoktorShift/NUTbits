import { c } from '../colors.js';
import { table, sats, heading, print, jsonOut } from '../render.js';

export async function run(client, args) {
    var d = await client.get('/api/v1/balance');
    if (args?.json) return jsonOut(d);

    var headers = ['Mint', 'Proofs', 'Sats', 'Status'];
    var rows = d.mints.map(m => [
        `${c.dim}${m.url}${c.reset}`,
        `${c.muted}${m.proofs}${c.reset}`,
        sats(m.sats),
        m.active ? `${c.dot.ok} active` : m.healthy ? `${c.dot.warn} standby` : `${c.dot.err} down`,
    ]);

    print(heading('Balance'));
    print(table(headers, rows, { alignRight: [1, 2] }));
    print(`\n  ${c.dim}${'─'.repeat(60)}${c.reset}`);
    print(`  ${'Total'.padEnd(46)}${sats(d.total_sats)}`);
    print('');
}
