#!/bin/zsh
set -euo pipefail
ROOT="${0:A:h:h}"
cd "$ROOT"
mkdir -p "$ROOT/.build/python-cache"
PYTHONPYCACHEPREFIX="$ROOT/.build/python-cache" python3 -m py_compile \
  src/argos_service.py src/service_router.py
PYTHONPYCACHEPREFIX="$ROOT/.build/python-cache" python3 -m unittest discover \
  -s tests -p 'test_argos_service.py' -q
print -r -- "Service checks passed"
