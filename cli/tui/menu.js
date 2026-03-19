// NUTbits TUI — Menu component
// Navigable left-panel menu with sections and separators

import { c } from '../colors.js';

// ── Menu Definition ──────────────────────────────────────────────────────

export var MENU_ITEMS = [
    { id: 'status',      label: 'Dashboard',      icon: '●', section: 'overview' },
    { id: 'balance',     label: 'Balance',         icon: '◆', section: 'overview' },
    { id: 'connections', label: 'Connections',      icon: '◉', section: 'overview' },
    { id: 'history',     label: 'History',          icon: '◈', section: 'overview' },
    { id: 'sep1',        separator: true },
    { id: 'pay',         label: 'Pay',              icon: '⚡', section: 'actions', color: c.red },
    { id: 'receive',     label: 'Receive',          icon: '⚡', section: 'actions', color: c.green },
    { id: 'connect',     label: 'New Connection',   icon: '✦', section: 'actions', color: c.blue },
    { id: 'revoke',      label: 'Revoke',           icon: '✕', section: 'actions', color: c.red },
    { id: 'sep2',        separator: true },
    { id: 'mints',       label: 'Mints',            icon: '◇', section: 'network' },
    { id: 'nuts',        label: 'NUTs',             icon: '◆', section: 'network' },
    { id: 'relays',      label: 'Relays',           icon: '◎', section: 'network' },
    { id: 'sep3',        separator: true },
    { id: 'fees',        label: 'Fees',             icon: '◆', section: 'system', color: c.yellow },
    { id: 'config',      label: 'Config',           icon: '◌', section: 'system' },
    { id: 'backup',      label: 'Backup',           icon: '▪', section: 'system' },
    { id: 'restore',     label: 'Restore',          icon: '▫', section: 'system' },
    { id: 'logs',        label: 'Logs',             icon: '▸', section: 'system' },
];

// Navigable items (skip separators)
export var NAV_ITEMS = MENU_ITEMS.filter(m => !m.separator);

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

        if (item.separator) {
            lines.push(`${c.dim}${'─'.repeat(24)}${c.reset}`);
            continue;
        }

        var isActive = navIdx === selected;
        var icon = item.icon || ' ';
        var label = item.label;

        if (isActive) {
            var clr = item.color || c.purple;
            lines.push(`${clr}${c.bold} ❯ ${icon} ${label}${c.reset}`);
        } else {
            lines.push(`${c.muted}   ${icon} ${label}${c.reset}`);
        }
        navIdx++;
    }

    return lines;
}
