import { c } from '../colors.js';
import { kv, print, jsonOut } from '../render.js';
import { input } from '../prompts.js';
import fs from 'node:fs';

export async function run(client, args) {
    var filePath = args._positional?.[0] || args.file || null;

    if (!filePath) {
        filePath = await input({ message: 'Backup file:', placeholder: './nutbits-backup-*.enc' });
    }
    if (!filePath?.trim()) { print(`  ${c.red}File path is required.${c.reset}\n`); return; }

    if (!fs.existsSync(filePath)) {
        print(`\n  ${c.red}File not found: ${filePath}${c.reset}\n`);
        return;
    }

    // For now, verify = check it's a valid encrypted blob (non-empty, right structure)
    var stat = fs.statSync(filePath);
    var buf = fs.readFileSync(filePath);

    // Basic validation: min size (salt 16 + iv 12 + tag 16 + at least 1 byte)
    if (buf.length < 45) {
        if (args?.json) return jsonOut({ valid: false, error: 'file too small', size_bytes: buf.length });
        print(`\n  ${c.fail} ${c.red}Invalid backup: file too small (${buf.length} bytes)${c.reset}\n`);
        return;
    }

    if (args?.json) return jsonOut({ valid: true, file: filePath, size_bytes: stat.size, modified: stat.mtime.toISOString() });

    print('');
    print(`  ${c.ok} Backup file looks valid`);
    print('');
    print(kv('File', `${c.white}${filePath}${c.reset}`));
    print(kv('Size', `${(stat.size / 1024).toFixed(1)} KB`));
    print(kv('Modified', `${c.dim}${stat.mtime.toISOString()}${c.reset}`));
    print('');
    print(`  ${c.dim}To fully verify decryption, the service checks it against the passphrase.${c.reset}`);
    print('');
}
