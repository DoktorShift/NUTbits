#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
LOG_DIR="$ROOT_DIR/logs"
NODE_PATH="$(command -v node)"
UID_VALUE="$(id -u)"

BACKEND_LABEL="dev.doktorshift.nutbits"
GUI_LABEL="dev.doktorshift.nutbits-gui"
BACKEND_PLIST="$LAUNCH_AGENTS_DIR/$BACKEND_LABEL.plist"
GUI_PLIST="$LAUNCH_AGENTS_DIR/$GUI_LABEL.plist"

mkdir -p "$LAUNCH_AGENTS_DIR" "$LOG_DIR"
cd "$ROOT_DIR"

# Install deps + build GUI if needed
if [[ ! -d "$ROOT_DIR/node_modules" ]]; then
  echo "Installing backend dependencies"
  npm install
fi

if [[ ! -f "$ROOT_DIR/gui/node_modules/vite/dist/node/cli.js" ]]; then
  echo "Installing GUI dependencies"
  npm --prefix gui install
fi

echo "Building GUI"
npm run build:gui

# ── Backend service ───────────────────────────────────────────
cat >"$BACKEND_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$BACKEND_LABEL</string>
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

# ── GUI service ───────────────────────────────────────────────
cat >"$GUI_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$GUI_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_PATH</string>
    <string>$ROOT_DIR/scripts/nutbits-gui-server.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$ROOT_DIR</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$LOG_DIR/nutbits-gui.launchd.out.log</string>
  <key>StandardErrorPath</key>
  <string>$LOG_DIR/nutbits-gui.launchd.err.log</string>
</dict>
</plist>
EOF

# ── Start services ────────────────────────────────────────────
launchctl bootout "gui/$UID_VALUE/$BACKEND_LABEL" >/dev/null 2>&1 || true
launchctl bootout "gui/$UID_VALUE/$GUI_LABEL" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$UID_VALUE" "$BACKEND_PLIST"
launchctl bootstrap "gui/$UID_VALUE" "$GUI_PLIST"
launchctl kickstart -k "gui/$UID_VALUE/$BACKEND_LABEL"
launchctl kickstart -k "gui/$UID_VALUE/$GUI_LABEL"

echo ""
echo "Installed launchd services:"
echo "  Backend: $BACKEND_LABEL"
echo "  GUI:     $GUI_LABEL"
echo ""
echo "Logs:"
echo "  tail -f $LOG_DIR/nutbits.launchd.out.log"
echo "  tail -f $LOG_DIR/nutbits-gui.launchd.out.log"
echo ""
echo "Status:"
echo "  launchctl print gui/$UID_VALUE/$BACKEND_LABEL"
echo "  launchctl print gui/$UID_VALUE/$GUI_LABEL"
echo ""
echo "Remove: npm run service:mac:remove"
