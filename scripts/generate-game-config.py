#!/usr/bin/env python3
"""Generate the browser-side immutable game config from game.json."""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path


def load_validator(path: Path):
    spec = importlib.util.spec_from_file_location("vnrevival_game_manifest", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load game manifest validator")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: generate-game-config.py <game.json> <output.js>", file=sys.stderr)
        return 2
    script_dir = Path(__file__).resolve().parent
    validator = load_validator(script_dir / "game-manifest.py")
    manifest = validator.load_manifest(Path(sys.argv[1]))
    runtime_fields = {
        key: manifest[key]
        for key in (
            "id", "title", "shortTitle", "translatorName", "sourceLanguage",
            "officialLocalizations", "supportedVersions", "storageNamespace", "cacheDatabase",
        )
    }
    if "legacyCompatibility" in manifest:
        runtime_fields["legacyCompatibility"] = manifest["legacyCompatibility"]
    payload = json.dumps(runtime_fields, ensure_ascii=True, separators=(",", ":"))
    source = f"""(function (root) {{
  \"use strict\";
  const config = {payload};
  function deepFreeze(value) {{
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }}
  root.VNRevivalGameConfig = deepFreeze(config);
}})(typeof globalThis !== \"undefined\" ? globalThis : this);
"""
    Path(sys.argv[2]).write_text(source, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
