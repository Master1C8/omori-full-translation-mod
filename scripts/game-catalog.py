#!/usr/bin/env python3
"""Validate and read the ordered launcher game catalog."""

from __future__ import annotations

import importlib.util
import json
import re
import sys
from pathlib import Path


def _manifest_loader(scripts_dir: Path):
    spec = importlib.util.spec_from_file_location("vnrevival_game_manifest", scripts_dir / "game-manifest.py")
    if spec is None or spec.loader is None:
        raise ValueError("game manifest validator is unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.load_manifest


def load_catalog(path: Path) -> list[dict]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or payload.get("schemaVersion") != 1:
        raise ValueError("unsupported catalog schema")
    game_ids = payload.get("games")
    if (not isinstance(game_ids, list) or len(game_ids) < 2
            or len(set(game_ids)) != len(game_ids)
            or not all(isinstance(game_id, str) and re.fullmatch(r"[a-z0-9][a-z0-9-]*", game_id)
                       for game_id in game_ids)):
        raise ValueError("catalog must contain at least two unique game ids")
    load_manifest = _manifest_loader(path.parents[2] / "scripts")
    result = []
    for game_id in game_ids:
        manifest_path = path.parent / game_id / "game.json"
        manifest = load_manifest(manifest_path)
        if manifest["id"] != game_id:
            raise ValueError(f"catalog id does not match manifest: {game_id}")
        if not (manifest_path.parent / "adapter.js").is_file():
            raise ValueError(f"adapter is missing: {game_id}")
        result.append(manifest)
    return result


def main() -> int:
    if len(sys.argv) not in (2, 3):
        print("Usage: game-catalog.py <catalog.json> [list|json]", file=sys.stderr)
        return 2
    try:
        games = load_catalog(Path(sys.argv[1]))
        command = sys.argv[2] if len(sys.argv) == 3 else "json"
        if command == "list":
            print("\n".join(game["id"] for game in games))
        elif command == "json":
            print(json.dumps(games, ensure_ascii=False, sort_keys=True))
        else:
            raise ValueError("unknown command")
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"Invalid game catalog: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
