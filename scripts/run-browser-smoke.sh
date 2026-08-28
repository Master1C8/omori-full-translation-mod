#!/bin/zsh
set -euo pipefail

ROOT="${0:A:h:h}"
CHROME="${VNREVIVAL_CHROME:-}"
if [[ -z "$CHROME" ]]; then
  for CANDIDATE in \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/Applications/Chromium.app/Contents/MacOS/Chromium" \
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"; do
    if [[ -x "$CANDIDATE" ]]; then
      CHROME="$CANDIDATE"
      break
    fi
  done
fi

if [[ -z "$CHROME" || ! -x "$CHROME" ]]; then
  if [[ "${VNREVIVAL_REQUIRE_BROWSER_SMOKE:-0}" == "1" ]]; then
    echo "A Chromium browser is required for the release browser smoke test." >&2
    exit 1
  fi
  echo "Browser smoke skipped (no Chromium browser found)"
  exit 0
fi

SMOKE_DIR=$(/usr/bin/mktemp -d "${TMPDIR%/}/vnrevival-browser-smoke.XXXXXX")
ERRORS="$SMOKE_DIR/errors.log"
DEVTOOLS_PORT_FILE="$SMOKE_DIR/profile/DevToolsActivePort"
CHROME_PID=""
stop_chrome() {
  [[ -n "$CHROME_PID" ]] || return 0
  if /bin/kill -0 "$CHROME_PID" >/dev/null 2>&1; then
    /bin/kill "$CHROME_PID" >/dev/null 2>&1 || true
    for _ in {1..50}; do
      /bin/kill -0 "$CHROME_PID" >/dev/null 2>&1 || break
      sleep 0.1
    done
    if /bin/kill -0 "$CHROME_PID" >/dev/null 2>&1; then
      /bin/kill -9 "$CHROME_PID" >/dev/null 2>&1 || true
    fi
  fi
  wait "$CHROME_PID" >/dev/null 2>&1 || true
  CHROME_PID=""
}
cleanup() {
  stop_chrome
  if [[ -n "$SMOKE_DIR" && "$SMOKE_DIR" == "${TMPDIR%/}/vnrevival-browser-smoke."* ]]; then
    /bin/rm -rf -- "$SMOKE_DIR" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

SMOKE_URL="file://${ROOT// /%20}/tests/runtime-smoke.html"
"$CHROME" \
  --headless=new \
  --disable-background-networking \
  --disable-component-update \
  --disable-default-apps \
  --disable-gpu \
  --disable-sync \
  --no-first-run \
  --no-default-browser-check \
  --allow-file-access-from-files \
  --user-data-dir="$SMOKE_DIR/profile" \
  --remote-debugging-port=0 \
  --remote-allow-origins='*' \
  "$SMOKE_URL" >/dev/null 2>"$ERRORS" &
CHROME_PID=$!

for _ in {1..200}; do
  [[ -s "$DEVTOOLS_PORT_FILE" ]] && break
  if ! /bin/kill -0 "$CHROME_PID" >/dev/null 2>&1; then
    tail -n 20 "$ERRORS" >&2
    exit 1
  fi
  sleep 0.1
done
if [[ ! -s "$DEVTOOLS_PORT_FILE" ]]; then
  echo "Browser smoke DevTools port timed out." >&2
  exit 1
fi
DEVTOOLS_PORT=$(sed -n '1p' "$DEVTOOLS_PORT_FILE")
node "$ROOT/scripts/browser-smoke-cdp.js" "$DEVTOOLS_PORT"
stop_chrome
