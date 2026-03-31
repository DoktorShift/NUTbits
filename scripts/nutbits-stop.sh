#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"
BACKEND_PID_FILE="$RUN_DIR/nutbits.pid"
GUI_PID_FILE="$RUN_DIR/gui.pid"

stop_pid() {
  local pid_file="$1"
  local label="$2"

  if [[ ! -f "$pid_file" ]]; then
    return
  fi

  local pid
  pid="$(cat "$pid_file")"

  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    echo "Stopping $label ($pid)"
    kill "$pid"
    for _ in {1..20}; do
      if ! kill -0 "$pid" 2>/dev/null; then
        break
      fi
      sleep 1
    done
    if kill -0 "$pid" 2>/dev/null; then
      echo "Force stopping $label ($pid)"
      kill -9 "$pid"
    fi
  fi

  rm -f "$pid_file"
}

stop_pid "$GUI_PID_FILE" "GUI server"
stop_pid "$BACKEND_PID_FILE" "NUTbits backend"

echo "NUTbits stopped."
