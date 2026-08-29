#!/bin/zsh
set -euo pipefail
ROOT="${0:A:h:h}"
cd "$ROOT"

NODE_TESTS=(
  tests/translation-core.test.js
  tests/providers.test.js
  tests/runtime-ui.test.js
  tests/runtime-progress.test.js
  tests/runtime-panel.test.js
  tests/game-adapter.test.js
  src/games/omori/tests/*.test.js(N)
)
VNREVIVAL_GAME=omori node --test --test-reporter=dot "${NODE_TESTS[@]}"
for SOURCE in \
  src/translation-core.js src/providers.js src/runtime-ui.js \
  src/runtime-progress.js src/runtime-panel.js src/translator-runtime.js \
  src/games/omori/adapter.js; do
  node --check "$SOURCE"
done
print -r -- "Runtime checks passed"
