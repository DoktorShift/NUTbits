// NUTbits TUI — Menu component
// Navigable left-panel menu with sections, labels, and reverse-video highlight

import { c } from '../colors.js';

// ── Menu Definition ──────────────────────────────────────────────────────
// Icons: single-cell-width only (no emoji) for cross-terminal compatibility

export var MENU_ITEMS = [
    { id: 'sec_overview',  section_label: 'OVERVIEW' },
    { id: 'status',        label: 'Dashboard',       icon: '*', section: 'overview' },
    { id: 'balance',       label: 'Balance',          icon: '$', section: 'overview' },
    { id: 'connections',   label: 'Connections',      icon: '#', section: 'overview' },
    { id: 'history',       label: 'History',          icon: '>', section: 'overview' },
    { id: 'sec_actions',   section_label: 'ACTIONS' },
    { id: 'pay',           label: 'Pay',              icon: '<', section: 'actions', color: c.red },
    { id: 'receive',       label: 'Receive',          icon: '>', section: 'actions', color: c.green },
    { id: 'connect',       label: 'New Connection',   icon: '+', section: 'actions', color: c.blue },
    { id: 'revoke',        label: 'Revoke',           icon: 'x', section: 'actions', color: c.red },
    { id: 'sec_network',   section_label: 'NETWORK' },
    { id: 'mints',         label: 'Mints',            icon: 'M', section: 'network' },
    { id: 'nuts',          label: 'NUTs',             icon: 'N', section: 'network' },
    { id: 'relays',        label: 'Relays',           icon: 'R', section: 'network' },
    { id: 'export',        label: 'Export History',   icon: 'E', section: 'actions', color: c.yellow },
    { id: 'sec_system',    section_label: 'SYSTEM' },
    { id: 'fees',          label: 'Fees',             icon: '%', section: 'system', color: c.yellow },
    { id: 'config',        label: 'Config',           icon: '~', section: 'system' },
    { id: 'backup',        label: 'Backup',           icon: '=', section: 'system' },
    { id: 'restore',       label: 'Restore',          icon: '^', section: 'system' },
    { id: 'logs',          label: 'Logs',             icon: '.', section: 'system' },
];

// Navigable items (skip section headers)
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

export function renderMenu(state, maxRows) {
    var selected = state.index;
    var lines = [];

    var navIdx = 0;
    for (var item of MENU_ITEMS) {
        if (lines.length >= maxRows) break;

        // Section header
        if (item.section_label) {
            if (lines.length > 0) lines.push(''); // blank line before (except first)
            lines.push(`${c.dim} ${item.section_label}${c.reset}`);
            continue;
        }

        var isActive = navIdx === selected;
        var icon = item.icon || ' ';
        var label = item.label;

        if (isActive) {
            // Reverse-video style: bright background indicator + bold text
            var clr = item.color || c.purple;
            lines.push(`${clr}${c.bold} >> ${icon} ${label}${c.reset}`);
        } else {
            lines.push(`${c.muted}    ${icon} ${label}${c.reset}`);
        }
        navIdx++;
    }

    return lines;
}
