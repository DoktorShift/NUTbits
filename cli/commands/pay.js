import { c } from '../colors.js';
import { kv, sats, print, jsonOut } from '../render.js';
import { confirm, input, spinner } from '../prompts.js';

export async function run(client, args) {
    var invoice = args._positional?.[0] || null;

    if (!invoice) {
        invoice = await input({ message: 'Invoice:', placeholder: 'lnbc...' });
    }
    if (!invoice?.trim()) { print(`  ${c.red}Invoice is required.${c.reset}\n`); return; }
    invoice = invoice.trim();

    if (args?.json) {
        var result = await client.post('/api/v1/pay', { invoice });
        return jsonOut(result);
    }

    // Decode info (basic extraction from invoice)
    print('');
    var sp = spinner('Paying...');
    sp.start();

    try {
        var result = await client.post('/api/v1/pay', { invoice });
        sp.stop(`${c.ok} Payment settled`);

        print('');
        if (result.preimage) print(kv('Preimage', `${c.dim}${result.preimage}${c.reset}`));
        if (result.fees_paid) print(kv('Fees paid', `${c.muted}${Math.floor(result.fees_paid / 1000)} sats${c.reset}`));
        print(kv('Balance', sats(result.balance_sats)));
        print('');
    } catch (e) {
        sp.stop(`${c.fail} ${c.red}Payment failed${c.reset}`);
        print(`  ${c.dim}${e.message}${c.reset}\n`);
    }
}
