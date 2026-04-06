#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SYSTEMD_USER_DIR="$HOME/.config/systemd/user"
BACKEND_UNIT_PATH="$SYSTEMD_USER_DIR/nutbits-backend.service"
GUI_UNIT_PATH="$SYSTEMD_USER_DIR/nutbits-gui.service"
LEGACY_UNIT_PATH="$SYSTEMD_USER_DIR/nutbits.service"

mkdir -p "$SYSTEMD_USER_DIR"
cd "$ROOT_DIR"

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

cat >"$BACKEND_UNIT_PATH" <<EOF
[Unit]
Description=NUTbits backend
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$ROOT_DIR
ExecStart=/usr/bin/env npm start
Restart=on-failure
RestartSec=5
Environment=HOME=$HOME

[Install]
WantedBy=default.target
EOF

cat >"$GUI_UNIT_PATH" <<EOF
[Unit]
Description=NUTbits GUI
After=network-online.target nutbits-backend.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$ROOT_DIR
ExecStart=/usr/bin/env npm run gui
Restart=on-failure
RestartSec=5
Environment=HOME=$HOME

[Install]
WantedBy=default.target
EOF

# Clean up the old single-service unit if it exists.
systemctl --user disable --now nutbits.service >/dev/null 2>&1 || true
rm -f "$LEGACY_UNIT_PATH"

systemctl --user daemon-reload
systemctl --user enable --now nutbits-backend.service
systemctl --user enable --now nutbits-gui.service

echo "Installed systemd user services:"
echo "  - nutbits-backend.service"
echo "  - nutbits-gui.service"
echo "Service files:"
echo "  - $BACKEND_UNIT_PATH"
echo "  - $GUI_UNIT_PATH"
echo "Status:"
echo "  - systemctl --user status nutbits-backend"
echo "  - systemctl --user status nutbits-gui"
echo "Logs:"
echo "  - journalctl --user -u nutbits-backend -f"
echo "  - journalctl --user -u nutbits-gui -f"
echo "Remove: npm run service:linux:remove"
