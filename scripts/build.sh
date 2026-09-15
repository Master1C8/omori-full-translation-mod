#!/bin/zsh
set -euo pipefail
ROOT="${0:A:h:h}"
VERSION=$(tr -d '[:space:]' < "$ROOT/VERSION")
BUILD_NUMBER=$(date -u +%Y%m%d%H%M)
PRODUCT_NAME="VN Revival Localization Workbench"
ARCHIVE_PREFIX="VN-Revival-Localization-Workbench"
BUILD_DIR="$ROOT/.build"
READY_DIR="$ROOT/launcher/READY_TO_SHARE"
APP="$BUILD_DIR/macos/$PRODUCT_NAME.app"
MAC_ZIP="$READY_DIR/$ARCHIVE_PREFIX-macOS-$VERSION.zip"
MAC_CHECKSUM="$BUILD_DIR/checksums/${MAC_ZIP:t}.sha256"
MAC_SIGN_IDENTITY="${VNREVIVAL_MAC_SIGN_IDENTITY:--}"
MAC_NOTARY_PROFILE="${VNREVIVAL_MAC_NOTARY_PROFILE:-}"

"$ROOT/scripts/test-workbench.sh"
/bin/rm -rf -- "$BUILD_DIR/macos"
mkdir -p "$BUILD_DIR/checksums" "$READY_DIR" "$APP/Contents/MacOS" "$APP/Contents/Resources"
python3 "$ROOT/scripts/render-template.py" "$ROOT/launcher/macos/Info.plist" "$APP/Contents/Info.plist" \
  VERSION "$VERSION" BUILD "$BUILD_NUMBER"
cp "$ROOT/launcher/macos/launch.sh" "$APP/Contents/MacOS/$PRODUCT_NAME"
cp "$ROOT/src/workbench_service.py" "$APP/Contents/Resources/"
cp -R "$ROOT/src/workbench" "$ROOT/src/workbench_ui" "$APP/Contents/Resources/"
cp "$ROOT/assets/AppIcon.icns" "$APP/Contents/Resources/AppIcon.icns"
cp "$ROOT/README.md" "$ROOT/LICENSE" "$ROOT/THIRD_PARTY_NOTICES.md" "$APP/Contents/Resources/"
chmod +x "$APP/Contents/MacOS/$PRODUCT_NAME" "$APP/Contents/Resources/workbench_service.py"

if [[ "$MAC_SIGN_IDENTITY" == "-" ]]; then
  /usr/bin/codesign --force --deep --sign - "$APP" >/dev/null
else
  /usr/bin/codesign --force --deep --options runtime --timestamp --sign "$MAC_SIGN_IDENTITY" "$APP"
fi
if [[ -n "$MAC_NOTARY_PROFILE" ]]; then
  [[ "$MAC_SIGN_IDENTITY" != "-" ]]
  NOTARY_ZIP="$BUILD_DIR/$ARCHIVE_PREFIX-notary.zip"
  /bin/rm -f -- "$NOTARY_ZIP"
  /usr/bin/ditto -c -k --sequesterRsrc --keepParent "$APP" "$NOTARY_ZIP"
  /usr/bin/xcrun notarytool submit "$NOTARY_ZIP" --keychain-profile "$MAC_NOTARY_PROFILE" --wait
  /usr/bin/xcrun stapler staple "$APP"
fi
/bin/rm -f -- "$MAC_ZIP" "$MAC_CHECKSUM"
/usr/bin/ditto -c -k --sequesterRsrc --keepParent "$APP" "$MAC_ZIP"
(cd "$READY_DIR" && shasum -a 256 "${MAC_ZIP:t}") > "$MAC_CHECKSUM"

"$ROOT/scripts/build-windows.sh"
"$ROOT/scripts/verify.sh"
print -r -- "Built Localization Workbench for macOS and Windows"
