import { c } from '../colors.js';
import { kv, sats, print, jsonOut } from '../render.js';
import fs from 'node:fs';

export async function run(client, args) {
    var d = await client.get('/api/v1/backup');
    if (args?.json) return jsonOut({ ...d, data_b64: '(omitted)' });

    var outPath = args.out || `./nutbits-backup-${new Date().toISOString().slice(0, 10)}-${new Date().toISOString().slice(11, 16).replace(':', '')}.enc`;

    var buf = Buffer.from(d.data_b64, 'base64');
    fs.writeFileSync(outPath, buf, { mode: 0o600 });

    print('');
    print(`  ${c.ok} Backup exported`);
    print('');
    print(kv('File', `${c.white}${outPath}${c.reset}`));
    print(kv('Size', `${(buf.length / 1024).toFixed(1)} KB`));
    print(kv('Proofs', `${d.proofs} (${sats(d.total_sats)})`));
    print(kv('Connections', `${d.connections}`));
    print(kv('Mints', `${d.mints}`));
    print(kv('Timestamp', `${c.dim}${d.timestamp}${c.reset}`));
    print('');
}
