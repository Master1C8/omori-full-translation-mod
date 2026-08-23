#!/usr/bin/env python3
"""Render a small build template from KEY/value argument pairs."""

from __future__ import annotations

import re
import sys
from html import escape as xml_escape
from pathlib import Path


def c_escape(value: str) -> str:
    return (value.replace("\\", "\\\\").replace('"', '\\"')
            .replace("\r", "\\r").replace("\n", "\\n").replace("\t", "\\t"))


def main() -> int:
    if len(sys.argv) < 5 or (len(sys.argv) - 3) % 2:
        print("Usage: render-template.py <input> <output> <KEY> <value> [...]", file=sys.stderr)
        return 2
    source = Path(sys.argv[1]).read_text(encoding="utf-8")
    for index in range(3, len(sys.argv), 2):
        key, value = sys.argv[index], sys.argv[index + 1]
        source = source.replace(f"__{key}_XML__", xml_escape(value, quote=True))
        source = source.replace(f"__{key}_C__", c_escape(value))
        source = source.replace(f"__{key}__", value)
    unresolved = sorted(set(re.findall(r"__[A-Z][A-Z0-9_]*__", source)))
    if unresolved:
        print(f"Unresolved template fields: {', '.join(unresolved)}", file=sys.stderr)
        return 1
    Path(sys.argv[2]).write_text(source, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
