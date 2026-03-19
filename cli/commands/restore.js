import { c } from '../colors.js';
import { heading, kv, sats, print, jsonOut } from '../render.js';
import { confirm, spinner } from '../prompts.js';

export async function run(client, args) {
    print(heading('Proof Recovery (NUT-09)'));
    print(`  ${c.muted}This checks each mint for recoverable proofs using your seed.${c.reset}`);
    print(`  ${c.muted}Existing proofs are not affected.${c.reset}`);
    print('');

    if (args?.json) {
        var body = {};
        if (args.mint) body.mint = args.mint;
        return jsonOut(await client.post('/api/v1/restore', body));
    }

    if (!args['from-seed'] && !args.force) {
        var ok = await confirm({ message: 'Start recovery?', initial: true });
        if (!ok) { print(`  ${c.dim}Cancelled.${c.reset}\n`); return; }
    }

    var sp = spinner('Recovering proofs');
    sp.start();

    try {
        var body = {};
        if (args.mint) body.mint = args.mint;

        var d = await client.post('/api/v1/restore', body);
        sp.stop('');

        for (var r of d.results) {
            var mintShort = r.mint.replace(/^https?:\/\//, '').split('/')[0];
            if (r.proofs_restored > 0) {
                print(`  ${c.ok} ${c.white}${mintShort}${c.reset}  ${r.proofs_restored} proofs restored (${sats(r.sats)})`);
            } else {
                print(`  ${c.dim}${mintShort}  no proofs to restore${c.reset}`);
            }
        }

        print('');
        if (d.total_sats > 0) {
            print(`  ${c.ok} Recovery complete: ${sats(d.total_sats)} across ${d.results.length} mint${d.results.length > 1 ? 's' : ''}`);
        } else {
            print(`  ${c.muted}No proofs found to recover.${c.reset}`);
        }
        print('');
    } catch (e) {
        sp.stop(`${c.fail} ${c.red}Recovery failed${c.reset}`);
        print(`  ${c.dim}${e.message}${c.reset}\n`);
    }
}
