#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SYSTEMD_USER_DIR="$HOME/.config/systemd/user"
UNIT_PATH="$SYSTEMD_USER_DIR/nutbits.service"
NODE_PATH="$(command -v node)"

mkdir -p "$SYSTEMD_USER_DIR"

cat >"$UNIT_PATH" <<EOF
[Unit]
Description=NUTbits backend service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$ROOT_DIR
ExecStart=$NODE_PATH $ROOT_DIR/nutbits.js
Restart=on-failure
RestartSec=5
Environment=HOME=$HOME

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now nutbits.service

echo "Installed systemd user service: nutbits.service"
echo "Service file: $UNIT_PATH"
echo "Status: systemctl --user status nutbits"
echo "Logs: journalctl --user -u nutbits -f"
echo "Remove: npm run service:linux:remove"
