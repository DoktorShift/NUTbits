import { c } from '../colors.js';
import { kv, heading, print, jsonOut } from '../render.js';

export async function run(client, args) {
    var d = await client.get('/api/v1/fees');
    if (args?.json) return jsonOut(d);

    print(heading('Service Fee Revenue'));

    if (!d.enabled) {
        print(`  ${c.muted}Service fees are disabled.${c.reset}`);
        print(`  ${c.dim}Set NUTBITS_SERVICE_FEE_PPM in .env to enable.${c.reset}`);
        print(`  ${c.dim}Or: nutbits config set service_fee_ppm 10000  (= 1%)${c.reset}`);
        print('');
        return;
    }

    print(kv('Fee rate', `${d.fee_ppm} ppm (${(d.fee_ppm / 10000).toFixed(2)}%)`));
    if (d.fee_base_sats) print(kv('Base fee', `${d.fee_base_sats} sats`));
    print('');
    print(kv('Today', `${c.yellow}${c.bold}${d.today_sats.toLocaleString()}${c.reset}${c.muted} sats${c.reset}`));
    print(kv('Total earned', `${c.green}${c.bold}${d.total_sats.toLocaleString()}${c.reset}${c.muted} sats${c.reset}`));

    if (d.by_connection.length > 0) {
        print('');
        print(`  ${c.muted}By connection:${c.reset}`);
        for (var conn of d.by_connection) {
            var todaySats = Math.floor(conn.today_msat / 1000);
            var totalSats = Math.floor(conn.total_msat / 1000);
            print(`    ${c.white}${conn.label.padEnd(16)}${c.reset}${c.dim}today:${c.reset} ${todaySats}  ${c.dim}total:${c.reset} ${totalSats}`);
        }
    }

    print('');
    print(`  ${c.dim}Fees are collected as ecash and stay in your balance.${c.reset}`);
    print(`  ${c.dim}Outgoing payments only — receiving is always free.${c.reset}`);
    print('');
}
