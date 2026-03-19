import { c } from '../colors.js';
import { select, confirm } from '../prompts.js';
import { heading, print, jsonOut } from '../render.js';

export async function run(client, args) {
    var targetId = args._positional?.[0] || null;

    // If no ID given, interactive selection
    if (!targetId) {
        print('');
        print(`  ${c.purple}${c.bold}Revoke Connection${c.reset}`);
        print(`  ${c.muted}Permanently disconnect an NWC connection. The app will${c.reset}`);
        print(`  ${c.muted}no longer be able to access your wallet.${c.reset}`);
        print('');

        var d = await client.get('/api/v1/connections');
        if (d.connections.length === 0) {
            print(`  ${c.muted}No active connections to revoke.${c.reset}\n`);
            return;
        }

        var choice = await select({
            message: 'Which connection do you want to revoke?',
            description: 'Select the connection to disconnect permanently.',
            options: d.connections.map(conn => {
                var perms = (conn.permissions || []).map(p => {
                    if (p === 'pay_invoice') return 'pay';
                    if (p === 'make_invoice') return 'receive';
                    if (p === 'get_balance') return 'balance';
                    return '';
                }).filter(Boolean).join(', ');
                return {
                    label: `#${conn.id}  ${conn.label}`,
                    hint: `${perms}`,
                    value: conn,
                };
            }),
        });
        if (choice === null) { print(`  ${c.dim}Cancelled. No connections were revoked.${c.reset}\n`); return; }
        targetId = choice.value.id;
    }

    // Resolve ID to pubkey
    var d = d || await client.get('/api/v1/connections');
    var conn = d.connections.find(item => item.id === Number(targetId));
    if (!conn) {
        print(`\n  ${c.red}Connection #${targetId} not found.${c.reset}\n`);
        return;
    }

    // Confirmation
    if (!args.force) {
        print('');
        var ok = await confirm({
            message: `Revoke "${conn.label}" (#${conn.id})?`,
            initial: false,
            description: 'The app will immediately lose access. Transaction history is kept.',
        });
        if (ok === null || !ok) { print(`  ${c.dim}Cancelled. Connection is still active.${c.reset}\n`); return; }
    }

    var result = await client.delete(`/api/v1/connections/${conn.app_pubkey}`);
    if (args?.json) return jsonOut({ ...result, id: conn.id, label: conn.label });

    print('');
    print(`  ${c.ok} ${c.green}Connection "${conn.label}" revoked${c.reset}`);
    print(`  ${c.dim}Relay subscriptions closed. ${d.connections.length - 1} active connection${d.connections.length - 1 !== 1 ? 's' : ''} remaining.${c.reset}`);
    print('');
}
