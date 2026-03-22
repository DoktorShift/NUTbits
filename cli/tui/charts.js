// NUTbits TUI - Chart components
// Sparklines, horizontal bars, gauges - zero dependencies, Unicode only
// Each function returns an array of strings (lines) ready to render

import { c, stripAnsi } from '../colors.js';

// ── Sparkline ────────────────────────────────────────────────────────────
// Single-line graph using block elements: ▁▂▃▄▅▆▇█
// 8 height levels per character cell
//
// sparkline([10, 20, 30, 15, 5], 20)
// => ["▂▄▇▃▁"]

var SPARK_CHARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

export function sparkline(values, width, options) {
    if (!values || values.length === 0) return [];
    var opts = options || {};
    var color = opts.color || c.purple;
    var label = opts.label || null;
    var showRange = opts.showRange !== false;

    // Downsample if more data points than width
    var data = values;
    if (data.length > width) {
        var bucketSize = data.length / width;
        var sampled = [];
        for (var i = 0; i < width; i++) {
            var start = Math.floor(i * bucketSize);
            var end = Math.floor((i + 1) * bucketSize);
            var sum = 0, count = 0;
            for (var j = start; j < end && j < data.length; j++) { sum += data[j]; count++; }
            sampled.push(count > 0 ? sum / count : 0);
        }
        data = sampled;
    }

    // Pad if fewer data points than width
    if (data.length < width) {
        var pad = new Array(width - data.length).fill(0);
        data = pad.concat(data);
    }

    var min = opts.min !== undefined ? opts.min : Math.min(...data);
    var max = opts.max !== undefined ? opts.max : Math.max(...data);
    var range = max - min || 1;

    // Build sparkline string
    var line = '';
    for (var i = 0; i < data.length; i++) {
        var normalized = (data[i] - min) / range;
        var idx = Math.min(7, Math.floor(normalized * 8));
        if (data[i] === 0 && min === 0) idx = 0;
        line += SPARK_CHARS[idx];
    }

    var lines = [];
    if (label) {
        var current = data[data.length - 1];
        lines.push(`${c.muted}${label}:${c.reset} ${color}${c.bold}${Number(current).toLocaleString()}${c.reset}`);
    }
    lines.push(`${color}${line}${c.reset}`);
    if (showRange && max > min) {
        var rangeStr = `${c.dim}${Number(min).toLocaleString()}${c.reset}`;
        var maxStr = `${c.dim}${Number(max).toLocaleString()}${c.reset}`;
        var padLen = Math.max(0, width - stripAnsi(rangeStr).length - stripAnsi(maxStr).length);
        lines.push(`${rangeStr}${' '.repeat(padLen)}${maxStr}`);
    }

    return lines;
}

// ── Horizontal Bar Chart ─────────────────────────────────────────────────
// Per-item horizontal bars with labels, values, and optional percentages
//
// hbar([{label:'Alice', value:847}, {label:'Bob', value:312}], 40)
// => ["Alice    ████████████████░░░░  847",
//     "Bob      ██████░░░░░░░░░░░░░░  312"]

export function hbar(data, width, options) {
    if (!data || data.length === 0) return [];
    var opts = options || {};
    var showPct = opts.showPct !== false;
    var unit = opts.unit || '';

    var maxVal = Math.max(...data.map(d => d.value), 1);
    var maxLabelLen = Math.max(...data.map(d => d.label.length), 1);
    var labelW = Math.min(maxLabelLen, 16);

    // Calculate bar area width
    var valueStr = Number(maxVal).toLocaleString() + (unit ? ' ' + unit : '');
    var pctStr = showPct ? ' 100%' : '';
    var barW = Math.max(8, width - labelW - 2 - valueStr.length - pctStr.length - 2);

    var lines = [];
    for (var item of data) {
        var label = item.label.slice(0, labelW).padEnd(labelW);
        var ratio = item.value / maxVal;
        var filled = Math.round(ratio * barW);
        var empty = barW - filled;
        var barColor = item.color || c.purple;

        var bar = `${barColor}${'█'.repeat(filled)}${c.reset}${c.dim}${'░'.repeat(empty)}${c.reset}`;
        var val = Number(item.value).toLocaleString() + (unit ? ' ' + unit : '');
        var pct = showPct ? `${c.dim} ${Math.round(ratio * 100)}%${c.reset}` : '';

        lines.push(`${c.white}${label}${c.reset}  ${bar}  ${c.muted}${val}${c.reset}${pct}`);
    }

    return lines;
}

// ── Gauge Bar ────────────────────────────────────────────────────────────
// Single-line progress indicator with fractional block precision
//
// gauge(52, 100, 20)
// => "████████████░░░░░░░░ 52%"

var FRAC_BLOCKS = [' ', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'];

export function gauge(value, max, width, options) {
    if (max <= 0) return [];
    var opts = options || {};
    var color = opts.color || c.green;
    var label = opts.label || null;
    var showPct = opts.showPct !== false;

    var ratio = Math.min(1, Math.max(0, value / max));
    var pctStr = showPct ? ` ${Math.round(ratio * 100)}%` : '';
    var barW = Math.max(4, width - (label ? label.length + 2 : 0) - pctStr.length);

    var fullBlocks = Math.floor(ratio * barW);
    var remainder = (ratio * barW) - fullBlocks;
    var fracIdx = Math.round(remainder * 8);
    var emptyBlocks = barW - fullBlocks - (fracIdx > 0 ? 1 : 0);

    var bar = `${color}${'█'.repeat(fullBlocks)}${c.reset}`;
    if (fracIdx > 0 && fracIdx < 9) bar += `${color}${FRAC_BLOCKS[fracIdx]}${c.reset}`;
    bar += `${c.dim}${'░'.repeat(Math.max(0, emptyBlocks))}${c.reset}`;

    var line = '';
    if (label) line += `${c.muted}${label}${c.reset}  `;
    line += bar;
    if (showPct) line += `${c.white}${pctStr}${c.reset}`;

    return [line];
}

// ── Mini Bar (inline) ────────────────────────────────────────────────────
// Compact bar for inline use within kv() style layouts
//
// miniBar(75, 100, 10) => "███████░░░"

export function miniBar(value, max, width, color) {
    if (max <= 0) return `${c.dim}${'░'.repeat(width)}${c.reset}`;
    var clr = color || c.green;
    var ratio = Math.min(1, Math.max(0, value / max));
    var filled = Math.round(ratio * width);
    var empty = width - filled;
    return `${clr}${'█'.repeat(filled)}${c.reset}${c.dim}${'░'.repeat(empty)}${c.reset}`;
}

// ── Braille Sparkline ────────────────────────────────────────────────────
// Higher resolution using braille dots (2x4 per character = 4 vertical levels)
// Used for response time graphs where detail matters
//
// Each braille char is U+2800 + dot bits:
//   dot1(0x01) dot4(0x08)
//   dot2(0x02) dot5(0x10)
//   dot3(0x04) dot6(0x20)
//   dot7(0x40) dot8(0x80)

export function brailleSparkline(values, width, options) {
    if (!values || values.length === 0) return [];
    var opts = options || {};
    var color = opts.color || c.blue;
    var height = opts.height || 2; // character rows

    // Each char is 2 columns wide x 4 rows high in dot resolution
    var dotsWide = width * 2;
    var dotsTall = height * 4;

    // Resample to fit
    var data = resample(values, dotsWide);

    var min = Math.min(...data);
    var max = Math.max(...data);
    var range = max - min || 1;

    // Build grid (rows x cols) of dots
    var grid = [];
    for (var r = 0; r < dotsTall; r++) grid.push(new Array(dotsWide).fill(false));

    // Plot points
    for (var x = 0; x < data.length; x++) {
        var normalized = (data[x] - min) / range;
        var y = Math.floor(normalized * (dotsTall - 1));
        // Invert y (top = high value)
        grid[dotsTall - 1 - y][x] = true;
        // Fill below for area effect
        if (opts.fill) {
            for (var fy = dotsTall - 1 - y + 1; fy < dotsTall; fy++) grid[fy][x] = true;
        }
    }

    // Encode to braille characters
    // Each char covers cols [cx*2, cx*2+1] x rows [ry*4 .. ry*4+3]
    var lines = [];
    for (var ry = 0; ry < height; ry++) {
        var row = '';
        for (var cx = 0; cx < width; cx++) {
            var code = 0x2800;
            var bx = cx * 2;
            var by = ry * 4;
            // Left column dots: 1,2,3,7
            if (grid[by]?.[bx])     code |= 0x01;
            if (grid[by + 1]?.[bx]) code |= 0x02;
            if (grid[by + 2]?.[bx]) code |= 0x04;
            if (grid[by + 3]?.[bx]) code |= 0x40;
            // Right column dots: 4,5,6,8
            if (grid[by]?.[bx + 1])     code |= 0x08;
            if (grid[by + 1]?.[bx + 1]) code |= 0x10;
            if (grid[by + 2]?.[bx + 1]) code |= 0x20;
            if (grid[by + 3]?.[bx + 1]) code |= 0x80;
            row += String.fromCharCode(code);
        }
        lines.push(`${color}${row}${c.reset}`);
    }

    return lines;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function resample(values, targetLen) {
    if (values.length === targetLen) return values;
    if (values.length === 0) return new Array(targetLen).fill(0);

    var result = [];
    var ratio = values.length / targetLen;
    for (var i = 0; i < targetLen; i++) {
        var srcIdx = i * ratio;
        var lo = Math.floor(srcIdx);
        var hi = Math.min(lo + 1, values.length - 1);
        var frac = srcIdx - lo;
        result.push(values[lo] * (1 - frac) + values[hi] * frac);
    }
    return result;
}
