#!/bin/zsh
set -euo pipefail
ROOT="${0:A:h:h}"
: "${VNREVIVAL_GAME:?Set VNREVIVAL_GAME or invoke verification through a game-specific build script}"
GAME_ID="$VNREVIVAL_GAME"
GAME_MANIFEST="$ROOT/src/games/$GAME_ID/game.json"
manifest_value() { python3 "$ROOT/scripts/game-manifest.py" "$GAME_MANIFEST" "$1"; }
VERSION=$(tr -d '[:space:]' < "$ROOT/VERSION")
PRODUCT_NAME=$(manifest_value translatorName)
ARCHIVE_PREFIX=$(manifest_value archivePrefix)
DIST_NAME=$(manifest_value windowsDistributionName)
READY="$ROOT/launcher/READY_TO_SHARE"
BUILD_DIR="$ROOT/.build"
APP="$BUILD_DIR/macos/$PRODUCT_NAME.app"
ZIP="$READY/$ARCHIVE_PREFIX-macOS-$VERSION.zip"
WINDOWS_ZIP="$READY/$ARCHIVE_PREFIX-Windows-$VERSION.zip"
MAC_CHECKSUM="$BUILD_DIR/checksums/${ZIP:t}.sha256"
WINDOWS_CHECKSUM="$BUILD_DIR/checksums/${WINDOWS_ZIP:t}.sha256"

[[ -x "$APP/Contents/MacOS/$PRODUCT_NAME" ]]
[[ -x "$APP/Contents/Resources/VNRevivalTranslatorController" ]]
[[ -x "$APP/Contents/Resources/argos_service.py" ]]
[[ -s "$APP/Contents/Resources/translator.bundle.js" ]]
[[ -s "$APP/Contents/Resources/game.json" ]]
[[ -s "$APP/Contents/Resources/AppIcon.icns" ]]
[[ -s "$ZIP" ]]
[[ -s "$WINDOWS_ZIP" ]]
/usr/bin/codesign --verify --deep --strict "$APP"
CONTROLLER_ARCHS=$(/usr/bin/lipo -archs "$APP/Contents/Resources/VNRevivalTranslatorController")
grep -Eq '(^| )arm64( |$)' <<< "$CONTROLLER_ARCHS"
grep -Eq '(^| )x86_64( |$)' <<< "$CONTROLLER_ARCHS"
(cd "$READY" && shasum -a 256 -c "$MAC_CHECKSUM")
(cd "$READY" && shasum -a 256 -c "$WINDOWS_CHECKSUM")

CONTENTS=$(unzip -Z1 "$ZIP")
if grep -Ei '\.(exe|dll|pak|sav)$|/resources/app/|/steamapps/' <<< "$CONTENTS"; then
  echo "Archive contains game or user files" >&2
  exit 1
fi

WINDOWS_CONTENTS=$(unzip -Z1 "$WINDOWS_ZIP")
grep -Fqx "$DIST_NAME/$PRODUCT_NAME.exe" <<< "$WINDOWS_CONTENTS"
grep -Fqx "$DIST_NAME/resources/python/python.exe" <<< "$WINDOWS_CONTENTS"
grep -Fqx "$DIST_NAME/resources/argos_service.py" <<< "$WINDOWS_CONTENTS"
grep -Fqx "$DIST_NAME/resources/game.json" <<< "$WINDOWS_CONTENTS"
WINDOWS_NOTICES=$(unzip -p "$WINDOWS_ZIP" "$DIST_NAME/THIRD_PARTY_NOTICES.txt")
grep -Fq "$PRODUCT_NAME bundles the Python embeddable runtime" <<< "$WINDOWS_NOTICES"
if grep -Fq '__PRODUCT_NAME__' <<< "$WINDOWS_NOTICES"; then
  echo "Windows notices were not rendered" >&2
  exit 1
fi
if grep -Ei '/steamapps/|/resources/app/|\.pak$|\.sav$' <<< "$WINDOWS_CONTENTS"; then
  echo "Windows archive contains game or user files" >&2
  exit 1
fi

WINDOWS_EXE="$ROOT/.build/verify-windows-launcher.exe"
unzip -p "$WINDOWS_ZIP" "$DIST_NAME/$PRODUCT_NAME.exe" > "$WINDOWS_EXE"
grep -Eq 'PE32\+ executable.*GUI.*x86-64' <<< "$(file "$WINDOWS_EXE")"

USAGE_OUTPUT=$("$APP/Contents/Resources/VNRevivalTranslatorController" 2>&1 || true)
grep -Eq "Usage:" <<< "$USAGE_OUTPUT"
PYTHONPYCACHEPREFIX="$ROOT/.build/python-cache" python3 -m py_compile "$APP/Contents/Resources/argos_service.py"
echo "Product verification passed"
