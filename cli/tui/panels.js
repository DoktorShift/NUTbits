// NUTbits TUI — Right-side panel renderers
// Each function returns an array of lines for the content panel

import { c } from '../colors.js';
import { col } from './layout.js';

// ── Formatting Helpers ───────────────────────────────────────────────────

var fmtSats = n => `${c.yellow}${c.bold}${Number(n || 0).toLocaleString('en-US')}${c.reset}${c.muted} sats${c.reset}`;

var fmtUptime = ms => {
    var s = Math.floor(ms / 1000);
    var d = Math.floor(s / 86400); s %= 86400;
    var h = Math.floor(s / 3600); s %= 3600;
    var m = Math.floor(s / 60); s %= 60;
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m`;
    return `${s}s`;
};

var fmtTime = ts => {
    if (!ts) return `${c.dim}—${c.reset}`;
    var diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 0) return 'just now';
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
};

var kv = (label, value, width = 16) => {
    return `${c.muted}${label.padEnd(width)}${c.reset}${value}`;
};

var dot = {
    ok:   `${c.green}●${c.reset}`,
    warn: `${c.yellow}●${c.reset}`,
    err:  `${c.red}●${c.reset}`,
    off:  `${c.dim}●${c.reset}`,
};

// ── Panel: Status ────────────────────────────────────────────────────────

export async function statusPanel(client) {
    var d = await client.get('/api/v1/status');
    var lines = [];

    lines.push(`${c.green}${c.bold}NUTbits is running${c.reset}              ${c.dim}uptime: ${fmtUptime(d.uptime_ms)}${c.reset}`);
    lines.push('');
    lines.push(kv('Mint', `${c.white}${c.bold}${d.mint?.name || 'unknown'}${c.reset}`));
    lines.push(kv('', `${c.dim}${d.mint?.url || ''}${c.reset}`));
    lines.push(kv('Version', `${d.mint?.version || '?'}`));
    lines.push(kv('Balance', fmtSats(d.balance_sats)));
    lines.push(kv('Storage', `${d.storage}`));
    lines.push(kv('Relays', `${d.relays?.connected || 0}/${d.relays?.total || 0} connected`));
    lines.push(kv('Seed', d.seed_configured ? `${dot.ok} configured` : `${dot.err} not set`));
    lines.push(kv('Connections', `${d.connections_count} active`));
    lines.push('');

    // NUTs
    if (d.nuts) {
        var all = ['00','01','02','03','04','05','06','07','08','09','12','13','15','17','20'];
        var nutStr = all.map(n => {
            var supported = Number(n) <= 8 ? true : d.nuts[`nut${n}`];
            return supported ? `${c.green}${n}${c.reset}` : `${c.dim}${n}${c.reset}`;
        }).join(' ');
        lines.push(kv('NUTs', nutStr));
    }

    if (d.mint?.motd) lines.push('', kv('MOTD', `${c.yellow}"${d.mint.motd}"${c.reset}`));
    if (d.limits?.max_payment_sats) lines.push(kv('Limit', `${d.limits.max_payment_sats.toLocaleString()} sats/payment`));
    if (d.limits?.daily_limit_sats) lines.push(kv('Limit', `${d.limits.daily_limit_sats.toLocaleString()} sats/day`));

    return lines;
}

// ── Panel: Balance ───────────────────────────────────────────────────────

export async function balancePanel(client) {
    var d = await client.get('/api/v1/balance');
    var lines = [];

    lines.push(`${c.white}${c.bold}Balance Breakdown${c.reset}`);
    lines.push('');
    lines.push(`  ${c.muted}${'Mint'.padEnd(34)}${'Proofs'.padEnd(8)}${'Sats'.padEnd(16)}Status${c.reset}`);
    lines.push(`  ${c.dim}${'─'.repeat(66)}${c.reset}`);

    for (var m of (d.mints || [])) {
        var status = m.active ? `${dot.ok} active` : m.healthy ? `${dot.warn} standby` : `${dot.err} down`;
        var url = m.url.replace(/^https?:\/\//, '').slice(0, 30);
        lines.push(`  ${col(`${c.dim}${url}${c.reset}`, 34)}${col(String(m.proofs), 8)}${col(fmtSats(m.sats), 16)}${status}`);
    }

    lines.push(`  ${c.dim}${'─'.repeat(70)}${c.reset}`);
    lines.push(`  ${'Total'.padEnd(46)}${fmtSats(d.total_sats)}`);

    return lines;
}

// ── Panel: Connections ───────────────────────────────────────────────────

export async function connectionsPanel(client) {
    var d = await client.get('/api/v1/connections');
    var lines = [];

    lines.push(`${c.white}${c.bold}NWC Connections${c.reset}  ${c.dim}(${(d.connections || []).length} active)${c.reset}`);
    lines.push('');

    if (!d.connections?.length) {
        lines.push(`  ${c.muted}No connections yet.${c.reset}`);
        lines.push(`  ${c.dim}Select "New Connection" from the menu to create one.${c.reset}`);
        return lines;
    }

    lines.push(`  ${c.muted}${'ID'.padEnd(5)}${'Label'.padEnd(16)}${'Permissions'.padEnd(22)}${'Balance'.padEnd(16)}Txs${c.reset}`);
    lines.push(`  ${c.dim}${'─'.repeat(62)}${c.reset}`);

    for (var conn of d.connections) {
        var perms = (conn.permissions || []).map(p => {
            if (p === 'pay_invoice') return 'pay';
            if (p === 'make_invoice') return 'recv';
            if (p === 'get_balance') return 'bal';
            if (p === 'list_transactions' || p === 'lookup_invoice') return 'hist';
            if (p === 'get_info') return 'info';
            return '';
        }).filter((v, i, a) => a.indexOf(v) === i).filter(Boolean).join(' ');

        lines.push(
            `  ${col(`${c.purple}#${conn.id}${c.reset}`, 5)}` +
            `${col(`${c.white}${(conn.label || '—').slice(0, 14)}${c.reset}`, 16)}` +
            `${col(`${c.muted}${perms}${c.reset}`, 22)}` +
            `${col(fmtSats(Math.floor((conn.balance_msat || 0) / 1000)), 16)}` +
            `${c.dim}${conn.tx_count || 0}${c.reset}`
        );
    }

    return lines;
}

// ── Panel: History ───────────────────────────────────────────────────────

export async function historyPanel(client) {
    var d = await client.get('/api/v1/history', { limit: '15', unpaid: 'true' });
    var lines = [];

    lines.push(`${c.white}${c.bold}Recent Transactions${c.reset}  ${c.dim}(${d.total} total)${c.reset}`);
    lines.push('');

    if (!d.transactions?.length) {
        lines.push(`  ${c.muted}No transactions yet.${c.reset}`);
        return lines;
    }

    lines.push(`  ${c.muted}${'Time'.padEnd(12)}${'Type'.padEnd(8)}${'Amount'.padEnd(16)}${'Status'.padEnd(10)}Connection${c.reset}`);
    lines.push(`  ${c.dim}${'─'.repeat(60)}${c.reset}`);

    for (var tx of d.transactions) {
        var time = tx.created_at ? fmtTime(tx.created_at * 1000) : '—';
        var arrow = tx.type === 'incoming' ? `${c.green}← in${c.reset}` : `${c.red}→ out${c.reset}`;
        var amt = fmtSats(Math.floor((tx.amount || 0) / 1000));
        var status = tx.settled_at ? `${c.green}settled${c.reset}`
            : tx.err_msg ? `${c.red}failed${c.reset}`
            : `${c.yellow}pending${c.reset}`;
        var connLabel = `${c.dim}${(tx.connection_label || '—').slice(0, 14)}${c.reset}`;

        lines.push(`  ${col(time, 12)}${col(arrow, 8)}${col(amt, 16)}${col(status, 10)}${connLabel}`);
    }

    return lines;
}

// ── Panel: Mints ─────────────────────────────────────────────────────────

export async function mintsPanel(client) {
    var d = await client.get('/api/v1/mints');
    var lines = [];

    lines.push(`${c.white}${c.bold}Configured Mints${c.reset}`);
    lines.push('');

    for (var m of (d.mints || [])) {
        var health = m.healthy === true ? dot.ok : m.healthy === false ? dot.err : dot.off;
        var active = m.active ? `${c.green}active${c.reset}` : `${c.dim}standby${c.reset}`;
        lines.push(`  ${health} ${c.white}${c.bold}${m.name || 'unknown'}${c.reset}  ${active}  ${fmtSats(m.balance_sats)}`);
        lines.push(`    ${c.dim}${m.url}${c.reset}`);
        if (m.version) lines.push(`    ${c.dim}Version: ${m.version}${c.reset}`);
        if (m.motd) lines.push(`    ${c.yellow}MOTD: "${m.motd}"${c.reset}`);
        lines.push('');
    }

    if (d.mints?.length > 1) {
        lines.push(`  ${c.muted}Failover: ${d.mints.length} mints configured${c.reset}`);
    }

    return lines;
}

// ── Panel: NUTs ──────────────────────────────────────────────────────────

export async function nutsPanel(client) {
    var d = await client.get('/api/v1/nuts');
    var lines = [];
    var nutNames = d.nuts || {};
    var nutIds = Object.keys(nutNames);
    var mintUrls = Object.keys(d.mints || {});

    lines.push(`${c.white}${c.bold}NUT Support${c.reset}`);
    lines.push('');

    if (mintUrls.length <= 1) {
        var url = mintUrls[0] || '';
        var mintNuts = d.mints?.[url]?.nuts || {};
        var half = Math.ceil(nutIds.length / 2);

        for (var i = 0; i < half; i++) {
            var left = nutIds[i];
            var right = nutIds[i + half];
            var lOk = mintNuts[left];
            var lIcon = lOk ? `${c.green}✓${c.reset}` : `${c.red}✗${c.reset}`;
            var lName = `${lOk ? c.white : c.dim}${nutNames[left] || ''}${c.reset}`;
            var entry = `  ${lIcon} ${c.muted}${left}${c.reset}  ${lName}`;

            if (right) {
                var rOk = mintNuts[right];
                var rIcon = rOk ? `${c.green}✓${c.reset}` : `${c.red}✗${c.reset}`;
                var rName = `${rOk ? c.white : c.dim}${nutNames[right] || ''}${c.reset}`;
                var pad = 36 - (left.length + (nutNames[left] || '').length + 5);
                entry += ' '.repeat(Math.max(2, pad)) + `${rIcon} ${c.muted}${right}${c.reset}  ${rName}`;
            }
            lines.push(entry);
        }

        var supported = Object.values(mintNuts).filter(Boolean).length;
        lines.push('');
        lines.push(`  ${c.muted}${supported}/${nutIds.length} NUTs supported${c.reset}`);
    } else {
        // Multi-mint comparison
        lines.push(`  ${c.muted}${'NUT'.padEnd(6)}${'Name'.padEnd(26)}${mintUrls.map(u => u.replace(/^https?:\/\//, '').split('/')[0].padEnd(16)).join('')}${c.reset}`);
        lines.push(`  ${c.dim}${'─'.repeat(60)}${c.reset}`);
        for (var n of nutIds) {
            var row = `  ${c.muted}${n.padEnd(6)}${c.reset}${c.white}${(nutNames[n] || '').padEnd(26)}${c.reset}`;
            for (var url of mintUrls) {
                var ok = d.mints[url]?.nuts?.[n];
                row += (ok ? `${c.green}✓${c.reset}` : `${c.red}✗${c.reset}`).padEnd(16);
            }
            lines.push(row);
        }
    }

    return lines;
}

// ── Panel: Relays ────────────────────────────────────────────────────────

export async function relaysPanel(client) {
    var d = await client.get('/api/v1/relays');
    var lines = [];

    lines.push(`${c.white}${c.bold}Relay Status${c.reset}  ${c.muted}(${d.connected}/${d.total} connected)${c.reset}`);
    lines.push('');

    for (var r of (d.relays || [])) {
        var status = r.connected ? `${dot.ok} connected` : `${dot.err} disconnected`;
        var subs = r.subscriptions > 0 ? `${c.dim}${r.subscriptions} subs${c.reset}` : '';
        lines.push(`  ${status}  ${c.dim}${r.url}${c.reset}  ${subs}`);
    }

    return lines;
}

// ── Panel: Config ────────────────────────────────────────────────────────

export async function configPanel(client) {
    var d = await client.get('/api/v1/config');
    var lines = [];

    lines.push(`${c.white}${c.bold}Running Configuration${c.reset}`);
    lines.push('');
    lines.push(kv('Active mint', `${c.white}${d.active_mint}${c.reset}`));
    lines.push(kv('Storage', d.storage));
    lines.push(kv('Log level', d.log_level));
    lines.push(kv('Fee reserve', `${d.fee_reserve_pct}%`));
    lines.push(kv('Max payment', d.max_payment_sats ? `${d.max_payment_sats.toLocaleString()} sats` : `${c.dim}no limit${c.reset}`));
    lines.push(kv('Daily limit', d.daily_limit_sats ? `${d.daily_limit_sats.toLocaleString()} sats` : `${c.dim}no limit${c.reset}`));
    lines.push(kv('Health check', `${d.health_check_interval_ms / 1000}s`));
    lines.push(kv('Seed', d.seed_configured ? `${c.green}configured${c.reset}` : `${c.red}not set${c.reset}`));
    lines.push('');
    lines.push(`${c.dim}Relays:${c.reset}`);
    for (var r of (d.relays || [])) lines.push(`  ${c.dim}${r}${c.reset}`);
    lines.push('');
    lines.push(`${c.dim}Hot-reloadable: ${(d.reloadable || []).join(', ')}${c.reset}`);
    lines.push(`${c.dim}Use CLI: nutbits config set <key> <value>${c.reset}`);

    return lines;
}

// ── Panel: Logs ──────────────────────────────────────────────────────────

var LOG_COLORS = { error: c.red, warn: c.yellow, info: c.blue, debug: c.dim };

export async function logsPanel(client) {
    var d = await client.get('/api/v1/logs', { level: 'info', limit: '20' });
    var lines = [];

    lines.push(`${c.white}${c.bold}Recent Logs${c.reset}`);
    lines.push('');

    for (var entry of (d.logs || [])) {
        var time = new Date(entry.ts).toLocaleTimeString('en-US', { hour12: false });
        var lvl = (entry.level || 'info').toUpperCase().padEnd(5);
        var clr = LOG_COLORS[entry.level] || c.muted;
        var msg = entry.msg || '';
        lines.push(`  ${c.dim}${time}${c.reset} ${clr}${lvl}${c.reset} ${msg}`);
    }

    if (!d.logs?.length) {
        lines.push(`  ${c.muted}No recent logs.${c.reset}`);
    }

    return lines;
}

// ── Panel: Fees ──────────────────────────────────────────────────────────

export async function feesPanel(client) {
    var d = await client.get('/api/v1/fees');
    var lines = [];

    lines.push(`${c.yellow}${c.bold}Service Fee Revenue${c.reset}`);
    lines.push('');

    if (!d.enabled) {
        lines.push(`  ${c.muted}Fees are disabled (default).${c.reset}`);
        lines.push('');
        lines.push(`  ${c.dim}To enable, set in .env or via CLI:${c.reset}`);
        lines.push(`  ${c.green}NUTBITS_SERVICE_FEE_PPM=10000${c.reset}  ${c.dim}(1%)${c.reset}`);
        lines.push(`  ${c.green}NUTBITS_SERVICE_FEE_BASE=1${c.reset}    ${c.dim}(+1 sat)${c.reset}`);
        lines.push('');
        lines.push(`  ${c.dim}Fees apply to outgoing payments only.${c.reset}`);
        lines.push(`  ${c.dim}Receiving is always free.${c.reset}`);
        return lines;
    }

    lines.push(kv('Fee rate', `${d.fee_ppm} ppm (${(d.fee_ppm / 10000).toFixed(2)}%)`));
    if (d.fee_base_sats) lines.push(kv('Base fee', `${d.fee_base_sats} sats`));
    lines.push('');
    lines.push(kv('Today', `${c.yellow}${c.bold}${d.today_sats.toLocaleString()}${c.reset}${c.muted} sats${c.reset}`));
    lines.push(kv('Total earned', `${c.green}${c.bold}${d.total_sats.toLocaleString()}${c.reset}${c.muted} sats${c.reset}`));

    if (d.by_connection?.length > 0) {
        lines.push('');
        lines.push(`  ${c.muted}By connection:${c.reset}`);
        for (var conn of d.by_connection) {
            lines.push(`    ${c.white}${conn.label}${c.reset}  ${c.dim}today:${c.reset} ${Math.floor(conn.today_msat / 1000)}  ${c.dim}total:${c.reset} ${Math.floor(conn.total_msat / 1000)}`);
        }
    }

    lines.push('');
    lines.push(`  ${c.dim}Fees stay in your ecash balance.${c.reset}`);
    lines.push(`  ${c.dim}Outgoing only — receiving is always free.${c.reset}`);

    return lines;
}

// ── Panel: Backup ────────────────────────────────────────────────────────

export async function backupPanel() {
    var lines = [];
    lines.push(`${c.white}${c.bold}Backup${c.reset}`);
    lines.push('');
    lines.push(`  Export an encrypted backup of your wallet state.`);
    lines.push('');
    lines.push(`  ${c.muted}Use the CLI command:${c.reset}`);
    lines.push(`  ${c.green}nutbits backup${c.reset}`);
    lines.push(`  ${c.green}nutbits backup --out ./my-backup.enc${c.reset}`);
    lines.push('');
    lines.push(`  ${c.muted}Verify a backup:${c.reset}`);
    lines.push(`  ${c.green}nutbits verify ./my-backup.enc${c.reset}`);
    return lines;
}

// ── Panel: Restore ───────────────────────────────────────────────────────

export async function restorePanel() {
    var lines = [];
    lines.push(`${c.white}${c.bold}Restore (NUT-09)${c.reset}`);
    lines.push('');
    lines.push(`  Recover ecash proofs from your seed.`);
    lines.push(`  Existing proofs are not affected.`);
    lines.push('');
    lines.push(`  ${c.muted}Use the CLI command:${c.reset}`);
    lines.push(`  ${c.green}nutbits restore${c.reset}`);
    lines.push(`  ${c.green}nutbits restore --mint <url>${c.reset}`);
    return lines;
}

// ── Panel: Pay ───────────────────────────────────────────────────────────

export async function payPanel() {
    var lines = [];
    lines.push(`${c.red}${c.bold}Pay Invoice${c.reset}`);
    lines.push('');
    lines.push(`  Pay a Lightning invoice from your ecash balance.`);
    lines.push('');
    lines.push(`  ${c.muted}Use the CLI command:${c.reset}`);
    lines.push(`  ${c.green}nutbits pay <invoice>${c.reset}`);
    lines.push(`  ${c.green}nutbits pay${c.reset}  ${c.dim}(interactive)${c.reset}`);
    return lines;
}

// ── Panel: Receive ───────────────────────────────────────────────────────

export async function receivePanel() {
    var lines = [];
    lines.push(`${c.green}${c.bold}Receive Payment${c.reset}`);
    lines.push('');
    lines.push(`  Create a Lightning invoice and wait for payment.`);
    lines.push('');
    lines.push(`  ${c.muted}Use the CLI command:${c.reset}`);
    lines.push(`  ${c.green}nutbits receive <amount>${c.reset}`);
    lines.push(`  ${c.green}nutbits receive${c.reset}  ${c.dim}(interactive)${c.reset}`);
    return lines;
}

// ── Panel: New Connection ────────────────────────────────────────────────

export async function connectPanel() {
    var lines = [];
    lines.push(`${c.purple}${c.bold}New NWC Connection${c.reset}`);
    lines.push('');
    lines.push(`  Create a new NWC connection string with`);
    lines.push(`  custom permissions and spending limits.`);
    lines.push('');
    lines.push(`  ${c.muted}Use the CLI command:${c.reset}`);
    lines.push(`  ${c.green}nutbits connect${c.reset}  ${c.dim}(guided setup)${c.reset}`);
    lines.push(`  ${c.green}nutbits connect --label "name" --permissions pay,balance${c.reset}`);
    return lines;
}

// ── Panel: Revoke ────────────────────────────────────────────────────────

export async function revokePanel(client) {
    var d = await client.get('/api/v1/connections');
    var lines = [];
    lines.push(`${c.red}${c.bold}Revoke Connection${c.reset}`);
    lines.push('');
    lines.push(`  Disconnect an NWC connection permanently.`);
    lines.push(`  Transaction history is kept.`);
    lines.push('');
    if (d.connections?.length) {
        lines.push(`  ${c.muted}Active connections:${c.reset}`);
        for (var conn of d.connections) {
            lines.push(`  ${c.purple}#${conn.id}${c.reset}  ${c.white}${conn.label}${c.reset}`);
        }
        lines.push('');
    }
    lines.push(`  ${c.muted}Use the CLI command:${c.reset}`);
    lines.push(`  ${c.green}nutbits revoke <id>${c.reset}`);
    lines.push(`  ${c.green}nutbits revoke${c.reset}  ${c.dim}(interactive)${c.reset}`);
    return lines;
}

// ── Panel Router ─────────────────────────────────────────────────────────

var PANELS = {
    status:      statusPanel,
    balance:     balancePanel,
    connections: connectionsPanel,
    history:     historyPanel,
    mints:       mintsPanel,
    nuts:        nutsPanel,
    relays:      relaysPanel,
    fees:        feesPanel,
    config:      configPanel,
    logs:        logsPanel,
    backup:      backupPanel,
    restore:     restorePanel,
    revoke:      revokePanel,
    pay:         payPanel,
    receive:     receivePanel,
    connect:     connectPanel,
};

export async function renderPanel(panelId, client) {
    var fn = PANELS[panelId];
    if (!fn) return [`${c.dim}Unknown panel: ${panelId}${c.reset}`];
    try {
        return await fn(client);
    } catch (e) {
        return [
            `${c.red}Error loading ${panelId}${c.reset}`,
            '',
            `${c.dim}${e.message}${c.reset}`,
        ];
    }
}
