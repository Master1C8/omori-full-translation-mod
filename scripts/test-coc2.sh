#!/bin/zsh
set -euo pipefail
ROOT="${0:A:h:h}"
cd "$ROOT"

VNREVIVAL_GAME=coc2 node --test --test-reporter=dot \
  tests/translation-core.test.js tests/providers.test.js tests/runtime-ui.test.js \
  tests/runtime-progress.test.js tests/runtime-panel.test.js tests/multi-game.test.js \
  src/games/coc2/tests/adapter.test.js
python3 scripts/game-manifest.py src/games/coc2/game.json >/dev/null
VNREVIVAL_GAME=coc2 ./scripts/build-game-bundle.sh .build/coc2/translator.bundle.js >/dev/null
node --check .build/coc2/game-config.js
node --check src/games/coc2/adapter.js
node --check src/translator-runtime.js
PYTHONPYCACHEPREFIX="$ROOT/.build/python-cache" python3 -m unittest discover -s tests -p 'test_local_service.py' -q
if VNREVIVAL_GAME=coc2 ./scripts/build.sh >/dev/null 2>&1; then
  print -u2 -r -- "Prototype target unexpectedly produced a release build"
  exit 1
fi
print -r -- "CoC2 realtime prototype checks passed"
