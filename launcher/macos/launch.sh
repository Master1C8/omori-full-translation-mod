#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
RESOURCE_DIR="${SCRIPT_DIR:h}/Resources"
SERVICE="$RESOURCE_DIR/workbench_service.py"
DATA_DIR="${VNREVIVAL_WORKBENCH_DATA_DIR:-$HOME/Library/Application Support/VN Revival/Localization Workbench}"

show_error() {
  VNREVIVAL_WORKBENCH_ERROR="$1" /usr/bin/osascript \
    -e 'display alert "VN Revival Localization Workbench" message (system attribute "VNREVIVAL_WORKBENCH_ERROR") as critical' \
    >/dev/null 2>&1 || true
}

if [[ ! -s "$SERVICE" || ! -d "$RESOURCE_DIR/workbench" || ! -d "$RESOURCE_DIR/workbench_ui" ]]; then
  show_error "The application resources are incomplete. Reinstall Localization Workbench."
  exit 1
fi

mkdir -p "$DATA_DIR" || {
  show_error "The application data directory could not be created."
  exit 1
}

exec /usr/bin/python3 "$SERVICE" --data-dir "$DATA_DIR"
