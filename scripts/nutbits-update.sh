#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:---daemon}"

cd "$ROOT_DIR"

echo "Updating repository"
git pull --ff-only

echo "Installing backend dependencies"
npm install

echo "Installing GUI dependencies"
npm --prefix gui install

echo "Rebuilding GUI"
npm run build:gui

echo "Restarting NUTbits"
exec "$ROOT_DIR/scripts/nutbits-restart.sh" "$MODE"
