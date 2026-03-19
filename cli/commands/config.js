import { c } from '../colors.js';
import { kv, heading, print, jsonOut } from '../render.js';
import { select, input } from '../prompts.js';

export async function run(client, args) {
    var subcommand = args._positional?.[0] || null;

    if (subcommand === 'set') {
        return await setConfig(client, args);
    }

    // Default: show config
    var d = await client.get('/api/v1/config');
    if (args?.json) return jsonOut(d);

    print(heading('Running Configuration'));
    print(kv('Mint URLs', ''));
    for (var url of d.mint_urls) print(`  ${' '.repeat(14)}${c.dim}${url}${c.reset}`);
    print(kv('Active mint', `${c.white}${d.active_mint}${c.reset}`));
    print(kv('Relays', ''));
    for (var r of d.relays) print(`  ${' '.repeat(14)}${c.dim}${r}${c.reset}`);
    print(kv('Storage', d.storage));
    print(kv('Log level', d.log_level));
    print(kv('Fee reserve', `${d.fee_reserve_pct}%`));
    print(kv('Max payment', d.max_payment_sats ? `${d.max_payment_sats.toLocaleString()} sats` : 'no limit'));
    print(kv('Daily limit', d.daily_limit_sats ? `${d.daily_limit_sats.toLocaleString()} sats` : 'no limit'));
    print(kv('Health check', `${d.health_check_interval_ms / 1000}s`));
    print(kv('Failover cd', `${d.failover_cooldown_ms / 1000}s`));
    print(kv('Seed', d.seed_configured ? `${c.green}configured${c.reset}` : `${c.red}not set${c.reset}`));
    print('');
    print(`  ${c.dim}Hot-reloadable: ${d.reloadable.join(', ')}${c.reset}`);
    print(`  ${c.dim}Other settings require a restart.${c.reset}`);
    print('');
}

async function setConfig(client, args) {
    var key = args._positional?.[1] || null;
    var value = args._positional?.[2] || null;

    // Interactive mode
    if (!key) {
        var d = await client.get('/api/v1/config');
        var options = [
            { label: 'Log level', hint: `currently: ${d.log_level}`, value: 'log_level' },
            { label: 'Max per payment', hint: d.max_payment_sats ? `currently: ${d.max_payment_sats.toLocaleString()} sats` : 'currently: no limit', value: 'max_payment_sats' },
            { label: 'Daily limit', hint: d.daily_limit_sats ? `currently: ${d.daily_limit_sats.toLocaleString()} sats` : 'currently: no limit', value: 'daily_limit_sats' },
            { label: 'Fee reserve', hint: `currently: ${d.fee_reserve_pct}%`, value: 'fee_reserve_pct' },
        ];

        print('');
        var choice = await select({
            message: 'Which setting?',
            options,
        });
        key = choice.value;

        if (key === 'log_level') {
            var lvl = await select({
                message: 'Log level:',
                options: ['error', 'warn', 'info', 'debug'].map(l => ({ label: l, value: l })),
                initial: ['error', 'warn', 'info', 'debug'].indexOf(d.log_level),
            });
            value = lvl.value;
        } else {
            value = await input({ message: `New value for ${key}:`, validate: v => isNaN(Number(v)) ? 'Enter a number' : null });
        }
    }

    // Map CLI-friendly names to API keys
    var keyMap = {
        'log-level': 'log_level',
        'max-payment': 'max_payment_sats',
        'daily-limit': 'daily_limit_sats',
        'fee-reserve': 'fee_reserve_pct',
    };
    key = keyMap[key] || key;

    var result = await client.post('/api/v1/config', { key, value });

    print('');
    print(`  ${c.ok} ${c.white}${result.key}${c.reset} updated: ${c.dim}${result.old_value}${c.reset} → ${c.green}${result.new_value}${c.reset}`);
    print(`  ${c.dim}Applied immediately (no restart needed)${c.reset}`);
    print('');
}
