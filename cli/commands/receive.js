import { c } from '../colors.js';
import { box, kv, sats, print, jsonOut } from '../render.js';
import { input, spinner } from '../prompts.js';

export async function run(client, args) {
    var amount = args._positional?.[0] || null;

    if (!amount) {
        amount = await input({ message: 'Amount in sats:', validate: v => isNaN(Number(v)) || Number(v) <= 0 ? 'Enter a positive number' : null });
    }
    amount = Number(amount);
    if (!amount || amount <= 0) { print(`  ${c.red}Valid amount is required.${c.reset}\n`); return; }

    var result = await client.post('/api/v1/receive', { amount_sats: amount });
    if (args?.json) return jsonOut(result);

    print('');
    print(`  Creating invoice for ${c.yellow}${c.bold}${amount.toLocaleString()}${c.reset}${c.muted} sats${c.reset}`);
    print(`  ${c.dim}Mint: ${result.mint}${c.reset}`);
    print('');
    print(box(['', `  ${c.bold}${result.invoice}${c.reset}`, '']));

    if (args['no-wait']) {
        print(`  ${c.dim}Invoice created. Use ${c.white}nutbits history${c.dim} to check status.${c.reset}\n`);
        return;
    }

    // Poll for payment
    var sp = spinner('Waiting for payment');
    sp.start();

    var maxAttempts = 120;
    for (var i = 0; i < maxAttempts; i++) {
        await new Promise(r => setTimeout(r, 5000));
        try {
            var check = await client.post('/api/v1/receive/check', {
                quote_id: result.quote_id,
                invoice: result.invoice,
                mint: result.mint,
            });
            if (check.paid) {
                sp.stop(`${c.ok} ${c.green}${amount.toLocaleString()} sats received${c.reset}`);
                print(kv('Balance', sats(check.balance_sats)));
                print('');
                return;
            }
        } catch (e) { /* keep polling */ }
    }

    sp.stop(`${c.dim}Timed out waiting. The invoice may still be paid later.${c.reset}`);
    print(`  ${c.dim}Check with ${c.white}nutbits history --unpaid${c.reset}\n`);
}
