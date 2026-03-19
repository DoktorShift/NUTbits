import { c } from '../colors.js';
import { table, heading, print, jsonOut } from '../render.js';

export async function run(client, args) {
    var d = await client.get('/api/v1/relays');
    if (args?.json) return jsonOut(d);

    if (d.relays.length === 0) {
        print(heading('Relays'));
        print(`  ${c.muted}No relays configured.${c.reset}\n`);
        return;
    }

    var headers = ['URL', 'Status', 'Subscriptions'];
    var rows = d.relays.map(r => [
        `${c.dim}${r.url}${c.reset}`,
        r.connected ? `${c.dot.ok} connected` : `${c.dot.err} disconnected`,
        r.subscriptions > 0 ? `${c.muted}${r.subscriptions} connections${c.reset}` : `${c.dim}—${c.reset}`,
    ]);

    print(heading('Relays'));
    print(table(headers, rows));
    print(`\n  ${c.muted}${d.connected}/${d.total} connected${c.reset}\n`);
}
