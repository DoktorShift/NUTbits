#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
LABEL="dev.doktorshift.nutbits"
PLIST_PATH="$LAUNCH_AGENTS_DIR/$LABEL.plist"
LOG_DIR="$ROOT_DIR/logs"
NODE_PATH="$(command -v node)"
UID_VALUE="$(id -u)"

mkdir -p "$LAUNCH_AGENTS_DIR" "$LOG_DIR"

cat >"$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_PATH</string>
    <string>$ROOT_DIR/nutbits.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$ROOT_DIR</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$LOG_DIR/nutbits.launchd.out.log</string>
  <key>StandardErrorPath</key>
  <string>$LOG_DIR/nutbits.launchd.err.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$UID_VALUE/$LABEL" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$UID_VALUE" "$PLIST_PATH"
launchctl kickstart -k "gui/$UID_VALUE/$LABEL"

echo "Installed launchd service: $LABEL"
echo "Service file: $PLIST_PATH"
echo "Logs: $LOG_DIR/nutbits.launchd.out.log and $LOG_DIR/nutbits.launchd.err.log"
echo "Status: launchctl print gui/$UID_VALUE/$LABEL"
echo "Remove: npm run service:mac:remove"
