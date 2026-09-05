#!/usr/bin/env python3
"""Generate the native Windows launcher game table from canonical manifests."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


def _load_catalog(script_dir: Path, path: Path) -> list[dict]:
    spec = importlib.util.spec_from_file_location("vnrevival_game_catalog", script_dir / "game-catalog.py")
    if spec is None or spec.loader is None:
        raise RuntimeError("catalog loader is unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.load_catalog(path)


def c_escape(value: str) -> str:
    return (value.replace("\\", "\\\\").replace('"', '\\"')
            .replace("\r", "\\r").replace("\n", "\\n").replace("\t", "\\t"))


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: generate-windows-game-catalog.py <catalog.json> <output.h>", file=sys.stderr)
        return 2
    script_dir = Path(__file__).resolve().parent
    games = _load_catalog(script_dir, Path(sys.argv[1]))
    rows = []
    for game in games:
        label = game["title"] + (" — Prototype" if game["releaseStatus"] == "prototype" else "")
        wide_values = [
            game["id"], game["title"], label, game["windowsExecutable"],
            game["dataDirectory"].replace("/", "\\"),
        ]
        narrow_values = [
            game["debugTargetTitleContains"], game["debugTargetUrlContains"],
            f'{game["id"]}-translator.bundle.js',
        ]
        rows.append(
            "    {" + ", ".join(f'L"{c_escape(value)}"' for value in wide_values)
            + ", " + ", ".join(f'"{c_escape(value)}"' for value in narrow_values)
            + f', {game["steamAppId"]}UL' + "},"
        )
    output = (
        "/* Generated from src/games/catalog.json; do not edit. */\n"
        "static const GameDefinition GAME_CATALOG[] = {\n"
        + "\n".join(rows)
        + "\n};\n"
        "#define GAME_CATALOG_COUNT (sizeof(GAME_CATALOG) / sizeof(GAME_CATALOG[0]))\n"
    )
    Path(sys.argv[2]).write_text(output, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
