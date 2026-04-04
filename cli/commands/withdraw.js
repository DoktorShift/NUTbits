import { c } from '../colors.js';
import { kv, heading, print, jsonOut } from '../render.js';
import { input, select, confirm, spinner } from '../prompts.js';

export async function run(client, args) {
    var connId = args._positional?.[0] || null;
    var amount = args._positional?.[1] ? Number(args._positional[1]) : null;
    var all = args.all || false;

    // Fetch connections
    var d = await client.get('/api/v1/connections');
    var dedicated = d.connections.filter(c => c.dedicated && (c.dedicated_balance_msat || 0) > 0);

    if (dedicated.length === 0) {
        print('');
        print(`  ${c.muted}No dedicated connections with balance to withdraw from.${c.reset}`);
        print('');
        return;
    }

    // Select connection
    var conn = null;
    if (connId) {
        conn = dedicated.find(c => String(c.id) === String(connId) || c.label === connId);
        if (!conn) {
            print(`  ${c.red}Connection not found or has no balance: ${connId}${c.reset}\n`);
            return;
        }
    } else {
        print(heading('Withdraw'));
        print(`  ${c.muted}Pull sats from a dedicated connection back to the main wallet.${c.reset}`);
        print('');

        var choice = await select({
            message: 'Which connection?',
            options: dedicated.map(c => ({
                label: `#${c.id}  ${c.label}`,
                hint: `${Math.floor((c.dedicated_balance_msat || 0) / 1000).toLocaleString()} sats`,
                value: c,
            })),
        });
        if (choice === null) { print(`  ${c.dim}Cancelled.${c.reset}\n`); return; }
        conn = choice.value;
    }

    var dedBal = Math.floor((conn.dedicated_balance_msat || 0) / 1000);

    // Determine amount
    if (all) {
        amount = 0; // API treats 0 as "withdraw all"
    } else if (!amount || amount <= 0) {
        print('');
        print(kv('  Connection', `${c.white}${c.bold}${conn.label}${c.reset}`));
        print(kv('  Available', `${c.yellow}${dedBal.toLocaleString()}${c.reset} sats`));
        print('');

        var withdrawChoice = await select({
            message: 'How much?',
            options: [
                { label: `All (${dedBal.toLocaleString()} sats)`, value: 0 },
                { label: 'Custom amount', value: -1 },
            ],
        });
        if (withdrawChoice === null) { print(`  ${c.dim}Cancelled.${c.reset}\n`); return; }

        if (withdrawChoice.value === -1) {
            var amountStr = await input({
                message: 'Amount to withdraw (sats):',
                placeholder: `max ${dedBal.toLocaleString()}`,
                validate: v => {
                    if (!v || isNaN(Number(v)) || Number(v) <= 0) return 'Enter a positive number';
                    if (Number(v) > dedBal) return `Only ${dedBal.toLocaleString()} sats available`;
                    return null;
                },
            });
            if (amountStr === null) { print(`  ${c.dim}Cancelled.${c.reset}\n`); return; }
            amount = Number(amountStr);
        } else {
            amount = 0;
        }
    }

    // Withdraw
    var label = amount === 0 ? `all ${dedBal.toLocaleString()} sats` : `${amount.toLocaleString()} sats`;
    var sp = spinner(`Withdrawing ${label}`);
    sp.start();

    try {
        var result = await client.post(`/api/v1/connections/${conn.app_pubkey}/withdraw`, { amount_sats: amount });
        if (args?.json) { sp.stop(''); return jsonOut(result); }

        sp.stop(`${c.ok} ${c.green}${c.bold}Withdrawn!${c.reset}`);
        print('');
        print(kv('  Connection', `${c.white}${conn.label}${c.reset}`));
        print(kv('  Withdrawn', `${c.yellow}${result.withdrawn_sats.toLocaleString()}${c.reset} sats`));
        print(kv('  Remaining', `${c.muted}${result.dedicated_balance_sats.toLocaleString()}${c.reset} sats`));
        print('');
    } catch (e) {
        sp.stop(`${c.red}Failed${c.reset}`);
        print(`  ${c.red}${e.message}${c.reset}\n`);
    }
}
