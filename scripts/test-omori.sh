#!/bin/zsh
set -euo pipefail
ROOT="${0:A:h:h}"
VNREVIVAL_GAME=omori exec "$ROOT/scripts/test.sh"
