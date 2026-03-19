// NUTbits TUI — Full-screen terminal application
// Split-panel interface: navigable menu + live content
// Zero dependencies — raw ANSI + stdin

import { c, stripAnsi } from '../colors.js';
import { createBuffer, getSize, drawFrame, drawRow, drawTitleSep, drawFooter, MENU_WIDTH } from './layout.js';
import { createMenuState, menuUp, menuDown, getSelectedId, renderMenu, NAV_ITEMS, MENU_ITEMS } from './menu.js';
import { renderPanel } from './panels.js';
import { spinner } from '../prompts.js';

// ── Action Panel → CLI Command Mapping ───────────────────────────────────

var ACTION_COMMANDS = {
    pay:         () => import('../commands/pay.js'),
    receive:     () => import('../commands/receive.js'),
    connect:     () => import('../commands/connect.js'),
    export:      () => import('../commands/export.js'),
    revoke:      () => import('../commands/revoke.js'),
    backup:      () => import('../commands/backup.js'),
    restore:     () => import('../commands/restore.js'),
    config:      { loader: () => import('../commands/config.js'), args: { _positional: ['set'] } },
};

// ── Splash Screen ────────────────────────────────────────────────────────

// Logo: no internal padding — centering handled by showSplash
var LOGO_WIDTH = 58; // visual width of the widest logo line

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
    process.stdout.write('\x1b[H\x1b[2J\x1b[?25l');

    // Single left-edge calculation: center the logo, everything else aligns to it
    var pad = ' '.repeat(Math.max(0, Math.floor((size.cols - LOGO_WIDTH) / 2)));
    // Content indent: 2 spaces in from the logo edge
    var indent = pad + '  ';

    // ── Phase 1: Logo reveal ─────────────────────────────────────

    var totalHeight = LOGO.length + 14 + 6; // logo + tagline + boot + ready
    var topPad = Math.max(1, Math.floor((size.rows - totalHeight) / 2));
    for (var i = 0; i < topPad; i++) console.log('');

    for (var line of LOGO) {
        console.log(pad + line);
        await wait(40);
    }
    await wait(200);

    // Tagline — same left edge as logo content
    console.log('');
    console.log(`${indent}${c.yellow}${c.bold}ecash meets Lightning${c.reset}`);
    console.log(`${indent}${c.white}your nuts, your rules${c.reset}`);
    console.log('');
    console.log(`${indent}${c.dim}${'─'.repeat(Math.min(LOGO_WIDTH - 4, 50))}${c.reset}`);
    console.log('');
    console.log(`${indent}${c.muted}Cashu ecash to NWC bridge${c.reset}`);
    console.log(`${indent}${c.dim}by DoktorShift · inspired by supertestnet/bankify${c.reset}`);
    await wait(600);

    // ── Phase 2: Boot sequence ───────────────────────────────────

    console.log('');

    var checkLine = (icon, label, detail) => {
        console.log(`${indent}${icon}  ${c.white}${label.padEnd(14)}${c.reset}${c.dim}${detail}${c.reset}`);
    };

    // Check 1: Service connection
    var sp = spinner(`${indent}Connecting to service`);
    sp.start();
    var status = null;
    try {
        status = await client.get('/api/v1/status');
    } catch (e) { /* */ }
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
        process.exit(1);
    }

    checkLine(`${c.green}●${c.reset}`, 'Service', `running · uptime ${formatUptime(status.uptime_ms)}`);
    await wait(150);

    var mintHealthy = status.mint?.healthy !== false;
    checkLine(
        mintHealthy ? `${c.green}●${c.reset}` : `${c.red}●${c.reset}`,
        'Mint',
        `${status.mint?.name || 'unknown'}${mintHealthy ? '' : ' (unhealthy)'}`
    );
    await wait(150);

    checkLine(`${c.yellow}●${c.reset}`, 'Balance', `${status.balance_sats.toLocaleString()} sats`);
    await wait(150);

    checkLine(
        status.relays?.connected > 0 ? `${c.green}●${c.reset}` : `${c.red}●${c.reset}`,
        'Relays',
        `${status.relays?.connected || 0}/${status.relays?.total || 0} connected`
    );
    await wait(150);

    checkLine(`${c.blue}●${c.reset}`, 'Connections', `${status.connections_count} active`);
    await wait(150);

    checkLine(
        status.seed_configured ? `${c.green}●${c.reset}` : `${c.yellow}●${c.reset}`,
        'Seed',
        status.seed_configured ? 'configured' : 'not set — recovery unavailable'
    );
    await wait(300);

    // ── Phase 3: Ready ───────────────────────────────────────────

    console.log('');
    console.log(`${indent}${c.green}${c.bold}All systems ready.${c.reset}`);
    console.log('');
    console.log(`${indent}${c.white}Press ${c.bold}Enter${c.reset}${c.white} to open dashboard${c.reset}  ${c.dim}· ${c.white}q${c.dim} to quit${c.reset}`);
    process.stdout.write('\x1b[?25h');

    // Wait for user input
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
                process.stdout.write('\x1b[H\x1b[2J');
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
// Buffers \x1b and waits 50ms for more bytes (arrow keys = \x1b[A etc.)
// If nothing follows, it's a real Escape press

function createKeyReader(handler) {
    var escBuffer = '';
    var escTimer = null;

    return (data) => {
        if (escTimer) { clearTimeout(escTimer); escTimer = null; }

        escBuffer += data;

        // If we have a complete escape sequence, dispatch it
        if (escBuffer.length >= 3 && escBuffer.startsWith('\x1b[')) {
            handler(escBuffer);
            escBuffer = '';
            return;
        }

        // If we have a bare \x1b, wait for more bytes
        if (escBuffer === '\x1b') {
            escTimer = setTimeout(() => {
                handler('\x1b'); // real Escape
                escBuffer = '';
            }, 50);
            return;
        }

        // Regular key or complete sequence
        handler(escBuffer);
        escBuffer = '';
    };
}

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
    var inCommand = false;      // true while a CLI command is executing
    var rendering = false;      // render lock
    var renderQueued = false;    // queued re-render
    var refreshTimer = null;
    var currentPanel = 'status';
    var showHelp = false;
    var menuScroll = 0;         // menu viewport offset

    // ── Render (with lock) ───────────────────────────────────────

    var render = async () => {
        if (!running || inCommand) return;
        if (rendering) { renderQueued = true; return; }
        rendering = true;

        try {
            var size = getSize();
            var buf = createBuffer();
            var contentRows = size.rows - 4;

            currentPanel = getSelectedId(menuState);
            var scroll = scrollOffsets[currentPanel] || 0;

            // Fetch panel content (use cache for instant navigation, fetch async)
            var panelLines = panelCache[currentPanel];
            if (!panelLines) {
                try {
                    panelLines = await renderPanel(currentPanel, client);
                    panelCache[currentPanel] = panelLines;
                } catch (e) {
                    panelLines = [`${c.red}${e.message}${c.reset}`];
                }
            }

            // Help overlay
            if (showHelp) {
                panelLines = [
                    `${c.white}${c.bold}Keyboard Shortcuts${c.reset}`,
                    '',
                    `  ${c.purple}up / down${c.reset}     navigate menu`,
                    `  ${c.purple}enter${c.reset}         run action or refresh`,
                    `  ${c.purple}page up/dn${c.reset}    scroll content`,
                    `  ${c.purple}r${c.reset}             refresh data`,
                    `  ${c.purple}?${c.reset}             toggle this help`,
                    `  ${c.purple}q${c.reset}             quit`,
                    `  ${c.purple}esc${c.reset}           quit (or close help)`,
                ];
            }

            // Clamp scroll
            var maxScroll = Math.max(0, panelLines.length - contentRows);
            scroll = Math.min(scroll, maxScroll);
            scrollOffsets[currentPanel] = scroll;

            // Menu with viewport scrolling
            var allMenuLines = renderMenu(menuState, 999);
            // Ensure selected item is visible
            var selectedVisualIdx = getSelectedVisualIndex(menuState);
            if (selectedVisualIdx < menuScroll) menuScroll = selectedVisualIdx;
            if (selectedVisualIdx >= menuScroll + contentRows) menuScroll = selectedVisualIdx - contentRows + 1;
            menuScroll = Math.max(0, Math.min(menuScroll, Math.max(0, allMenuLines.length - contentRows)));
            var menuLines = allMenuLines.slice(menuScroll, menuScroll + contentRows);

            // Panel title
            var panelItem = NAV_ITEMS.find(n => n.id === currentPanel);
            var panelTitle = showHelp ? 'Help' : (panelItem?.label || 'Status');
            var scrollSuffix = panelLines.length > contentRows
                ? `  ${scroll + 1}-${Math.min(scroll + contentRows, panelLines.length)}/${panelLines.length}`
                : '';

            // Draw
            drawFrame(buf, size, 'NUTbits', panelTitle + scrollSuffix);
            drawTitleSep(buf, size);

            var visiblePanel = panelLines.slice(scroll, scroll + contentRows);
            for (var i = 0; i < contentRows; i++) {
                buf.push(drawRow(menuLines[i] || '', visiblePanel[i] || '', size.cols));
            }

            var isAction = !!ACTION_COMMANDS[currentPanel];
            var footerLeft = showHelp
                ? `${c.dim}press ? to close help${c.reset}`
                : isAction
                    ? `${c.dim}arrows${c.reset} ${c.muted}move${c.reset}  ${c.green}enter${c.reset} ${c.green}run${c.reset}  ${c.dim}pgup/dn${c.reset} ${c.muted}scroll${c.reset}  ${c.dim}?${c.reset} ${c.muted}help${c.reset}  ${c.dim}q${c.reset} ${c.muted}quit${c.reset}`
                    : `${c.dim}arrows${c.reset} ${c.muted}move${c.reset}  ${c.dim}enter${c.reset} ${c.muted}refresh${c.reset}  ${c.dim}pgup/dn${c.reset} ${c.muted}scroll${c.reset}  ${c.dim}?${c.reset} ${c.muted}help${c.reset}  ${c.dim}q${c.reset} ${c.muted}quit${c.reset}`;
            drawFooter(buf, size, footerLeft);

            buf.flush();
        } finally {
            rendering = false;
            if (renderQueued) {
                renderQueued = false;
                render().catch(() => {});
            }
        }
    };

    // ── Helper: find visual line index of selected item ──────────

    function getSelectedVisualIndex(state) {
        var selected = state.index;
        var navIdx = 0;
        var lineIdx = 0;
        for (var item of MENU_ITEMS) {
            if (item.section_label) {
                if (lineIdx > 0) lineIdx++; // blank line before section (except first)
                lineIdx++; // section header
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

        // CRITICAL: remove TUI key handler before running CLI command
        process.stdin.removeListener('data', keyReader);
        process.stdin.setRawMode(false);
        process.stdout.write('\x1b[?25h');
        process.stdout.write('\x1b[H\x1b[2J');

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

        // Wait for Enter with a CLEAN listener (no TUI handler attached)
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

        // Re-enter TUI mode
        process.stdin.setRawMode(true);
        process.stdout.write('\x1b[?25l');

        // Re-attach TUI key handler
        process.stdin.on('data', keyReader);

        inCommand = false;
        panelCache = {};
    };

    // ── Key Handler ──────────────────────────────────────────────

    var handleKey = async (key) => {
        if (inCommand) return; // safety: ignore keys during command

        if (key === '\x03' || key === 'q') { cleanup(); return; }
        if (key === '\x1b') {
            if (showHelp) { showHelp = false; await render().catch(() => {}); }
            else { cleanup(); }
            return;
        }
        if (key === '?') { showHelp = !showHelp; await render().catch(() => {}); return; }
        if (showHelp) return;

        if (key === '\x1b[A') { // up
            menuUp(menuState);
            await render().catch(() => {});
        } else if (key === '\x1b[B') { // down
            menuDown(menuState);
            await render().catch(() => {});
        } else if (key === '\x1b[5~') { // page up
            var off = scrollOffsets[currentPanel] || 0;
            scrollOffsets[currentPanel] = Math.max(0, off - 10);
            await render().catch(() => {});
        } else if (key === '\x1b[6~') { // page down
            scrollOffsets[currentPanel] = (scrollOffsets[currentPanel] || 0) + 10;
            await render().catch(() => {});
        } else if (key === '\r') { // enter
            if (ACTION_COMMANDS[currentPanel]) {
                await execCommand(currentPanel);
                await render().catch(() => {});
            } else {
                panelCache[currentPanel] = null; // force refresh this panel
                await render().catch(() => {});
            }
        } else if (key === 'r' || key === 'R') {
            panelCache = {};
            await render().catch(() => {});
        }
    };

    // ── Setup ────────────────────────────────────────────────────

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdout.write('\x1b[?25l');

    var keyReader = createKeyReader(handleKey);
    process.stdin.on('data', keyReader);

    var cleanup = () => {
        running = false;
        if (refreshTimer) clearTimeout(refreshTimer);
        process.stdin.removeListener('data', keyReader);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdout.write('\x1b[?25h');
        process.stdout.write('\x1b[H\x1b[2J');
        process.exit(0);
    };

    process.stdout.on('resize', () => {
        if (!inCommand) render().catch(() => {});
    });

    // Initial render — fetch data for status panel
    await render().catch(() => {});
    // Async: fetch fresh data after initial cached render
    renderPanel('status', client).then(lines => {
        panelCache['status'] = lines;
        if (!inCommand) render().catch(() => {});
    }).catch(() => {});

    // Auto-refresh
    var scheduleRefresh = () => {
        if (!running) return;
        refreshTimer = setTimeout(async () => {
            if (!running || showHelp || inCommand) { scheduleRefresh(); return; }
            var livePanels = ['status', 'balance', 'connections', 'history', 'relays', 'logs', 'fees'];
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
