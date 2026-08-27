#!/bin/zsh
set -euo pipefail

ROOT="${0:A:h:h}"
NWJS_VERSION="${VNREVIVAL_NWJS_VERSION:-0.115.0}"
BUILD_DIR="$ROOT/.build/nwjs-macos-arm64-$NWJS_VERSION"
RUNTIME_APP="$BUILD_DIR/NWJS Runtime.app"
ARCHIVE="$BUILD_DIR/nwjs-sdk-v$NWJS_VERSION-osx-arm64.zip"
EXTRACT_DIR="$BUILD_DIR/extracted"
DOWNLOAD_URL="https://dl.nwjs.io/v$NWJS_VERSION/nwjs-sdk-v$NWJS_VERSION-osx-arm64.zip"

if [[ -x "$RUNTIME_APP/Contents/MacOS/nwjs" ]]; then
  exit 0
fi

mkdir -p "$BUILD_DIR"
if [[ ! -s "$ARCHIVE" ]]; then
  PARTIAL_ARCHIVE="$ARCHIVE.partial"
  /usr/bin/curl --fail --location --retry 5 --retry-all-errors \
    --output "$PARTIAL_ARCHIVE" "$DOWNLOAD_URL"
  /bin/mv "$PARTIAL_ARCHIVE" "$ARCHIVE"
fi

/usr/bin/unzip -tq "$ARCHIVE" >/dev/null
/bin/rm -rf -- "$EXTRACT_DIR"
mkdir -p "$EXTRACT_DIR"
/usr/bin/ditto -x -k "$ARCHIVE" "$EXTRACT_DIR"
SOURCE_APP="$EXTRACT_DIR/nwjs-sdk-v$NWJS_VERSION-osx-arm64/nwjs.app"
[[ -x "$SOURCE_APP/Contents/MacOS/nwjs" ]]
/bin/cp -cR "$SOURCE_APP" "$RUNTIME_APP"
/usr/bin/xattr -dr com.apple.quarantine "$RUNTIME_APP" 2>/dev/null || true
/usr/bin/codesign --force --deep --sign - "$RUNTIME_APP" >/dev/null
/bin/rm -rf -- "$EXTRACT_DIR"

echo "Prepared NW.js $NWJS_VERSION ARM64 runtime"
