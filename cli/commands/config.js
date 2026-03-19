import { c } from '../colors.js';
import { kv, heading, print, jsonOut } from '../render.js';
import { select, input } from '../prompts.js';

export async function run(client, args) {
    var subcommand = args._positional?.[0] || null;

    if (subcommand === 'set') {
        return await setConfig(client, args);
    }

    // Default: show all .env options
    if (args?.json) {
        var d = await client.get('/api/v1/config');
        return jsonOut(d);
    }

    var env = await client.get('/api/v1/config/env');

    print(heading('Configuration'));
    print(`  ${c.muted}Settings from your .env file. Edit interactively or directly.${c.reset}`);
    print('');

    if (!env.file_exists) {
        print(`  ${c.red}No .env file found.${c.reset}`);
        print(`  ${c.muted}Create one with: ${c.white}cp .env.example .env${c.reset}`);
        print('');
        return;
    }

    // Group options by category for clarity
    var categories = {
        'Mint & Relays':  ['MINT_URL', 'MINT_URLS', 'RELAYS'],
        'Security':       ['STATE_PASSPHRASE', 'SEED', 'API_TOKEN'],
        'Storage':        ['STATE_BACKEND', 'SQLITE_PATH', 'MYSQL_URL', 'STATE_FILE'],
        'Limits & Fees':  ['MAX_PAYMENT_SATS', 'DAILY_LIMIT_SATS', 'FEE_RESERVE_PCT', 'SERVICE_FEE_PPM', 'SERVICE_FEE_BASE'],
        'API':            ['API_ENABLED', 'API_SOCKET', 'API_PORT'],
        'Tuning':         ['LOG_LEVEL', 'HEALTH_CHECK_INTERVAL_MS', 'FAILOVER_COOLDOWN_MS', 'INVOICE_CHECK_MAX_RETRIES', 'INVOICE_CHECK_INTERVAL_SECS', 'FETCH_TIMEOUT_MS'],
    };

    var optMap = {};
    for (var opt of (env.options || [])) {
        optMap[opt.key.replace('NUTBITS_', '')] = opt;
    }

    for (var [catName, keys] of Object.entries(categories)) {
        var catOpts = keys.map(k => optMap[k]).filter(Boolean);
        if (catOpts.length === 0) continue;

        print(`  ${c.purple}${c.bold}${catName}${c.reset}`);
        for (var opt of catOpts) {
            var status = opt.active ? `${c.green}●${c.reset}` : `${c.dim}○${c.reset}`;
            var val = opt.value || '';
            if (opt.sensitive && val) val = '***';
            var liveTag = opt.restart ? '' : ` ${c.blue}live${c.reset}`;
            var shortKey = opt.key.replace('NUTBITS_', '');

            print(`  ${status} ${c.white}${shortKey.padEnd(30)}${c.reset}${liveTag} ${c.dim}${val || '(not set)'}${c.reset}`);
        }
        print('');
    }

    print(`  ${c.green}●${c.reset} ${c.dim}= active${c.reset}    ${c.dim}○ = inactive/commented${c.reset}    ${c.blue}live${c.reset} ${c.dim}= applies without restart${c.reset}`);
    print('');
    print(`  ${c.muted}To change a setting:${c.reset}  ${c.white}nutbits config set${c.reset}  ${c.dim}(interactive)${c.reset}`);
    print(`  ${c.muted}Or directly:${c.reset}          ${c.white}nutbits config set LOG_LEVEL debug${c.reset}`);
    print('');
}

async function setConfig(client, args) {
    var key = args._positional?.[1] || null;
    var value = args._positional?.[2] || null;

    // Interactive mode
    if (!key) {
        var env = await client.get('/api/v1/config/env');
        var editableOptions = (env.options || []).filter(o => !o.sensitive);

        var options = editableOptions.map(o => {
            var shortKey = o.key.replace('NUTBITS_', '');
            var status = o.active ? `${c.green}●${c.reset}` : `${c.dim}○${c.reset}`;
            var liveTag = o.restart ? '' : ` ${c.blue}live${c.reset}`;
            return {
                label: `${status} ${shortKey}${liveTag}`,
                hint: o.value ? `current: ${o.value}` : o.desc,
                value: o.key,
                envOpt: o,
            };
        });

        print('');
        var choice = await select({
            message: 'Which setting do you want to change?',
            description: 'Changes are saved to .env. "live" settings apply immediately.',
            options,
        });
        if (choice === null) { print(`  ${c.dim}Cancelled.${c.reset}\n`); return; }

        var envKey = choice.value;
        var envOpt = choice.envOpt;
        var shortKey = envKey.replace('NUTBITS_', '');

        // Special handling for known enum types
        if (envKey === 'NUTBITS_LOG_LEVEL') {
            var lvl = await select({
                message: 'Log level:',
                description: 'Controls how much detail appears in logs.',
                options: [
                    { label: 'error', hint: 'critical issues only' },
                    { label: 'warn', hint: 'warnings and errors' },
                    { label: 'info', hint: 'standard operation (recommended)' },
                    { label: 'debug', hint: 'verbose, includes all details' },
                ].map(l => ({ ...l, value: l.label })),
            });
            if (lvl === null) { print(`  ${c.dim}Cancelled.${c.reset}\n`); return; }
            value = lvl.value;
        } else if (envKey === 'NUTBITS_STATE_BACKEND') {
            var backend = await select({
                message: 'Storage backend:',
                description: 'Where NUTbits stores proofs and connections.',
                options: [
                    { label: 'file', hint: 'encrypted JSON file (default)', value: 'file' },
                    { label: 'sqlite', hint: 'SQLite database (recommended for production)', value: 'sqlite' },
                    { label: 'mysql', hint: 'MySQL/MariaDB (requires mysql2)', value: 'mysql' },
                ],
            });
            if (backend === null) { print(`  ${c.dim}Cancelled.${c.reset}\n`); return; }
            value = backend.value;
        } else if (envKey === 'NUTBITS_API_ENABLED') {
            var enabled = await select({
                message: 'Management API:',
                description: 'The API is required for the CLI to work.',
                options: [
                    { label: 'Enabled', hint: 'CLI + TUI access (recommended)', value: 'true' },
                    { label: 'Disabled', hint: 'NWC-only mode, no CLI', value: 'false' },
                ],
            });
            if (enabled === null) { print(`  ${c.dim}Cancelled.${c.reset}\n`); return; }
            value = enabled.value;
        } else {
            var currentVal = envOpt.value || '';
            value = await input({
                message: `${shortKey}:`,
                placeholder: currentVal || 'enter value',
                description: envOpt.desc || '',
            });
            if (value === null) { print(`  ${c.dim}Cancelled.${c.reset}\n`); return; }
        }

        // Map NUTBITS_ env key to config API key
        key = shortKey.toLowerCase();
    }

    // Map CLI-friendly names to API keys
    var keyMap = {
        'log-level': 'log_level',
        'max-payment': 'max_payment_sats',
        'daily-limit': 'daily_limit_sats',
        'fee-reserve': 'fee_reserve_pct',
    };
    key = keyMap[key] || key;

    // Try hot-reload first, fall back to env-only persistence
    try {
        var result = await client.post('/api/v1/config', { key, value });
        print('');
        print(`  ${c.ok} ${c.white}${result.key}${c.reset} updated: ${c.dim}${result.old_value}${c.reset} → ${c.green}${result.new_value}${c.reset}`);
        print(`  ${c.dim}Applied immediately + saved to .env${c.reset}`);
    } catch (e) {
        // Not hot-reloadable - save to .env only
        var envKey = 'NUTBITS_' + key.toUpperCase();
        await client.post('/api/v1/config/env', { key: envKey, value });
        print('');
        print(`  ${c.ok} ${c.white}${envKey}${c.reset} saved to .env: ${c.green}${value}${c.reset}`);
        print(`  ${c.yellow}Restart NUTbits for this to take effect.${c.reset}`);
    }
    print('');
}
