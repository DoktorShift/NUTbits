import { c } from '../colors.js';
import { kv, sats, print, jsonOut } from '../render.js';
import { confirm, input, spinner } from '../prompts.js';

export async function run(client, args) {
    var invoice = args._positional?.[0] || null;

    if (!invoice) {
        print('');
        print(`  ${c.purple}${c.bold}Pay a Lightning Invoice${c.reset}`);
        print(`  ${c.muted}Send sats from your ecash balance to a Lightning invoice.${c.reset}`);
        print('');

        // Show balance upfront so the user knows what they have
        try {
            var status = await client.get('/api/v1/status');
            print(kv('Your balance', sats(status.balance_sats)));
            print('');
        } catch (e) { /* skip */ }

        invoice = await input({
            message: 'Paste invoice:',
            placeholder: 'lnbc...',
            description: 'Paste a BOLT11 Lightning invoice starting with lnbc',
        });
        if (invoice === null) { print(`  ${c.dim}Cancelled.${c.reset}\n`); return; }
    }
    if (!invoice?.trim()) { print(`  ${c.red}No invoice provided. Nothing to pay.${c.reset}\n`); return; }
    invoice = invoice.trim();

    if (args?.json) {
        var result = await client.post('/api/v1/pay', { invoice });
        return jsonOut(result);
    }

    // ── Show what we're about to pay ─────────────────────────────

    print('');
    print(`  ${c.dim}${'─'.repeat(50)}${c.reset}`);

    // Show balance if not already shown
    if (!status) {
        try {
            status = await client.get('/api/v1/status');
            print(kv('Your balance', sats(status.balance_sats)));
        } catch (e) { /* skip */ }
    }

    // Extract amount from invoice prefix (rough — lnbc<amount><multiplier>)
    var amountHint = extractAmountFromInvoice(invoice);
    if (amountHint) {
        print(kv('Amount', `${c.yellow}${c.bold}${amountHint.toLocaleString()}${c.reset}${c.muted} sats${c.reset}`));
        if (status?.balance_sats && amountHint > status.balance_sats) {
            print(`  ${c.red}${c.bold}  Warning: this exceeds your current balance!${c.reset}`);
        }
    }
    print(kv('Invoice', `${c.dim}${invoice.slice(0, 20)}...${invoice.slice(-8)}${c.reset}`));
    print('');

    // Confirm payment
    if (!args.force) {
        var confirmMsg = amountHint ? `Send ${amountHint.toLocaleString()} sats?` : 'Send this payment?';
        var ok = await confirm({
            message: confirmMsg,
            initial: true,
            description: 'This action cannot be undone.',
        });
        if (ok === null || !ok) { print(`  ${c.dim}Cancelled. No payment was sent.${c.reset}\n`); return; }
    }

    // ── Execute payment ──────────────────────────────────────────

    var sp = spinner('Sending payment');
    sp.start();

    try {
        var result = await client.post('/api/v1/pay', { invoice });
        sp.stop(`${c.ok} ${c.green}${c.bold}Payment sent!${c.reset}`);

        print('');
        if (result.amount_sats) print(kv('Paid', `${c.yellow}${c.bold}${result.amount_sats.toLocaleString()}${c.reset}${c.muted} sats${c.reset}`));
        if (result.fees_paid) print(kv('Routing fee', `${c.dim}${Math.floor(result.fees_paid / 1000)} sats${c.reset}`));
        if (result.service_fee_sats) print(kv('Service fee', `${c.dim}${result.service_fee_sats} sats${c.reset}`));
        if (result.preimage) print(kv('Preimage', `${c.dim}${result.preimage.slice(0, 16)}...${c.reset}`));
        print(kv('Balance', sats(result.balance_sats)));
        print('');
    } catch (e) {
        sp.stop(`${c.fail} ${c.red}${c.bold}Payment failed${c.reset}`);
        print('');
        print(`  ${c.red}Reason:${c.reset} ${c.muted}${e.message}${c.reset}`);
        print(`  ${c.dim}Your balance was not affected.${c.reset}`);
        print('');
    }
}

// ── Helper: extract sats from BOLT11 invoice prefix ──────────────────────
// Format: lnbc<amount><multiplier> where multiplier: m=milli, u=micro, n=nano, p=pico

function extractAmountFromInvoice(invoice) {
    try {
        var match = invoice.match(/^lnbc(\d+)([munp]?)/i);
        if (!match) return null;
        var num = Number(match[1]);
        var mult = match[2];
        if (mult === 'm') return Math.floor(num * 100000);      // milli-BTC
        if (mult === 'u') return Math.floor(num * 100);          // micro-BTC
        if (mult === 'n') return Math.floor(num / 10);           // nano-BTC
        if (mult === 'p') return Math.floor(num / 10000);        // pico-BTC
        if (!mult) return Math.floor(num * 100000000);           // full BTC
        return null;
    } catch (e) { return null; }
}
