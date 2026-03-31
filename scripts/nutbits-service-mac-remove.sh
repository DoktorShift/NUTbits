#!/usr/bin/env bash
set -euo pipefail

LABEL="dev.doktorshift.nutbits"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"
UID_VALUE="$(id -u)"

launchctl bootout "gui/$UID_VALUE/$LABEL" >/dev/null 2>&1 || true
rm -f "$PLIST_PATH"

echo "Removed launchd service: $LABEL"
