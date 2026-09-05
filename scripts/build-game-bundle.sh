#!/bin/zsh
set -euo pipefail

ROOT="${0:A:h:h}"
: "${VNREVIVAL_GAME:?Set VNREVIVAL_GAME to the game adapter id}"
GAME_ID="$VNREVIVAL_GAME"
GAME_DIR="$ROOT/src/games/$GAME_ID"
GAME_MANIFEST="$GAME_DIR/game.json"
OUTPUT="${1:-$ROOT/.build/$GAME_ID/translator.bundle.js}"
OUTPUT_DIR="${OUTPUT:h}"

python3 "$ROOT/scripts/game-manifest.py" "$GAME_MANIFEST" >/dev/null
[[ "$(python3 "$ROOT/scripts/game-manifest.py" "$GAME_MANIFEST" id)" == "$GAME_ID" ]]
[[ -s "$GAME_DIR/adapter.js" ]]

VERSION=$(tr -d '[:space:]' < "$ROOT/VERSION")
mkdir -p "$OUTPUT_DIR"
sed "s/__VERSION__/$VERSION/g" "$ROOT/src/translator-runtime.js" > "$OUTPUT_DIR/translator-runtime.js"
python3 "$ROOT/scripts/generate-game-config.py" "$GAME_MANIFEST" "$OUTPUT_DIR/game-config.js"
{
  printf '%s\n' "/* $(python3 "$ROOT/scripts/game-manifest.py" "$GAME_MANIFEST" translatorName) — generated VN Revival bundle */"
  cat "$ROOT/src/translation-core.js"
  cat "$ROOT/src/languages.js"
  cat "$ROOT/src/providers.js"
  cat "$ROOT/src/runtime-ui.js"
  cat "$ROOT/src/runtime-progress.js"
  cat "$ROOT/src/runtime-panel.js"
  cat "$OUTPUT_DIR/game-config.js"
  cat "$GAME_DIR/adapter.js"
  cat "$OUTPUT_DIR/translator-runtime.js"
} > "$OUTPUT"
node --check "$OUTPUT"
print -r -- "$OUTPUT"
