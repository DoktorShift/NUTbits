#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"
LOG_DIR="$ROOT_DIR/logs"
BACKEND_PID_FILE="$RUN_DIR/nutbits.pid"
GUI_PID_FILE="$RUN_DIR/gui.pid"
BACKEND_LOG="$LOG_DIR/nutbits.log"
GUI_LOG="$LOG_DIR/gui.log"

mkdir -p "$RUN_DIR" "$LOG_DIR"

cd "$ROOT_DIR"

set -a
if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  source ./.env
fi
set +a

export NUTBITS_API_ENABLED="${NUTBITS_API_ENABLED:-true}"
export NUTBITS_API_PORT="${NUTBITS_API_PORT:-3338}"
export NUTBITS_GUI_HOST="${NUTBITS_GUI_HOST:-127.0.0.1}"
export NUTBITS_GUI_PORT="${NUTBITS_GUI_PORT:-8080}"

MODE="daemon"
if [[ "${1:-}" == "--interactive" ]]; then
  MODE="interactive"
elif [[ "${1:-}" == "--daemon" || -z "${1:-}" ]]; then
  MODE="daemon"
else
  echo "Usage: $0 [--daemon|--interactive]" >&2
  exit 1
fi

is_running() {
  local pid_file="$1"
  [[ -f "$pid_file" ]] || return 1
  local pid
  pid="$(cat "$pid_file")"
  [[ -n "$pid" ]] || return 1
  kill -0 "$pid" 2>/dev/null
}

read_pid() {
  local pid_file="$1"
  [[ -f "$pid_file" ]] && cat "$pid_file"
}

ensure_dependencies() {
  if [[ ! -d "$ROOT_DIR/node_modules" ]]; then
    echo "Installing backend dependencies"
    npm install
  fi
}

ensure_gui_dependencies() {
  if [[ ! -f "$ROOT_DIR/gui/node_modules/vite/dist/node/cli.js" ]]; then
    echo "Installing GUI dependencies"
    npm --prefix gui install
  fi
}

build_gui() {
  ensure_dependencies
  ensure_gui_dependencies
  echo "Building GUI"
  npm run build:gui
}

start_backend_daemon() {
  if is_running "$BACKEND_PID_FILE"; then
    echo "NUTbits backend already running with PID $(read_pid "$BACKEND_PID_FILE")"
    return
  fi

  nohup npm start >>"$BACKEND_LOG" 2>&1 &
  echo $! > "$BACKEND_PID_FILE"
  echo "Started NUTbits backend with PID $(read_pid "$BACKEND_PID_FILE")"
}

wait_for_backend() {
  local attempts=30
  local url="http://127.0.0.1:${NUTBITS_API_PORT}/api/v1/bootstrap"

  for ((i=1; i<=attempts; i++)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  echo "Backend did not become ready on $url" >&2
  return 1
}

start_gui_daemon() {
  if is_running "$GUI_PID_FILE"; then
    echo "GUI server already running with PID $(read_pid "$GUI_PID_FILE")"
    return
  fi

  nohup npm run gui >>"$GUI_LOG" 2>&1 &
  echo $! > "$GUI_PID_FILE"
  echo "Started GUI server with PID $(read_pid "$GUI_PID_FILE")"
}

stop_nutbits() {
  "$ROOT_DIR/scripts/nutbits-stop.sh" >/dev/null
}

if [[ "$MODE" == "daemon" ]]; then
  start_backend_daemon
  wait_for_backend
  build_gui
  start_gui_daemon

  echo
  echo "NUTbits is up."
  echo "Backend: http://127.0.0.1:${NUTBITS_API_PORT}"
  echo "GUI:     http://${NUTBITS_GUI_HOST}:${NUTBITS_GUI_PORT}"
  echo "Logs:    $BACKEND_LOG and $GUI_LOG"
  exit 0
fi

if is_running "$BACKEND_PID_FILE"; then
  echo "Switching NUTbits backend from daemon to interactive mode"
  stop_nutbits
fi

build_gui
start_gui_daemon

echo
echo "GUI: http://${NUTBITS_GUI_HOST}:${NUTBITS_GUI_PORT}"
echo "GUI logs: $GUI_LOG"
echo "Starting NUTbits backend in interactive mode."
echo

exec npm start
