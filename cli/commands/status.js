import { c } from '../colors.js';
import { box, kv, sats, uptime, print, jsonOut } from '../render.js';

export async function run(client, args) {
    var d = await client.get('/api/v1/status');
    if (args?.json) return jsonOut(d);

    var nutList = '';
    if (d.nuts) {
        var all = ['00','01','02','03','04','05','06','07','08','09','12','13','15','17','20'];
        nutList = all.map(n => {
            var supported = Number(n) <= 8 ? true : d.nuts[`nut${n}`];
            return supported ? `${c.green}${n}${c.reset}` : `${c.dim}${n}${c.reset}`;
        }).join(' ');
    }

    var lines = [
        `${c.green}${c.bold}NUTbits is running${c.reset}`,
        '',
        kv('Mint', `${c.bold}${d.mint.name}${c.reset}`),
        kv('', `${c.dim}${d.mint.url}${c.reset}`),
        kv('Version', d.mint.version),
        kv('Balance', sats(d.balance_sats)),
        kv('Storage', d.storage),
        kv('Relays', `${d.relays.connected}/${d.relays.total} connected`),
        kv('Seed', d.seed_configured ? `${c.dot.ok} configured` : `${c.dot.err} not set`),
        kv('Connections', `${d.connections_count} active`),
        '',
        kv('NUTs', nutList || `${c.dim}(none detected)${c.reset}`),
    ];

    if (d.mint.motd) lines.push('', kv('MOTD', `${c.yellow}"${d.mint.motd}"${c.reset}`));
    if (d.limits.max_payment_sats) lines.push(kv('Limit', `${d.limits.max_payment_sats.toLocaleString()} sats/payment`));
    if (d.limits.daily_limit_sats) lines.push(kv('Limit', `${d.limits.daily_limit_sats.toLocaleString()} sats/day`));

    print('');
    print(box(lines, { title: `${c.purple}${c.bold}NUTbits${c.reset} ${c.dim}v${d.version}${c.reset}                          ${c.muted}uptime: ${uptime(d.uptime_ms)}${c.reset}` }));
    print('');
}
