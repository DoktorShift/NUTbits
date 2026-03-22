// NUTbits TUI - Layout engine
// Rounded corners, focus borders, responsive menu, single-write buffer

import { c, stripAnsi } from '../colors.js';

// ── Terminal Dimensions ──────────────────────────────────────────────────

export var getSize = () => ({
    cols: process.stdout.columns || 100,
    rows: process.stdout.rows || 40,
});

// ── Responsive Menu Width ────────────────────────────────────────────────
// Scales with terminal: wider terminals get a wider menu

export var getMenuWidth = (cols) => {
    if (cols >= 140) return 38;
    if (cols >= 110) return 34;
    if (cols >= 90)  return 30;
    return 26;
};

// Backwards compat export (used by panels that need a constant)
export var MENU_WIDTH = 30;

// ── Screen Buffer ────────────────────────────────────────────────────────

export var createBuffer = () => {
    var lines = [];
    return {
        push: line => lines.push(line),
        flush: () => {
            process.stdout.write('\x1b[H' + lines.join('\n') + '\x1b[J');
            lines = [];
        },
    };
};

// ── Border Characters ───────────────────────────────────────────────────

var B = {
    tl: '╭', tr: '╮', bl: '╰', br: '╯',
    h: '─', v: '│',
    tj: '┬', bj: '┴', lj: '├', rj: '┤', x: '┼',
};

// ── Alternate Screen Buffer ─────────────────────────────────────────────

export var enterScreen = () => {
    process.stdout.write('\x1b[?1049h');
    process.stdout.write('\x1b[?25l');
    process.stdout.write('\x1b[2J\x1b[H');
};

export var exitScreen = () => {
    process.stdout.write('\x1b[?25h');
    process.stdout.write('\x1b[?1049l');
};

// ── Focus-Aware Border Colors ───────────────────────────────────────────

var borderColor = (focused) => focused ? c.purple : c.dim;

// ── Top Border with Titles ───────────────────────────────────────────────
// Title left-aligned, scroll indicator right-aligned in content panel

export var drawFrame = (buf, size, menuTitle, contentTitle, scrollInfo, menuFocused, contentFocused) => {
    var { cols } = size;
    var mw = getMenuWidth(cols);
    var cw = cols - mw - 1;

    var mtPlain = stripAnsi(menuTitle);
    var menuFill = Math.max(0, mw - mtPlain.length - 4);

    var mc = borderColor(menuFocused);
    var cc = borderColor(contentFocused);
    var mtColor = menuFocused ? `${c.purple}${c.bold}` : c.muted;
    var ctColor = contentFocused ? `${c.white}${c.bold}` : c.muted;

    // Content title left, scroll info right
    var ctPlain = stripAnsi(contentTitle);
    var siPlain = scrollInfo ? stripAnsi(scrollInfo) : '';
    var contentFill = Math.max(0, cw - ctPlain.length - siPlain.length - (siPlain ? 6 : 4));

    var scrollPart = scrollInfo ? ` ${c.dim}${scrollInfo}${c.reset} ` : '';

    buf.push(
        `${mc}${B.tl}${B.h}${c.reset}` +
        ` ${mtColor}${menuTitle}${c.reset} ` +
        `${mc}${B.h.repeat(menuFill)}${c.reset}${c.dim}${B.tj}${c.reset}` +
        `${cc}${B.h}${c.reset}` +
        ` ${ctColor}${contentTitle}${c.reset} ` +
        `${cc}${B.h.repeat(contentFill)}${c.reset}` +
        `${scrollPart}${cc}${B.tr}${c.reset}`
    );
};

// ── Title Separator ──────────────────────────────────────────────────────

export var drawTitleSep = (buf, size, menuFocused, contentFocused) => {
    var { cols } = size;
    var mw = getMenuWidth(cols);
    var cw = cols - mw - 1;
    var mc = borderColor(menuFocused);
    var cc = borderColor(contentFocused);
    buf.push(`${mc}${B.lj}${B.h.repeat(mw)}${c.reset}${c.dim}${B.x}${c.reset}${cc}${B.h.repeat(cw)}${B.rj}${c.reset}`);
};

// ── Content Row ──────────────────────────────────────────────────────────

export var drawRow = (menuContent, panelContent, cols, menuFocused, contentFocused) => {
    var mw = getMenuWidth(cols);
    var cw = cols - mw - 1;

    var menuPlain = stripAnsi(menuContent || '');
    var menuPad = Math.max(0, mw - 2 - menuPlain.length);

    var panelPlain = stripAnsi(panelContent || '');
    var panelPad = Math.max(0, cw - 2 - panelPlain.length);

    var mc = borderColor(menuFocused);
    var cc = borderColor(contentFocused);

    return (
        `${mc}${B.v}${c.reset} ${menuContent || ''}${' '.repeat(menuPad)}` +
        `${c.dim}${B.v}${c.reset} ${panelContent || ''}${' '.repeat(panelPad)}` +
        `${cc}${B.v}${c.reset}`
    );
};

// ── Footer (inside the frame) ────────────────────────────────────────────

export var drawFooter = (buf, size, footerContent, menuFocused, contentFocused) => {
    var { cols } = size;
    var mw = getMenuWidth(cols);
    var cw = cols - mw - 1;

    var mc = borderColor(menuFocused);
    var cc = borderColor(contentFocused);

    buf.push(`${mc}${B.lj}${B.h.repeat(mw)}${c.reset}${c.dim}${B.bj}${c.reset}${cc}${B.h.repeat(cw)}${B.rj}${c.reset}`);

    if (footerContent) {
        var plain = stripAnsi(footerContent);
        var innerWidth = cols - 4;
        var pad = Math.max(0, innerWidth - plain.length);
        buf.push(`${mc}${B.v}${c.reset} ${footerContent}${' '.repeat(pad)}${c.reset} ${cc}${B.v}${c.reset}`);
    }

    buf.push(`${mc}${B.bl}${c.reset}${c.dim}${B.h.repeat(cols - 2)}${c.reset}${cc}${B.br}${c.reset}`);
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

export var col = (str, width) => {
    var plain = stripAnsi(str);
    if (plain.length > width) return truncate(str, width);
    return str + ' '.repeat(Math.max(0, width - plain.length));
};
