import { c } from '../colors.js';
import { kv, heading, print, jsonOut } from '../render.js';
import { input, select, spinner } from '../prompts.js';

export async function run(client, args) {
    var connId = args._positional?.[0] || null;
    var amount = args._positional?.[1] ? Number(args._positional[1]) : null;

    // Fetch connections
    var d = await client.get('/api/v1/connections');
    var dedicated = d.connections.filter(c => c.dedicated);

    if (dedicated.length === 0) {
        print('');
        print(`  ${c.muted}No dedicated connections to fund.${c.reset}`);
        print(`  ${c.dim}Create one with ${c.white}nutbits connect${c.dim} or via deeplink.${c.reset}`);
        print('');
        return;
    }

    // Select connection (interactive or by ID)
    var conn = null;
    if (connId) {
        conn = dedicated.find(c => String(c.id) === String(connId) || c.label === connId);
        if (!conn) {
            print(`  ${c.red}Dedicated connection not found: ${connId}${c.reset}\n`);
            return;
        }
    } else {
        print(heading('Fund Connection'));
        print(`  ${c.muted}Add sats to a dedicated connection's balance.${c.reset}`);
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

    // Get amount (interactive or from args)
    if (!amount || amount <= 0) {
        var dedBal = Math.floor((conn.dedicated_balance_msat || 0) / 1000);
        print('');
        print(kv('  Connection', `${c.white}${c.bold}${conn.label}${c.reset}`));
        print(kv('  Current balance', `${c.yellow}${dedBal.toLocaleString()}${c.reset} sats`));
        print('');

        var amountStr = await input({
            message: 'Amount to fund (sats):',
            placeholder: 'e.g. 5000',
            validate: v => {
                if (!v || isNaN(Number(v)) || Number(v) <= 0) return 'Enter a positive number';
                return null;
            },
        });
        if (amountStr === null) { print(`  ${c.dim}Cancelled.${c.reset}\n`); return; }
        amount = Number(amountStr);
    }

    // Fund
    var sp = spinner(`Funding ${amount.toLocaleString()} sats`);
    sp.start();

    try {
        var result = await client.post(`/api/v1/connections/${conn.app_pubkey}/fund`, { amount_sats: amount });
        if (args?.json) { sp.stop(''); return jsonOut(result); }

        sp.stop(`${c.ok} ${c.green}${c.bold}Funded!${c.reset}`);
        print('');
        print(kv('  Connection', `${c.white}${conn.label}${c.reset}`));
        print(kv('  Added', `${c.green}+${amount.toLocaleString()}${c.reset} sats`));
        print(kv('  New balance', `${c.yellow}${c.bold}${result.dedicated_balance_sats.toLocaleString()}${c.reset} sats`));
        print('');
    } catch (e) {
        sp.stop(`${c.red}Failed${c.reset}`);
        print(`  ${c.red}${e.message}${c.reset}\n`);
    }
}
