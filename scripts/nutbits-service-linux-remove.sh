#!/usr/bin/env bash
set -euo pipefail

BACKEND_UNIT_PATH="$HOME/.config/systemd/user/nutbits-backend.service"
GUI_UNIT_PATH="$HOME/.config/systemd/user/nutbits-gui.service"
LEGACY_UNIT_PATH="$HOME/.config/systemd/user/nutbits.service"

systemctl --user disable --now nutbits-gui.service >/dev/null 2>&1 || true
systemctl --user disable --now nutbits-backend.service >/dev/null 2>&1 || true
systemctl --user disable --now nutbits.service >/dev/null 2>&1 || true
rm -f "$BACKEND_UNIT_PATH" "$GUI_UNIT_PATH" "$LEGACY_UNIT_PATH"
systemctl --user daemon-reload

echo "Removed systemd user services: nutbits-backend.service, nutbits-gui.service"
