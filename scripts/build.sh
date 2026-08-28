#!/bin/zsh
set -euo pipefail
ROOT="${0:A:h:h}"
: "${VNREVIVAL_GAME:?Set VNREVIVAL_GAME or use a game-specific build script such as scripts/build-omori.sh}"
GAME_ID="$VNREVIVAL_GAME"
GAME_DIR="$ROOT/src/games/$GAME_ID"
GAME_MANIFEST="$GAME_DIR/game.json"
manifest_value() { python3 "$ROOT/scripts/game-manifest.py" "$GAME_MANIFEST" "$1"; }
python3 "$ROOT/scripts/game-manifest.py" "$GAME_MANIFEST" >/dev/null
[[ -s "$GAME_DIR/adapter.js" ]]

VERSION=$(tr -d '[:space:]' < "$ROOT/VERSION")
BUILD_NUMBER=$(date -u +%Y%m%d%H%M)
PRODUCT_NAME=$(manifest_value translatorName)
GAME_TITLE=$(manifest_value title)
SHORT_TITLE=$(manifest_value shortTitle)
STEAM_APP_ID=$(manifest_value steamAppId)
WINDOWS_EXECUTABLE=$(manifest_value windowsExecutable)
CROSSOVER_BOTTLE=$(manifest_value crossOverBottle)
CROSSOVER_GAME_PATH=$(manifest_value crossOverGamePath)
DATA_DIRECTORY=$(manifest_value dataDirectory)
BUNDLE_IDENTIFIER=$(manifest_value bundleIdentifier)
ICON_PNG=$(manifest_value iconPng)
ICON_ICNS=$(manifest_value iconIcns)
ARCHIVE_PREFIX=$(manifest_value archivePrefix)
LAUNCH_STRATEGY=$(manifest_value launchStrategy)
DEBUG_TARGET_TITLE=$(manifest_value debugTargetTitleContains)
DEBUG_TARGET_URL=$(manifest_value debugTargetUrlContains)
[[ "$LAUNCH_STRATEGY" == "electron-cdp" ]] || { echo "Unsupported launch strategy: $LAUNCH_STRATEGY" >&2; exit 1; }
BUILD_DIR="$ROOT/.build"
READY_DIR="$ROOT/launcher/READY_TO_SHARE"
APP="$BUILD_DIR/macos/$PRODUCT_NAME.app"
MAC_ZIP="$READY_DIR/$ARCHIVE_PREFIX-macOS-$VERSION.zip"
MAC_CHECKSUM="$BUILD_DIR/checksums/${MAC_ZIP:t}.sha256"
SWIFTC="/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/swiftc"
SDK="/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk"
MAC_SIGN_IDENTITY="${VNREVIVAL_MAC_SIGN_IDENTITY:--}"
MAC_NOTARY_PROFILE="${VNREVIVAL_MAC_NOTARY_PROFILE:-}"
[[ -s "$ROOT/$ICON_PNG" && -s "$ROOT/$ICON_ICNS" ]]

VNREVIVAL_REQUIRE_BROWSER_SMOKE=1 VNREVIVAL_GAME="$GAME_ID" "$ROOT/scripts/test.sh"
"$ROOT/scripts/prepare-nwjs-macos.sh"
rm -rf "$BUILD_DIR/macos"
mkdir -p "$BUILD_DIR/checksums" "$READY_DIR" "$APP/Contents/MacOS" "$APP/Contents/Resources"

sed "s/__VERSION__/$VERSION/g" "$ROOT/src/translator-runtime.js" > "$BUILD_DIR/translator-runtime.js"
python3 "$ROOT/scripts/generate-game-config.py" "$GAME_MANIFEST" "$BUILD_DIR/game-config.js"
{
  printf '%s\n' "/* $PRODUCT_NAME — generated VN Revival bundle */"
  cat "$ROOT/src/translation-core.js"
  cat "$ROOT/src/languages.js"
  cat "$ROOT/src/providers.js"
  cat "$BUILD_DIR/game-config.js"
  cat "$GAME_DIR/adapter.js"
  cat "$BUILD_DIR/translator-runtime.js"
} > "$BUILD_DIR/translator.bundle.js"

[[ -x "$SWIFTC" && -d "$SDK" ]]
for ARCH in arm64 x86_64; do
  MODULE_CACHE="$BUILD_DIR/module-cache-$ARCH"
  rm -rf "$MODULE_CACHE"
  mkdir -p "$MODULE_CACHE"
  CLANG_MODULE_CACHE_PATH="$MODULE_CACHE" "$SWIFTC" \
    -parse-as-library -O -target "$ARCH-apple-macos12.0" -sdk "$SDK" \
    -module-cache-path "$MODULE_CACHE" \
    "$ROOT/src/controller/main.swift" -o "$BUILD_DIR/VNRevivalTranslatorController-$ARCH"
done
/usr/bin/lipo -create \
  "$BUILD_DIR/VNRevivalTranslatorController-arm64" \
  "$BUILD_DIR/VNRevivalTranslatorController-x86_64" \
  -output "$BUILD_DIR/VNRevivalTranslatorController"

python3 "$ROOT/scripts/render-template.py" "$ROOT/launcher/macos/Info.plist" "$APP/Contents/Info.plist" \
  VERSION "$VERSION" BUILD "$BUILD_NUMBER" PRODUCT_NAME "$PRODUCT_NAME" \
  BUNDLE_IDENTIFIER "$BUNDLE_IDENTIFIER" GAME_ID "$GAME_ID" GAME_TITLE "$GAME_TITLE" \
  SHORT_TITLE "$SHORT_TITLE" STEAM_APP_ID "$STEAM_APP_ID" WINDOWS_EXECUTABLE "$WINDOWS_EXECUTABLE" \
  CROSSOVER_BOTTLE "$CROSSOVER_BOTTLE" CROSSOVER_GAME_PATH "$CROSSOVER_GAME_PATH" DATA_DIRECTORY "$DATA_DIRECTORY" \
  LAUNCH_STRATEGY "$LAUNCH_STRATEGY" DEBUG_TARGET_TITLE "$DEBUG_TARGET_TITLE" DEBUG_TARGET_URL "$DEBUG_TARGET_URL"
cp "$ROOT/launcher/macos/launch.sh" "$APP/Contents/MacOS/$PRODUCT_NAME"
cp "$BUILD_DIR/VNRevivalTranslatorController" "$APP/Contents/Resources/"
cp "$BUILD_DIR/translator.bundle.js" "$APP/Contents/Resources/"
cp "$GAME_MANIFEST" "$APP/Contents/Resources/game.json"
cp "$ROOT/src/argos_service.py" "$APP/Contents/Resources/"
cp "$ROOT/src/requirements-runtime-macos.txt" "$APP/Contents/Resources/"
cp -R "$ROOT/src/bergamot-web" "$APP/Contents/Resources/bergamot-web"
cp "$ROOT/launcher/macos/steam-compat.js" "$APP/Contents/Resources/"
/bin/cp -cR "$BUILD_DIR/nwjs-macos-arm64-${VNREVIVAL_NWJS_VERSION:-0.115.0}/NWJS Runtime.app" "$APP/Contents/Resources/NWJS Runtime.app"
cp "$ROOT/$ICON_ICNS" "$APP/Contents/Resources/AppIcon.icns"
cp "$ROOT/README.md" "$APP/Contents/Resources/README.md"
cp "$ROOT/LICENSE" "$APP/Contents/Resources/LICENSE"
cp "$ROOT/THIRD_PARTY_NOTICES.md" "$APP/Contents/Resources/THIRD_PARTY_NOTICES.md"
chmod +x "$APP/Contents/MacOS/$PRODUCT_NAME" "$APP/Contents/Resources/VNRevivalTranslatorController" "$APP/Contents/Resources/argos_service.py"

if [[ "$MAC_SIGN_IDENTITY" == "-" ]]; then
  /usr/bin/codesign --force --deep --sign - "$APP" >/dev/null
else
  /usr/bin/codesign --force --deep --options runtime --timestamp --sign "$MAC_SIGN_IDENTITY" "$APP"
fi
if [[ -n "$MAC_NOTARY_PROFILE" ]]; then
  [[ "$MAC_SIGN_IDENTITY" != "-" ]]
  NOTARY_ZIP="$BUILD_DIR/$ARCHIVE_PREFIX-notary.zip"
  rm -f "$NOTARY_ZIP"
  /usr/bin/ditto -c -k --sequesterRsrc --keepParent "$APP" "$NOTARY_ZIP"
  /usr/bin/xcrun notarytool submit "$NOTARY_ZIP" --keychain-profile "$MAC_NOTARY_PROFILE" --wait
  /usr/bin/xcrun stapler staple "$APP"
fi
rm -f "$MAC_ZIP" "$MAC_CHECKSUM"
/usr/bin/ditto -c -k --sequesterRsrc --keepParent "$APP" "$MAC_ZIP"
(cd "$READY_DIR" && shasum -a 256 "${MAC_ZIP:t}") > "$MAC_CHECKSUM"

VNREVIVAL_GAME="$GAME_ID" "$ROOT/scripts/build-windows.sh" "$BUILD_DIR/translator.bundle.js"
VNREVIVAL_GAME="$GAME_ID" "$ROOT/scripts/verify.sh"
ROOT_APP="$ROOT/$PRODUCT_NAME.app"
ROOT_APP_STAGING="$BUILD_DIR/root-app-staging.app"
ROOT_APP_PREVIOUS="$BUILD_DIR/root-app-previous.app"
/bin/rm -rf -- "$ROOT_APP_STAGING" "$ROOT_APP_PREVIOUS"
/bin/cp -cR "$APP" "$ROOT_APP_STAGING"
/usr/bin/codesign --verify --deep --strict "$ROOT_APP_STAGING"
if [[ -e "$ROOT_APP" ]]; then
  /bin/mv "$ROOT_APP" "$ROOT_APP_PREVIOUS"
fi
if ! /bin/mv "$ROOT_APP_STAGING" "$ROOT_APP"; then
  [[ ! -e "$ROOT_APP_PREVIOUS" ]] || /bin/mv "$ROOT_APP_PREVIOUS" "$ROOT_APP"
  exit 1
fi
/usr/bin/codesign --verify --deep --strict "$ROOT_APP"
/bin/rm -rf -- "$ROOT_APP_PREVIOUS"
[[ -s "$MAC_ZIP" ]]
[[ -s "$READY_DIR/$ARCHIVE_PREFIX-Windows-$VERSION.zip" ]]
echo "Built the two current release archives"
