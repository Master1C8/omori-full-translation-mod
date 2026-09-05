#!/bin/zsh
set -euo pipefail

ROOT="${0:A:h:h}"
OUTPUT="${1:-$ROOT/.build/game-resources}"
CATALOG="$ROOT/src/games/catalog.json"
[[ "$OUTPUT" == "$ROOT/.build/"* && "$OUTPUT" != "$ROOT/.build/" ]] || {
  print -u2 -r -- "Game resources must be staged inside $ROOT/.build"
  exit 1
}
BUNDLE_BUILD="${OUTPUT:h}/${OUTPUT:t}-bundles"

python3 "$ROOT/scripts/game-catalog.py" "$CATALOG" >/dev/null
rm -rf "$BUNDLE_BUILD" "$OUTPUT"
mkdir -p "$OUTPUT"
cp "$CATALOG" "$OUTPUT/catalog.json"
python3 "$ROOT/scripts/game-catalog.py" "$CATALOG" list > "$OUTPUT/catalog.txt"
for GAME_ID in ${(f)"$(python3 "$ROOT/scripts/game-catalog.py" "$CATALOG" list)"}; do
  GAME_DIR="$ROOT/src/games/$GAME_ID"
  GAME_OUTPUT="$OUTPUT/$GAME_ID"
  mkdir -p "$GAME_OUTPUT"
  VNREVIVAL_GAME="$GAME_ID" "$ROOT/scripts/build-game-bundle.sh" \
    "$BUNDLE_BUILD/$GAME_ID/translator.bundle.js" >/dev/null
  cp "$BUNDLE_BUILD/$GAME_ID/translator.bundle.js" "$GAME_OUTPUT/translator.bundle.js"
  cp "$GAME_DIR/game.json" "$GAME_OUTPUT/game.json"
done

print -r -- "$OUTPUT"
