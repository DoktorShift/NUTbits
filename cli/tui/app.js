// NUTbits TUI — Full-screen terminal application
// Split-panel interface: navigable menu + live content
// Zero dependencies — raw ANSI + stdin

import { c } from '../colors.js';
import { createBuffer, getSize, drawFrame, drawRow, MENU_WIDTH } from './layout.js';
import { createMenuState, menuUp, menuDown, getSelectedId, renderMenu, NAV_ITEMS } from './menu.js';
import { renderPanel } from './panels.js';

// ── Splash Screen ────────────────────────────────────────────────────────

var SPLASH = [
    '',
    `${c.purple}${c.bold}     ╔╗╔╦ ╦╔╦╗┌┐ ┬┌┬┐┌─┐${c.reset}`,
    `${c.purple}${c.bold}     ║║║║ ║ ║ ├┴┐│ │ └─┐${c.reset}`,
    `${c.purple}${c.bold}     ╝╚╝╚═╝ ╩ └─┘┴ ┴ └─┘${c.reset}`,
    '',
    `  ${c.yellow}ecash meets Lightning${c.reset}`,
    `  ${c.dim}your nuts, your rules${c.reset}`,
    '',
    `  ${c.dim}management console${c.reset}`,
    `  ${c.dim}by DoktorShift${c.reset}`,
    '',
];

var showSplash = () => {
    process.stdout.write('\x1b[H\x1b[2J');
    for (var line of SPLASH) console.log(line);
};

// ── Key Constants ────────────────────────────────────────────────────────

var KEY = {
    UP:     '\x1b[A',
    DOWN:   '\x1b[B',
    ENTER:  '\r',
    CTRL_C: '\x03',
    Q:      'q',
    R:      'r',
};

// ── Main Application ─────────────────────────────────────────────────────

var MIN_COLS = 64;
var MIN_ROWS = 20;

export async function startTUI(client) {
    // Check minimum terminal size
    var size = getSize();
    if (size.cols < MIN_COLS || size.rows < MIN_ROWS) {
        console.error(`\n  ${c.red}Terminal too small (${size.cols}x${size.rows}).${c.reset}`);
        console.error(`  ${c.dim}Minimum: ${MIN_COLS}x${MIN_ROWS}. Resize your terminal or use CLI commands directly.${c.reset}\n`);
        process.exit(1);
    }

    // Splash
    showSplash();
    await new Promise(r => setTimeout(r, 800));

    var menuState = createMenuState();
    var panelCache = {};
    var running = true;
    var refreshTimer = null;
    var currentPanel = 'status';

    // ── Render Frame ─────────────────────────────────────────────

    var render = async () => {
        if (!running) return;
        var size = getSize();
        var buf = createBuffer();

        // Fetch panel content (with cache for snappy navigation)
        currentPanel = getSelectedId(menuState);
        var panelLines;
        try {
            panelLines = await renderPanel(currentPanel, client);
            panelCache[currentPanel] = panelLines;
        } catch (e) {
            panelLines = panelCache[currentPanel] || [`${c.dim}Loading...${c.reset}`];
        }

        // Render menu
        var contentRows = size.rows - 3; // top border + content + bottom border
        var menuLines = renderMenu(menuState, contentRows);

        // Panel title based on selection
        var panelItem = NAV_ITEMS.find(n => n.id === currentPanel);
        var panelTitle = panelItem?.label || 'Status';

        // Draw frame top
        drawFrame(buf, size, 'NUTbits', panelTitle,
            `${c.dim}↑↓${c.reset} ${c.muted}navigate${c.reset}  ${c.dim}enter${c.reset} ${c.muted}select${c.reset}  ${c.dim}r${c.reset} ${c.muted}refresh${c.reset}  ${c.dim}q${c.reset} ${c.muted}quit${c.reset}`,
            `${c.dim}${currentPanel}${c.reset}`
        );

        // Draw content rows
        for (var i = 0; i < contentRows; i++) {
            var menuLine = menuLines[i] || '';
            var panelLine = panelLines[i] || '';
            buf.push(drawRow(menuLine, panelLine, size.cols));
        }

        buf.flush();
    };

    // ── Input Handling ───────────────────────────────────────────

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdout.write('\x1b[?25l'); // hide cursor

    var onKey = async key => {
        if (key === KEY.CTRL_C || key === KEY.Q) {
            cleanup();
            return;
        }
        if (key === KEY.UP) {
            menuUp(menuState);
            panelCache = {}; // clear cache on nav
            await render().catch(() => {});
        }
        if (key === KEY.DOWN) {
            menuDown(menuState);
            panelCache = {};
            await render().catch(() => {});
        }
        if (key === KEY.ENTER) {
            panelCache = {};
            await render().catch(() => {});
        }
        if (key === KEY.R || key === 'R') {
            panelCache = {};
            await render().catch(() => {});
        }
    };

    var cleanup = () => {
        running = false;
        if (refreshTimer) clearTimeout(refreshTimer);
        process.stdin.removeListener('data', onKey);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdout.write('\x1b[?25h'); // show cursor
        process.stdout.write('\x1b[H\x1b[2J'); // clear screen
        process.exit(0);
    };

    process.stdin.on('data', onKey);

    // Handle resize
    var onResize = () => { render().catch(() => {}); };
    process.stdout.on('resize', onResize);

    // Initial render
    await render().catch(() => {});

    // Auto-refresh every 5s for live data
    var scheduleRefresh = () => {
        if (!running) return;
        refreshTimer = setTimeout(async () => {
            if (!running) return;
            // Only refresh data panels (not action panels)
            var dataPanels = ['status', 'balance', 'connections', 'history', 'relays', 'logs'];
            if (dataPanels.includes(currentPanel)) {
                panelCache = {};
                await render().catch(() => {});
            }
            scheduleRefresh();
        }, 5000);
    };
    scheduleRefresh();

    // Keep alive
    await new Promise(() => {});
}
