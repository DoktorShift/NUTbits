import { c } from '../colors.js';
import { kv, sats, print, jsonOut } from '../render.js';
import fs from 'node:fs';

export async function run(client, args) {
    var d = await client.get('/api/v1/backup');
    if (args?.json) return jsonOut({ ...d, data_b64: '(omitted)' });

    var outPath = args.out || `./nutbits-backup-${new Date().toISOString().slice(0, 10)}-${new Date().toISOString().slice(11, 16).replace(':', '')}.enc`;

    var buf = Buffer.from(d.data_b64, 'base64');
    fs.writeFileSync(outPath, buf, { mode: 0o600 });

    var sizeStr = buf.length > 1024 * 1024
        ? `${(buf.length / (1024 * 1024)).toFixed(1)} MB`
        : `${(buf.length / 1024).toFixed(1)} KB`;

    print('');
    print(`  ${c.ok} ${c.green}${c.bold}Backup exported${c.reset}`);
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
