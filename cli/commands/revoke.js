import { c } from '../colors.js';
import { select, confirm } from '../prompts.js';
import { heading, print, jsonOut } from '../render.js';

export async function run(client, args) {
    var targetId = args._positional?.[0] || null;

    // If no ID given, interactive selection
    if (!targetId) {
        var d = await client.get('/api/v1/connections');
        if (d.connections.length === 0) {
            print(`\n  ${c.muted}No active connections to revoke.${c.reset}\n`);
            return;
        }

        var choice = await select({
            message: 'Which connection?',
            options: d.connections.map(conn => {
                var perms = (conn.permissions || []).map(p => {
                    if (p === 'pay_invoice') return 'pay';
                    if (p === 'make_invoice') return 'receive';
                    if (p === 'get_balance') return 'balance';
                    return '';
                }).filter(Boolean).join(' ');
                return {
                    label: `#${conn.id}  ${conn.label}`,
                    hint: `${perms}  ${Math.floor(conn.balance_msat / 1000).toLocaleString()} sats`,
                    value: conn,
                };
            }),
        });
        targetId = choice.value.id;
    }

    // Resolve ID to pubkey
    var d = await client.get('/api/v1/connections');
    var conn = d.connections.find(item => item.id === Number(targetId));
    if (!conn) {
        print(`\n  ${c.red}Connection #${targetId} not found.${c.reset}\n`);
        return;
    }

    // Confirmation
    if (!args.force) {
        print('');
        print(`  Revoke connection ${c.purple}#${conn.id}${c.reset} (${c.white}${conn.label}${c.reset})?`);
        print(`  ${c.dim}This disconnects immediately. Transaction history is kept.${c.reset}`);
        print('');
        var ok = await confirm({ message: 'Revoke?', initial: false });
        if (!ok) { print(`  ${c.dim}Cancelled.${c.reset}\n`); return; }
    }

    var result = await client.delete(`/api/v1/connections/${conn.app_pubkey}`);
    if (args?.json) return jsonOut({ ...result, id: conn.id, label: conn.label });

    print('');
    print(`  ${c.ok} Connection ${c.purple}#${conn.id}${c.reset} revoked`);
    print(`  ${c.dim}Relays disconnected. ${d.connections.length - 1} active connections remaining.${c.reset}`);
    print('');
}
