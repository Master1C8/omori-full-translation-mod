#!/bin/zsh
set -euo pipefail
ROOT="${0:A:h:h}"
exec "$ROOT/scripts/test-workbench.sh"
