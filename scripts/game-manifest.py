#!/usr/bin/env python3
"""Validate and read a VN Revival game adapter manifest."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path, PurePosixPath


REQUIRED = {
    "schemaVersion": int,
    "id": str,
    "title": str,
    "shortTitle": str,
    "translatorName": str,
    "sourceLanguage": str,
    "officialLocalizations": list,
    "supportedVersions": list,
    "launchStrategy": str,
    "debugTargetTitleContains": str,
    "debugTargetUrlContains": str,
    "storageNamespace": str,
    "cacheDatabase": str,
    "steamAppId": int,
    "windowsExecutable": str,
    "crossOverBottle": str,
    "crossOverGamePath": str,
    "dataDirectory": str,
    "bundleIdentifier": str,
    "iconPng": str,
    "iconIcns": str,
    "archivePrefix": str,
    "windowsDistributionName": str,
}

LEGACY_COMPATIBILITY_FIELDS = {
    "cacheFormats": list,
    "coreGlobal": str,
    "languagesGlobal": str,
    "translatorGlobal": str,
}


def load_manifest(path: Path) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("manifest root must be an object")
    for key, expected_type in REQUIRED.items():
        field = value.get(key)
        if not isinstance(field, expected_type) or isinstance(field, bool) or (isinstance(field, str) and not field.strip()):
            raise ValueError(f"invalid or missing field: {key}")
    if value["schemaVersion"] != 1:
        raise ValueError("unsupported schemaVersion")
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", value["id"]):
        raise ValueError("id must use lowercase ASCII letters, digits, and hyphens")
    if value["sourceLanguage"] != "en":
        raise ValueError("sourceLanguage must be en in contract version 1")
    official_localizations = value["officialLocalizations"]
    if not official_localizations or not all(
        isinstance(item, str) and re.fullmatch(r"[a-z]{2}(?:-[A-Z]{2})?", item)
        for item in official_localizations
    ) or len(set(official_localizations)) != len(official_localizations):
        raise ValueError("officialLocalizations must contain unique language codes")
    if value["sourceLanguage"] not in official_localizations:
        raise ValueError("officialLocalizations must include sourceLanguage")
    if value["launchStrategy"] != "electron-cdp":
        raise ValueError("unsupported launchStrategy")
    if value["steamAppId"] <= 0:
        raise ValueError("steamAppId must be positive")
    if not all(isinstance(item, str) and item for item in value["supportedVersions"]):
        raise ValueError("supportedVersions must contain non-empty strings")
    for key, field in value.items():
        if isinstance(field, str) and (any(ord(char) < 32 for char in field) or "\x7f" in field):
            raise ValueError(f"control character in field: {key}")
    if not re.fullmatch(r"[^/\\]+\.exe", value["windowsExecutable"], re.IGNORECASE):
        raise ValueError("windowsExecutable must be an .exe filename, not a path")
    for key in ("crossOverGamePath", "dataDirectory"):
        candidate = PurePosixPath(value[key])
        if candidate.is_absolute() or ".." in candidate.parts or "\\" in value[key]:
            raise ValueError(f"{key} must be a safe relative POSIX path")
    for key, suffix in (("iconPng", ".png"), ("iconIcns", ".icns")):
        candidate = PurePosixPath(value[key])
        if candidate.is_absolute() or ".." in candidate.parts or "\\" in value[key] or candidate.suffix.lower() != suffix:
            raise ValueError(f"{key} must be a safe relative {suffix} path")
    if "/" in value["crossOverBottle"] or "\\" in value["crossOverBottle"]:
        raise ValueError("crossOverBottle must be a bottle name")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9.-]+", value["bundleIdentifier"]):
        raise ValueError("invalid bundleIdentifier")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", value["archivePrefix"]):
        raise ValueError("archivePrefix must be filename-safe")
    if any(char in value["windowsDistributionName"] for char in "/\\"):
        raise ValueError("windowsDistributionName must not contain path separators")
    if any(char in value["translatorName"] for char in "/\\"):
        raise ValueError("translatorName must not contain path separators")
    if not value["debugTargetTitleContains"] and not value["debugTargetUrlContains"]:
        raise ValueError("at least one debugging target matcher is required")
    compatibility = value.get("legacyCompatibility")
    if compatibility is not None:
        if not isinstance(compatibility, dict) or set(compatibility) != set(LEGACY_COMPATIBILITY_FIELDS):
            raise ValueError("legacyCompatibility has an invalid shape")
        for key, expected_type in LEGACY_COMPATIBILITY_FIELDS.items():
            if not isinstance(compatibility[key], expected_type):
                raise ValueError(f"invalid legacyCompatibility field: {key}")
        if not compatibility["cacheFormats"] or not all(
            isinstance(item, str) and item and item != "vnrevival-translator-cache"
            for item in compatibility["cacheFormats"]
        ):
            raise ValueError("legacyCompatibility.cacheFormats must contain legacy format names")
        for key in ("coreGlobal", "languagesGlobal", "translatorGlobal"):
            if not re.fullmatch(r"[A-Za-z_$][A-Za-z0-9_$]*", compatibility[key]):
                raise ValueError(f"invalid JavaScript global name: {key}")
    return value


def main() -> int:
    if len(sys.argv) not in (2, 3):
        print("Usage: game-manifest.py <game.json> [field]", file=sys.stderr)
        return 2
    try:
        manifest = load_manifest(Path(sys.argv[1]))
        if len(sys.argv) == 3:
            field = sys.argv[2]
            if field not in manifest:
                raise ValueError(f"unknown field: {field}")
            value = manifest[field]
            print(json.dumps(value, ensure_ascii=False) if isinstance(value, (list, dict)) else value)
        else:
            print(json.dumps(manifest, ensure_ascii=False, sort_keys=True))
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"Invalid game manifest: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
