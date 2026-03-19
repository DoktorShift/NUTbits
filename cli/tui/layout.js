// NUTbits TUI — Layout engine
// Handles terminal dimensions, panel drawing, border rendering

import { c, stripAnsi } from '../colors.js';

// ── Terminal Dimensions ──────────────────────────────────────────────────

export var getSize = () => ({
    cols: process.stdout.columns || 100,
    rows: process.stdout.rows || 40,
});

// ── Screen Buffer ────────────────────────────────────────────────────────

export var createBuffer = () => {
    var lines = [];
    return {
        push: line => lines.push(line),
        flush: () => {
            // Move to top-left, overwrite in-place, clear remainder
            process.stdout.write('\x1b[H' + lines.join('\x1b[K\n') + '\x1b[K\x1b[J');
            lines = [];
        },
    };
};

// ── Box Drawing ──────────────────────────────────────────────────────────

var B = {
    tl: '┌', tr: '┐', bl: '└', br: '┘',
    h: '─', v: '│',
    tj: '┬', bj: '┴', lj: '├', rj: '┤', x: '┼',
};

// ── Constants ────────────────────────────────────────────────────────────

export var MENU_WIDTH = 28;

// ── Top Border with Titles ───────────────────────────────────────────────

export var drawFrame = (buf, size, menuTitle, contentTitle) => {
    var { cols } = size;
    var mw = MENU_WIDTH;
    var cw = cols - mw - 1;

    var mtPlain = stripAnsi(menuTitle);
    var ctPlain = stripAnsi(contentTitle);

    var menuFill = Math.max(0, mw - mtPlain.length - 4);
    var contentFill = Math.max(0, cw - ctPlain.length - 4);

    buf.push(
        `${c.dim}${B.tl}${B.h}${c.reset}` +
        ` ${c.purple}${c.bold}${menuTitle}${c.reset} ` +
        `${c.dim}${B.h.repeat(menuFill)}${B.tj}${B.h}${c.reset}` +
        ` ${c.blue}${contentTitle}${c.reset} ` +
        `${c.dim}${B.h.repeat(contentFill)}${B.tr}${c.reset}`
    );
};

// ── Title Separator ──────────────────────────────────────────────────────

export var drawTitleSep = (buf, size) => {
    var { cols } = size;
    var mw = MENU_WIDTH;
    var cw = cols - mw - 1;
    buf.push(`${c.dim}${B.lj}${B.h.repeat(mw)}${B.x}${B.h.repeat(cw)}${B.rj}${c.reset}`);
};

// ── Content Row ──────────────────────────────────────────────────────────

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

// ── Footer ───────────────────────────────────────────────────────────────

export var drawFooter = (buf, size, footerContent) => {
    var { cols } = size;
    var mw = MENU_WIDTH;
    var cw = cols - mw - 1;

    // Bottom border with ┴ junction where the center divider meets it
    buf.push(`${c.dim}${B.bl}${B.h.repeat(mw)}${B.bj}${B.h.repeat(cw)}${B.br}${c.reset}`);

    // Footer text below the frame
    if (footerContent) {
        var plain = stripAnsi(footerContent);
        var pad = Math.max(0, cols - 2 - plain.length);
        buf.push(` ${footerContent}${' '.repeat(pad)}`);
    }
};

// ── Text Utilities ───────────────────────────────────────────────────────

export var truncate = (str, maxLen) => {
    var plain = stripAnsi(str);
    if (plain.length <= maxLen) return str;
    return plain.slice(0, maxLen - 1) + `${c.reset}…`;
};

export var padRight = (str, width) => {
    var plain = stripAnsi(str);
    var pad = Math.max(0, width - plain.length);
    return str + ' '.repeat(pad);
};

// ANSI-aware column formatting
export var col = (str, width) => {
    var plain = stripAnsi(str);
    if (plain.length > width) return truncate(str, width);
    return str + ' '.repeat(Math.max(0, width - plain.length));
};
