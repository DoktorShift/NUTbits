// NUTbits CLI - Terminal rendering primitives
// Boxes, tables, key-value pairs - zero dependencies

import { c, stripAnsi } from './colors.js';

var cols = () => process.stdout.columns || 80;

// ── Box ──────────────────────────────────────────────────────────────────

export var box = (lines, { title, color = c.border, width } = {}) => {
    var w = width || Math.min(cols() - 2, Math.max(60, ...lines.map(l => stripAnsi(l).length + 4)));
    var top = `${c.dim}┌${'─'.repeat(w - 2)}┐${c.reset}`;
    var bot = `${c.dim}└${'─'.repeat(w - 2)}┘${c.reset}`;
    var sep = `${c.dim}├${'─'.repeat(w - 2)}┤${c.reset}`;
    var out = [];

    if (title) {
        var tPlain = stripAnsi(title);
        var tPad = w - 4 - tPlain.length;
        out.push(top);
        out.push(`${c.dim}│${c.reset} ${title}${' '.repeat(Math.max(0, tPad))} ${c.dim}│${c.reset}`);
        out.push(sep);
    } else {
        out.push(top);
    }

    for (var line of lines) {
        var plain = stripAnsi(line);
        var pad = w - 4 - plain.length;
        out.push(`${c.dim}│${c.reset} ${line}${' '.repeat(Math.max(0, pad))} ${c.dim}│${c.reset}`);
    }
    out.push(bot);
    return out.join('\n');
};

// ── Key-Value ────────────────────────────────────────────────────────────

export var kv = (label, value, { labelWidth = 14, labelColor = c.muted, valueColor = '' } = {}) => {
    var padded = label.padEnd(labelWidth);
    return `  ${labelColor}${padded}${c.reset}${valueColor}${value}${c.reset}`;
};

// ── Table ────────────────────────────────────────────────────────────────

export var table = (headers, rows, { alignRight = [] } = {}) => {
    // Calculate column widths
    var widths = headers.map((h, i) => {
        var max = stripAnsi(h).length;
        for (var row of rows) {
            var cell = String(row[i] ?? '');
            max = Math.max(max, stripAnsi(cell).length);
        }
        return max;
    });

    var formatRow = (cells, isHeader) => {
        var parts = cells.map((cell, i) => {
            var s = String(cell ?? '');
            var plain = stripAnsi(s);
            var pad = widths[i] - plain.length;
            if (alignRight.includes(i)) return ' '.repeat(Math.max(0, pad)) + s;
            return s + ' '.repeat(Math.max(0, pad));
        });
        return '  ' + parts.join('   ');
    };

    var out = [];
    out.push(formatRow(headers.map(h => `${c.muted}${h}${c.reset}`), true));
    var divider = '  ' + widths.map(w => `${c.dim}${'─'.repeat(w)}${c.reset}`).join('   ');
    out.push(divider);
    for (var row of rows) out.push(formatRow(row, false));
    return out.join('\n');
};

// ── Sats formatting ──────────────────────────────────────────────────────

export var sats = (n, { color = c.yellow } = {}) => {
    var formatted = Number(n || 0).toLocaleString('en-US');
    return `${color}${c.bold}${formatted}${c.reset}${c.muted} sats${c.reset}`;
};

// ── Time formatting ──────────────────────────────────────────────────────

export var relativeTime = ts => {
    var diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 0) return 'just now';
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
};

export var uptime = ms => {
    var s = Math.floor(ms / 1000);
    var d = Math.floor(s / 86400); s %= 86400;
    var h = Math.floor(s / 3600); s %= 3600;
    var m = Math.floor(s / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m`;
    return `${s}s`;
};

// ── Section header ───────────────────────────────────────────────────────

export var heading = (text, { color = c.purple } = {}) => {
    return `\n  ${color}${c.bold}${text}${c.reset}\n`;
};

// ── Blank line helper ────────────────────────────────────────────────────

export var blank = () => '';

// ── Print helper ─────────────────────────────────────────────────────────

export var print = (...lines) => console.log(lines.join('\n'));

// ── JSON output helper ───────────────────────────────────────────────────

export var jsonOut = data => console.log(JSON.stringify(data, null, 2));
