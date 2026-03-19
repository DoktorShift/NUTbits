#!/usr/bin/env node

// NUTbits CLI - Management console for NUTbits service
// Usage: nutbits [command] [options]

import { parseArgs } from 'node:util';
import { createClient } from '../cli/client.js';
import { c } from '../cli/colors.js';

// ── Command Registry ─────────────────────────────────────────────────────

var commands = {
    status:      () => import('../cli/commands/status.js'),
    balance:     () => import('../cli/commands/balance.js'),
    pay:         () => import('../cli/commands/pay.js'),
    receive:     () => import('../cli/commands/receive.js'),
    history:     () => import('../cli/commands/history.js'),
    connections: () => import('../cli/commands/connections.js'),
    connect:     () => import('../cli/commands/connect.js'),
    revoke:      () => import('../cli/commands/revoke.js'),
    mints:       () => import('../cli/commands/mints.js'),
    nuts:        () => import('../cli/commands/nuts.js'),
    relays:      () => import('../cli/commands/relays.js'),
    export:      () => import('../cli/commands/export.js'),
    backup:      () => import('../cli/commands/backup.js'),
    verify:      () => import('../cli/commands/verify.js'),
    restore:     () => import('../cli/commands/restore.js'),
    watch:       () => import('../cli/commands/watch.js'),
    logs:        () => import('../cli/commands/logs.js'),
    config:      () => import('../cli/commands/config.js'),
    fees:        () => import('../cli/commands/fees.js'),
};

// ── Argument Parsing ─────────────────────────────────────────────────────

var { values: flags, positionals } = parseArgs({
    allowPositionals: true,
    strict: false,
    options: {
        // Global
        socket:       { type: 'string' },
        http:         { type: 'string' },
        json:         { type: 'boolean', default: false },
        'no-color':   { type: 'boolean', default: false },
        help:         { type: 'boolean', short: 'h', default: false },
        version:      { type: 'boolean', short: 'v', default: false },
        // Command-specific (parsed loosely)
        label:        { type: 'string' },
        permissions:  { type: 'string' },
        'max-daily':  { type: 'string' },
        'max-payment':{ type: 'string' },
        mint:         { type: 'string' },
        'fee-ppm':    { type: 'string' },
        'fee-base':   { type: 'string' },
        force:        { type: 'boolean', default: false },
        limit:        { type: 'string' },
        type:         { type: 'string' },
        connection:   { type: 'string' },
        from:         { type: 'string' },
        until:        { type: 'string' },
        unpaid:       { type: 'boolean', default: false },
        format:       { type: 'string' },
        id:           { type: 'string' },
        'include-revoked': { type: 'boolean', default: false },
        out:          { type: 'string' },
        file:         { type: 'string' },
        'from-seed':  { type: 'boolean', default: false },
        'no-wait':    { type: 'boolean', default: false },
        level:        { type: 'string' },
        follow:       { type: 'boolean', default: true },
    },
});

// ── Version ──────────────────────────────────────────────────────────────

if (flags.version) {
    console.log('nutbits-cli 0.7.0');
    process.exit(0);
}

// ── Help ─────────────────────────────────────────────────────────────────

if (flags.help && positionals.length === 0) {
    printHelp();
    process.exit(0);
}

// ── Resolve Command ──────────────────────────────────────────────────────

var commandName = positionals[0] || null;
var commandArgs = { ...flags, _positional: positionals.slice(1) };

// No command + TTY = launch interactive TUI
if (!commandName && process.stdin.isTTY && process.stdout.isTTY && !flags.json) {
    try {
        var client = createClient({ socket: flags.socket, httpUrl: flags.http });
        var { startTUI } = await import('../cli/tui/app.js');
        await startTUI(client);
    } catch (e) {
        if (e.message.includes('Cannot connect') || e.message.includes('No API token')) {
            console.error(`\n  ${c.red}${e.message}${c.reset}`);
            console.error(`  ${c.dim}Start NUTbits first: npm start${c.reset}\n`);
        } else {
            console.error(`\n  ${c.red}Error: ${e.message}${c.reset}\n`);
        }
        process.exit(1);
    }
    process.exit(0);
}

// No command + non-TTY or --json = fall back to status
if (!commandName) commandName = 'status';

if (!commands[commandName]) {
    console.error(`\n  ${c.red}Unknown command: ${commandName}${c.reset}`);
    console.error(`  ${c.dim}Run ${c.white}nutbits --help${c.dim} for available commands.${c.reset}\n`);
    process.exit(1);
}

// ── Execute ──────────────────────────────────────────────────────────────

var client = createClient({ socket: flags.socket, httpUrl: flags.http });

try {
    var mod = await commands[commandName]();
    await mod.run(client, commandArgs);
} catch (e) {
    if (e.message.includes('Cannot connect') || e.message.includes('No API token')) {
        console.error(`\n  ${c.red}${e.message}${c.reset}`);
        console.error(`  ${c.dim}Start NUTbits first: npm start${c.reset}\n`);
    } else {
        console.error(`\n  ${c.red}Error: ${e.message}${c.reset}\n`);
    }
    process.exit(1);
}

// ── Help Text ────────────────────────────────────────────────────────────

function printHelp() {
    console.log(`
  ${c.purple}${c.bold}nutbits${c.reset} - management console for NUTbits

  ${c.white}${c.bold}Usage${c.reset}
    nutbits                   ${c.dim}launch interactive TUI${c.reset}
    nutbits [command] [opts]  ${c.dim}run a single command${c.reset}

  ${c.white}${c.bold}Commands${c.reset}
    ${c.green}status${c.reset}            dashboard
    ${c.green}balance${c.reset}           per-mint balance breakdown
    ${c.green}pay${c.reset} <invoice>     pay a Lightning invoice
    ${c.green}receive${c.reset} <amount>  create an invoice, wait for payment
    ${c.green}history${c.reset}           recent transactions

    ${c.green}connections${c.reset}       list NWC connections
    ${c.green}connections${c.reset} <id>  show connection details + NWC string + QR
    ${c.green}connect${c.reset}           create a new NWC connection
    ${c.green}revoke${c.reset} <id>       revoke a connection

    ${c.green}mints${c.reset}             mint info + health
    ${c.green}nuts${c.reset}              NUT support matrix
    ${c.green}relays${c.reset}            relay status

    ${c.green}export${c.reset}            export history, connections, or mints
    ${c.green}backup${c.reset}            export encrypted backup
    ${c.green}verify${c.reset} <file>     verify a backup file
    ${c.green}restore${c.reset}           recover proofs from seed

    ${c.green}watch${c.reset}             live-updating dashboard
    ${c.green}logs${c.reset}              stream service logs
    ${c.green}config${c.reset}            view or change running config
    ${c.green}fees${c.reset}              service fee revenue

  ${c.white}${c.bold}Global Options${c.reset}
    --socket <path>   Unix socket path
    --http <url>      connect via HTTP
    --json            raw JSON output
    --no-color        disable colors
    --help, -h        show help
    --version, -v     show version
`);
}
