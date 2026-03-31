#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:---daemon}"

"$ROOT_DIR/scripts/nutbits-stop.sh"

exec "$ROOT_DIR/scripts/nutbits-start.sh" "$MODE"
