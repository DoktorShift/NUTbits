import { c } from '../colors.js';
import { table, sats, kv, heading, relativeTime, print, jsonOut } from '../render.js';

export async function run(client, args) {
    var d = await client.get('/api/v1/mints');
    if (args?.json) return jsonOut(d);

    var headers = ['#', 'Name', 'URL', 'Health', 'Balance', 'NUTs'];
    var rows = d.mints.map((m, i) => {
        var nutStr = Object.entries(m.nuts || {}).filter(([, v]) => v).map(([k]) => k).join(' ');
        var health = m.healthy === true ? `${c.dot.ok} healthy`
            : m.healthy === false ? `${c.dot.err} down`
            : `${c.dot.off} unknown`;
        return [
            `${c.muted}${i + 1}${c.reset}`,
            `${c.white}${m.name}${c.reset}`,
            `${c.dim}${m.url}${c.reset}`,
            health,
            sats(m.balance_sats),
            `${c.dim}${nutStr}${c.reset}`,
        ];
    });

    print(heading('Configured Mints'));
    print(table(headers, rows, { alignRight: [4] }));
    print('');

    var active = d.mints.find(m => m.active);
    if (active) {
        print(kv('Active', `${c.green}${active.name}${c.reset} ${c.dim}(${active.url})${c.reset}`));
        if (active.last_check) print(kv('Last check', relativeTime(active.last_check)));
        if (active.motd) print(kv('MOTD', `${c.yellow}"${active.motd}"${c.reset}`));
    }
    if (d.mints.length > 1) print(kv('Failover', `${c.muted}${d.mints.length} mints configured${c.reset}`));
    print('');
}
