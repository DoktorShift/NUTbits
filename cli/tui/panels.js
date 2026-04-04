// NUTbits TUI - Right-side panel renderers
// Each function returns an array of lines for the content panel

import { c } from '../colors.js';
import { col } from './layout.js';
import { sparkline, hbar, gauge, miniBar, brailleSparkline } from './charts.js';

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

// Standardized panel title: consistent format across all panels
// color defaults to purple for info panels; action panels pass their own
var title = (text, status, color) => {
    var clr = color || c.purple;
    var line = `${clr}${c.bold}${text}${c.reset}`;
    if (status) line += `  ${c.dim}${status}${c.reset}`;
    return line;
};

// Section divider inside a panel
var divider = () => `${c.dim}${'─'.repeat(46)}${c.reset}`;

// Safe datastore access (may not exist during early render or in CLI mode)
var getDs = (client) => client?._datastore || null;

// Inviting empty state with context and call-to-action
var emptyState = (lines, what, context, action) => {
    lines.push('');
    lines.push(`  ${c.dim}◇${c.reset} ${c.muted}${what}${c.reset}`);
    lines.push('');
    if (context) lines.push(`  ${c.dim}${context}${c.reset}`);
    if (action) lines.push(`  ${c.blue}${action}${c.reset}`);
    lines.push('');
};

// ── Panel: Status ────────────────────────────────────────────────────────

export async function statusPanel(client) {
    var d = await client.get('/api/v1/status');
    var lines = [];

    lines.push(title('Dashboard', `uptime: ${fmtUptime(d.uptime_ms)}`));
    lines.push('');

    // Active mint
    var mintHealth = d.mint?.healthy !== false ? dot.ok : dot.err;
    lines.push(kv('Mint', `${mintHealth} ${c.white}${c.bold}${d.mint?.name || 'unknown'}${c.reset}`));
    lines.push(kv('', `${c.dim}${d.mint?.url || ''}${c.reset}`));
    lines.push(kv('Version', `${d.mint?.version || '?'}`));
    // Balance with session delta
    var ds = getDs(client);
    var balLine = fmtSats(d.balance_sats);
    if (ds) {
        var balHistory = ds.getBalanceHistory();
        if (balHistory.length > 2) {
            var first = balHistory[0];
            var delta = Math.round(d.balance_sats - first);
            if (delta !== 0) {
                var sign = delta > 0 ? '+' : '';
                var deltaColor = delta > 0 ? c.green : c.red;
                balLine += `  ${deltaColor}${sign}${delta.toLocaleString()}${c.reset}`;
            }
        }
    }
    lines.push(kv('Balance', balLine));

    lines.push(kv('Storage', `${d.storage}`));
    lines.push(kv('Relays', `${d.relays?.connected || 0}/${d.relays?.total || 0} connected`));
    lines.push(kv('Seed', d.seed_configured ? `${dot.ok} configured` : `${dot.err} not set`));
    lines.push(kv('Connections', `${d.connections_count} active`));
    lines.push('');

    // Multi-mint failover summary
    try {
        var mints = await client.get('/api/v1/mints');
        if (mints.mints?.length > 1) {
            var healthy = mints.mints.filter(m => m.healthy !== false).length;
            var total = mints.mints.length;
            var failoverDot = healthy === total ? dot.ok : healthy > 0 ? dot.warn : dot.err;
            lines.push(kv('Failover', `${failoverDot} ${healthy}/${total} mints healthy`));
            for (var m of mints.mints) {
                if (m.active) continue; // already shown above
                var mDot = m.healthy !== false ? dot.ok : dot.err;
                var mintName = (m.name || m.url.replace(/^https?:\/\//, '').split('/')[0]).slice(0, 28);
                lines.push(`${c.dim}                ${mDot} ${mintName}  ${fmtSats(m.balance_sats)}${c.reset}`);
            }
            lines.push('');
        }
    } catch (e) { /* skip - single mint or API error */ }

    // NUTs
    if (d.nuts) {
        var all = ['00','01','02','03','04','05','06','07','08','09','12','13','15','17','20'];
        var nutStr = all.map(n => {
            var supported = Number(n) <= 8 ? true : d.nuts[`nut${n}`];
            return supported ? `${c.green}${n}${c.reset}` : `${c.dim}${n}${c.reset}`;
        }).join(' ');
        lines.push(kv('NUTs', nutStr));
    }

    // Activity sparkline (tx count over session)
    if (ds) {
        var txHistory = ds.getTxCountHistory();
        if (txHistory.length > 3) {
            lines.push('');
            lines.push(divider());
            lines.push('');
            var txSpark = sparkline(txHistory, 36, { color: c.green, label: 'Activity', showRange: false });
            for (var sl of txSpark) lines.push(`  ${sl}`);
        }
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

    lines.push(title('Balance Breakdown'));
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

    // Balance trend sparkline
    var ds = getDs(client);
    if (ds) {
        var balHistory = ds.getBalanceHistory();
        if (balHistory.length > 5) {
            lines.push('');
            lines.push(divider());
            lines.push('');
            lines.push(`  ${c.muted}Balance trend (session):${c.reset}`);
            lines.push('');
            var balSpark = sparkline(balHistory, 50, { color: c.yellow, showRange: true });
            for (var sl of balSpark) lines.push(`  ${sl}`);
        }
    }

    return lines;
}

// ── Panel: Connections ───────────────────────────────────────────────────

export async function connectionsPanel(client) {
    var d = await client.get('/api/v1/connections');
    var lines = [];

    lines.push(title('NWC Connections', `${(d.connections || []).length} active`));
    lines.push('');

    if (!d.connections?.length) {
        emptyState(lines,
            'No connections yet',
            'Each NWC connection can have custom permissions and spending limits.',
            'Navigate to "New Connection" and press Enter to create one.'
        );
        return lines;
    }

    var permLabel = p => {
        if (p === 'pay_invoice') return `${c.red}pay${c.reset}`;
        if (p === 'make_invoice') return `${c.green}recv${c.reset}`;
        if (p === 'get_balance') return `${c.yellow}bal${c.reset}`;
        if (p === 'list_transactions' || p === 'lookup_invoice') return `${c.muted}hist${c.reset}`;
        if (p === 'get_info') return `${c.muted}info${c.reset}`;
        return '';
    };

    for (var conn of d.connections) {
        var perms = (conn.permissions || [])
            .map(permLabel)
            .filter((v, i, a) => a.indexOf(v) === i)
            .filter(Boolean);

        var label = conn.label || '—';
        var tag = conn.dedicated ? ` ${c.dim}[dedicated]${c.reset}` : '';
        lines.push(`  ${c.purple}${c.bold}#${conn.id}${c.reset}  ${c.white}${c.bold}${label}${c.reset}${tag}`);
        lines.push(`     ${perms.join(`${c.dim} | ${c.reset}`)}`);
        if (conn.dedicated) {
            var dedSats = Math.floor((conn.dedicated_balance_msat || 0) / 1000);
            lines.push(`     ${fmtSats(dedSats)}${c.dim} dedicated${c.reset}  ${c.dim}${conn.tx_count || 0} transactions${c.reset}`);
        } else {
            lines.push(`     ${fmtSats(Math.floor((conn.balance_msat || 0) / 1000))}  ${c.dim}${conn.tx_count || 0} transactions${c.reset}`);
        }
        if (conn.lud16) lines.push(`     ${c.cyan}${conn.lud16}${c.reset}`);
        if (conn.max_daily_sats) lines.push(`     ${c.dim}daily limit: ${conn.max_daily_sats.toLocaleString()} sats${c.reset}`);
        lines.push('');
    }

    return lines;
}

// ── Panel: History ───────────────────────────────────────────────────────

export async function historyPanel(client) {
    var d = await client.get('/api/v1/history', { limit: '30', unpaid: 'true' });
    var lines = [];

    lines.push(title('Recent Transactions', `${d.total} total`));
    lines.push('');

    if (!d.transactions?.length) {
        emptyState(lines,
            'No transactions yet',
            'Incoming payments and sent invoices will appear here.',
            'Select "Receive" in the menu and press Enter to get started.'
        );
        return lines;
    }

    // Split by channel
    var nwcTxs = d.transactions.filter(tx => tx.connection_label !== 'API');
    var mintTxs = d.transactions.filter(tx => tx.connection_label === 'API');

    var renderTxRow = (tx) => {
        var time = tx.created_at ? fmtTime(tx.created_at * 1000) : '—';
        var arrow = tx.type === 'incoming' ? `${c.green}← in${c.reset}` : `${c.red}→ out${c.reset}`;
        var amt = fmtSats(Math.floor((tx.amount || 0) / 1000));
        var status = tx.settled_at ? `${c.green}settled${c.reset}`
            : tx.err_msg ? `${c.red}failed${c.reset}`
            : `${c.yellow}pending${c.reset}`;
        return `  ${col(time, 12)}${col(arrow, 8)}${col(amt, 16)}${status}`;
    };

    // ── NWC Channel ──────────────────────────────────────────────
    lines.push(`  ${c.blue}◆${c.reset} ${c.white}${c.bold}NWC${c.reset}${c.muted}  Nostr Wallet Connect${c.reset}`);
    lines.push(`  ${c.dim}${'─'.repeat(52)}${c.reset}`);

    if (nwcTxs.length === 0) {
        lines.push(`  ${c.dim}No NWC transactions yet${c.reset}`);
    } else {
        lines.push(`  ${c.muted}${'Time'.padEnd(12)}${'Type'.padEnd(8)}${'Amount'.padEnd(16)}${'Status'.padEnd(10)}${'Via'}${c.reset}`);
        for (var tx of nwcTxs.slice(0, 10)) {
            var row = renderTxRow(tx);
            var via = `  ${c.blue}${(tx.connection_label || '—').slice(0, 12)}${c.reset}`;
            lines.push(`${row}${via}`);
        }
        if (nwcTxs.length > 10) {
            lines.push(`  ${c.dim}+ ${nwcTxs.length - 10} more NWC transactions${c.reset}`);
        }
    }

    lines.push('');

    // ── Mint Channel ─────────────────────────────────────────────
    lines.push(`  ${c.purple}◆${c.reset} ${c.white}${c.bold}Mint${c.reset}${c.muted}  Direct CLI / API${c.reset}`);
    lines.push(`  ${c.dim}${'─'.repeat(52)}${c.reset}`);

    if (mintTxs.length === 0) {
        lines.push(`  ${c.dim}No direct mint transactions yet${c.reset}`);
    } else {
        lines.push(`  ${c.muted}${'Time'.padEnd(12)}${'Type'.padEnd(8)}${'Amount'.padEnd(16)}Status${c.reset}`);
        for (var tx of mintTxs.slice(0, 10)) {
            lines.push(renderTxRow(tx));
        }
        if (mintTxs.length > 10) {
            lines.push(`  ${c.dim}+ ${mintTxs.length - 10} more mint transactions${c.reset}`);
        }
    }

    if (d.total > 30) {
        lines.push('');
        lines.push(`  ${c.dim}Showing 30 of ${d.total}. Navigate to "Export History" to download all.${c.reset}`);
    }

    return lines;
}

// ── Panel: Mints ─────────────────────────────────────────────────────────

export async function mintsPanel(client) {
    var d = await client.get('/api/v1/mints');
    var lines = [];

    lines.push(title('Configured Mints'));
    lines.push('');

    var ds = getDs(client);
    for (var m of (d.mints || [])) {
        var health = m.healthy === true ? dot.ok : m.healthy === false ? dot.err : dot.off;
        var active = m.active ? `${c.green}active${c.reset}` : `${c.dim}standby${c.reset}`;
        lines.push(`  ${health} ${c.white}${c.bold}${m.name || 'unknown'}${c.reset}  ${active}  ${fmtSats(m.balance_sats)}`);
        lines.push(`    ${c.dim}${m.url}${c.reset}`);
        if (m.version) lines.push(`    ${c.dim}Version: ${m.version}${c.reset}`);
        if (m.motd) lines.push(`    ${c.yellow}MOTD: "${m.motd}"${c.reset}`);

        // Response time sparkline from session data
        if (ds) {
            var responseTimes = ds.getMintResponseTimes(m.url);
            if (responseTimes.length > 3) {
                var avg = Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length);
                var rtSpark = sparkline(responseTimes, 30, { color: c.blue, showRange: false });
                if (rtSpark.length > 0) {
                    lines.push(`    ${c.dim}Response:${c.reset} ${rtSpark[rtSpark.length > 1 ? 1 : 0]}  ${c.dim}avg ${avg}ms${c.reset}`);
                }
            }
        }
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

    lines.push(title('NUT Support'));
    lines.push('');

    if (mintUrls.length <= 1) {
        var url = mintUrls[0] || '';
        var mintNuts = d.mints?.[url]?.nuts || {};

        // Single column list - cleaner and more reliable than two-column
        for (var nid of nutIds) {
            var ok = mintNuts[nid];
            var icon = ok ? `${c.green}✓${c.reset}` : `${c.dim}✗${c.reset}`;
            var name = `${ok ? c.white : c.dim}${nutNames[nid] || ''}${c.reset}`;
            lines.push(`  ${icon} ${c.muted}${nid}${c.reset}  ${name}`);
        }

        var supported = Object.values(mintNuts).filter(Boolean).length;
        lines.push('');
        lines.push(`  ${c.muted}${supported}/${nutIds.length} NUTs supported${c.reset}`);
    } else {
        // Multi-mint: show each mint separately (scales to any count)
        for (var url of mintUrls) {
            var mintNuts = d.mints[url]?.nuts || {};
            var isActive = d.mints[url]?.active;
            var mintLabel = url.replace(/^https?:\/\//, '').split('/')[0].slice(0, 30);
            var statusTag = isActive ? `${c.green}active${c.reset}` : `${c.dim}standby${c.reset}`;
            var supported = Object.values(mintNuts).filter(Boolean).length;

            lines.push(`  ${c.white}${c.bold}${mintLabel}${c.reset}  ${statusTag}  ${c.dim}(${supported}/${nutIds.length})${c.reset}`);
            var nutLine = '  ';
            for (var n of nutIds) {
                nutLine += (mintNuts[n] ? `${c.green}${n}${c.reset}` : `${c.dim}${n}${c.reset}`) + ' ';
            }
            lines.push(nutLine);
            lines.push('');
        }
    }

    return lines;
}

// ── Panel: Relays ────────────────────────────────────────────────────────

export async function relaysPanel(client) {
    var d = await client.get('/api/v1/relays');
    var lines = [];

    lines.push(title('Nostr Relays', `${d.connected}/${d.total} connected`));
    lines.push('');

    if (!d.relays?.length) {
        emptyState(lines,
            'No relays configured',
            'Relays carry NWC messages between your wallet and apps.',
            'Set NUTBITS_RELAYS in .env to add relay URLs.'
        );
        return lines;
    }

    for (var r of (d.relays || [])) {
        var statusDot = r.connected ? dot.ok : dot.err;
        var statusText = r.connected ? `${c.green}connected${c.reset}` : `${c.red}disconnected${c.reset}`;
        var shortUrl = r.url.replace(/^wss?:\/\//, '');

        lines.push(`  ${statusDot} ${c.white}${c.bold}${shortUrl}${c.reset}`);
        lines.push(`    ${statusText}${r.subscriptions > 0 ? `  ${c.dim}${r.subscriptions} NWC link${r.subscriptions > 1 ? 's' : ''} active${c.reset}` : ''}`);
        lines.push('');
    }

    lines.push(divider());
    lines.push('');
    lines.push(`  ${c.dim}Relays carry NWC messages between your wallet and connected apps.${c.reset}`);
    lines.push(`  ${c.dim}At least one relay must be connected for NWC to work.${c.reset}`);

    return lines;
}

// ── Panel: Config ────────────────────────────────────────────────────────

export async function configPanel(client) {
    var lines = [];

    lines.push(title('Configuration'));
    lines.push('');

    try {
        var env;
        try {
            env = await client.get('/api/v1/config/env');
        } catch (envErr) {
            // Fallback to basic config if env endpoint not available
            var d = await client.get('/api/v1/config');
            lines.push(kv('Mint', `${c.dim}${(d.active_mint || '').replace(/^https?:\/\//, '').slice(0, 38)}${c.reset}`));
            lines.push(kv('Storage', d.storage || 'file'));
            lines.push(kv('Log level', d.log_level || 'info'));
            lines.push(kv('Seed', d.seed_configured ? `${c.green}configured${c.reset}` : `${c.red}not set${c.reset}`));
            lines.push('');
            lines.push(`  ${c.green}${c.bold}Press Enter to change settings${c.reset}`);
            return lines;
        }

        if (!env.file_exists) {
            lines.push(`  ${c.red}No .env file found${c.reset}`);
            lines.push(`  ${c.dim}Run: cp .env.example .env${c.reset}`);
            return lines;
        }

        // Group options by category for visual structure
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

        // Collect keys that aren't in any category
        var categorizedKeys = new Set(Object.values(categories).flat());
        var uncategorized = Object.keys(optMap).filter(k => !categorizedKeys.has(k));
        if (uncategorized.length > 0) categories['Other'] = uncategorized;

        for (var [catName, keys] of Object.entries(categories)) {
            var catOpts = keys.map(k => optMap[k]).filter(Boolean);
            if (catOpts.length === 0) continue;

            lines.push(`  ${c.purple}${c.bold}${catName}${c.reset}`);

            for (var opt of catOpts) {
                var statusDot = opt.active ? `${c.green}●${c.reset}` : `${c.dim}○${c.reset}`;
                var val = opt.value || '';
                if (opt.sensitive && val) val = '***';
                if (val.length > 28) val = val.slice(0, 26) + '..';
                var liveTag = opt.restart ? '' : ` ${c.blue}live${c.reset}`;
                var shortKey = opt.key.replace('NUTBITS_', '');

                lines.push(`  ${statusDot} ${c.white}${shortKey}${c.reset}${liveTag}  ${c.dim}${val || '(not set)'}${c.reset}`);
            }
            lines.push('');
        }

        lines.push(divider());
        lines.push('');
        lines.push(`  ${c.green}●${c.reset} ${c.dim}= active${c.reset}   ${c.dim}○ = inactive${c.reset}   ${c.blue}live${c.reset} ${c.dim}= no restart needed${c.reset}`);
        lines.push('');
        lines.push(`  ${c.green}${c.bold}Press Enter to change settings${c.reset}`);

    } catch (e) {
        lines.push(`  ${c.red}Could not load config: ${e.message}${c.reset}`);
    }

    return lines;
}

// ── Panel: Logs ──────────────────────────────────────────────────────────

var LOG_COLORS = { error: c.red, warn: c.yellow, info: c.blue, debug: c.dim };

export async function logsPanel(client) {
    var d = await client.get('/api/v1/logs', { level: 'info', limit: '20' });
    var lines = [];

    lines.push(title('Recent Logs'));
    lines.push('');

    for (var entry of (d.logs || [])) {
        var time = new Date(entry.ts).toLocaleTimeString('en-US', { hour12: false });
        var lvl = (entry.level || 'info').toUpperCase().padEnd(5);
        var clr = LOG_COLORS[entry.level] || c.muted;
        var msg = entry.msg || '';
        if (msg.length > 80) msg = msg.slice(0, 77) + '...';
        lines.push(`  ${c.dim}${time}${c.reset} ${clr}${lvl}${c.reset} ${msg}`);
    }

    if (!d.logs?.length) {
        emptyState(lines, 'No recent logs', 'Logs appear as NUTbits processes NWC requests.', null);
    }

    return lines;
}

// ── Panel: Fees ──────────────────────────────────────────────────────────

export async function feesPanel(client) {
    var d = await client.get('/api/v1/fees');
    var lines = [];

    lines.push(title('Service Fee Revenue', null, c.yellow));
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

    // Fee trend sparkline
    var ds = getDs(client);
    if (ds) {
        var feeHistory = ds.getFeeHistory();
        if (feeHistory.length > 3) {
            lines.push('');
            lines.push(divider());
            lines.push('');
            lines.push(`  ${c.muted}Revenue trend (session):${c.reset}`);
            lines.push('');
            var feeSpark = sparkline(feeHistory, 40, { color: c.yellow, showRange: true });
            for (var sl of feeSpark) lines.push(`  ${sl}`);
        }
    }

    if (d.by_connection?.length > 0) {
        lines.push('');
        lines.push(divider());
        lines.push('');
        lines.push(`  ${c.muted}By connection:${c.reset}`);
        lines.push('');
        var sortedConns = d.by_connection.slice().sort((a, b) => b.total_msat - a.total_msat);
        var barData = sortedConns.map(cn => ({
            label: cn.label.slice(0, 14),
            value: Math.floor(cn.total_msat / 1000),
            color: c.yellow,
        }));
        var bars = hbar(barData, 50, { unit: 'sats', showPct: true });
        for (var bl of bars) lines.push(`  ${bl}`);
    }

    lines.push('');
    lines.push(`  ${c.dim}Fees stay in your ecash balance.${c.reset}`);
    lines.push(`  ${c.dim}Outgoing only. Receiving is always free.${c.reset}`);

    return lines;
}

// ── Panel: Backup ────────────────────────────────────────────────────────

export async function backupPanel(client) {
    var lines = [];
    lines.push(title('Backup'));
    lines.push('');

    try {
        var bal = await client.get('/api/v1/balance');
        var conns = await client.get('/api/v1/connections');
        lines.push(`  ${c.muted}Current state:${c.reset}`);
        lines.push(`    Balance: ${fmtSats(bal.total_sats)}  across ${bal.mints?.length || 0} mint(s)`);
        lines.push(`    Connections: ${conns.connections?.length || 0}`);
        lines.push('');
    } catch (e) { /* skip */ }

    lines.push(`  Export an encrypted backup of your wallet.`);
    lines.push(`  Encrypted with your state passphrase.`);
    lines.push('');
    lines.push(`  ${c.green}${c.bold}Press Enter to export backup${c.reset}`);
    lines.push('');
    lines.push(`  ${c.dim}Or run directly:  nutbits backup --out ./file.enc${c.reset}`);
    lines.push(`  ${c.dim}Verify backup:    nutbits verify ./file.enc${c.reset}`);
    return lines;
}

// ── Panel: Restore ───────────────────────────────────────────────────────

export async function restorePanel(client) {
    var lines = [];
    lines.push(title('Restore', 'NUT-09'));
    lines.push('');

    try {
        var status = await client.get('/api/v1/status');
        lines.push(`  ${c.muted}Seed:${c.reset} ${status.seed_configured ? `${c.green}configured${c.reset}` : `${c.red}not set${c.reset}`}`);
        lines.push('');
    } catch (e) { /* skip */ }

    lines.push(`  Recover ecash proofs from your seed.`);
    lines.push(`  Existing proofs are not affected.`);
    lines.push(`  The mint must support NUT-09.`);
    lines.push('');
    lines.push(`  ${c.green}${c.bold}Press Enter to start recovery${c.reset}`);
    lines.push('');
    lines.push(`  ${c.dim}Or run directly:  nutbits restore${c.reset}`);
    return lines;
}

// ── Panel: Pay ───────────────────────────────────────────────────────────

export async function payPanel(client) {
    var lines = [];
    lines.push(title('Pay Invoice', null, c.red));
    lines.push('');

    try {
        var bal = await client.get('/api/v1/balance');
        lines.push(`  ${c.muted}Available balance:${c.reset} ${fmtSats(bal.total_sats)}`);
        lines.push('');
    } catch (e) { /* skip */ }

    lines.push(`  Pay a Lightning invoice from your ecash balance.`);
    lines.push(`  The mint handles the Lightning routing.`);
    lines.push('');
    lines.push(`  ${c.green}${c.bold}Press Enter to start${c.reset}`);
    lines.push('');
    lines.push(`  ${c.dim}Or run directly:  nutbits pay lnbc...${c.reset}`);
    return lines;
}

// ── Panel: Receive ───────────────────────────────────────────────────────

export async function receivePanel(client) {
    var lines = [];
    lines.push(title('Receive Payment', null, c.green));
    lines.push('');

    try {
        var status = await client.get('/api/v1/status');
        lines.push(`  ${c.muted}Mint:${c.reset} ${status.mint?.name || 'unknown'}`);
        lines.push(`  ${c.muted}Current balance:${c.reset} ${fmtSats(status.balance_sats)}`);
        lines.push('');
    } catch (e) { /* skip */ }

    lines.push(`  Create a Lightning invoice. The mint provides the`);
    lines.push(`  invoice, and NUTbits mints ecash when it's paid.`);
    lines.push('');
    lines.push(`  ${c.green}${c.bold}Press Enter to start${c.reset}`);
    lines.push('');
    lines.push(`  ${c.dim}Or run directly:  nutbits receive 1000${c.reset}`);
    return lines;
}

// ── Panel: New Connection ────────────────────────────────────────────────

export async function connectPanel(client) {
    var lines = [];
    lines.push(title('New NWC Connection', null, c.blue));
    lines.push('');

    try {
        var d = await client.get('/api/v1/connections');
        lines.push(`  ${c.muted}Current connections:${c.reset} ${d.connections?.length || 0}`);
        lines.push('');
    } catch (e) { /* skip */ }

    lines.push(`  Create a new NWC connection string with`);
    lines.push(`  custom permissions and spending limits.`);
    lines.push('');
    lines.push(`  Each connection gets its own NWC string,`);
    lines.push(`  scoped permissions, and optional fee rate.`);
    lines.push('');
    lines.push(`  ${c.green}${c.bold}Press Enter to start guided setup${c.reset}`);
    lines.push('');
    lines.push(`  ${c.dim}Or run directly:  nutbits connect --label "name"${c.reset}`);
    return lines;
}

// ── Panel: Export History ────────────────────────────────────────────────

export async function exportPanel(client) {
    var lines = [];
    lines.push(title('Export Data', null, c.yellow));
    lines.push('');

    try {
        var d = await client.get('/api/v1/history', { limit: '1', unpaid: 'true' });
        var cn = await client.get('/api/v1/connections');
        var mn = await client.get('/api/v1/mints');
        lines.push(`  ${c.muted}Transactions:${c.reset}  ${c.white}${c.bold}${d.total}${c.reset}`);
        lines.push(`  ${c.muted}Connections:${c.reset}   ${c.white}${cn.connections?.length || 0}${c.reset} active`);
        lines.push(`  ${c.muted}Mints:${c.reset}         ${c.white}${mn.mints?.length || 0}${c.reset} configured`);
        lines.push('');
    } catch (e) {
        lines.push('');
    }

    lines.push(`  ${c.white}${c.bold}Available exports:${c.reset}`);
    lines.push('');
    lines.push(`  ${c.purple}●${c.reset} ${c.white}Transaction history${c.reset}`);
    lines.push(`    ${c.dim}All payments as CSV or JSON: amounts, fees,${c.reset}`);
    lines.push(`    ${c.dim}timestamps, connections, and payment hashes${c.reset}`);
    lines.push('');
    lines.push(`  ${c.purple}●${c.reset} ${c.white}NWC connections${c.reset}`);
    lines.push(`    ${c.dim}Connection strings, permissions, spending${c.reset}`);
    lines.push(`    ${c.dim}limits, and per-connection fee settings${c.reset}`);
    lines.push('');
    lines.push(`  ${c.purple}●${c.reset} ${c.white}Mint info${c.reset}`);
    lines.push(`    ${c.dim}Mint details, NUT capabilities, balances,${c.reset}`);
    lines.push(`    ${c.dim}health status, and version info${c.reset}`);
    lines.push('');
    lines.push(`  ${c.green}${c.bold}Press Enter to choose what to export${c.reset}`);
    lines.push('');
    lines.push(`  ${c.dim}Or run directly:${c.reset}`);
    lines.push(`  ${c.dim}  nutbits export history --format csv${c.reset}`);
    lines.push(`  ${c.dim}  nutbits export connections${c.reset}`);
    lines.push(`  ${c.dim}  nutbits export mints${c.reset}`);
    return lines;
}

// ── Panel: Revoke ────────────────────────────────────────────────────────

export async function revokePanel(client) {
    var lines = [];
    lines.push(title('Revoke Connection', null, c.red));
    lines.push('');
    lines.push(`  Disconnect an NWC connection permanently.`);
    lines.push(`  Transaction history is kept.`);
    lines.push('');

    try {
        var d = await client.get('/api/v1/connections');
        if (d.connections?.length) {
            lines.push(`  ${c.muted}Active connections:${c.reset}`);
            lines.push('');
            for (var conn of d.connections) {
                lines.push(`    ${c.purple}#${conn.id}${c.reset}  ${c.white}${conn.label}${c.reset}  ${c.dim}(${conn.tx_count || 0} txs)${c.reset}`);
            }
            lines.push('');
        } else {
            lines.push(`  ${c.dim}No active connections to revoke.${c.reset}`);
            lines.push('');
        }
    } catch (e) { /* skip */ }

    lines.push(`  ${c.green}${c.bold}Press Enter to select and revoke${c.reset}`);
    lines.push('');
    lines.push(`  ${c.dim}Or run directly:  nutbits revoke <id>${c.reset}`);
    return lines;
}

// ── Panel: Activity ──────────────────────────────────────────────────────

export async function activityPanel(client) {
    var lines = [];
    lines.push(title('Activity'));
    lines.push('');

    // Fetch transaction data for breakdown
    var allTxs = [];
    try {
        var hist = await client.get('/api/v1/history', { limit: '100', unpaid: 'true' });
        allTxs = hist.transactions || [];
    } catch (e) { /* skip */ }

    if (allTxs.length === 0) {
        emptyState(lines,
            'No activity data yet',
            'Charts and breakdowns appear as payments flow through NUTbits.',
            'Send or receive sats to see volume, trends, and connection stats.'
        );
        return lines;
    }

    // Split by channel
    var nwcTxs = allTxs.filter(tx => tx.connection_label !== 'API');
    var mintTxs = allTxs.filter(tx => tx.connection_label === 'API');

    // Volume by day (last 7 days)
    var now = Math.floor(Date.now() / 1000);
    var dayBuckets = { nwc: {}, mint: {} };
    var dayLabels = [];
    for (var i = 6; i >= 0; i--) {
        var dayTs = now - i * 86400;
        var dayKey = new Date(dayTs * 1000).toLocaleDateString('en-US', { weekday: 'short' });
        dayBuckets.nwc[dayKey] = 0;
        dayBuckets.mint[dayKey] = 0;
        dayLabels.push(dayKey);
    }

    // Aggregate stats per channel
    var stats = {
        nwc:  { incoming: 0, outgoing: 0, settled: 0, failed: 0, count: nwcTxs.length },
        mint: { incoming: 0, outgoing: 0, settled: 0, failed: 0, count: mintTxs.length },
    };

    for (var tx of allTxs) {
        var isNwc = tx.connection_label !== 'API';
        var ch = isNwc ? 'nwc' : 'mint';
        var amtSats = Math.floor((tx.amount || 0) / 1000);

        if (tx.settled_at) stats[ch].settled++;
        if (tx.err_msg) stats[ch].failed++;
        if (tx.type === 'incoming') stats[ch].incoming += amtSats;
        else stats[ch].outgoing += amtSats;

        var txDay = new Date((tx.created_at || 0) * 1000).toLocaleDateString('en-US', { weekday: 'short' });
        if (dayBuckets[ch][txDay] !== undefined) dayBuckets[ch][txDay] += amtSats;
    }

    // ── Channel Overview ─────────────────────────────────────────
    var nwcTotal = stats.nwc.incoming + stats.nwc.outgoing;
    var mintTotal = stats.mint.incoming + stats.mint.outgoing;

    lines.push(`  ${c.muted}Volume by channel:${c.reset}`);
    lines.push('');

    var channelData = [];
    if (nwcTotal > 0) channelData.push({ label: 'NWC', value: nwcTotal, color: c.blue });
    if (mintTotal > 0) channelData.push({ label: 'Mint', value: mintTotal, color: c.purple });
    if (channelData.length > 0) {
        var chBars = hbar(channelData, 48, { unit: 'sats', showPct: true });
        for (var chb of chBars) lines.push(`  ${chb}`);
    }

    lines.push('');
    lines.push(divider());

    // ── NWC Channel Detail ───────────────────────────────────────
    lines.push('');
    lines.push(`  ${c.blue}◆${c.reset} ${c.white}${c.bold}NWC${c.reset}  ${c.muted}Nostr Wallet Connect${c.reset}  ${c.dim}${stats.nwc.count} txs${c.reset}`);
    lines.push('');

    if (stats.nwc.count === 0) {
        lines.push(`  ${c.dim}  No NWC transactions yet${c.reset}`);
    } else {
        lines.push(kv('    Incoming', `${c.green}${c.bold}${stats.nwc.incoming.toLocaleString()}${c.reset}${c.muted} sats${c.reset}`));
        lines.push(kv('    Outgoing', `${c.red}${c.bold}${stats.nwc.outgoing.toLocaleString()}${c.reset}${c.muted} sats${c.reset}`));
        lines.push(kv('    Net flow', `${c.white}${c.bold}${(stats.nwc.incoming - stats.nwc.outgoing).toLocaleString()}${c.reset}${c.muted} sats${c.reset}`));

        var nwcTotalTx = stats.nwc.settled + stats.nwc.failed;
        if (nwcTotalTx > 0) {
            lines.push('');
            var nwcGauge = gauge(stats.nwc.settled, nwcTotalTx, 28, { label: '    Success', color: c.green, showPct: true });
            for (var ng of nwcGauge) lines.push(ng);
        }

        // Per-connection breakdown within NWC
        var connMap = {};
        for (var tx of nwcTxs) {
            var cl = tx.connection_label || 'unknown';
            connMap[cl] = (connMap[cl] || 0) + Math.floor((tx.amount || 0) / 1000);
        }
        var connEntries = Object.entries(connMap).sort((a, b) => b[1] - a[1]);
        if (connEntries.length > 0) {
            lines.push('');
            lines.push(`  ${c.dim}  By connection:${c.reset}`);
            lines.push('');
            var connData = connEntries.slice(0, 6).map(([label, value]) => ({
                label: label.slice(0, 14),
                value,
                color: c.blue,
            }));
            var connBars = hbar(connData, 44, { unit: 'sats', showPct: true });
            for (var cb of connBars) lines.push(`    ${cb}`);
        }
    }

    lines.push('');
    lines.push(divider());

    // ── Mint Channel Detail ──────────────────────────────────────
    lines.push('');
    lines.push(`  ${c.purple}◆${c.reset} ${c.white}${c.bold}Mint${c.reset}  ${c.muted}Direct CLI / API${c.reset}  ${c.dim}${stats.mint.count} txs${c.reset}`);
    lines.push('');

    if (stats.mint.count === 0) {
        lines.push(`  ${c.dim}  No direct mint transactions yet${c.reset}`);
    } else {
        lines.push(kv('    Received', `${c.green}${c.bold}${stats.mint.incoming.toLocaleString()}${c.reset}${c.muted} sats${c.reset}`));
        lines.push(kv('    Sent', `${c.red}${c.bold}${stats.mint.outgoing.toLocaleString()}${c.reset}${c.muted} sats${c.reset}`));
        lines.push(kv('    Net flow', `${c.white}${c.bold}${(stats.mint.incoming - stats.mint.outgoing).toLocaleString()}${c.reset}${c.muted} sats${c.reset}`));

        var mintTotalTx = stats.mint.settled + stats.mint.failed;
        if (mintTotalTx > 0) {
            lines.push('');
            var mintGauge = gauge(stats.mint.settled, mintTotalTx, 28, { label: '    Success', color: c.green, showPct: true });
            for (var mg of mintGauge) lines.push(mg);
        }
    }

    lines.push('');
    lines.push(divider());
    lines.push('');

    // ── Combined Daily Volume ────────────────────────────────────
    lines.push(`  ${c.muted}Daily volume (last 7 days):${c.reset}`);
    lines.push('');
    var dayData = dayLabels.map(d => {
        var nwcVal = dayBuckets.nwc[d];
        var mintVal = dayBuckets.mint[d];
        return { label: d, value: nwcVal + mintVal, color: nwcVal >= mintVal ? c.blue : c.purple };
    });
    while (dayData.length > 1 && dayData[0].value === 0) dayData.shift();
    var dayBars = hbar(dayData, 48, { unit: 'sats', showPct: false });
    for (var bl of dayBars) lines.push(`  ${bl}`);

    // ── Combined Summary ─────────────────────────────────────────
    var totalIncoming = stats.nwc.incoming + stats.mint.incoming;
    var totalOutgoing = stats.nwc.outgoing + stats.mint.outgoing;

    lines.push('');
    lines.push(divider());
    lines.push('');
    lines.push(`  ${c.muted}Combined:${c.reset}`);
    lines.push('');
    lines.push(kv('  Incoming', `${c.green}${c.bold}${totalIncoming.toLocaleString()}${c.reset}${c.muted} sats${c.reset}`));
    lines.push(kv('  Outgoing', `${c.red}${c.bold}${totalOutgoing.toLocaleString()}${c.reset}${c.muted} sats${c.reset}`));
    lines.push(kv('  Net flow', `${c.white}${c.bold}${(totalIncoming - totalOutgoing).toLocaleString()}${c.reset}${c.muted} sats${c.reset}`));

    // Session activity sparkline
    var ds = getDs(client);
    if (ds) {
        var txHistory = ds.getTxCountHistory();
        if (txHistory.length > 5) {
            lines.push('');
            lines.push(divider());
            lines.push('');
            lines.push(`  ${c.muted}Session activity (tx count):${c.reset}`);
            lines.push('');
            var actSpark = sparkline(txHistory, 48, { color: c.green, showRange: true });
            for (var asl of actSpark) lines.push(`  ${asl}`);
        }
    }

    return lines;
}

// ── Panel Router ─────────────────────────────────────────────────────────

var PANELS = {
    status:      statusPanel,
    balance:     balancePanel,
    connections: connectionsPanel,
    history:     historyPanel,
    activity:    activityPanel,
    mints:       mintsPanel,
    nuts:        nutsPanel,
    relays:      relaysPanel,
    fees:        feesPanel,
    config:      configPanel,
    logs:        logsPanel,
    backup:      backupPanel,
    restore:     restorePanel,
    export:      exportPanel,
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
            '',
            `  ${c.red}${c.bold}Error loading ${panelId}${c.reset}`,
            '',
            `  ${c.dim}${(e.message || '').slice(0, 100)}${c.reset}`,
            '',
            `  ${c.muted}Press ${c.white}r${c.muted} to retry or check if NUTbits is running.${c.reset}`,
        ];
    }
}
