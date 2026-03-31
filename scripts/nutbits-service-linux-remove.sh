#!/usr/bin/env bash
set -euo pipefail

UNIT_PATH="$HOME/.config/systemd/user/nutbits.service"

systemctl --user disable --now nutbits.service >/dev/null 2>&1 || true
rm -f "$UNIT_PATH"
systemctl --user daemon-reload

echo "Removed systemd user service: nutbits.service"
