#!/bin/zsh
set -u

SCRIPT_DIR="${0:A:h}"
RESOURCE_DIR="${SCRIPT_DIR:h}/Resources"
INFO_PLIST="${SCRIPT_DIR:h}/Info.plist"
plist_value() { /usr/libexec/PlistBuddy -c "Print :$1" "$INFO_PLIST"; }

PRODUCT_NAME=$(plist_value CFBundleDisplayName)
GAME_ID=$(plist_value VNRevivalGameID)
GAME_TITLE=$(plist_value VNRevivalGameTitle)
GAME_SHORT_TITLE=$(plist_value VNRevivalShortTitle)
STEAM_APP_ID=$(plist_value VNRevivalSteamAppID)
WINDOWS_EXECUTABLE=$(plist_value VNRevivalWindowsExecutable)
DEFAULT_BOTTLE=$(plist_value VNRevivalCrossOverBottle)
CROSSOVER_GAME_PATH=$(plist_value VNRevivalCrossOverGamePath)
DATA_DIRECTORY=$(plist_value VNRevivalDataDirectory)
LAUNCH_STRATEGY=$(plist_value VNRevivalLaunchStrategy)
DEBUG_TARGET_TITLE=$(plist_value VNRevivalDebugTargetTitle)
DEBUG_TARGET_URL=$(plist_value VNRevivalDebugTargetURL)

CONTROLLER="$RESOURCE_DIR/VNRevivalTranslatorController"
TRANSLATOR="$RESOURCE_DIR/translator.bundle.js"
ARGOS_SERVICE="$RESOURCE_DIR/argos_service.py"
CROSSOVER_APP="${VNREVIVAL_CROSSOVER_APP:-/Applications/CrossOver.app}"
BOTTLE="${VNREVIVAL_CROSSOVER_BOTTLE:-$DEFAULT_BOTTLE}"
WINE="$CROSSOVER_APP/Contents/SharedSupport/CrossOver/bin/wine"
BOTTLE_DIR="$HOME/Library/Application Support/CrossOver/Bottles/$BOTTLE"
STEAM_EXE="$BOTTLE_DIR/drive_c/Program Files (x86)/Steam/steam.exe"
CROSSOVER_GAME_EXE="$BOTTLE_DIR/$CROSSOVER_GAME_PATH"
GAME_PATH_DIR="$HOME/Library/Application Support/VN Revival/Translator Paths"
GAME_PATH_FILE="$GAME_PATH_DIR/$GAME_ID.txt"
ARGOS_DATA_DIR="${VNREVIVAL_ARGOS_DATA_DIR:-$HOME/Library/Application Support/$DATA_DIRECTORY}"
ARGOS_LOG="$ARGOS_DATA_DIR/argos-service.log"
RESELECT_MARKER="$ARGOS_DATA_DIR/.reselect-game-executable"
ARGOS_PID=""
GAME_PID=""
RUNTIME_SESSION_DIR=""

cleanup() {
  if [[ -n "$ARGOS_PID" ]] && kill -0 "$ARGOS_PID" >/dev/null 2>&1; then
    kill "$ARGOS_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "$GAME_PID" ]] && kill -0 "$GAME_PID" >/dev/null 2>&1; then
    kill "$GAME_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "$RUNTIME_SESSION_DIR" && "$RUNTIME_SESSION_DIR" == "${TMPDIR%/}/vnrevival-omori-runtime."* ]]; then
    /bin/rm -rf -- "$RUNTIME_SESSION_DIR"
  fi
}
trap cleanup EXIT INT TERM

show_error() {
  VNREVIVAL_TRANSLATOR_TITLE="$PRODUCT_NAME" VNREVIVAL_TRANSLATOR_ERROR="$1" /usr/bin/osascript \
    -e 'display alert (system attribute "VNREVIVAL_TRANSLATOR_TITLE") message (system attribute "VNREVIVAL_TRANSLATOR_ERROR") as critical' \
    >/dev/null 2>&1 || true
}

choose_game_executable() {
  VNREVIVAL_GAME_TITLE="$GAME_TITLE" /usr/bin/osascript \
    -e 'POSIX path of (choose file with prompt ("Locate the game executable or application for " & (system attribute "VNREVIVAL_GAME_TITLE")))' \
    2>/dev/null
}

normalize_game_target() {
  local VALUE="$1"
  while [[ "$VALUE" != "/" && "$VALUE" == */ ]]; do
    VALUE="${VALUE%/}"
  done
  print -r -- "$VALUE"
}

valid_game_target() {
  local TARGET=$(normalize_game_target "$1")
  if [[ -d "$TARGET" && "$TARGET" == *.app ]]; then
    [[ -d "$TARGET/Contents/Resources/app.nw" && -d "$TARGET/Contents/MacOS" ]] || return 1
    local BIN_CANDIDATE
    for BIN_CANDIDATE in "$TARGET/Contents/MacOS"/*; do
      [[ -f "$BIN_CANDIDATE" && -x "$BIN_CANDIDATE" ]] && return 0
    done
    return 1
  fi
  if [[ "${TARGET:l}" == *.exe ]]; then
    [[ -f "$TARGET" ]]
    return
  fi
  [[ -f "$TARGET" && -x "$TARGET" ]]
}

if [[ "$LAUNCH_STRATEGY" != "electron-cdp" ]]; then
  show_error "This build uses an unsupported game launch strategy."
  exit 1
fi

FORCE_RESELECT=0
if [[ -f "$RESELECT_MARKER" ]]; then
  rm -f "$RESELECT_MARKER"
  FORCE_RESELECT=1
fi

GAME_TARGET=""
GAME_KIND=""
GAME_PROCESS_NAME=""

# 1. Check saved path if valid
if (( ! FORCE_RESELECT )) && [[ -s "$GAME_PATH_FILE" ]]; then
  SAVED_PATH=$(normalize_game_target "$(head -n 1 "$GAME_PATH_FILE")")
  if valid_game_target "$SAVED_PATH"; then
    GAME_TARGET="$SAVED_PATH"
  fi
fi

# 2. Check native macOS Steam locations
if [[ -z "$GAME_TARGET" ]]; then
  for NATIVE_CANDIDATE in \
    "$HOME/Library/Application Support/Steam/steamapps/common/$GAME_TITLE/$GAME_TITLE.app" \
    "$HOME/Library/Application Support/Steam/steamapps/common/$GAME_SHORT_TITLE/$GAME_SHORT_TITLE.app" \
    "$HOME/Library/Application Support/Steam/steamapps/common/$GAME_TITLE" \
    "/Applications/$GAME_TITLE.app"; do
    NORMALIZED_CANDIDATE=$(normalize_game_target "$NATIVE_CANDIDATE")
    if valid_game_target "$NORMALIZED_CANDIDATE"; then
      GAME_TARGET="$NORMALIZED_CANDIDATE"
      break
    fi
  done
fi

# 3. Check CrossOver if available
if [[ -z "$GAME_TARGET" && -x "$WINE" && -f "$CROSSOVER_GAME_EXE" ]]; then
  GAME_TARGET="$CROSSOVER_GAME_EXE"
fi

# 4. Prompt user if still not found
if (( FORCE_RESELECT )) || [[ -z "$GAME_TARGET" ]]; then
  GAME_TARGET=$(choose_game_executable || true)
  GAME_TARGET=$(normalize_game_target "$GAME_TARGET")
  if [[ -z "$GAME_TARGET" ]] || ! valid_game_target "$GAME_TARGET"; then
    show_error "The selected file is not the real $GAME_TITLE application. Select the game app containing Contents/Resources/app.nw, not a Steam desktop shortcut."
    exit 1
  fi
fi

# Persist the validated canonical target, including an automatically recovered Steam path.
mkdir -p "$GAME_PATH_DIR"
print -r -- "$GAME_TARGET" > "$GAME_PATH_FILE"

# Determine launch mode and executable
NATIVE_BINARY=""
NATIVE_APP_ARGUMENT=""
NATIVE_USER_DATA_DIR=""
if [[ -d "$GAME_TARGET" && "$GAME_TARGET" == *.app ]]; then
  if [[ ! -d "$GAME_TARGET/Contents/Resources/app.nw" ]]; then
    show_error "The selected application is a shortcut, not the real $GAME_TITLE game."
    exit 1
  fi
  for BIN_CANDIDATE in "$GAME_TARGET/Contents/MacOS"/*; do
    if [[ -f "$BIN_CANDIDATE" && -x "$BIN_CANDIDATE" ]]; then
      NATIVE_BINARY="$BIN_CANDIDATE"
      GAME_PROCESS_NAME="${BIN_CANDIDATE:t}"
      break
    fi
  done
  if [[ -z "$NATIVE_BINARY" ]]; then
    show_error "The selected application has no executable for $GAME_TITLE."
    exit 1
  fi
  GAME_KIND="native_app"

  # OMORI ships an Intel-only NW.js/Chromium 65 runtime. Its stack sampler
  # crashes under Rosetta on current Apple Silicon macOS releases. Run the
  # untouched game package through the bundled native ARM64 NW.js instead.
  BUNDLED_NWJS_APP="$RESOURCE_DIR/NWJS Runtime.app"
  APPLE_SILICON_AVAILABLE=$(/usr/sbin/sysctl -in hw.optional.arm64 2>/dev/null || print 0)
  if [[ "$APPLE_SILICON_AVAILABLE" == "1" && -x "$BUNDLED_NWJS_APP/Contents/MacOS/nwjs" ]]; then
    RUNTIME_SESSION_DIR=$(/usr/bin/mktemp -d "${TMPDIR%/}/vnrevival-omori-runtime.XXXXXX") || {
      show_error "Could not prepare the compatible Apple Silicon game runtime."
      exit 1
    }
    RUNTIME_APP="$RUNTIME_SESSION_DIR/NWJS Runtime.app"
    /bin/cp -cR "$BUNDLED_NWJS_APP" "$RUNTIME_APP" || {
      show_error "Could not copy the compatible Apple Silicon game runtime."
      exit 1
    }
    /bin/ln -s "$GAME_TARGET/Contents/Resources/app.nw" "$RUNTIME_APP/Contents/Resources/app.nw" || {
      show_error "Could not connect the compatible runtime to the OMORI game files."
      exit 1
    }
    /usr/bin/codesign --force --deep --sign - "$RUNTIME_APP" >/dev/null 2>&1 || {
      show_error "Could not authorize the compatible Apple Silicon game runtime."
      exit 1
    }
    NATIVE_BINARY="$RUNTIME_APP/Contents/MacOS/nwjs"
    NATIVE_APP_ARGUMENT=""
    NATIVE_USER_DATA_DIR="$HOME/Library/Application Support/$GAME_SHORT_TITLE"
    GAME_PROCESS_NAME="nwjs"
  else
    NATIVE_APP_ARGUMENT="$GAME_TARGET/Contents/Resources/app.nw"
  fi
elif [[ "${GAME_TARGET:l}" == *.exe ]]; then
  GAME_KIND="crossover"
  GAME_PROCESS_NAME="${GAME_TARGET:t}"
  if [[ ! -x "$WINE" ]]; then
    show_error "CrossOver was not found in /Applications to run Windows executable."
    exit 1
  fi
elif [[ -x "$GAME_TARGET" ]]; then
  GAME_KIND="native_bin"
  NATIVE_BINARY="$GAME_TARGET"
  GAME_PROCESS_NAME="${GAME_TARGET:t}"
else
  show_error "Unsupported executable format for $GAME_TITLE."
  exit 1
fi

game_main_running() {
  /usr/bin/pgrep -x "$GAME_PROCESS_NAME" >/dev/null 2>&1
}

if [[ ! -x "$CONTROLLER" || ! -f "$TRANSLATOR" || ! -f "$ARGOS_SERVICE" ]]; then
  show_error "The translator files are incomplete. Reinstall the application."
  exit 1
fi

if game_main_running; then
  show_error "$GAME_TITLE is already running. Close the game and open $PRODUCT_NAME again."
  exit 1
fi

PORT=9317
while /usr/bin/nc -z 127.0.0.1 "$PORT" >/dev/null 2>&1; do
  PORT=$((PORT + 1))
  if (( PORT > 9399 )); then
    show_error "Could not find a free local port."
    exit 1
  fi
done

ARGOS_PORT=$((PORT + 1))
while /usr/bin/nc -z 127.0.0.1 "$ARGOS_PORT" >/dev/null 2>&1; do
  ARGOS_PORT=$((ARGOS_PORT + 1))
  if (( ARGOS_PORT > 9499 )); then
    ARGOS_PORT=""
    break
  fi
done

PYTHON="${VNREVIVAL_ARGOS_PYTHON:-}"
if [[ -z "$PYTHON" ]]; then
  for CANDIDATE in /usr/bin/python3 /opt/homebrew/bin/python3 /usr/local/bin/python3; do
    if [[ -x "$CANDIDATE" ]]; then
      PYTHON="$CANDIDATE"
      break
    fi
  done
fi

ARGOS_URL=""
ARGOS_TOKEN=""
if [[ -n "$ARGOS_PORT" && -x "$PYTHON" ]]; then
  mkdir -p "$ARGOS_DATA_DIR"
  ARGOS_TOKEN=$(/usr/bin/uuidgen | tr -d '-')
  "$PYTHON" -s "$ARGOS_SERVICE" --port "$ARGOS_PORT" --token "$ARGOS_TOKEN" \
    --data-dir "$ARGOS_DATA_DIR" --credential-id "$GAME_ID" --game-path "$GAME_TARGET" \
    >>"$ARGOS_LOG" 2>&1 &
  ARGOS_PID=$!
  for _ in {1..40}; do
    /usr/bin/nc -z 127.0.0.1 "$ARGOS_PORT" >/dev/null 2>&1 && break
    kill -0 "$ARGOS_PID" >/dev/null 2>&1 || break
    sleep 0.1
  done
  if /usr/bin/nc -z 127.0.0.1 "$ARGOS_PORT" >/dev/null 2>&1; then
    ARGOS_URL="http://127.0.0.1:$ARGOS_PORT"
  else
    if [[ -n "$ARGOS_PID" ]] && kill -0 "$ARGOS_PID" >/dev/null 2>&1; then
      kill "$ARGOS_PID" >/dev/null 2>&1 || true
    fi
    ARGOS_PID=""
    ARGOS_TOKEN=""
  fi
fi

if [[ "$GAME_KIND" == "native_app" ]]; then
  NATIVE_LAUNCH_ARGS=("--remote-debugging-address=127.0.0.1" "--remote-debugging-port=$PORT")
  [[ -n "$NATIVE_APP_ARGUMENT" ]] && NATIVE_LAUNCH_ARGS=("$NATIVE_APP_ARGUMENT" "${NATIVE_LAUNCH_ARGS[@]}")
  [[ -n "$NATIVE_USER_DATA_DIR" ]] && NATIVE_LAUNCH_ARGS=("--user-data-dir=$NATIVE_USER_DATA_DIR" "${NATIVE_LAUNCH_ARGS[@]}")
  "$NATIVE_BINARY" "${NATIVE_LAUNCH_ARGS[@]}" >/dev/null 2>&1 &
  GAME_PID=$!
elif [[ "$GAME_KIND" == "native_bin" ]]; then
  "$NATIVE_BINARY" "--remote-debugging-address=127.0.0.1" "--remote-debugging-port=$PORT" >/dev/null 2>&1 &
  GAME_PID=$!
else
  STEAM_STATUS=1
  if [[ -f "$STEAM_EXE" ]]; then
    "$WINE" --bottle "$BOTTLE" --no-wait "$STEAM_EXE" -applaunch "$STEAM_APP_ID" \
      "--remote-debugging-address=127.0.0.1" "--remote-debugging-port=$PORT" >/dev/null 2>&1
    STEAM_STATUS=$?
  fi
  for _ in {1..60}; do
    game_main_running && break
    sleep 0.5
  done
  if (( STEAM_STATUS != 0 )) || ! game_main_running; then
    "$WINE" --bottle "$BOTTLE" --no-wait "$GAME_TARGET" \
      "--remote-debugging-address=127.0.0.1" "--remote-debugging-port=$PORT" >/dev/null 2>&1
  fi
fi

for _ in {1..20}; do
  game_main_running && break
  sleep 0.5
done
if ! game_main_running; then
  show_error "The selected executable did not start the expected game process. Choose the game's main EXE or application and try again."
  exit 1
fi

if [[ -n "$ARGOS_URL" ]]; then
  CONTROLLER_OUTPUT=$(VNREVIVAL_PRODUCT_NAME="$PRODUCT_NAME" VNREVIVAL_TARGET_TITLE_HINT="$DEBUG_TARGET_TITLE" VNREVIVAL_TARGET_URL_HINT="$DEBUG_TARGET_URL" VNREVIVAL_SOURCE_LABEL="$GAME_ID-translator.bundle.js" "$CONTROLLER" "$PORT" "$TRANSLATOR" "$ARGOS_URL" "$ARGOS_TOKEN" 2>&1)
else
  CONTROLLER_OUTPUT=$(VNREVIVAL_PRODUCT_NAME="$PRODUCT_NAME" VNREVIVAL_TARGET_TITLE_HINT="$DEBUG_TARGET_TITLE" VNREVIVAL_TARGET_URL_HINT="$DEBUG_TARGET_URL" VNREVIVAL_SOURCE_LABEL="$GAME_ID-translator.bundle.js" "$CONTROLLER" "$PORT" "$TRANSLATOR" 2>&1)
fi
CONTROLLER_STATUS=$?
if (( CONTROLLER_STATUS != 0 )); then
  show_error "The game started, but the translator could not connect. Close $GAME_SHORT_TITLE and launch it again through $PRODUCT_NAME.\n\n$CONTROLLER_OUTPUT"
  exit 1
fi

# Injection succeeded, so cleanup must leave the user-owned game process alive.
GAME_PID=""

# Keep the local Argos bridge alive for as long as the game is running.
while game_main_running; do
  sleep 2
done
