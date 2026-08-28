#!/bin/zsh
set -euo pipefail

ROOT="${0:A:h:h}"
DEFAULT_NWJS_VERSION="0.115.0"
DEFAULT_NWJS_SHA256="d601cb05998c2ff69c0400d38af58dc7ba068c536f8e744aa3347e8b66a61483"
NWJS_VERSION="${VNREVIVAL_NWJS_VERSION:-$DEFAULT_NWJS_VERSION}"
NWJS_SHA256="${VNREVIVAL_NWJS_SHA256:-}"
if [[ -z "$NWJS_SHA256" && "$NWJS_VERSION" == "$DEFAULT_NWJS_VERSION" ]]; then
  NWJS_SHA256="$DEFAULT_NWJS_SHA256"
fi
[[ "$NWJS_SHA256" =~ '^[0-9a-fA-F]{64}$' ]] || {
  echo "Set VNREVIVAL_NWJS_SHA256 when overriding VNREVIVAL_NWJS_VERSION." >&2
  exit 1
}
BUILD_DIR="$ROOT/.build/nwjs-macos-arm64-$NWJS_VERSION"
RUNTIME_APP="$BUILD_DIR/NWJS Runtime.app"
ARCHIVE="$BUILD_DIR/nwjs-sdk-v$NWJS_VERSION-osx-arm64.zip"
VERIFIED_MARKER="$BUILD_DIR/.verified-archive-sha256"
EXTRACT_DIR="$BUILD_DIR/extracted"
DOWNLOAD_URL="https://dl.nwjs.io/v$NWJS_VERSION/nwjs-sdk-v$NWJS_VERSION-osx-arm64.zip"

verify_archive() {
  local ACTUAL
  ACTUAL=$(/usr/bin/shasum -a 256 "$ARCHIVE") || return 1
  ACTUAL="${ACTUAL%% *}"
  [[ "${ACTUAL:l}" == "${NWJS_SHA256:l}" ]]
}

if [[ -x "$RUNTIME_APP/Contents/MacOS/nwjs" && -s "$VERIFIED_MARKER" \
  && "$(tr -d '[:space:]' < "$VERIFIED_MARKER")" == "${NWJS_SHA256:l}" ]] \
  && /usr/bin/codesign --verify --deep --strict "$RUNTIME_APP" >/dev/null 2>&1; then
  exit 0
fi

mkdir -p "$BUILD_DIR"
if [[ ! -s "$ARCHIVE" ]]; then
  PARTIAL_ARCHIVE="$ARCHIVE.partial"
  /usr/bin/curl --fail --location --retry 5 --retry-all-errors \
    --output "$PARTIAL_ARCHIVE" "$DOWNLOAD_URL"
  /bin/mv "$PARTIAL_ARCHIVE" "$ARCHIVE"
fi

verify_archive || {
  echo "SHA-256 mismatch for $ARCHIVE" >&2
  exit 1
}
/usr/bin/unzip -tq "$ARCHIVE" >/dev/null
/bin/rm -rf -- "$EXTRACT_DIR"
mkdir -p "$EXTRACT_DIR"
/usr/bin/ditto -x -k "$ARCHIVE" "$EXTRACT_DIR"
SOURCE_APP="$EXTRACT_DIR/nwjs-sdk-v$NWJS_VERSION-osx-arm64/nwjs.app"
[[ -x "$SOURCE_APP/Contents/MacOS/nwjs" ]]
/bin/rm -rf -- "$RUNTIME_APP"
/bin/cp -cR "$SOURCE_APP" "$RUNTIME_APP"
/usr/bin/xattr -dr com.apple.quarantine "$RUNTIME_APP" 2>/dev/null || true
/usr/bin/codesign --force --deep --sign - "$RUNTIME_APP" >/dev/null
print -r -- "${NWJS_SHA256:l}" > "$VERIFIED_MARKER"
/bin/rm -rf -- "$EXTRACT_DIR"

echo "Prepared NW.js $NWJS_VERSION ARM64 runtime"
