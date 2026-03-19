// NUTbits CLI — Interactive prompt components
// Select, MultiSelect, Input, Confirm — zero dependencies
// Uses raw stdin keypresses + ANSI cursor control
//
// ESCAPE: every prompt resolves with null on Escape (cancel).
// Commands should check for null and handle gracefully.

import { c, stripAnsi } from './colors.js';

// ── TTY Guard ────────────────────────────────────────────────────────────

var requireTTY = () => {
    if (!process.stdin.isTTY) {
        throw new Error('Interactive prompts require a TTY. Use flags for scripted mode (e.g. --label, --permissions).');
    }
};

// ── Cancelled sentinel ───────────────────────────────────────────────────

export var CANCELLED = Symbol('cancelled');

// ── Keyboard Constants ───────────────────────────────────────────────────

var KEY = {
    UP:     '\x1b[A',
    DOWN:   '\x1b[B',
    ENTER:  '\r',
    SPACE:  ' ',
    CTRL_C: '\x03',
    ESCAPE: '\x1b',
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

// Save cursor position, then restore + erase below to clear prompt output
var saveCursor = () => process.stdout.write('\x1b7');
var restoreAndClear = () => process.stdout.write('\x1b8\x1b[J');

// ── Hint Bar ────────────────────────────────────────────────────────────

var hintBar = (parts) => {
    return '  ' + parts.map(([key, label]) =>
        `${c.muted}[${c.white}${key}${c.muted}] ${label}${c.reset}`
    ).join('  ');
};

// ── Escape Sequence Buffering ────────────────────────────────────────────

var createEscHandler = (onEscape, onSequence) => {
    var timer = null;
    var fn = (key) => {
        if (timer) { clearTimeout(timer); timer = null; }
        if (key === KEY.ESCAPE) {
            timer = setTimeout(() => { timer = null; onEscape(); }, 60);
            return true;
        }
        if (key.startsWith('\x1b[')) {
            onSequence(key);
            return true;
        }
        return false;
    };
    fn.cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
    return fn;
};

// ── Select: Pick one from a list ─────────────────────────────────────────

export var select = ({ message, options, initial = 0, description } = {}) => new Promise((resolve) => {
    requireTTY();
    if (!options || options.length === 0) { resolve(null); return; }
    var idx = initial;

    var render = () => {
        restoreAndClear();
        var lines = [];
        lines.push(`  ${c.purple}${c.bold}?${c.reset} ${c.white}${c.bold}${message}${c.reset}`);
        if (description) lines.push(`    ${c.dim}${description}${c.reset}`);
        lines.push('');
        for (var i = 0; i < options.length; i++) {
            var selected = i === idx;
            var indicator = selected ? `${c.purple}${c.bold} ›${c.reset}` : '  ';
            var label = selected ? `${c.white}${c.bold}${options[i].label}${c.reset}` : `${c.muted}${options[i].label}${c.reset}`;
            var hint = options[i].hint ? `  ${c.dim}${options[i].hint}${c.reset}` : '';
            lines.push(`  ${indicator} ${label}${hint}`);
        }
        lines.push('');
        lines.push(hintBar([['↑↓', 'navigate'], ['enter', 'select'], ['esc', 'cancel']]));
        process.stdout.write(lines.join('\n') + '\n');
    };

    var escHandler = createEscHandler(
        () => { cleanup(); restoreAndClear(); resolve(null); },
        (seq) => {
            if (seq === KEY.UP && idx > 0) { idx--; render(); }
            if (seq === KEY.DOWN && idx < options.length - 1) { idx++; render(); }
        }
    );

    hideCursor();
    saveCursor();
    render();
    enableRaw();

    var onKey = key => {
        if (key === KEY.CTRL_C) { cleanup(); process.exit(130); }
        if (escHandler(key)) return;
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

export var multiSelect = ({ message, options, initial = [], description } = {}) => new Promise((resolve) => {
    requireTTY();
    if (!options || options.length === 0) { resolve(null); return; }
    var idx = 0;
    var selected = new Set(initial);

    var render = () => {
        restoreAndClear();
        var lines = [];
        lines.push(`  ${c.purple}${c.bold}?${c.reset} ${c.white}${c.bold}${message}${c.reset}`);
        if (description) lines.push(`    ${c.dim}${description}${c.reset}`);
        lines.push('');
        for (var i = 0; i < options.length; i++) {
            var cursor = i === idx ? `${c.purple}${c.bold} ›${c.reset}` : '  ';
            var checked = selected.has(i);
            var box = checked ? `${c.green}[●]${c.reset}` : `${c.dim}[○]${c.reset}`;
            var label = i === idx ? `${c.white}${options[i].label}${c.reset}` : `${c.muted}${options[i].label}${c.reset}`;
            var hint = options[i].hint ? `  ${c.dim}${options[i].hint}${c.reset}` : '';
            lines.push(`  ${cursor} ${box} ${label}${hint}`);
        }
        var count = selected.size;
        lines.push('');
        lines.push(hintBar([['↑↓', 'navigate'], ['space', 'toggle'], ['enter', `confirm (${count})`], ['esc', 'cancel']]));
        process.stdout.write(lines.join('\n') + '\n');
    };

    var escHandler = createEscHandler(
        () => { cleanup(); restoreAndClear(); resolve(null); },
        (seq) => {
            if (seq === KEY.UP && idx > 0) { idx--; render(); }
            if (seq === KEY.DOWN && idx < options.length - 1) { idx++; render(); }
        }
    );

    hideCursor();
    saveCursor();
    render();
    enableRaw();

    var onKey = key => {
        if (key === KEY.CTRL_C) { cleanup(); process.exit(130); }
        if (escHandler(key)) return;
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

export var input = ({ message, placeholder = '', validate, description } = {}) => new Promise((resolve) => {
    requireTTY();
    var value = '';

    var render = () => {
        restoreAndClear();
        var cols = process.stdout.columns || 80;
        var prefixText = `  > ${message} `;
        var maxValueLen = Math.max(20, cols - prefixText.length - 2);

        // Truncate display for long values (like invoices)
        var displayVal = value;
        if (value.length > maxValueLen) {
            displayVal = value.slice(0, maxValueLen - 12) + '...' + value.slice(-8);
        }

        var display = value
            ? `${c.white}${displayVal}${c.reset}`
            : `${c.dim}${placeholder}${c.reset}`;
        var line = `  ${c.purple}${c.bold}>${c.reset} ${c.white}${c.bold}${message}${c.reset} ${display}`;

        var lines = [line];
        if (description && !value) lines.push(`    ${c.dim}${description}${c.reset}`);
        lines.push(hintBar([['type', 'answer'], ['enter', 'confirm'], ['esc', 'cancel']]));
        process.stdout.write(lines.join('\n') + '\n');
    };

    showCursor();
    saveCursor();
    render();
    enableRaw();

    var escHandler = createEscHandler(
        () => { cleanup(); restoreAndClear(); resolve(null); },
        () => {}
    );

    var onKey = key => {
        if (key === KEY.CTRL_C) { cleanup(); process.exit(130); }
        if (escHandler(key)) return;
        if (key === KEY.ENTER) {
            if (validate) {
                var err = validate(value);
                if (err) {
                    restoreAndClear();
                    process.stdout.write(`  ${c.red}${err}${c.reset}\n`);
                    saveCursor();
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
            return;
        }
        // Printable characters (supports paste — multi-char data events)
        var printable = '';
        for (var ci = 0; ci < key.length; ci++) {
            var ch = key.charCodeAt(ci);
            if (ch >= 32 && ch < 127) printable += key[ci];
        }
        if (printable.length > 0) {
            value += printable;
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

export var confirm = ({ message, initial = false, description } = {}) => new Promise((resolve) => {
    requireTTY();
    var value = initial;

    var render = () => {
        restoreAndClear();
        var yesIndicator = value ? `${c.purple}${c.bold} ›${c.reset}` : '  ';
        var noIndicator = !value ? `${c.purple}${c.bold} ›${c.reset}` : '  ';
        var yesLabel = value ? `${c.green}${c.bold}Yes${c.reset}` : `${c.dim}Yes${c.reset}`;
        var noLabel = !value ? `${c.red}${c.bold}No${c.reset}` : `${c.dim}No${c.reset}`;
        var lines = [];
        lines.push(`  ${c.purple}${c.bold}?${c.reset} ${c.white}${c.bold}${message}${c.reset}`);
        if (description) lines.push(`    ${c.dim}${description}${c.reset}`);
        lines.push('');
        lines.push(`  ${yesIndicator} ${yesLabel}`);
        lines.push(`  ${noIndicator} ${noLabel}`);
        lines.push('');
        lines.push(hintBar([['↑↓', 'choose'], ['y/n', 'shortcut'], ['enter', 'confirm'], ['esc', 'cancel']]));
        process.stdout.write(lines.join('\n') + '\n');
    };

    var escHandler = createEscHandler(
        () => { cleanup(); restoreAndClear(); resolve(null); },
        (seq) => {
            if (seq === KEY.UP || seq === KEY.DOWN) { value = !value; render(); }
        }
    );

    hideCursor();
    saveCursor();
    render();
    enableRaw();

    var onKey = key => {
        if (key === KEY.CTRL_C) { cleanup(); process.exit(130); }
        if (escHandler(key)) return;
        if (key === 'y' || key === 'Y') { value = true; render(); }
        if (key === 'n' || key === 'N') { value = false; render(); }
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
