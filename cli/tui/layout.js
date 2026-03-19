// NUTbits TUI — Layout engine
// Handles terminal dimensions, panel drawing, border rendering

import { c, stripAnsi } from '../colors.js';

// ── Terminal Dimensions ──────────────────────────────────────────────────

export var getSize = () => ({
    cols: process.stdout.columns || 100,
    rows: process.stdout.rows || 40,
});

// ── Screen Buffer ────────────────────────────────────────────────────────
// Write to buffer, then flush once — eliminates flicker

export var createBuffer = () => {
    var lines = [];
    return {
        push: line => lines.push(line),
        flush: () => {
            // Move to top-left and overwrite in-place (no screen clear = no flicker)
            process.stdout.write('\x1b[H' + lines.join('\x1b[K\n') + '\x1b[K\x1b[J');
            lines = [];
        },
    };
};

// ── Box Drawing Characters ───────────────────────────────────────────────

var B = {
    tl: '┌', tr: '┐', bl: '└', br: '┘',
    h: '─', v: '│',
    tj: '┬', bj: '┴', lj: '├', rj: '┤', x: '┼',
};

// ── Panel Layout ─────────────────────────────────────────────────────────

export var MENU_WIDTH = 28;

export var drawFrame = (buf, size, menuTitle, contentTitle, footerLeft, footerRight) => {
    var { cols, rows } = size;
    var mw = MENU_WIDTH;
    var cw = cols - mw - 1; // content width (minus divider)

    // Top border
    buf.push(
        `${c.dim}${B.tl}${B.h}${c.reset} ${c.purple}${c.bold}${menuTitle}${c.reset} ` +
        `${c.dim}${B.h.repeat(Math.max(0, mw - stripAnsi(menuTitle).length - 4))}${B.tj}` +
        `${B.h}${c.reset} ${c.blue}${c.bold}${contentTitle}${c.reset} ` +
        `${c.dim}${B.h.repeat(Math.max(0, cw - stripAnsi(contentTitle).length - 4))}${B.tr}${c.reset}`
    );

    // Middle rows are filled by menu + content
    // (caller handles rows 1 through rows-3)

    // Bottom border with footer
    var fl = footerLeft || '';
    var fr = footerRight || '';
    var flPlain = stripAnsi(fl);
    var frPlain = stripAnsi(fr);
    var footerPad = Math.max(0, cols - 4 - flPlain.length - frPlain.length);
    buf.push(
        `${c.dim}${B.bl}${c.reset} ${fl}${' '.repeat(footerPad)}${fr} ${c.dim}${B.br}${c.reset}`
    );
};

// ── Row Builder ──────────────────────────────────────────────────────────

export var drawRow = (menuContent, panelContent, cols) => {
    var mw = MENU_WIDTH;
    var cw = cols - mw - 1;

    var menuPlain = stripAnsi(menuContent || '');
    var menuPad = Math.max(0, mw - 2 - menuPlain.length);

    var panelPlain = stripAnsi(panelContent || '');
    var panelPad = Math.max(0, cw - 2 - panelPlain.length);

    return (
        `${c.dim}${B.v}${c.reset} ${menuContent || ''}${' '.repeat(menuPad)}` +
        `${c.dim}${B.v}${c.reset} ${panelContent || ''}${' '.repeat(panelPad)}` +
        `${c.dim}${B.v}${c.reset}`
    );
};

// ── Separator Row ────────────────────────────────────────────────────────

export var drawSeparator = (cols) => {
    var mw = MENU_WIDTH;
    var cw = cols - mw - 1;
    return `${c.dim}${B.lj}${B.h.repeat(mw)}${B.x}${B.h.repeat(cw)}${B.rj}${c.reset}`;
};

// ── Text Utilities ───────────────────────────────────────────────────────

export var truncate = (str, maxLen) => {
    var plain = stripAnsi(str);
    if (plain.length <= maxLen) return str;
    // Safe truncation: walk the plain text, map back to raw string position
    // Simple fallback: strip ANSI, truncate, reapply reset
    return plain.slice(0, maxLen - 1) + `${c.reset}…`;
};

export var padRight = (str, width) => {
    var plain = stripAnsi(str);
    var pad = Math.max(0, width - plain.length);
    return str + ' '.repeat(pad);
};

// ANSI-aware column formatting — pads based on visible width
export var col = (str, width) => {
    var plain = stripAnsi(str);
    if (plain.length > width) return truncate(str, width);
    return str + ' '.repeat(Math.max(0, width - plain.length));
};
