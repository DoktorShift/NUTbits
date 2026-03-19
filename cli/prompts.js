// NUTbits CLI — Interactive prompt components
// Select, MultiSelect, Input, Confirm — zero dependencies
// Uses raw stdin keypresses + ANSI cursor control

import { c, stripAnsi } from './colors.js';

// ── TTY Guard ────────────────────────────────────────────────────────────

var requireTTY = () => {
    if (!process.stdin.isTTY) {
        throw new Error('Interactive prompts require a TTY. Use flags for scripted mode (e.g. --label, --permissions).');
    }
};

// ── Keyboard Constants ───────────────────────────────────────────────────

var KEY = {
    UP:     '\x1b[A',
    DOWN:   '\x1b[B',
    ENTER:  '\r',
    SPACE:  ' ',
    CTRL_C: '\x03',
    BACKSPACE: '\x7f',
    DELETE: '\x1b[3~',
};

// ── Raw Mode Helpers ─────────────────────────────────────────────────────

var enableRaw = () => {
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
};

var disableRaw = () => {
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdin.pause();
};

var hideCursor = () => process.stdout.write('\x1b[?25l');
var showCursor = () => process.stdout.write('\x1b[?25h');
var clearLines = n => {
    for (var i = 0; i < n; i++) {
        process.stdout.write('\x1b[1A\x1b[2K');
    }
};

// ── Select: Pick one from a list ─────────────────────────────────────────

export var select = ({ message, options, initial = 0 }) => new Promise((resolve, reject) => {
    requireTTY();
    if (!options || options.length === 0) { resolve(null); return; }
    var idx = initial;
    var lineCount = 0;

    var render = () => {
        if (lineCount > 0) clearLines(lineCount);
        var lines = [];
        lines.push(`  ${c.white}${c.bold}${message}${c.reset}`);
        lines.push('');
        for (var i = 0; i < options.length; i++) {
            var selected = i === idx;
            var indicator = selected ? `${c.purple}${c.bold}❯${c.reset}` : ' ';
            var radio = selected ? `${c.purple}◉${c.reset}` : `${c.dim}○${c.reset}`;
            var label = selected ? `${c.white}${options[i].label}${c.reset}` : `${c.muted}${options[i].label}${c.reset}`;
            var hint = options[i].hint ? `  ${c.dim}${options[i].hint}${c.reset}` : '';
            lines.push(`  ${indicator} ${radio} ${label}${hint}`);
        }
        lines.push('');
        lines.push(`  ${c.dim}↑↓ move · enter select${c.reset}`);
        process.stdout.write(lines.join('\n') + '\n');
        lineCount = lines.length;
    };

    hideCursor();
    render();
    enableRaw();

    var onKey = key => {
        if (key === KEY.CTRL_C) { cleanup(); process.exit(130); }
        if (key === KEY.UP && idx > 0) { idx--; render(); }
        if (key === KEY.DOWN && idx < options.length - 1) { idx++; render(); }
        if (key === KEY.ENTER) { cleanup(); resolve(options[idx]); }
    };

    var cleanup = () => {
        process.stdin.removeListener('data', onKey);
        disableRaw();
        showCursor();
    };

    process.stdin.on('data', onKey);
});

// ── MultiSelect: Toggle multiple options ─────────────────────────────────

export var multiSelect = ({ message, options, initial = [] }) => new Promise((resolve, reject) => {
    requireTTY();
    if (!options || options.length === 0) { resolve([]); return; }
    var idx = 0;
    var selected = new Set(initial);
    var lineCount = 0;

    var render = () => {
        if (lineCount > 0) clearLines(lineCount);
        var lines = [];
        lines.push(`  ${c.white}${c.bold}${message}${c.reset}`);
        lines.push('');
        for (var i = 0; i < options.length; i++) {
            var cursor = i === idx ? `${c.purple}${c.bold}❯${c.reset}` : ' ';
            var checked = selected.has(i);
            var box = checked ? `${c.green}●${c.reset}` : `${c.dim}○${c.reset}`;
            var label = i === idx ? `${c.white}${options[i].label}${c.reset}` : `${c.muted}${options[i].label}${c.reset}`;
            var hint = options[i].hint ? `  ${c.dim}${options[i].hint}${c.reset}` : '';
            lines.push(`  ${cursor} ${box} ${label}${hint}`);
        }
        lines.push('');
        lines.push(`  ${c.dim}↑↓ move · space toggle · enter confirm${c.reset}`);
        process.stdout.write(lines.join('\n') + '\n');
        lineCount = lines.length;
    };

    hideCursor();
    render();
    enableRaw();

    var onKey = key => {
        if (key === KEY.CTRL_C) { cleanup(); process.exit(130); }
        if (key === KEY.UP && idx > 0) { idx--; render(); }
        if (key === KEY.DOWN && idx < options.length - 1) { idx++; render(); }
        if (key === KEY.SPACE) {
            if (selected.has(idx)) selected.delete(idx);
            else selected.add(idx);
            render();
        }
        if (key === KEY.ENTER) {
            cleanup();
            resolve(options.filter((_, i) => selected.has(i)));
        }
    };

    var cleanup = () => {
        process.stdin.removeListener('data', onKey);
        disableRaw();
        showCursor();
    };

    process.stdin.on('data', onKey);
});

// ── Input: Type text or numbers ──────────────────────────────────────────

export var input = ({ message, placeholder = '', validate } = {}) => new Promise((resolve, reject) => {
    requireTTY();
    var value = '';
    var lineCount = 0;

    var render = () => {
        if (lineCount > 0) clearLines(lineCount);
        var display = value || `${c.dim}${placeholder}${c.reset}`;
        var line = `  ${c.white}${c.bold}${message}${c.reset} ${display}${value ? '' : ''}`;
        process.stdout.write(line + '\n');
        lineCount = 1;
    };

    showCursor();
    render();
    enableRaw();

    var onKey = key => {
        if (key === KEY.CTRL_C) { cleanup(); process.exit(130); }
        if (key === KEY.ENTER) {
            if (validate) {
                var err = validate(value);
                if (err) {
                    // Show error briefly
                    if (lineCount > 0) clearLines(lineCount);
                    process.stdout.write(`  ${c.red}${err}${c.reset}\n`);
                    lineCount = 1;
                    setTimeout(render, 800);
                    return;
                }
            }
            cleanup();
            resolve(value);
        }
        if (key === KEY.BACKSPACE || key === KEY.DELETE) {
            value = value.slice(0, -1);
            render();
        }
        // Printable characters
        if (key.length === 1 && key.charCodeAt(0) >= 32 && key.charCodeAt(0) < 127) {
            value += key;
            render();
        }
    };

    var cleanup = () => {
        process.stdin.removeListener('data', onKey);
        disableRaw();
    };

    process.stdin.on('data', onKey);
});

// ── Confirm: Yes / No ────────────────────────────────────────────────────

export var confirm = ({ message, initial = false }) => new Promise((resolve, reject) => {
    requireTTY();
    var value = initial;
    var lineCount = 0;

    var render = () => {
        if (lineCount > 0) clearLines(lineCount);
        var yes = value ? `${c.green}${c.bold}Yes${c.reset}` : `${c.dim}Yes${c.reset}`;
        var no = !value ? `${c.red}${c.bold}No${c.reset}` : `${c.dim}No${c.reset}`;
        var line = `  ${c.white}${c.bold}${message}${c.reset}  ${yes} / ${no}`;
        process.stdout.write(line + '\n');
        lineCount = 1;
    };

    hideCursor();
    render();
    enableRaw();

    var onKey = key => {
        if (key === KEY.CTRL_C) { cleanup(); process.exit(130); }
        if (key === 'y' || key === 'Y') { value = true; render(); }
        if (key === 'n' || key === 'N') { value = false; render(); }
        if (key === KEY.UP || key === KEY.DOWN) { value = !value; render(); }
        if (key === KEY.ENTER) { cleanup(); resolve(value); }
    };

    var cleanup = () => {
        process.stdin.removeListener('data', onKey);
        disableRaw();
        showCursor();
    };

    process.stdin.on('data', onKey);
});

// ── Spinner: Animated waiting indicator ──────────────────────────────────

export var spinner = (message) => {
    var frames = ['●○○○', '○●○○', '○○●○', '○○○●', '○○●○', '○●○○'];
    var i = 0;
    var interval;

    var start = () => {
        hideCursor();
        interval = setInterval(() => {
            var frame = frames[i % frames.length].split('').map(ch =>
                ch === '●' ? `${c.purple}●${c.reset}` : `${c.dim}○${c.reset}`
            ).join('');
            process.stdout.write(`\r  ${message}  ${frame}`);
            i++;
        }, 120);
    };

    var stop = (finalMessage) => {
        clearInterval(interval);
        process.stdout.write(`\r\x1b[2K`);
        if (finalMessage) process.stdout.write(`  ${finalMessage}\n`);
        showCursor();
    };

    return { start, stop };
};
