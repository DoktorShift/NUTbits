import { c } from '../colors.js';
import { table, heading, print, jsonOut } from '../render.js';

export async function run(client, args) {
    var d = await client.get('/api/v1/relays');
    if (args?.json) return jsonOut(d);

    if (d.relays.length === 0) {
        print(heading('Nostr Relays'));
        print(`  ${c.muted}No relays configured.${c.reset}`);
        print(`  ${c.dim}Set in .env: ${c.white}NUTBITS_RELAYS=wss://relay.getalby.com${c.reset}`);
        print('');
        return;
    }

    var headers = ['Relay URL', 'Status', 'NWC Links'];
    var rows = d.relays.map(r => [
        `${c.dim}${r.url}${c.reset}`,
        r.connected ? `${c.dot.ok} connected` : `${c.dot.err} disconnected`,
        r.subscriptions > 0 ? `${c.muted}${r.subscriptions} active${c.reset}` : `${c.dim}—${c.reset}`,
    ]);

    print(heading('Nostr Relays'));
    print(table(headers, rows));
    print('');
    print(`  ${c.muted}${d.connected}/${d.total} connected.${c.reset} ${c.dim}Relays carry NWC messages between your wallet and apps.${c.reset}`);
    print('');
}
