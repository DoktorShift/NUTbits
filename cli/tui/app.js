// NUTbits TUI - Full-screen terminal application
// Split-panel interface with focus model, vim keys, and contextual help
// Zero dependencies - raw ANSI + stdin

import { c, stripAnsi } from '../colors.js';
import { createBuffer, getSize, drawFrame, drawRow, drawTitleSep, drawFooter, enterScreen, exitScreen, getMenuWidth } from './layout.js';
import { createMenuState, menuUp, menuDown, getSelectedId, renderMenu, NAV_ITEMS, MENU_ITEMS } from './menu.js';
import { renderPanel } from './panels.js';
import { spinner } from '../prompts.js';
import { createDatastore } from './datastore.js';

// ── Action Panel -> CLI Command Mapping ──────────────────────────────────

var ACTION_COMMANDS = {
    pay:         () => import('../commands/pay.js'),
    receive:     () => import('../commands/receive.js'),
    connect:     () => import('../commands/connect.js'),
    export:      () => import('../commands/export.js'),
    revoke:      () => import('../commands/revoke.js'),
    fund:        () => import('../commands/fund.js'),
    withdraw:    () => import('../commands/withdraw.js'),
    backup:      () => import('../commands/backup.js'),
    restore:     () => import('../commands/restore.js'),
    config:      { loader: () => import('../commands/config.js'), args: { _positional: ['set'] } },
};

// ── Splash Screen ────────────────────────────────────────────────────────

var LOGO_WIDTH = 58;

var LOGO = [
    `${c.purple}${c.bold}███╗   ██╗██╗   ██╗████████╗██████╗ ██╗████████╗███████╗${c.reset}`,
    `${c.purple}${c.bold}████╗  ██║██║   ██║╚══██╔══╝██╔══██╗██║╚══██╔══╝██╔════╝${c.reset}`,
    `${c.purple}${c.bold}██╔██╗ ██║██║   ██║   ██║   ██████╔╝██║   ██║   ███████╗${c.reset}`,
    `${c.purple}${c.bold}██║╚██╗██║██║   ██║   ██║   ██╔══██╗██║   ██║   ╚════██║${c.reset}`,
    `${c.purple}${c.bold}██║ ╚████║╚██████╔╝   ██║   ██████╔╝██║   ██║   ███████║${c.reset}`,
    `${c.purple}${c.bold}╚═╝  ╚═══╝ ╚═════╝    ╚═╝   ╚═════╝ ╚═╝   ╚═╝   ╚══════╝${c.reset}`,
];

var wait = ms => new Promise(r => setTimeout(r, ms));

var showSplash = async (client) => {
    var size = getSize();
    enterScreen();

    var pad = ' '.repeat(Math.max(0, Math.floor((size.cols - LOGO_WIDTH) / 2)));
    var indent = pad + '  ';

    var totalHeight = LOGO.length + 14 + 6;
    var topPad = Math.max(1, Math.floor((size.rows - totalHeight) / 2));
    for (var i = 0; i < topPad; i++) console.log('');

    for (var line of LOGO) {
        console.log(pad + line);
        await wait(40);
    }
    await wait(200);

    console.log('');
    console.log(`${indent}${c.yellow}${c.bold}ecash meets Lightning${c.reset}`);
    console.log(`${indent}${c.white}your nuts, your rules${c.reset}`);
    console.log('');
    console.log(`${indent}${c.dim}${'─'.repeat(Math.min(LOGO_WIDTH - 4, 50))}${c.reset}`);
    console.log('');
    console.log(`${indent}${c.muted}Cashu ecash to NWC bridge${c.reset}`);
    console.log(`${indent}${c.dim}by DoktorShift · inspired by supertestnet/bankify${c.reset}`);
    await wait(600);

    console.log('');

    var checkLine = (icon, label, detail) => {
        console.log(`${indent}${icon}  ${c.white}${label.padEnd(14)}${c.reset}${c.dim}${detail}${c.reset}`);
    };

    var sp = spinner(`${indent}Connecting to service`);
    sp.start();
    var status = null;
    try { status = await client.get('/api/v1/status'); } catch (e) { /* */ }
    sp.stop('');

    if (!status) {
        checkLine(`${c.red}✗${c.reset}`, 'Service', 'not responding');
        console.log('');
        console.log(`${indent}${c.muted}Start NUTbits first: ${c.white}npm start${c.reset}`);
        console.log('');
        console.log(`${indent}${c.dim}Press any key to exit...${c.reset}`);
        process.stdout.write('\x1b[?25h');
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding('utf8');
        await new Promise(r => process.stdin.once('data', r));
        exitScreen();
        process.exit(1);
    }

    checkLine(`${c.green}●${c.reset}`, 'Service', `running · uptime ${formatUptime(status.uptime_ms)}`);
    await wait(150);
    checkLine(status.mint?.healthy !== false ? `${c.green}●${c.reset}` : `${c.red}●${c.reset}`, 'Mint', `${status.mint?.name || 'unknown'}`);
    await wait(150);
    checkLine(`${c.yellow}●${c.reset}`, 'Balance', `${status.balance_sats.toLocaleString()} sats`);
    await wait(150);
    checkLine(status.relays?.connected > 0 ? `${c.green}●${c.reset}` : `${c.red}●${c.reset}`, 'Relays', `${status.relays?.connected || 0}/${status.relays?.total || 0} connected`);
    await wait(150);
    checkLine(`${c.blue}●${c.reset}`, 'Connections', `${status.connections_count} active`);
    await wait(150);
    checkLine(status.seed_configured ? `${c.green}●${c.reset}` : `${c.yellow}●${c.reset}`, 'Seed', status.seed_configured ? 'configured' : 'not set');
    await wait(300);

    console.log('');
    console.log(`${indent}${c.green}${c.bold}All systems ready.${c.reset}`);
    console.log('');
    console.log(`${indent}${c.white}Press ${c.bold}Enter${c.reset}${c.white} to open dashboard${c.reset}  ${c.dim}· ${c.white}q${c.dim} to quit${c.reset}`);
    process.stdout.write('\x1b[?25h');

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    await new Promise((resolve) => {
        var onKey = key => {
            if (key === '\r' || key === '\n') {
                process.stdin.removeListener('data', onKey);
                resolve();
            }
            if (key === 'q' || key === '\x03' || key === '\x1b') {
                process.stdin.removeListener('data', onKey);
                process.stdin.setRawMode(false);
                exitScreen();
                process.exit(0);
            }
        };
        process.stdin.on('data', onKey);
    });
    process.stdin.setRawMode(false);
};

function formatUptime(ms) {
    var s = Math.floor(ms / 1000);
    var d = Math.floor(s / 86400); s %= 86400;
    var h = Math.floor(s / 3600); s %= 3600;
    var m = Math.floor(s / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m`;
    return `${s}s`;
}

// ── Escape Sequence Handler ──────────────────────────────────────────────
// Properly splits batched input into individual key events.
// Handles: regular chars, CSI sequences (\x1b[...X), bare ESC, Alt+key.

function createKeyReader(handler) {
    var escBuffer = '';
    var escTimer = null;

    var processBuffer = () => {
        while (escBuffer.length > 0) {
            if (escBuffer[0] === '\x1b') {
                if (escBuffer.length === 1) {
                    // Bare ESC so far — wait for more or emit standalone ESC
                    escTimer = setTimeout(() => {
                        handler('\x1b');
                        escBuffer = '';
                    }, 50);
                    return;
                }
                if (escBuffer[1] === '[') {
                    // CSI sequence: \x1b[ <params> <terminator 0x40-0x7E>
                    var end = -1;
                    for (var i = 2; i < escBuffer.length; i++) {
                        var ch = escBuffer.charCodeAt(i);
                        if (ch >= 0x40 && ch <= 0x7E) { end = i; break; }
                    }
                    if (end === -1) {
                        // Incomplete CSI — wait for terminator
                        escTimer = setTimeout(() => {
                            escBuffer = '';
                        }, 50);
                        return;
                    }
                    var seq = escBuffer.slice(0, end + 1);
                    escBuffer = escBuffer.slice(end + 1);
                    handler(seq);
                } else {
                    // Alt+key (ESC + char)
                    handler(escBuffer.slice(0, 2));
                    escBuffer = escBuffer.slice(2);
                }
            } else {
                // Regular single character
                handler(escBuffer[0]);
                escBuffer = escBuffer.slice(1);
            }
        }
    };

    return (data) => {
        if (escTimer) { clearTimeout(escTimer); escTimer = null; }
        escBuffer += data;
        processBuffer();
    };
}

// ── Footer Key Hints ─────────────────────────────────────────────────────

var hintKey = (key, label) => `${c.white}${c.bold}${key}${c.reset}${c.dim} ${label}${c.reset}`;
var dot = `${c.dim} · ${c.reset}`;

var footerForContext = (focus, isAction, showHelp, cols) => {
    if (showHelp) {
        return `${hintKey('?', 'close')}${dot}${hintKey('q', 'quit')}`;
    }
    var compact = cols < 90; // use short labels on narrow terminals
    var parts = [];
    if (focus === 'menu') {
        var tag = `${c.dim}[${c.reset}${c.purple}${c.bold}◀ menu${c.reset}${c.dim}]${c.reset}`;
        parts.push(tag);
        parts.push(hintKey('↑↓', compact ? 'nav' : 'navigate'));
        parts.push(hintKey('↵', isAction ? 'run' : (compact ? 'sel' : 'refresh')));
        parts.push(hintKey('Tab', compact ? '→' : '→ content'));
    } else {
        var tag2 = `${c.dim}[${c.reset}${c.purple}${c.bold}content ▶${c.reset}${c.dim}]${c.reset}`;
        parts.push(tag2);
        parts.push(hintKey('↑↓', compact ? 'scr' : 'scroll'));
        if (!compact) parts.push(hintKey('PgUp/Dn', 'page'));
        if (!compact) parts.push(hintKey('g/G', 'top/btm'));
        parts.push(hintKey('Tab', compact ? '←' : '← menu'));
        if (isAction) parts.push(hintKey('↵', 'run'));
    }
    if (!compact) parts.push(hintKey('r', 'refresh'));
    parts.push(hintKey('?', 'help'));
    parts.push(hintKey('q', 'quit'));
    return parts.join(dot);
};

// ── Main Application ─────────────────────────────────────────────────────

var MIN_COLS = 64;
var MIN_ROWS = 20;

export async function startTUI(client) {
    var size = getSize();
    if (size.cols < MIN_COLS || size.rows < MIN_ROWS) {
        console.error(`\n  ${c.red}Terminal too small (${size.cols}x${size.rows}).${c.reset}`);
        console.error(`  ${c.dim}Minimum: ${MIN_COLS}x${MIN_ROWS}. Resize or use CLI commands directly.${c.reset}\n`);
        process.exit(1);
    }

    await showSplash(client);

    var menuState = createMenuState();
    var panelCache = {};
    var scrollOffsets = {};
    var running = true;
    var inCommand = false;
    var rendering = false;
    var renderQueued = false;
    var refreshTimer = null;
    var currentPanel = 'status';
    var showHelp = false;
    var menuScroll = 0;
    var focus = 'menu'; // 'menu' or 'content'

    // Session datastore for charts (balance history, activity, etc.)
    var datastore = createDatastore();

    // Make datastore available to panels via client object
    client._datastore = datastore;

    // ── Render ────────────────────────────────────────────────────

    var render = async () => {
        if (!running || inCommand) return;
        if (rendering) { renderQueued = true; return; }
        rendering = true;

        try {
            var size = getSize();
            var buf = createBuffer();
            // rows: top border + title sep + content + footer sep + footer + bottom border = 5 chrome rows
            var contentRows = size.rows - 5;

            currentPanel = getSelectedId(menuState);
            var scroll = scrollOffsets[currentPanel] || 0;

            // Fetch panel content
            var panelLines = panelCache[currentPanel];
            if (!panelLines) {
                try {
                    panelLines = await renderPanel(currentPanel, client);
                    panelCache[currentPanel] = panelLines;
                } catch (e) {
                    panelLines = [`${c.red}${e.message}${c.reset}`];
                }
            }

            // Help overlay as responsive bordered box
            if (showHelp) {
                var bx = { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' };
                var contentW = size.cols - getMenuWidth(size.cols) - 5;
                var helpW = Math.min(contentW, 56);
                var hr = `${c.purple}${bx.tl}${'─'.repeat(helpW)}${bx.tr}${c.reset}`;
                var btm = `${c.purple}${bx.bl}${'─'.repeat(helpW)}${bx.br}${c.reset}`;
                var row = (text) => {
                    var plain = stripAnsi(text);
                    var pad = Math.max(0, helpW - 2 - plain.length);
                    return `${c.purple}${bx.v}${c.reset} ${text}${' '.repeat(pad)} ${c.purple}${bx.v}${c.reset}`;
                };
                var blank = row('');

                panelLines = [
                    '',
                    ` ${hr}`,
                    ` ${row(`${c.white}${c.bold}Keyboard Shortcuts${c.reset}`)}`,
                    ` ${blank}`,
                    ` ${row(`${c.purple}${c.bold}Focus${c.reset}`)}`,
                    ` ${row(`  ${c.white}Tab${c.reset}${c.dim}          switch left ↔ right panel${c.reset}`)}`,
                    ` ${blank}`,
                    ` ${row(`${c.purple}${c.bold}Left Panel${c.reset}${c.dim}  (menu)${c.reset}`)}`,
                    ` ${row(`  ${c.white}↑↓${c.reset} ${c.dim}or${c.reset} ${c.white}j/k${c.reset}${c.dim}    navigate items${c.reset}`)}`,
                    ` ${row(`  ${c.white}Enter${c.reset}${c.dim}        select / run action${c.reset}`)}`,
                    ` ${blank}`,
                    ` ${row(`${c.purple}${c.bold}Right Panel${c.reset}${c.dim} (content)${c.reset}`)}`,
                    ` ${row(`  ${c.white}↑↓${c.reset} ${c.dim}or${c.reset} ${c.white}j/k${c.reset}${c.dim}    scroll content${c.reset}`)}`,
                    ` ${row(`  ${c.white}PgUp/PgDn${c.reset}${c.dim}    page up / down${c.reset}`)}`,
                    ` ${row(`  ${c.white}g / G${c.reset}${c.dim}        jump to top / bottom${c.reset}`)}`,
                    ` ${blank}`,
                    ` ${row(`${c.purple}${c.bold}General${c.reset}`)}`,
                    ` ${row(`  ${c.white}r${c.reset}${c.dim}            refresh panel${c.reset}`)}`,
                    ` ${row(`  ${c.white}PgUp/PgDn${c.reset}${c.dim}    scroll content (any focus)${c.reset}`)}`,
                    ` ${row(`  ${c.white}?${c.reset}${c.dim}            toggle this help${c.reset}`)}`,
                    ` ${row(`  ${c.white}q${c.reset} ${c.dim}or${c.reset} ${c.white}Esc${c.reset}${c.dim}     quit${c.reset}`)}`,
                    ` ${blank}`,
                    ` ${row(`${c.dim}Focused panel has ${c.purple}purple${c.reset}${c.dim} borders${c.reset}`)}`,
                    ` ${btm}`,
                ];
            }

            // Clamp scroll
            var maxScroll = Math.max(0, panelLines.length - contentRows);
            scroll = Math.min(scroll, maxScroll);
            scrollOffsets[currentPanel] = scroll;

            // Menu lines
            var menuFocused = focus === 'menu';
            var contentFocused = focus === 'content';
            var allMenuLines = renderMenu(menuState, 999, menuFocused);
            var selectedVisualIdx = getSelectedVisualIndex(menuState);
            if (selectedVisualIdx < menuScroll) menuScroll = selectedVisualIdx;
            if (selectedVisualIdx >= menuScroll + contentRows) menuScroll = selectedVisualIdx - contentRows + 1;
            menuScroll = Math.max(0, Math.min(menuScroll, Math.max(0, allMenuLines.length - contentRows)));
            var menuLines = allMenuLines.slice(menuScroll, menuScroll + contentRows);

            // Panel title (left) and scroll indicator (right, separate)
            var panelItem = NAV_ITEMS.find(n => n.id === currentPanel);
            var panelTitle = showHelp ? 'Help' : (panelItem?.label || 'Status');

            var scrollInfo = '';
            if (panelLines.length > contentRows && !showHelp) {
                var scrollEnd = Math.min(scroll + contentRows, panelLines.length);
                scrollInfo = `${scroll + 1}-${scrollEnd}/${panelLines.length}`;
                if (scroll > 0) scrollInfo += ' ▲';
                if (scrollEnd < panelLines.length) scrollInfo += ' ▼';
            }

            // Draw frame with title left, scroll info right
            drawFrame(buf, size, 'NUTbits', panelTitle, scrollInfo, menuFocused, contentFocused);
            drawTitleSep(buf, size, menuFocused, contentFocused);

            var visiblePanel = panelLines.slice(scroll, scroll + contentRows);
            for (var i = 0; i < contentRows; i++) {
                buf.push(drawRow(menuLines[i] || '', visiblePanel[i] || '', size.cols, menuFocused, contentFocused));
            }

            // Contextual footer
            var isAction = !!ACTION_COMMANDS[currentPanel];
            var footerText = footerForContext(focus, isAction, showHelp, size.cols);
            drawFooter(buf, size, footerText, menuFocused, contentFocused);

            buf.flush();
        } finally {
            rendering = false;
            if (renderQueued) {
                renderQueued = false;
                render().catch(() => {});
            }
        }
    };

    // ── Helper: visual line index of selected menu item ──────────

    function getSelectedVisualIndex(state) {
        var selected = state.index;
        var navIdx = 0;
        var lineIdx = 0;
        for (var item of MENU_ITEMS) {
            if (item.section_label) {
                if (lineIdx > 0) lineIdx++;
                lineIdx++; // header
                lineIdx++; // separator line
                continue;
            }
            if (navIdx === selected) return lineIdx;
            navIdx++;
            lineIdx++;
        }
        return 0;
    }

    // ── Execute CLI Command ──────────────────────────────────────

    var execCommand = async (panelId) => {
        inCommand = true;

        process.stdin.removeListener('data', keyReader);
        process.stdin.setRawMode(false);
        exitScreen();

        console.log(`\n  ${c.purple}${c.bold}nutbits ${panelId}${c.reset}\n`);

        try {
            var entry = ACTION_COMMANDS[panelId];
            var mod, args;
            if (typeof entry === 'function') {
                mod = await entry();
                args = { _positional: [] };
            } else {
                mod = await entry.loader();
                args = entry.args || { _positional: [] };
            }
            await mod.run(client, args);
        } catch (e) {
            console.error(`\n  ${c.red}${e.message}${c.reset}`);
        }

        console.log(`\n  ${c.dim}Press Enter to return to dashboard...${c.reset}`);

        await new Promise(resolve => {
            process.stdin.resume();
            process.stdin.setEncoding('utf8');
            var onData = key => {
                if (key === '\r' || key === '\n' || key === '\x03') {
                    process.stdin.removeListener('data', onData);
                    resolve();
                }
            };
            process.stdin.on('data', onData);
        });

        enterScreen();
        process.stdin.setRawMode(true);
        process.stdin.on('data', keyReader);

        inCommand = false;
        panelCache = {};
    };

    // ── Key Handler ──────────────────────────────────────────────

    var handleKey = async (key) => {
        if (inCommand) return;

        // Global keys (work regardless of focus)
        if (key === '\x03' || key === 'q') { cleanup(); return; }
        if (key === '\x1b') {
            if (showHelp) { showHelp = false; await render().catch(() => {}); }
            else { cleanup(); }
            return;
        }
        if (key === '?') { showHelp = !showHelp; await render().catch(() => {}); return; }
        if (showHelp) return;

        // Tab: switch focus
        if (key === '\t') {
            focus = focus === 'menu' ? 'content' : 'menu';
            await render().catch(() => {});
            return;
        }

        // r/R: refresh (global)
        if (key === 'r' || key === 'R') {
            panelCache = {};
            await render().catch(() => {});
            return;
        }

        // Enter: action depends on focus
        if (key === '\r') {
            if (ACTION_COMMANDS[currentPanel]) {
                await execCommand(currentPanel);
                await render().catch(() => {});
            } else if (focus === 'menu') {
                panelCache[currentPanel] = null;
                await render().catch(() => {});
            }
            return;
        }

        // Focus-specific key handling
        if (focus === 'menu') {
            // Menu navigation
            if (key === '\x1b[A' || key === 'k') { menuUp(menuState); await render().catch(() => {}); }
            else if (key === '\x1b[B' || key === 'j') { menuDown(menuState); await render().catch(() => {}); }
        } else {
            // Content scrolling
            var off = scrollOffsets[currentPanel] || 0;
            if (key === '\x1b[A' || key === 'k') {
                scrollOffsets[currentPanel] = Math.max(0, off - 1);
                await render().catch(() => {});
            } else if (key === '\x1b[B' || key === 'j') {
                scrollOffsets[currentPanel] = off + 1;
                await render().catch(() => {});
            } else if (key === '\x1b[5~') { // page up
                scrollOffsets[currentPanel] = Math.max(0, off - 10);
                await render().catch(() => {});
            } else if (key === '\x1b[6~') { // page down
                scrollOffsets[currentPanel] = off + 10;
                await render().catch(() => {});
            } else if (key === 'g') { // top
                scrollOffsets[currentPanel] = 0;
                await render().catch(() => {});
            } else if (key === 'G') { // bottom
                var panelLines = panelCache[currentPanel] || [];
                var contentRows = getSize().rows - 5;
                scrollOffsets[currentPanel] = Math.max(0, panelLines.length - contentRows);
                await render().catch(() => {});
            }
        }

        // Page up/down also work from menu focus (convenience)
        if (focus === 'menu') {
            if (key === '\x1b[5~') {
                var off2 = scrollOffsets[currentPanel] || 0;
                scrollOffsets[currentPanel] = Math.max(0, off2 - 10);
                await render().catch(() => {});
            } else if (key === '\x1b[6~') {
                scrollOffsets[currentPanel] = (scrollOffsets[currentPanel] || 0) + 10;
                await render().catch(() => {});
            }
        }
    };

    // ── Setup ────────────────────────────────────────────────────

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    var keyReader = createKeyReader(handleKey);
    process.stdin.on('data', keyReader);

    var cleanup = () => {
        running = false;
        if (refreshTimer) clearTimeout(refreshTimer);
        process.stdin.removeListener('data', keyReader);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        exitScreen();
        process.exit(0);
    };

    process.on('uncaughtException', (e) => {
        exitScreen();
        console.error('TUI crash:', e.message);
        process.exit(1);
    });

    process.stdout.on('resize', () => {
        if (!inCommand) render().catch(() => {});
    });

    // Initial render
    await render().catch(() => {});
    renderPanel('status', client).then(lines => {
        panelCache['status'] = lines;
        if (!inCommand) render().catch(() => {});
    }).catch(() => {});

    // Auto-refresh + data collection
    var collectData = async () => {
        try {
            var t0 = Date.now();
            var status = await client.get('/api/v1/status');
            var responseMs = Date.now() - t0;

            // Record main metrics
            var extras = {};
            try {
                var hist = await client.get('/api/v1/history', { limit: '1', unpaid: 'true' });
                extras.txCount = hist.total || 0;
            } catch (e) { /* skip */ }
            try {
                var fees = await client.get('/api/v1/fees');
                extras.feeTotal = fees.total_sats || 0;
            } catch (e) { /* skip */ }

            datastore.record(status, extras);

            // Record mint response time
            if (status?.mint?.url) {
                datastore.recordMintResponse(status.mint.url, responseMs);
            }
        } catch (e) { /* skip - service may be restarting */ }
    };

    // Initial data collection
    collectData().catch(() => {});

    var scheduleRefresh = () => {
        if (!running) return;
        refreshTimer = setTimeout(async () => {
            if (!running || showHelp || inCommand) { scheduleRefresh(); return; }

            // Collect data on every refresh cycle
            await collectData().catch(() => {});

            var livePanels = ['status', 'balance', 'connections', 'history', 'activity', 'relays', 'logs', 'fees'];
            if (livePanels.includes(currentPanel)) {
                panelCache[currentPanel] = null;
                await render().catch(() => {});
            }
            scheduleRefresh();
        }, 5000);
    };
    scheduleRefresh();

    await new Promise(() => {});
}
