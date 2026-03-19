// NUTbits CLI - ANSI color palette
// True-color matching the project's SVG/terminal style
// Respects NO_COLOR env and --no-color flag

var enabled = !process.env.NO_COLOR && !process.argv.includes('--no-color') && process.stdout.isTTY;

var rgb = (r, g, b) => enabled ? `\x1b[38;2;${r};${g};${b}m` : '';
var bg = (r, g, b) => enabled ? `\x1b[48;2;${r};${g};${b}m` : '';

export var c = {
    // Project palette
    purple:  rgb(192, 132, 252),   // #c084fc
    blue:    rgb(88, 166, 255),    // #58a6ff
    yellow:  rgb(255, 189, 46),    // #ffbd2e
    green:   rgb(39, 201, 63),     // #27c93f
    red:     rgb(255, 95, 86),     // #ff5f56

    // Text tones
    white:   rgb(201, 209, 217),   // #c9d1d9
    dim:     rgb(72, 79, 88),      // #484f58
    muted:   rgb(139, 148, 158),   // #8b949e
    border:  rgb(48, 54, 61),      // #30363d
    bg:      bg(13, 17, 23),       // #0d1117

    // Formatting
    bold:    enabled ? '\x1b[1m' : '',
    reset:   enabled ? '\x1b[0m' : '',

    // Status indicators
    dot: {
        ok:   (enabled ? rgb(39, 201, 63) : '') + '●' + (enabled ? '\x1b[0m' : ''),
        warn: (enabled ? rgb(255, 189, 46) : '') + '●' + (enabled ? '\x1b[0m' : ''),
        err:  (enabled ? rgb(255, 95, 86) : '') + '●' + (enabled ? '\x1b[0m' : ''),
        off:  (enabled ? rgb(72, 79, 88) : '') + '●' + (enabled ? '\x1b[0m' : ''),
    },

    ok:   (enabled ? rgb(39, 201, 63) : '') + '✓' + (enabled ? '\x1b[0m' : ''),
    fail: (enabled ? rgb(255, 95, 86) : '') + '✗' + (enabled ? '\x1b[0m' : ''),
};

// Strip ANSI escape codes for width calculation
export var stripAnsi = s => s.replace(/\x1b\[[0-9;]*m/g, '');
