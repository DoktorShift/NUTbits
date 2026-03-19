import { c } from '../colors.js';
import { box, kv, heading, print, jsonOut } from '../render.js';
import { input, multiSelect, select, confirm } from '../prompts.js';

// Permission options for the interactive menu
var PERM_OPTIONS = [
    { label: 'Pay invoices', hint: 'send sats over Lightning', value: 'pay' },
    { label: 'Receive payments', hint: 'create invoices to receive sats', value: 'receive' },
    { label: 'Check balance', hint: 'read the current balance', value: 'balance' },
    { label: 'View history', hint: 'see past transactions', value: 'history' },
    { label: 'Wallet info', hint: 'read mint and wallet metadata', value: 'info' },
];

var DAILY_LIMIT_OPTIONS = [
    { label: 'No limit', value: 0 },
    { label: '1,000 sats/day', value: 1000 },
    { label: '5,000 sats/day', value: 5000 },
    { label: '10,000 sats/day', value: 10000 },
    { label: '50,000 sats/day', value: 50000 },
    { label: 'Custom', value: -1 },
];

var PAYMENT_LIMIT_OPTIONS = [
    { label: 'No limit', value: 0 },
    { label: '100 sats', value: 100 },
    { label: '500 sats', value: 500 },
    { label: '1,000 sats', value: 1000 },
    { label: '5,000 sats', value: 5000 },
    { label: 'Custom', value: -1 },
];

export async function run(client, args) {
    // Scripted mode: all flags provided
    if (args.label) {
        return await createScripted(client, args);
    }

    // Interactive mode
    print(heading('New Connection'));

    // 1. Label
    var label = await input({ message: 'Name:', placeholder: 'e.g. lnbits-main' });
    if (!label.trim()) { print(`  ${c.red}Name is required.${c.reset}`); return; }

    // 2. Permissions
    var permChoices = await multiSelect({
        message: 'What can this connection do?',
        options: PERM_OPTIONS,
        initial: [0, 1, 2],  // pay, receive, balance pre-selected
    });
    var permissions = permChoices.map(p => p.value);
    if (permissions.length === 0) { print(`  ${c.red}At least one permission is required.${c.reset}`); return; }

    // 3. Daily limit
    var dailyChoice = await select({ message: 'Set a daily spending limit?', options: DAILY_LIMIT_OPTIONS });
    var maxDaily = dailyChoice.value;
    if (maxDaily === -1) {
        var custom = await input({ message: 'Daily limit (sats):', validate: v => isNaN(Number(v)) ? 'Enter a number' : null });
        maxDaily = Number(custom);
    }

    // 4. Per-payment limit
    var paymentChoice = await select({ message: 'Max per payment?', options: PAYMENT_LIMIT_OPTIONS });
    var maxPayment = paymentChoice.value;
    if (maxPayment === -1) {
        var custom = await input({ message: 'Max per payment (sats):', validate: v => isNaN(Number(v)) ? 'Enter a number' : null });
        maxPayment = Number(custom);
    }

    // 5. Mint selection (multi-mint only)
    var mint = null;
    try {
        var mints = await client.get('/api/v1/mints');
        if (mints.mints.length > 1) {
            var mintChoice = await select({
                message: 'Which mint?',
                options: mints.mints.map(m => ({
                    label: m.name || m.url,
                    hint: `${m.active ? '● active' : '● standby'}  ${m.balance_sats.toLocaleString()} sats`,
                    value: m.url,
                })),
            });
            mint = mintChoice.value;
        }
    } catch (e) { /* single mint, skip */ }

    // 6. Summary + confirmation
    print('');
    print(`  ${c.dim}${'─'.repeat(50)}${c.reset}`);
    print('');
    print(kv('Name', `${c.white}${label}${c.reset}`));
    print(kv('Permissions', `${c.muted}${permissions.join(', ')}${c.reset}`));
    print(kv('Daily limit', maxDaily ? `${maxDaily.toLocaleString()} sats` : 'no limit'));
    print(kv('Per payment', maxPayment ? `${maxPayment.toLocaleString()} sats` : 'no limit'));
    if (mint) print(kv('Mint', `${c.dim}${mint}${c.reset}`));
    print('');

    var ok = await confirm({ message: 'Create this connection?', initial: true });
    if (!ok) { print(`  ${c.dim}Cancelled.${c.reset}`); return; }

    // Create
    var body = {
        label: label.trim(),
        permissions,
        max_daily_sats: maxDaily,
        max_payment_sats: maxPayment,
    };
    if (mint) body.mint = mint;

    var result = await client.post('/api/v1/connections', body);

    print('');
    print(`  ${c.ok} Connection created`);
    print('');
    print(box([
        '',
        `  ${c.bold}${result.nwc_string}${c.reset}`,
        '',
    ]));
    print(`  ${c.dim}Save this now — it won't be shown again.${c.reset}`);
    print('');
}

async function createScripted(client, args) {
    var body = {
        label: args.label,
        permissions: args.permissions ? args.permissions.split(',').map(s => s.trim()) : ['pay', 'receive', 'balance', 'history', 'info'],
        max_daily_sats: Number(args['max-daily']) || 0,
        max_payment_sats: Number(args['max-payment']) || 0,
    };
    if (args.mint) body.mint = args.mint;
    if (args['fee-ppm'] !== undefined) body.service_fee_ppm = Number(args['fee-ppm']);
    if (args['fee-base'] !== undefined) body.service_fee_base = Number(args['fee-base']);

    var result = await client.post('/api/v1/connections', body);
    if (args?.json) return jsonOut(result);

    print('');
    print(`  ${c.ok} Connection ${c.purple}#${result.label}${c.reset} created`);
    print('');
    print(`  ${result.nwc_string}`);
    print('');
}
