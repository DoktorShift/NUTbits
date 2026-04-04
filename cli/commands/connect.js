import { c } from '../colors.js';
import { box, kv, heading, print, jsonOut } from '../render.js';
import { input, multiSelect, select, confirm, spinner } from '../prompts.js';

// Try to load QR code renderer (optional dependency)
var qrGenerate = null;
try {
    var qrt = await import('qrcode-terminal');
    qrGenerate = (text) => new Promise(resolve => {
        qrt.default.generate(text, { small: true }, resolve);
    });
} catch (e) { /* qrcode-terminal not installed - skip QR */ }

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
    print(heading('New NWC Connection'));
    print(`  ${c.muted}Create a Nostr Wallet Connect (NWC) link that lets apps${c.reset}`);
    print(`  ${c.muted}like LNbits, Alby, or BuhoGO use your ecash wallet.${c.reset}`);
    print('');

    // Check mint count early to determine total steps
    var multiMint = false;
    try {
        var mintCheck = await client.get('/api/v1/mints');
        multiMint = mintCheck.mints?.length > 1;
    } catch (e) { /* single mint */ }
    var totalSteps = multiMint ? 6 : 5;

    // Step 1. Label
    print(`  ${c.purple}Step 1 of ${totalSteps}${c.reset}  ${c.dim}— Give it a name${c.reset}`);
    var label = await input({
        message: 'Connection name:',
        placeholder: 'e.g. lnbits-main, alby-mobile',
        description: 'A short name so you can identify this connection later.',
    });
    if (label === null) { print(`  ${c.dim}Cancelled.${c.reset}\n`); return; }
    if (!label.trim()) { print(`  ${c.red}A name is required so you can identify this connection.${c.reset}`); return; }
    print('');

    // Step 2. Permissions
    print(`  ${c.purple}Step 2 of ${totalSteps}${c.reset}  ${c.dim}— Choose permissions${c.reset}`);
    var permChoices = await multiSelect({
        message: 'What can this connection do?',
        description: 'Toggle permissions on/off. Most apps need pay + receive + balance.',
        options: PERM_OPTIONS,
        initial: [0, 1, 2],
    });
    if (permChoices === null) { print(`  ${c.dim}Cancelled.${c.reset}\n`); return; }
    var permissions = permChoices.map(p => p.value);
    if (permissions.length === 0) { print(`  ${c.red}At least one permission is required.${c.reset}`); return; }
    print('');

    // Step 3. Balance type
    print(`  ${c.purple}Step 3 of ${totalSteps}${c.reset}  ${c.dim}— Balance type${c.reset}`);
    var balanceChoice = await select({
        message: 'Balance isolation',
        description: 'Dedicated = own balance, starts at 0, you fund it. Shared = full wallet access.',
        options: [
            { label: `${c.green}Dedicated${c.reset}  ${c.dim}— own balance, starts at 0 sats (recommended)${c.reset}`, value: true },
            { label: `${c.yellow}Shared${c.reset}     ${c.dim}— full wallet access (only for apps you fully trust)${c.reset}`, value: false },
        ],
    });
    if (balanceChoice === null) { print(`  ${c.dim}Cancelled.${c.reset}\n`); return; }
    var dedicated = balanceChoice.value;
    if (!dedicated) {
        print(`  ${c.yellow}${c.bold}Warning:${c.reset} ${c.muted}This connection can spend your entire wallet balance.${c.reset}`);
        print(`  ${c.muted}Only use shared for apps you fully control.${c.reset}`);
        var confirmShared = await confirm({
            message: 'Continue with shared balance?',
            initial: false,
        });
        if (!confirmShared) { print(`  ${c.dim}Switched to dedicated.${c.reset}`); dedicated = true; }
    }
    print('');

    // Step 4. Spending limits
    print(`  ${c.purple}Step 4 of ${totalSteps}${c.reset}  ${c.dim}— Set spending limits${c.reset}`);
    var dailyChoice = await select({
        message: 'Daily spending limit',
        description: 'Max total sats this connection can spend per day.',
        options: DAILY_LIMIT_OPTIONS,
    });
    if (dailyChoice === null) { print(`  ${c.dim}Cancelled.${c.reset}\n`); return; }
    var maxDaily = dailyChoice.value;
    if (maxDaily === -1) {
        var customDaily = await input({
            message: 'Daily limit (sats):',
            placeholder: 'e.g. 25000',
            validate: v => isNaN(Number(v)) || Number(v) < 0 ? 'Enter a positive number' : null,
        });
        if (customDaily === null) { print(`  ${c.dim}Cancelled.${c.reset}\n`); return; }
        maxDaily = Number(customDaily);
    }

    var paymentChoice = await select({
        message: 'Max per single payment',
        description: 'Largest payment this connection can make at once.',
        options: PAYMENT_LIMIT_OPTIONS,
    });
    if (paymentChoice === null) { print(`  ${c.dim}Cancelled.${c.reset}\n`); return; }
    var maxPayment = paymentChoice.value;
    if (maxPayment === -1) {
        var customPayment = await input({
            message: 'Max per payment (sats):',
            placeholder: 'e.g. 2000',
            validate: v => isNaN(Number(v)) || Number(v) < 0 ? 'Enter a positive number' : null,
        });
        if (customPayment === null) { print(`  ${c.dim}Cancelled.${c.reset}\n`); return; }
        maxPayment = Number(customPayment);
    }
    print('');

    // Step 5. Lightning Address (optional)
    print(`  ${c.purple}Step 5 of ${totalSteps}${c.reset}  ${c.dim}— Lightning Address (optional)${c.reset}`);
    var lud16 = await input({
        message: 'Lightning Address:',
        placeholder: 'e.g. you@getalby.com (press Enter to skip)',
        description: 'Attach a Lightning Address to this connection. Apps can use it for receiving.',
        validate: v => {
            if (!v || !v.trim()) return null;
            if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim())) return 'Invalid format. Use: user@domain.com';
            return null;
        },
    });
    if (lud16 === null) { print(`  ${c.dim}Cancelled.${c.reset}\n`); return; }
    lud16 = lud16?.trim() || null;
    print('');

    // Step 6. Mint selection (multi-mint only)
    var mint = null;
    try {
        var mints = mintCheck || await client.get('/api/v1/mints');
        if (mints.mints?.length > 1) {
            print(`  ${c.purple}Step 6 of ${totalSteps}${c.reset}  ${c.dim}— Choose mint${c.reset}`);
            var mintChoice = await select({
                message: 'Which mint should this connection use?',
                options: mints.mints.map(m => ({
                    label: m.name || m.url,
                    hint: `${m.active ? `${c.green}● active${c.reset}` : `${c.dim}● standby${c.reset}`}  ${m.balance_sats.toLocaleString()} sats`,
                    value: m.url,
                })),
            });
            if (mintChoice === null) { print(`  ${c.dim}Cancelled.${c.reset}\n`); return; }
            mint = mintChoice.value;
            print('');
        }
    } catch (e) { /* single mint, skip */ }

    // Summary + confirmation
    print(`  ${c.dim}${'─'.repeat(50)}${c.reset}`);
    print(`  ${c.white}${c.bold}Review your new connection:${c.reset}`);
    print('');
    print(kv('Name', `${c.white}${c.bold}${label}${c.reset}`));
    print(kv('Balance', dedicated ? `${c.green}dedicated${c.reset} ${c.dim}(starts at 0, you fund it)${c.reset}` : `${c.yellow}shared${c.reset} ${c.dim}(full wallet access)${c.reset}`));
    print(kv('Permissions', `${c.muted}${permissions.join(', ')}${c.reset}`));
    print(kv('Daily limit', maxDaily ? `${c.yellow}${maxDaily.toLocaleString()} sats${c.reset}` : `${c.dim}no limit${c.reset}`));
    print(kv('Per payment', maxPayment ? `${c.yellow}${maxPayment.toLocaleString()} sats${c.reset}` : `${c.dim}no limit${c.reset}`));
    if (lud16) print(kv('Lightning Address', `${c.cyan}${lud16}${c.reset}`));
    if (mint) print(kv('Mint', `${c.dim}${mint}${c.reset}`));
    print('');

    var ok = await confirm({
        message: 'Create this connection?',
        initial: true,
        description: 'You can revoke it later with "nutbits revoke".',
    });
    if (ok === null || !ok) { print(`  ${c.dim}Cancelled. Nothing was created.${c.reset}\n`); return; }

    // Create
    var body = {
        label: label.trim(),
        permissions,
        max_daily_sats: maxDaily,
        max_payment_sats: maxPayment,
        dedicated,
    };
    if (!dedicated) body.dedicated = false;
    if (lud16) body.lud16 = lud16;
    if (mint) body.mint = mint;

    var sp = spinner('Creating connection');
    sp.start();

    var result = await client.post('/api/v1/connections', body);

    sp.stop(`${c.ok} ${c.green}${c.bold}Connection created!${c.reset}`);
    print('');

    // ── Present the NWC string ───────────────────────────────────

    print(`  ${c.dim}${'─'.repeat(50)}${c.reset}`);
    print('');
    print(`  ${c.purple}${c.bold}Your NWC Connection String${c.reset}`);
    print(`  ${c.muted}for "${label}"${c.reset}`);
    print('');

    // QR Code (if qrcode-terminal is installed)
    if (qrGenerate) {
        print(`  ${c.muted}Scan to connect:${c.reset}`);
        print('');
        var qrText = await qrGenerate(result.nwc_string);
        for (var line of qrText.split('\n')) {
            if (line.trim()) print('    ' + line);
        }
        print('');
    }

    // Wrap the NWC string for readability
    print(`  ${c.muted}NWC connection string:${c.reset}`);
    print('');
    var nwc = result.nwc_string;
    var lineWidth = Math.min(68, (process.stdout.columns || 80) - 8);
    for (var i = 0; i < nwc.length; i += lineWidth) {
        print(`    ${c.white}${c.bold}${nwc.slice(i, i + lineWidth)}${c.reset}`);
    }

    print('');
    print(`  ${c.dim}${'─'.repeat(50)}${c.reset}`);
    print('');
    print(`  ${c.muted}Paste this into:${c.reset}`);
    print(`    ${c.white}LNbits${c.reset}  ${c.dim}→ Funding Source → NWC${c.reset}`);
    print(`    ${c.white}Alby${c.reset}    ${c.dim}→ Settings → Wallet Connection${c.reset}`);
    print(`    ${c.white}BuhoGO${c.reset}  ${c.dim}→ Add Wallet → NWC${c.reset}`);
    print(`    ${c.muted}...or any NWC-compatible app${c.reset}`);
    print('');
    print(`  ${c.yellow}${c.bold}Save this now.${c.reset} ${c.muted}To see it again: ${c.white}nutbits connections ${result.id || result.label}${c.reset}`);
    print('');
}

async function createScripted(client, args) {
    var body = {
        label: args.label,
        permissions: args.permissions ? args.permissions.split(',').map(s => s.trim()) : ['pay', 'receive', 'balance', 'history', 'info'],
        max_daily_sats: Number(args['max-daily']) || 0,
        max_payment_sats: Number(args['max-payment']) || 0,
    };
    // Default to dedicated unless --shared is explicitly passed
    if (args.shared) body.dedicated = false;
    if (args.mint) body.mint = args.mint;
    if (args.lud16) body.lud16 = args.lud16;
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
