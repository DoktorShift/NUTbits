import { c } from '../colors.js';
import { kv, sats, heading, print, jsonOut } from '../render.js';
import { spinner } from '../prompts.js';
import fs from 'node:fs';

export async function run(client, args) {
    if (args?.json) {
        var d = await client.get('/api/v1/backup');
        return jsonOut({ ...d, data_b64: '(omitted)' });
    }

    print(heading('Backup'));
    print(`  ${c.muted}Export an encrypted snapshot of your wallet state.${c.reset}`);
    print(`  ${c.dim}Includes proofs, connections, and settings.${c.reset}`);
    print('');

    var sp = spinner('Creating backup');
    sp.start();

    var d = await client.get('/api/v1/backup');
    var outPath = args.out || `./nutbits-backup-${new Date().toISOString().slice(0, 10)}-${new Date().toISOString().slice(11, 16).replace(':', '')}.enc`;

    var buf = Buffer.from(d.data_b64, 'base64');
    fs.writeFileSync(outPath, buf, { mode: 0o600 });

    sp.stop(`${c.ok} ${c.green}${c.bold}Backup exported${c.reset}`);

    var sizeStr = buf.length > 1024 * 1024
        ? `${(buf.length / (1024 * 1024)).toFixed(1)} MB`
        : `${(buf.length / 1024).toFixed(1)} KB`;

    print('');
    print(kv('File', `${c.white}${c.bold}${outPath}${c.reset}`));
    print(kv('Size', `${sizeStr}`));
    print(kv('Proofs', `${d.proofs} (${sats(d.total_sats)})`));
    print(kv('Connections', `${d.connections}`));
    print(kv('Mints', `${d.mints}`));
    print(kv('Encrypted', `${c.green}yes${c.reset} ${c.dim}(with your state passphrase)${c.reset}`));
    print('');
    print(`  ${c.dim}To restore: ${c.white}nutbits restore${c.dim}  (recovers proofs from seed)${c.reset}`);
    print(`  ${c.dim}To verify:  ${c.white}nutbits verify ${outPath}${c.reset}`);
    print('');
}
