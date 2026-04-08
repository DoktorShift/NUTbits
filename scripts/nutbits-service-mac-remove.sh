#!/usr/bin/env bash
set -euo pipefail

BACKEND_LABEL="dev.doktorshift.nutbits"
GUI_LABEL="dev.doktorshift.nutbits-gui"
BACKEND_PLIST="$HOME/Library/LaunchAgents/$BACKEND_LABEL.plist"
GUI_PLIST="$HOME/Library/LaunchAgents/$GUI_LABEL.plist"
UID_VALUE="$(id -u)"

launchctl bootout "gui/$UID_VALUE/$BACKEND_LABEL" >/dev/null 2>&1 || true
launchctl bootout "gui/$UID_VALUE/$GUI_LABEL" >/dev/null 2>&1 || true
rm -f "$BACKEND_PLIST" "$GUI_PLIST"

echo "Removed launchd services: $BACKEND_LABEL, $GUI_LABEL"
