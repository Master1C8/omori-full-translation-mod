#!/bin/zsh
set -euo pipefail

ROOT="${0:A:h:h}"
: "${VNREVIVAL_GAME:?Set VNREVIVAL_GAME or invoke this script through a game-specific build script}"
GAME_ID="$VNREVIVAL_GAME"
GAME_MANIFEST="$ROOT/src/games/$GAME_ID/game.json"
manifest_value() { python3 "$ROOT/scripts/game-manifest.py" "$GAME_MANIFEST" "$1"; }
python3 "$ROOT/scripts/game-manifest.py" "$GAME_MANIFEST" >/dev/null
VERSION=$(tr -d '[:space:]' < "$ROOT/VERSION")
PRODUCT_NAME=$(manifest_value translatorName)
GAME_TITLE=$(manifest_value title)
STEAM_APP_ID=$(manifest_value steamAppId)
WINDOWS_EXECUTABLE=$(manifest_value windowsExecutable)
DATA_DIRECTORY=$(manifest_value dataDirectory)
ICON_PNG=$(manifest_value iconPng)
DATA_DIRECTORY_WINDOWS=$(python3 -c 'import sys; print(sys.argv[1].replace("/", "\\"))' "$DATA_DIRECTORY")
ARCHIVE_PREFIX=$(manifest_value archivePrefix)
LAUNCH_STRATEGY=$(manifest_value launchStrategy)
DEBUG_TARGET_TITLE=$(manifest_value debugTargetTitleContains)
DEBUG_TARGET_URL=$(manifest_value debugTargetUrlContains)
[[ "$LAUNCH_STRATEGY" == "electron-cdp" ]] || { echo "Unsupported launch strategy: $LAUNCH_STRATEGY" >&2; exit 1; }
PYTHON_VERSION="3.11.9"
PYTHON_ABI="311"
BUILD_ROOT="$ROOT/.build/windows"
DIST_NAME=$(manifest_value windowsDistributionName)
DIST_DIR="$BUILD_ROOT/$DIST_NAME"
RESOURCE_DIR="$DIST_DIR/resources"
PYTHON_DIR="$RESOURCE_DIR/python"
SITE_PACKAGES="$PYTHON_DIR/Lib/site-packages"
READY_DIR="$ROOT/launcher/READY_TO_SHARE"
ZIP_PATH="$READY_DIR/$ARCHIVE_PREFIX-Windows-$VERSION.zip"
CHECKSUM_PATH="$ROOT/.build/checksums/${ZIP_PATH:t}.sha256"
PYTHON_ZIP="$ROOT/.build/cache/python-$PYTHON_VERSION-embed-amd64.zip"
PYTHON_URL="https://www.python.org/ftp/python/$PYTHON_VERSION/python-$PYTHON_VERSION-embed-amd64.zip"
PYTHON_ZIP_SHA256="009d6bf7e3b2ddca3d784fa09f90fe54336d5b60f0e0f305c37f400bf83cfd3b"
WINDOWS_REQUIREMENTS="$ROOT/scripts/requirements-windows.txt"
CC="${VNREVIVAL_WINDOWS_CC:-$(command -v x86_64-w64-mingw32-gcc)}"
WINDRES="${VNREVIVAL_WINDOWS_WINDRES:-$(command -v x86_64-w64-mingw32-windres)}"
PROJECT_PYTHON="$ROOT/.venv/bin/python"
HOST_PYTHON="${VNREVIVAL_HOST_PYTHON:-$PROJECT_PYTHON}"
ICON_PYTHON="${VNREVIVAL_ICON_PYTHON:-$HOST_PYTHON}"
BUNDLE="${1:-$ROOT/.build/translator.bundle.js}"
WINDOWS_SIGN_CERT="${VNREVIVAL_WINDOWS_SIGN_CERT:-}"
WINDOWS_SIGN_PASSWORD="${VNREVIVAL_WINDOWS_SIGN_PASSWORD:-}"
WINDOWS_SIGN_TIMESTAMP="${VNREVIVAL_WINDOWS_SIGN_TIMESTAMP:-http://timestamp.digicert.com}"
WINDOWS_SIGN_TOOL="${VNREVIVAL_WINDOWS_SIGN_TOOL:-$(command -v osslsigncode || true)}"

if [[ ! -x "$HOST_PYTHON" || ! -x "$ICON_PYTHON" ]]; then
  echo "Python build environment is missing. Run 'uv sync' in $ROOT or set VNREVIVAL_HOST_PYTHON and VNREVIVAL_ICON_PYTHON." >&2
  exit 1
fi
[[ -x "$CC" && -x "$WINDRES" && -s "$BUNDLE" && -s "$ROOT/$ICON_PNG" && -s "$WINDOWS_REQUIREMENTS" ]]
mkdir -p "$ROOT/.build/cache" "$ROOT/.build/checksums" "$READY_DIR"
verify_sha256() {
  local expected="$1"
  local artifact="$2"
  local actual
  actual=$(shasum -a 256 "$artifact") || { echo "Could not hash $artifact" >&2; exit 1; }
  actual=${actual%% *}
  [[ "$actual" == "$expected" ]] || { echo "SHA-256 mismatch for $artifact" >&2; exit 1; }
}
if [[ -e "$PYTHON_ZIP" ]]; then
  [[ -f "$PYTHON_ZIP" && -s "$PYTHON_ZIP" ]] || { echo "Invalid cached Python runtime: $PYTHON_ZIP" >&2; exit 1; }
  verify_sha256 "$PYTHON_ZIP_SHA256" "$PYTHON_ZIP"
else
  PYTHON_ZIP_DOWNLOAD="$PYTHON_ZIP.download.$$"
  trap 'rm -f "$PYTHON_ZIP_DOWNLOAD"' EXIT
  curl -fL --retry 3 --output "$PYTHON_ZIP_DOWNLOAD" "$PYTHON_URL"
  verify_sha256 "$PYTHON_ZIP_SHA256" "$PYTHON_ZIP_DOWNLOAD"
  mv "$PYTHON_ZIP_DOWNLOAD" "$PYTHON_ZIP"
  trap - EXIT
fi

rm -rf "$BUILD_ROOT"
mkdir -p "$SITE_PACKAGES"
unzip -q "$PYTHON_ZIP" -d "$PYTHON_DIR"

PTH_FILE=$(find "$PYTHON_DIR" -maxdepth 1 -name 'python*._pth' -print -quit)
[[ -n "$PTH_FILE" ]]
sed -e 's/\r$//' -e '/^#import site$/i\
Lib/site-packages' -e 's/^#import site$/import site/' "$PTH_FILE" > "$PTH_FILE.tmp"
mv "$PTH_FILE.tmp" "$PTH_FILE"

PIP_TARGET=(
  --disable-pip-version-check
  --upgrade
  --ignore-installed
  --only-binary=:all:
  --platform win_amd64
  --python-version 3.11
  --implementation cp
  --abi cp311
  --target "$SITE_PACKAGES"
)
"$HOST_PYTHON" -m pip install "${PIP_TARGET[@]}" \
  --require-hashes --no-deps --requirement "$WINDOWS_REQUIREMENTS"
rm -rf "$SITE_PACKAGES/bin" "$SITE_PACKAGES/tests"
find "$SITE_PACKAGES" -type d -name '__pycache__' -prune -exec rm -rf {} +
RUNTIME_BYTES=$(find "$SITE_PACKAGES" -type f -exec stat -f '%z' {} + | awk '{ total += $1 } END { print total + 0 }')
print -r -- "$RUNTIME_BYTES" > "$SITE_PACKAGES/.vnrevival-runtime-bytes"

cp "$BUNDLE" "$RESOURCE_DIR/translator.bundle.js"
cp "$ROOT/src/argos_service.py" "$RESOURCE_DIR/argos_service.py"
cp "$ROOT/src/requirements-runtime-macos.txt" "$RESOURCE_DIR/requirements-runtime-macos.txt"
cp -R "$ROOT/src/bergamot-web" "$RESOURCE_DIR/bergamot-web"
cp "$GAME_MANIFEST" "$RESOURCE_DIR/game.json"
python3 "$ROOT/scripts/render-template.py" "$ROOT/launcher/windows/README-Windows.txt" "$DIST_DIR/README.txt" \
  PRODUCT_NAME "$PRODUCT_NAME" GAME_TITLE "$GAME_TITLE" DATA_DIRECTORY_WINDOWS "$DATA_DIRECTORY_WINDOWS"
python3 "$ROOT/scripts/render-template.py" "$ROOT/launcher/windows/THIRD_PARTY_NOTICES.txt" "$DIST_DIR/THIRD_PARTY_NOTICES.txt" \
  PRODUCT_NAME "$PRODUCT_NAME"
cp "$ROOT/LICENSE" "$DIST_DIR/LICENSE"

"$ICON_PYTHON" -c 'from PIL import Image; import sys; image=Image.open(sys.argv[1]).convert("RGBA"); image.save(sys.argv[2], format="ICO", sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])' \
  "$ROOT/$ICON_PNG" "$BUILD_ROOT/AppIcon.ico"

VERSION_COMMAS=${VERSION//./,}
python3 "$ROOT/scripts/render-template.py" "$ROOT/launcher/windows/launcher.c" "$BUILD_ROOT/launcher.c" \
  VERSION "$VERSION" PRODUCT_NAME "$PRODUCT_NAME" GAME_TITLE "$GAME_TITLE" \
  WINDOWS_EXECUTABLE "$WINDOWS_EXECUTABLE" DATA_DIRECTORY_WINDOWS "$DATA_DIRECTORY_WINDOWS" \
  GAME_ID "$GAME_ID" STEAM_APP_ID "$STEAM_APP_ID" DEBUG_TARGET_TITLE "$DEBUG_TARGET_TITLE" DEBUG_TARGET_URL "$DEBUG_TARGET_URL"
python3 "$ROOT/scripts/render-template.py" "$ROOT/launcher/windows/app.manifest" "$BUILD_ROOT/app.manifest" \
  GAME_ID "$GAME_ID" PRODUCT_NAME "$PRODUCT_NAME"
python3 "$ROOT/scripts/render-template.py" "$ROOT/launcher/windows/app.rc.in" "$BUILD_ROOT/app.rc" \
  ICON_PATH "$BUILD_ROOT/AppIcon.ico" MANIFEST_PATH "$BUILD_ROOT/app.manifest" \
  VERSION_COMMAS "$VERSION_COMMAS" VERSION "$VERSION" PRODUCT_NAME "$PRODUCT_NAME"

"$WINDRES" "$BUILD_ROOT/app.rc" -O coff -o "$BUILD_ROOT/app-res.o"
"$CC" -std=c11 -O2 -s -Wall -Wextra -Werror -municode -mwindows \
  "$BUILD_ROOT/launcher.c" "$BUILD_ROOT/app-res.o" \
  -o "$DIST_DIR/$PRODUCT_NAME.exe" \
  -Wl,--major-subsystem-version,6,--minor-subsystem-version,2 \
  -lwinhttp -lws2_32 -lshell32 -lole32 -ladvapi32 -lcomdlg32

if [[ -n "$WINDOWS_SIGN_CERT" ]]; then
  [[ -x "$WINDOWS_SIGN_TOOL" && -s "$WINDOWS_SIGN_CERT" ]]
  SIGNED_EXE="$BUILD_ROOT/$PRODUCT_NAME-signed.exe"
  "$WINDOWS_SIGN_TOOL" sign \
    -pkcs12 "$WINDOWS_SIGN_CERT" \
    -pass "$WINDOWS_SIGN_PASSWORD" \
    -n "$PRODUCT_NAME by VN Revival" \
    -i "https://vnrevival.fun/" \
    -ts "$WINDOWS_SIGN_TIMESTAMP" \
    -in "$DIST_DIR/$PRODUCT_NAME.exe" \
    -out "$SIGNED_EXE"
  mv "$SIGNED_EXE" "$DIST_DIR/$PRODUCT_NAME.exe"
fi

rm -f "$ZIP_PATH" "$CHECKSUM_PATH"
(cd "$BUILD_ROOT" && zip -qry "$ZIP_PATH" "$DIST_NAME")
(cd "$READY_DIR" && shasum -a 256 "${ZIP_PATH:t}") > "$CHECKSUM_PATH"

file "$DIST_DIR/$PRODUCT_NAME.exe" > "$BUILD_ROOT/executable-type.txt"
grep -Eq 'PE32\+ executable.*x86-64' "$BUILD_ROOT/executable-type.txt"
unzip -Z1 "$ZIP_PATH" > "$BUILD_ROOT/archive-contents.txt"
grep -Fqx "$DIST_NAME/$PRODUCT_NAME.exe" "$BUILD_ROOT/archive-contents.txt"
grep -Fqx "$DIST_NAME/resources/python/python.exe" "$BUILD_ROOT/archive-contents.txt"
grep -Fqx "$DIST_NAME/resources/argos_service.py" "$BUILD_ROOT/archive-contents.txt"
grep -Fqx "$DIST_NAME/resources/translator.bundle.js" "$BUILD_ROOT/archive-contents.txt"
grep -Fqx "$DIST_NAME/resources/game.json" "$BUILD_ROOT/archive-contents.txt"
grep -Fqx "$DIST_NAME/resources/bergamot-web/worker/bergamot-translator-worker.wasm" "$BUILD_ROOT/archive-contents.txt"

echo "Built $ZIP_PATH"
