#!/bin/zsh
set -euo pipefail
ROOT="${0:A:h:h}"
VERSION=$(tr -d '[:space:]' < "$ROOT/VERSION")
PRODUCT_NAME="VN Revival Localization Workbench"
ARCHIVE_PREFIX="VN-Revival-Localization-Workbench"
DIST_NAME="VN Revival Localization Workbench"
PYTHON_VERSION="3.11.9"
BUILD_ROOT="$ROOT/.build/windows"
DIST_DIR="$BUILD_ROOT/$DIST_NAME"
RESOURCE_DIR="$DIST_DIR/resources"
PYTHON_DIR="$RESOURCE_DIR/python"
READY_DIR="$ROOT/launcher/READY_TO_SHARE"
ZIP_PATH="$READY_DIR/$ARCHIVE_PREFIX-Windows-$VERSION.zip"
CHECKSUM_PATH="$ROOT/.build/checksums/${ZIP_PATH:t}.sha256"
PYTHON_ZIP="$ROOT/.build/cache/python-$PYTHON_VERSION-embed-amd64.zip"
PYTHON_URL="https://www.python.org/ftp/python/$PYTHON_VERSION/python-$PYTHON_VERSION-embed-amd64.zip"
PYTHON_ZIP_SHA256="009d6bf7e3b2ddca3d784fa09f90fe54336d5b60f0e0f305c37f400bf83cfd3b"
CC="${VNREVIVAL_WINDOWS_CC:-$(command -v x86_64-w64-mingw32-gcc)}"
WINDRES="${VNREVIVAL_WINDOWS_WINDRES:-$(command -v x86_64-w64-mingw32-windres)}"
ICON_PYTHON="${VNREVIVAL_ICON_PYTHON:-$ROOT/.venv/bin/python}"

[[ -x "$CC" && -x "$WINDRES" && -x "$ICON_PYTHON" ]]
mkdir -p "$ROOT/.build/cache" "$ROOT/.build/checksums" "$READY_DIR"
verify_sha256() {
  local expected="$1" artifact="$2" actual
  actual=$(shasum -a 256 "$artifact")
  actual=${actual%% *}
  [[ "$actual" == "$expected" ]]
}
if [[ -s "$PYTHON_ZIP" ]]; then
  verify_sha256 "$PYTHON_ZIP_SHA256" "$PYTHON_ZIP"
else
  DOWNLOAD="$PYTHON_ZIP.download.$$"
  trap '/bin/rm -f -- "$DOWNLOAD"' EXIT
  curl -fL --retry 3 --output "$DOWNLOAD" "$PYTHON_URL"
  verify_sha256 "$PYTHON_ZIP_SHA256" "$DOWNLOAD"
  mv "$DOWNLOAD" "$PYTHON_ZIP"
  trap - EXIT
fi

/bin/rm -rf -- "$BUILD_ROOT"
mkdir -p "$PYTHON_DIR"
unzip -q "$PYTHON_ZIP" -d "$PYTHON_DIR"
print -r -- '..' >> "$PYTHON_DIR/python311._pth"
cp "$ROOT/src/workbench_service.py" "$RESOURCE_DIR/"
cp -R "$ROOT/src/workbench" "$ROOT/src/workbench_ui" "$RESOURCE_DIR/"
cp "$ROOT/LICENSE" "$DIST_DIR/LICENSE"
python3 "$ROOT/scripts/render-template.py" "$ROOT/launcher/windows/README-Windows.txt" "$DIST_DIR/README.txt" PRODUCT_NAME "$PRODUCT_NAME"
python3 "$ROOT/scripts/render-template.py" "$ROOT/launcher/windows/THIRD_PARTY_NOTICES.txt" "$DIST_DIR/THIRD_PARTY_NOTICES.txt" PRODUCT_NAME "$PRODUCT_NAME"
"$ICON_PYTHON" -c 'from PIL import Image; import sys; Image.open(sys.argv[1]).convert("RGBA").save(sys.argv[2], format="ICO", sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])' \
  "$ROOT/assets/icon-1024.png" "$BUILD_ROOT/AppIcon.ico"

VERSION_COMMAS=${VERSION//./,}
python3 "$ROOT/scripts/render-template.py" "$ROOT/launcher/windows/launcher.c" "$BUILD_ROOT/launcher.c" PRODUCT_NAME "$PRODUCT_NAME"
python3 "$ROOT/scripts/render-template.py" "$ROOT/launcher/windows/app.manifest" "$BUILD_ROOT/app.manifest" PRODUCT_NAME "$PRODUCT_NAME"
python3 "$ROOT/scripts/render-template.py" "$ROOT/launcher/windows/app.rc.in" "$BUILD_ROOT/app.rc" \
  ICON_PATH "$BUILD_ROOT/AppIcon.ico" MANIFEST_PATH "$BUILD_ROOT/app.manifest" \
  VERSION_COMMAS "$VERSION_COMMAS" VERSION "$VERSION" PRODUCT_NAME "$PRODUCT_NAME"
"$WINDRES" "$BUILD_ROOT/app.rc" -O coff -o "$BUILD_ROOT/app-res.o"
"$CC" -std=c11 -O2 -s -Wall -Wextra -Werror -municode -mwindows \
  "$BUILD_ROOT/launcher.c" "$BUILD_ROOT/app-res.o" -o "$DIST_DIR/$PRODUCT_NAME.exe" \
  -Wl,--major-subsystem-version,6,--minor-subsystem-version,2 -lshell32

/bin/rm -f -- "$ZIP_PATH" "$CHECKSUM_PATH"
(cd "$BUILD_ROOT" && zip -qry "$ZIP_PATH" "$DIST_NAME")
(cd "$READY_DIR" && shasum -a 256 "${ZIP_PATH:t}") > "$CHECKSUM_PATH"
print -r -- "Built $ZIP_PATH"
