#!/bin/zsh
set -euo pipefail
ROOT="${0:A:h:h}"
cd "$ROOT"
mkdir -p .build/python-cache
PYTHONPYCACHEPREFIX="$ROOT/.build/python-cache" PYTHONPATH="$ROOT/src" python3 -m py_compile \
  src/workbench/core.py src/workbench/adapters.py src/workbench/integrity.py src/workbench/openai_provider.py \
  src/workbench/site_glossary.py \
  src/workbench/omori_assets.py src/workbench_service.py
PYTHONPYCACHEPREFIX="$ROOT/.build/python-cache" PYTHONPATH="$ROOT/src" python3 -m unittest \
  tests.test_workbench -q
node --check src/workbench_ui/app.js
zsh -n launcher/macos/launch.sh scripts/build.sh scripts/build-windows.sh scripts/verify.sh
if command -v x86_64-w64-mingw32-gcc >/dev/null 2>&1; then
  python3 scripts/render-template.py launcher/windows/launcher.c .build/workbench-launcher.c \
    PRODUCT_NAME "VN Revival Localization Workbench"
  python3 scripts/render-template.py launcher/windows/app.manifest .build/workbench-app.manifest \
    PRODUCT_NAME "VN Revival Localization Workbench"
  x86_64-w64-mingw32-gcc -std=c11 -O2 -Wall -Wextra -Werror -municode -mwindows \
    .build/workbench-launcher.c -o .build/workbench-launcher.exe -lshell32
fi
print -r -- "Localization Workbench checks passed"
