#!/bin/zsh
set -euo pipefail
ROOT="${0:A:h:h}"
cd "$ROOT"
: "${VNREVIVAL_GAME:?Set VNREVIVAL_GAME or use a game-specific test script such as scripts/test-omori.sh}"
GAME_ID="$VNREVIVAL_GAME"
GAME_DIR="$ROOT/src/games/$GAME_ID"
GAME_MANIFEST="$ROOT/src/games/$GAME_ID/game.json"
manifest_value() { python3 "$ROOT/scripts/game-manifest.py" "$GAME_MANIFEST" "$1"; }
python3 scripts/game-manifest.py "$GAME_MANIFEST" >/dev/null
PRODUCT_NAME=$(manifest_value translatorName)
GAME_TITLE=$(manifest_value title)
STEAM_APP_ID=$(manifest_value steamAppId)
WINDOWS_EXECUTABLE=$(manifest_value windowsExecutable)
DATA_DIRECTORY=$(manifest_value dataDirectory)
ICON_PNG=$(manifest_value iconPng)
ICON_ICNS=$(manifest_value iconIcns)
DATA_DIRECTORY_WINDOWS=$(python3 -c 'import sys; print(sys.argv[1].replace("/", "\\"))' "$DATA_DIRECTORY")
DEBUG_TARGET_TITLE=$(manifest_value debugTargetTitleContains)
DEBUG_TARGET_URL=$(manifest_value debugTargetUrlContains)

NODE_TESTS=(tests/translation-core.test.js tests/providers.test.js tests/runtime-ui.test.js tests/runtime-progress.test.js tests/runtime-panel.test.js tests/game-adapter.test.js)
GAME_TESTS=("$GAME_DIR"/tests/*.test.js(N))
(( ${#GAME_TESTS} > 0 )) || { echo "No game-specific tests found for $GAME_ID" >&2; exit 1; }
NODE_TESTS+=("${GAME_TESTS[@]}")
VNREVIVAL_GAME="$GAME_ID" node --test "${NODE_TESTS[@]}"
node --check src/translation-core.js
node --check src/languages.js
node --check src/providers.js
node --check src/runtime-ui.js
node --check src/runtime-progress.js
node --check src/runtime-panel.js
node --check "src/games/$GAME_ID/adapter.js"
node --check src/translator-runtime.js
node --check launcher/macos/steam-compat.js
node --check scripts/browser-smoke-cdp.js
[[ -s "$ROOT/$ICON_PNG" && -s "$ROOT/$ICON_ICNS" ]]
[[ -s "$ROOT/src/runtime-ui.js" && -s "$ROOT/src/runtime-progress.js" && -s "$ROOT/src/runtime-panel.js" && -s "$ROOT/src/local_router.py" ]]
mkdir -p "$ROOT/.build"
python3 scripts/generate-game-config.py "$GAME_MANIFEST" "$ROOT/.build/game-config.js"
node --check "$ROOT/.build/game-config.js"
"$ROOT/scripts/run-browser-smoke.sh"
python3 scripts/render-template.py launcher/windows/launcher.c "$ROOT/.build/windows-launcher-smoke.c" \
  VERSION "$(tr -d '[:space:]' < VERSION)" PRODUCT_NAME "$PRODUCT_NAME" GAME_TITLE "$GAME_TITLE" \
  WINDOWS_EXECUTABLE "$WINDOWS_EXECUTABLE" DATA_DIRECTORY_WINDOWS "$DATA_DIRECTORY_WINDOWS" \
  GAME_ID "$GAME_ID" STEAM_APP_ID "$STEAM_APP_ID" DEBUG_TARGET_TITLE "$DEBUG_TARGET_TITLE" DEBUG_TARGET_URL "$DEBUG_TARGET_URL"
PYTHONPYCACHEPREFIX="$ROOT/.build/python-cache" python3 -m unittest discover -s tests -p 'test_*.py'
for SCRIPT in \
  launcher/macos/launch.sh scripts/build.sh scripts/build-windows.sh scripts/test.sh \
  scripts/verify.sh scripts/build-omori.sh scripts/test-omori.sh \
  scripts/prepare-nwjs-macos.sh scripts/run-browser-smoke.sh; do
  zsh -n "$SCRIPT"
done

if command -v x86_64-w64-mingw32-gcc >/dev/null 2>&1; then
  x86_64-w64-mingw32-gcc -std=c11 -O2 -Wall -Wextra -Werror -municode -mwindows \
    "$ROOT/.build/windows-launcher-smoke.c" -o "$ROOT/.build/windows-launcher-smoke.exe" \
    -lwinhttp -lws2_32 -lshell32 -lole32 -ladvapi32 -lcomdlg32
fi

if grep -RInE "381780|BepInEx|StorySentenceElement|EightyDaysRussianTranslator" src launcher/macos launcher/windows; then
  echo "Found identity left over from the 80 Days implementation" >&2
  exit 1
fi

if grep -RIniE "glossary|словар" src launcher/macos launcher/windows; then
  echo "Removed dictionary functionality is still present" >&2
  exit 1
fi

if grep -RIniE "coc2|corruption of champions" \
  src/translation-core.js src/languages.js src/providers.js src/runtime-ui.js src/runtime-progress.js src/runtime-panel.js src/translator-runtime.js \
  src/local_service.py src/controller launcher/macos launcher/windows/launcher.c; then
  echo "Found a CoC2-specific identity in the shared runtime" >&2
  exit 1
fi

if grep -RInE '[А-Яа-яЁё]' \
  src/runtime-ui.js src/runtime-progress.js src/runtime-panel.js src/translator-runtime.js src/local_service.py src/local_router.py \
  src/providers.js launcher/macos/launch.sh launcher/windows/launcher.c launcher/windows/README-Windows.txt "src/games/$GAME_ID/adapter.js"; then
  echo "The mod interface must remain English-only" >&2
  exit 1
fi

for REQUIRED in 'autoTranslate' 'showOriginal' 'showTranslations' 'exportCache' 'loadTranslationFile' 'inspectTranslationFile' 'installTranslationPack' 'clearCacheForLanguage' 'collapsed' 'collapseToggle' 'updateCollapsedState' 'applyLanguageFormatting' 'restoreLanguageFormatting' 'applyJobTranslation' 'populateLanguageOptions' 'MEMORY_CACHE_LIMIT' 'CACHE_META_KEY' 'CACHE_DIRTY_KEY' 'IntersectionObserver' 'visibilitychange' 'createCacheExportStream' 'providerRegistry' 'translateBulkLanguage'; do
  grep -Fq "$REQUIRED" src/translator-runtime.js || {
    echo "Missing runtime feature: $REQUIRED" >&2
    exit 1
  }
done

if grep -Eq 'SUPER_BULK_LANGUAGES|superBulkTranslateAll|superBulkTranslate|super-bulk|Super Bulk' src/translator-runtime.js; then
  echo "Removed Super Bulk mode is still present in translator-runtime.js" >&2
  exit 1
fi

if rg -n -i 'mymemory' src/translation-core.js src/providers.js src/translator-runtime.js; then
  echo "Removed MyMemory provider is still present in browser product code" >&2
  exit 1
fi

grep -Fq 'const MEMORY_CACHE_LIMIT = 50000;' src/translator-runtime.js || {
  echo "RAM cache must retain 50000 recent translations" >&2
  exit 1
}

for REQUIRED in 'google' 'gemini' 'lmstudio' 'openai-compatible' 'translateChunk' 'supportsLanguage' 'splitText'; do
  grep -Fq "$REQUIRED" src/providers.js || {
    echo "Missing provider feature: $REQUIRED" >&2
    exit 1
  }
done

if rg -n -i 'argos|ctranslate|opus' src/providers.js src/runtime-panel.js src/translator-runtime.js; then
  echo "Removed offline providers are still present in browser product code" >&2
  exit 1
fi

for REQUIRED in "#define APP_ID $STEAM_APP_ID" 'WinHttpWebSocket' "$WINDOWS_EXECUTABLE" 'local_service.py' 'python.exe' '__vnRevivalLocalBridge' '--credential-id' '--game-path' 'GetOpenFileNameW' 'load_saved_game_path' 'consume_reselect_marker' 'debug_target_running'; do
  grep -Fq -- "$REQUIRED" "$ROOT/.build/windows-launcher-smoke.c" || {
    echo "Missing Windows launcher feature: $REQUIRED" >&2
    exit 1
  }
done

for REQUIRED in 'ASSET_INDEX_SCHEMA' 'assetCache' 'GeminiCredentialStore' 'gemini_translate' 'lmstudio_status' 'lmstudio_translate' 'OpenAICompatibleCredentialStore' 'openai_compatible_status' 'openai_compatible_translate' 'LocalPostRouter' 'game_language_candidates' '_aes256_encrypt_block' 'request_game_executable_change' '/v1/gemini/status' '/v1/lmstudio/status' '/v1/game/strings'; do
  grep -Eq "$REQUIRED" src/local_service.py || {
    echo "Missing local service feature: $REQUIRED" >&2
    exit 1
  }
done

for REQUIRED in '/v1/gemini/key' '/v1/gemini/translate' '/v1/lmstudio/translate' '/v1/openai-compatible/status' '/v1/openai-compatible/key' '/v1/openai-compatible/translate' '/v1/reset' '/v1/launcher/reselect-executable'; do
  grep -Fq "$REQUIRED" src/local_router.py || {
    echo "Missing local service route: $REQUIRED" >&2
    exit 1
  }
done

if rg -n -i 'bergamot' src/providers.js src/runtime-ui.js src/runtime-progress.js src/runtime-panel.js src/translator-runtime.js src/local_service.py src/local_router.py; then
  echo "Removed Bergamot provider is still present in product code" >&2
  exit 1
fi

grep -Eq 'SITE_NAME = "VN Revival"' src/translator-runtime.js
grep -Eq 'SITE_URL = "https://vnrevival.fun/"' src/translator-runtime.js
grep -Fq 'https://discord.gg/QgyeWW3Jg' src/runtime-panel.js
grep -Fq 'https://t.me/VnRevival' src/runtime-panel.js
grep -Fq 'mailto:master1c8@proton.me' src/runtime-panel.js
grep -Eq 'VNRevivalGameAdapter' "src/games/$GAME_ID/adapter.js"
grep -Eq 'VNRevivalTranslationCore' src/translation-core.js
grep -Eq 'VNRevivalTranslationProviders' src/providers.js
grep -Eq 'VNRevivalRuntimeUI' src/runtime-ui.js
grep -Eq 'VNRevivalRuntimeProgress' src/runtime-progress.js
grep -Eq 'VNRevivalRuntimePanel' src/runtime-panel.js
grep -Eq 'VNRevivalGameConfig' "$ROOT/.build/game-config.js"
grep -Eq 'choose_game_executable' launcher/macos/launch.sh
grep -Eq 'valid_game_target' launcher/macos/launch.sh
grep -Fq 'Contents/Resources/app.nw' launcher/macos/launch.sh
grep -Fq 'not a Steam desktop shortcut' launcher/macos/launch.sh
grep -Fq 'NWJS Runtime.app' launcher/macos/launch.sh
grep -Fq 'hw.optional.arm64' launcher/macos/launch.sh
grep -Fq 'vnrevival-omori-runtime.' launcher/macos/launch.sh
grep -Fq 'GAME_ICON="$GAME_TARGET/Contents/Resources/app.icns"' launcher/macos/launch.sh
grep -Fq '/bin/cp "$GAME_ICON" "$RUNTIME_APP/Contents/Resources/app.icns"' launcher/macos/launch.sh
grep -Fq 'capture_steam_argument' launcher/macos/launch.sh
grep -Fq 'VNREVIVAL_STEAM_ARGUMENT="$STEAM_ARGUMENT"' launcher/macos/launch.sh
grep -Fq 'TRACKED_GAME_PID="$GAME_PID"' launcher/macos/launch.sh
grep -Fq '"$COMMAND" == "$GAME_TARGET/Contents/MacOS/"*' launcher/macos/launch.sh
grep -Fq '/bin/kill -0 "$TRACKED_GAME_PID"' launcher/macos/launch.sh
grep -Fq 'inject_js_start' launcher/macos/launch.sh
grep -Fq 'getAchievementNames: () => []' launcher/macos/steam-compat.js
grep -Fq 'gameWindow.restore()' launcher/macos/steam-compat.js
if grep -Eq 'console\.|writeFile|appendFile' launcher/macos/steam-compat.js; then
  echo "Apple Silicon compatibility must not log or persist the Steam argument" >&2
  exit 1
fi
grep -Fq 'prepare-nwjs-macos.sh' scripts/build.sh
grep -Fq 'cat "$ROOT/src/runtime-progress.js"' scripts/build.sh
grep -Fq 'cat "$ROOT/src/runtime-panel.js"' scripts/build.sh
grep -Fq 'cp "$ROOT/src/local_router.py" "$APP/Contents/Resources/"' scripts/build.sh
grep -Fq 'cp "$ROOT/src/local_router.py" "$RESOURCE_DIR/local_router.py"' scripts/build-windows.sh
grep -Fq 'ROOT_APP_STAGING="$BUILD_DIR/root-app-staging.app"' scripts/build.sh
grep -Fq 'ROOT_APP_PREVIOUS="$BUILD_DIR/root-app-previous.app"' scripts/build.sh
grep -Fq 'DEFAULT_NWJS_SHA256="d601cb05998c2ff69c0400d38af58dc7ba068c536f8e744aa3347e8b66a61483"' scripts/prepare-nwjs-macos.sh
grep -Fq 'verify_archive' scripts/prepare-nwjs-macos.sh
grep -Fq '.verified-archive-sha256' scripts/prepare-nwjs-macos.sh
grep -Fq '/bin/rm -rf -- "$RUNTIME_APP"' scripts/prepare-nwjs-macos.sh
grep -Fq 'kill "$LOCAL_SERVICE_PID"' launcher/macos/launch.sh
grep -Fq "UNEXPECTED_CONTENTS=" scripts/verify.sh
grep -Fq '"$ROOT/$PRODUCT_NAME.app"' scripts/build.sh
grep -Eq 'RESELECT_MARKER' launcher/macos/launch.sh
grep -Fq -- '--credential-id "$GAME_ID"' launcher/macos/launch.sh
grep -Fq -- '--game-path "$GAME_TARGET"' launcher/macos/launch.sh
grep -Eq 'persistControlSettings' src/translator-runtime.js
if grep -Eq 'class="(cacheActions|launcherActions|settingsActions|clearLanguage|export|import|changeExecutable|save|reset)"' src/runtime-panel.js; then
  echo "Removed settings actions are still present in the panel" >&2
  exit 1
fi
grep -Fq 'makeTranslationCacheKey(source, language, provider)' src/translator-runtime.js

COUNT=$(wc -l < src/languages.txt | tr -d ' ')
if [[ "$COUNT" != "249" ]]; then
  echo "Language catalog is unexpectedly short: $COUNT" >&2
  exit 1
fi

echo "Source verification passed ($COUNT languages)"
