// NUTbits TUI - Menu component
// Focus-aware, responsive separators, background highlight on active item

import { c } from '../colors.js';
import { getMenuWidth } from './layout.js';

// Background highlight for focused active item
var bgHighlight = '\x1b[48;2;45;30;65m'; // dark purple bg
var bgReset = '\x1b[49m';

// ── Menu Definition ──────────────────────────────────────────────────────

export var MENU_ITEMS = [
    { id: 'sec_overview',  section_label: 'OVERVIEW' },
    { id: 'status',        label: 'Dashboard',       icon: '*', section: 'overview' },
    { id: 'balance',       label: 'Balance',          icon: '$', section: 'overview' },
    { id: 'connections',   label: 'Connections',      icon: '#', section: 'overview' },
    { id: 'history',       label: 'History',          icon: '>', section: 'overview' },
    { id: 'activity',      label: 'Activity',         icon: '~', section: 'overview' },
    { id: 'sec_actions',   section_label: 'ACTIONS' },
    { id: 'pay',           label: 'Pay',              icon: '<', section: 'actions', color: c.red },
    { id: 'receive',       label: 'Receive',          icon: '>', section: 'actions', color: c.green },
    { id: 'connect',       label: 'New Connection',   icon: '+', section: 'actions', color: c.blue },
    { id: 'fund',          label: 'Fund',             icon: '+', section: 'actions', color: c.green },
    { id: 'withdraw',      label: 'Withdraw',         icon: '-', section: 'actions', color: c.yellow },
    { id: 'revoke',        label: 'Revoke',           icon: 'x', section: 'actions', color: c.red },
    { id: 'export',        label: 'Export',            icon: 'E', section: 'actions', color: c.yellow },
    { id: 'sec_network',   section_label: 'NETWORK' },
    { id: 'mints',         label: 'Mints',            icon: 'M', section: 'network' },
    { id: 'nuts',          label: 'NUTs',             icon: 'N', section: 'network' },
    { id: 'relays',        label: 'Relays',           icon: 'R', section: 'network' },
    { id: 'sec_system',    section_label: 'SYSTEM' },
    { id: 'fees',          label: 'Fees',             icon: '%', section: 'system', color: c.yellow },
    { id: 'config',        label: 'Config',           icon: '~', section: 'system' },
    { id: 'backup',        label: 'Backup',           icon: '=', section: 'system' },
    { id: 'restore',       label: 'Restore',          icon: '^', section: 'system' },
    { id: 'logs',          label: 'Logs',             icon: '.', section: 'system' },
];

export var NAV_ITEMS = MENU_ITEMS.filter(m => m.label);

// ── Menu State ───────────────────────────────────────────────────────────

export function createMenuState() {
    return { index: 0 };
}

export function menuUp(state) {
    if (state.index > 0) state.index--;
}

export function menuDown(state) {
    if (state.index < NAV_ITEMS.length - 1) state.index++;
}

export function getSelectedId(state) {
    return NAV_ITEMS[state.index]?.id || 'status';
}

// ── Render Menu Lines ────────────────────────────────────────────────────

export function renderMenu(state, maxRows, focused) {
    var selected = state.index;
    var cols = (process.stdout.columns || 100);
    var mw = getMenuWidth(cols);
    var sepLen = mw - 4; // dynamic separator width
    var lines = [];

    var navIdx = 0;
    for (var item of MENU_ITEMS) {
        if (lines.length >= maxRows) break;

        // Section header with dynamic separator
        if (item.section_label) {
            if (lines.length > 0) lines.push('');
            var headerColor = focused ? c.muted : c.dim;
            lines.push(`${headerColor} ${item.section_label}${c.reset}`);
            lines.push(`${c.dim} ${'─'.repeat(sepLen)}${c.reset}`);
            continue;
        }

        var isActive = navIdx === selected;
        var icon = item.icon || ' ';
        var label = item.label;

        if (isActive && focused) {
            // Focused + active: background highlight + bold colored text
            var clr = item.color || c.purple;
            lines.push(`${bgHighlight} ${clr}${c.bold}▌ ${icon} ${label}${c.reset}${bgReset}${c.reset}`);
        } else if (isActive && !focused) {
            // Unfocused + active: subtle indicator, white label
            lines.push(`${c.muted} ▌${c.reset} ${c.white}${icon} ${label}${c.reset}`);
        } else {
            // Inactive: dim text
            lines.push(`${c.dim}   ${icon} ${label}${c.reset}`);
        }
        navIdx++;
    }

    return lines;
}
