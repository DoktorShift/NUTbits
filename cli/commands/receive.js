import { c } from '../colors.js';
import { kv, sats, heading, print, jsonOut } from '../render.js';
import { input, spinner } from '../prompts.js';

// Try to load QR code renderer (optional dependency)
var qrGenerate = null;
try {
    var qrt = await import('qrcode-terminal');
    qrGenerate = (text) => new Promise(resolve => {
        qrt.default.generate(text, { small: true }, resolve);
    });
} catch (e) { /* qrcode-terminal not installed - skip QR */ }

export async function run(client, args) {
    var amount = args._positional?.[0] || null;

    if (!amount) {
        print(heading('Receive Sats'));
        print(`  ${c.muted}Create a Lightning invoice. When someone pays it, the sats${c.reset}`);
        print(`  ${c.muted}are minted as ecash and added to your balance.${c.reset}`);
        print('');

        amount = await input({
            message: 'How many sats?',
            placeholder: 'e.g. 1000',
            description: 'Enter the amount in satoshis you want to receive.',
            validate: v => {
                var n = Number(v);
                if (isNaN(n) || n <= 0) return 'Enter a positive number';
                if (!Number.isInteger(n)) return 'Sats must be a whole number (no decimals)';
                return null;
            },
        });
        if (amount === null) { print(`  ${c.dim}Cancelled.${c.reset}\n`); return; }
    }
    amount = Number(amount);
    if (!amount || amount <= 0) { print(`  ${c.red}Amount must be a positive number.${c.reset}\n`); return; }

    var result = await client.post('/api/v1/receive', { amount_sats: amount });
    if (args?.json) return jsonOut(result);

    // ── Invoice Presentation ─────────────────────────────────────

    print('');
    print(`  ${c.ok} ${c.green}${c.bold}Invoice created - waiting for payment${c.reset}`);
    print('');
    print(kv('Amount', `${c.yellow}${c.bold}${amount.toLocaleString()}${c.reset}${c.muted} sats${c.reset}`));
    print(kv('Mint', `${c.dim}${(result.mint || '').replace(/^https?:\/\//, '')}${c.reset}`));
    print('');

    // QR Code (if available)
    if (qrGenerate) {
        print(`  ${c.muted}Scan this QR code with any Lightning wallet:${c.reset}`);
        print('');
        var qrText = await qrGenerate(result.invoice.toUpperCase());
        for (var line of qrText.split('\n')) {
            if (line.trim()) print('    ' + line);
        }
        print('');
    }

    // Invoice string (wrapped for readability)
    print(`  ${c.muted}Or copy this invoice and paste it into a Lightning wallet:${c.reset}`);
    print('');
    var invoice = result.invoice;
    var lineWidth = Math.min(70, (process.stdout.columns || 80) - 8);
    for (var i = 0; i < invoice.length; i += lineWidth) {
        print(`    ${c.white}${invoice.slice(i, i + lineWidth)}${c.reset}`);
    }
    print('');

    // ── What to do next ──────────────────────────────────────────

    print(`  ${c.dim}${'─'.repeat(50)}${c.reset}`);
    print(`  ${c.muted}Once the invoice is paid, NUTbits automatically mints${c.reset}`);
    print(`  ${c.muted}ecash proofs and adds them to your balance.${c.reset}`);
    print('');

    if (args['no-wait']) {
        print(`  ${c.dim}Check payment status with: ${c.white}nutbits history --unpaid${c.reset}\n`);
        return;
    }

    // ── Wait for payment ─────────────────────────────────────────

    var sp = spinner('Waiting for payment');
    sp.start();

    var maxAttempts = 120;
    for (var attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise(r => setTimeout(r, 5000));
        try {
            var check = await client.post('/api/v1/receive/check', {
                quote_id: result.quote_id,
                invoice: result.invoice,
                mint: result.mint,
            });
            if (check.paid) {
                sp.stop(`${c.ok} ${c.green}${c.bold}Payment received!${c.reset}`);
                print('');
                print(kv('Received', `${c.green}${c.bold}${amount.toLocaleString()}${c.reset}${c.muted} sats${c.reset}`));
                print(kv('Balance', sats(check.balance_sats)));
                print('');
                return;
            }
        } catch (e) { /* keep polling */ }
    }

    sp.stop(`${c.dim}Timed out after 10 minutes.${c.reset}`);
    print(`  ${c.muted}The invoice may still be paid. NUTbits will mint tokens automatically.${c.reset}`);
    print(`  ${c.dim}Check with: ${c.white}nutbits history --unpaid${c.reset}\n`);
}
