#!/bin/zsh
set -euo pipefail
ROOT="${0:A:h:h}"
VERSION=$(tr -d '[:space:]' < "$ROOT/VERSION")
PRODUCT_NAME="VN Revival Localization Workbench"
PREFIX="VN-Revival-Localization-Workbench"
APP="$ROOT/.build/macos/$PRODUCT_NAME.app"
MAC_ZIP="$ROOT/launcher/READY_TO_SHARE/$PREFIX-macOS-$VERSION.zip"
WINDOWS_ZIP="$ROOT/launcher/READY_TO_SHARE/$PREFIX-Windows-$VERSION.zip"

[[ -x "$APP/Contents/MacOS/$PRODUCT_NAME" ]]
for path in workbench_service.py workbench/core.py workbench/adapters.py workbench/integrity.py workbench/openai_provider.py workbench/site_glossary.py workbench/omori_assets.py workbench_ui/index.html workbench_ui/app.js workbench_ui/styles.css; do
  [[ -s "$APP/Contents/Resources/$path" ]]
done
/usr/bin/codesign --verify --deep --strict "$APP"
[[ -s "$MAC_ZIP" && -s "$WINDOWS_ZIP" ]]
MAC_CONTENTS=$(unzip -Z1 "$MAC_ZIP")
WINDOWS_CONTENTS=$(unzip -Z1 "$WINDOWS_ZIP")
grep -Fq '/Contents/Resources/workbench_service.py' <<< "$MAC_CONTENTS"
grep -Fq "$PRODUCT_NAME/resources/workbench_service.py" <<< "$WINDOWS_CONTENTS"
grep -Fq "$PRODUCT_NAME/resources/python/python.exe" <<< "$WINDOWS_CONTENTS"
if grep -Eqi 'translator\.bundle|steam-compat|games/coc2|VNRevivalTranslatorController' <<< "$MAC_CONTENTS$WINDOWS_CONTENTS"; then
  print -u2 -- "A legacy runtime translator component entered the release"
  exit 1
fi
print -r -- "Localization Workbench release verification passed"
