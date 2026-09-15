from __future__ import annotations

import hashlib
import json
import re
import zipfile
from pathlib import Path
from typing import Any, Protocol


_OMORI_CONTEXT_PRIORITY = {
    "dialogue": 0,
    "event-dialogue": 1,
    "choice": 2,
    "choice-branch": 3,
    "lore": 4,
    "database": 5,
    "map-name": 6,
    "ui": 7,
    "system": 8,
}


class AdapterError(Exception):
    def __init__(self, code: str, message: str, status: int = 400, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.code = code
        self.status = status
        self.details = dict(details or {})


class LocalizationAdapter(Protocol):
    id: str
    title: str
    description: str

    def extract(self, project: dict[str, Any]) -> list[dict[str, Any]]: ...
    def build(self, project: dict[str, Any], destination: Path) -> dict[str, Any]: ...


def _source_path(project: dict[str, Any]) -> Path:
    raw = project.get("sourcePath")
    if not isinstance(raw, str) or not raw.strip():
        raise AdapterError("source_path_missing", "Choose a source file or game directory first")
    return Path(raw).expanduser().resolve()


def _json_pointer(parts: list[str | int]) -> str:
    return "/" + "/".join(str(value).replace("~", "~0").replace("/", "~1") for value in parts)


def _walk_json(value: Any, path: list[str | int], records: list[dict[str, Any]]) -> None:
    if isinstance(value, str) and value.strip() and any(char.isalpha() for char in value):
        records.append({
            "source": value,
            "locator": {"pointer": _json_pointer(path)},
            "context": {"kind": "text", "path": _json_pointer(path)},
        })
    elif isinstance(value, list):
        for index, item in enumerate(value):
            _walk_json(item, path + [index], records)
    elif isinstance(value, dict):
        for key, item in value.items():
            _walk_json(item, path + [str(key)], records)


def _set_pointer(document: Any, pointer: str, value: str) -> None:
    parts = [] if pointer == "" else pointer.lstrip("/").split("/")
    decoded = [part.replace("~1", "/").replace("~0", "~") for part in parts]
    current = document
    for part in decoded[:-1]:
        current = current[int(part)] if isinstance(current, list) else current[part]
    if not decoded:
        raise AdapterError("root_string_unsupported", "A JSON document whose root is a string is not supported")
    tail = decoded[-1]
    if isinstance(current, list):
        current[int(tail)] = value
    else:
        current[tail] = value


def _get_pointer(document: Any, pointer: str) -> Any:
    parts = [] if pointer == "" else pointer.lstrip("/").split("/")
    current = document
    for raw in parts:
        part = raw.replace("~1", "/").replace("~0", "~")
        current = current[int(part)] if isinstance(current, list) else current[part]
    return current


class JsonTreeAdapter:
    id = "json-tree"
    title = "JSON tree"
    description = "Extract every human-readable JSON string and rebuild the translated JSON tree."

    def extract(self, project: dict[str, Any]) -> list[dict[str, Any]]:
        source = _source_path(project)
        if not source.is_file() or source.suffix.casefold() != ".json":
            raise AdapterError("json_source_missing", "JSON tree projects require an existing .json source file", 404)
        try:
            document = json.loads(source.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as error:
            raise AdapterError("json_source_invalid", "The source JSON file could not be read", 422) from error
        records: list[dict[str, Any]] = []
        _walk_json(document, [], records)
        if not records:
            raise AdapterError("source_empty", "No human-readable strings were found", 422)
        return records

    def build(self, project: dict[str, Any], destination: Path) -> dict[str, Any]:
        source = _source_path(project)
        document = json.loads(source.read_text(encoding="utf-8"))
        for entry in project["entries"]:
            pointer = entry.get("locator", {}).get("pointer")
            if not isinstance(pointer, str):
                raise AdapterError("locator_invalid", f"Entry {entry['id']} has no JSON pointer", 500)
            _set_pointer(document, pointer, entry["final"])
        name = f"{project['id']}-{project['targetLanguage']}.json"
        output = destination / name
        output.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return {"name": name, "path": str(output), "format": "json-tree", "bytes": output.stat().st_size}


class PortableJsonAdapter:
    id = "portable-json"
    title = "Portable localization source"
    description = "Use a game adapter's portable source catalog and produce a reviewed translation catalog."

    def extract(self, project: dict[str, Any]) -> list[dict[str, Any]]:
        source = _source_path(project)
        try:
            payload = json.loads(source.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as error:
            raise AdapterError("portable_source_invalid", "The portable source catalog could not be read", 422) from error
        if not isinstance(payload, dict) or payload.get("schemaVersion") != 1 or not isinstance(payload.get("entries"), list):
            raise AdapterError("portable_source_invalid", "Expected a schemaVersion 1 catalog with an entries array", 422)
        records = []
        for item in payload["entries"]:
            if not isinstance(item, dict) or not isinstance(item.get("source"), str):
                continue
            records.append({
                "id": item.get("id"),
                "source": item["source"],
                "context": item.get("context", {}),
                "locator": item.get("locator", {"externalId": item.get("id")}),
            })
        if not records:
            raise AdapterError("source_empty", "The portable catalog has no source entries", 422)
        return records

    def build(self, project: dict[str, Any], destination: Path) -> dict[str, Any]:
        name = f"{project['id']}-{project['targetLanguage']}.localization.json"
        output = destination / name
        payload = {
            "schemaVersion": 1,
            "kind": "vn-revival-reviewed-localization",
            "project": {
                key: project[key]
                for key in ("id", "title", "adapter", "sourceLanguage", "targetLanguage", "targetLanguageName")
            } | {"gameSlug": project["gameSlug"], "glossaryFingerprint": project["glossary"]["fingerprint"]},
            "entries": [{
                "id": entry["id"], "source": entry["source"], "translation": entry["final"],
                "context": entry["context"], "locator": entry["locator"], "reviewed": True,
            } for entry in project["entries"]],
        }
        output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return {"name": name, "path": str(output), "format": "portable-json", "bytes": output.stat().st_size}


def _omori_root(path: Path) -> Path:
    candidates = [path, path.parent] if path.is_file() else [path]
    candidates.extend([
        path / "Contents/Resources/app.nw",
        path / "OMORI.app/Contents/Resources/app.nw",
        path / "www",
    ])
    for candidate in candidates:
        if (candidate / "languages/en").is_dir() and (candidate / "data").is_dir():
            return candidate.resolve()
    raise AdapterError("omori_source_missing", "Could not find OMORI languages/en and data directories", 404)


def _yaml_quote(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def _decode_quoted(value: str) -> str | None:
    try:
        if value.startswith('"'):
            return json.loads(value)
        if value.startswith("'"):
            return value[1:-1].replace("''", "'")
    except (ValueError, json.JSONDecodeError):
        return None
    return None


_QUOTED_YAML = re.compile(r'''"(?:\\.|[^"\\])*"|'(?:''|[^'])*' ''', re.X)


def _replace_yaml_scalars(
    text: str,
    translations: dict[str, str],
    target_sources: dict[int, set[str]] | None = None,
) -> str:
    """Replace exact YAML scalar values while preserving keys and non-text data."""
    lines = text.replace("\r", "").splitlines()
    output: list[str] = []
    index = 0
    while index < len(lines):
        line = lines[index]
        block = re.match(r"^(\s*[^#][^:]*:\s*)[>|][+-]?\s*(?:#.*)?$", line)
        if block:
            base_indent = len(line) - len(line.lstrip())
            cursor = index + 1
            raw_block = []
            while cursor < len(lines):
                candidate = lines[cursor]
                if candidate.strip() and len(candidate) - len(candidate.lstrip()) <= base_indent:
                    break
                raw_block.append(candidate)
                cursor += 1
            if raw_block:
                content_indent = min((len(value) - len(value.lstrip()) for value in raw_block if value.strip()), default=base_indent + 2)
                literal = "\n".join(value[content_indent:] if value.strip() else "" for value in raw_block).strip("\n")
                folded = " ".join(part.strip() for part in raw_block if part.strip())
                allowed = target_sources.get(index, set()) if target_sources is not None else None
                matched_source = next((candidate for candidate in (literal, folded)
                                       if (allowed is None or candidate in allowed) and candidate in translations), None)
                replacement = translations.get(matched_source) if matched_source is not None else None
                if replacement == matched_source:
                    output.extend(lines[index:cursor])
                    index = cursor
                    continue
                if replacement:
                    output.append(block.group(1) + "|-")
                    indent = " " * max(base_indent + 2, content_indent)
                    output.extend(indent + part for part in replacement.split("\n"))
                    index = cursor
                    continue

        def replace_quoted(match: re.Match[str]) -> str:
            decoded = _decode_quoted(match.group(0))
            allowed = target_sources.get(index, set()) if target_sources is not None else None
            replacement = translations.get(decoded) if decoded is not None and (allowed is None or decoded in allowed) else None
            if replacement == decoded:
                return match.group(0)
            return _yaml_quote(replacement) if replacement is not None else match.group(0)

        changed = _QUOTED_YAML.sub(replace_quoted, line)
        scalar = re.match(r"^(\s*[^#][^:]*:\s*)([^#\[{][^#]*?)(\s*(?:#.*)?)$", changed)
        if scalar:
            candidate = scalar.group(2).strip()
            allowed = target_sources.get(index, set()) if target_sources is not None else None
            replacement = translations.get(candidate) if allowed is None or candidate in allowed else None
            if replacement is not None and replacement != candidate:
                changed = scalar.group(1) + _yaml_quote(replacement) + scalar.group(3)
        output.append(changed)
        index += 1
    return "\n".join(output) + "\n"


def _replace_json_strings(value: Any, translations: dict[str, str]) -> Any:
    if isinstance(value, str):
        return translations.get(value, value)
    if isinstance(value, list):
        return [_replace_json_strings(item, translations) for item in value]
    if isinstance(value, dict):
        return {key: _replace_json_strings(item, translations) for key, item in value.items()}
    return value


class OmoriOneLoaderAdapter:
    id = "omori-oneloader"
    title = "OMORI / OneLoader"
    description = "Extract encrypted OMORI text assets and build a text-only static OneLoader localization mod."

    def extract(self, project: dict[str, Any]) -> list[dict[str, Any]]:
        from .omori_assets import (
            OMORI_EXCLUDED_HERO_FILES,
            apply_message_speaker_context,
            extract_records_from_hero,
            extract_records_from_kel,
        )

        root = _omori_root(_source_path(project))
        language_dir = root / "languages/en"
        records: list[dict[str, Any]] = []
        for path in sorted(language_dir.glob("*.HERO")):
            if path.name.casefold() in OMORI_EXCLUDED_HERO_FILES:
                continue
            for record in extract_records_from_hero(path):
                record["locator"] = {
                    "kind": "hero",
                    "file": path.name,
                    "line": record.get("line"),
                    "valueIndex": record.get("valueIndex", 0),
                    "source": record["source"],
                }
                record["context"] = {
                    "kind": record.get("kind", "dialogue"),
                    "asset": path.name,
                    "messageId": record.get("messageId", ""),
                    "field": record.get("field", "text"),
                    "path": record.get("yamlPath", []),
                    "portrait": record.get("portrait", {}),
                    "speaker": record.get("speaker", {}),
                }
                records.append(record)
        apply_message_speaker_context(records)
        for record in records:
            record["context"]["speaker"] = record.get("speaker", {})
        for path in sorted((root / "data").glob("*.KEL")):
            for record in extract_records_from_kel(path):
                records.append({
                    "source": record["source"],
                    "locator": {
                        "kind": "kel",
                        "file": path.name,
                        "pointer": _json_pointer(record["pointer"]),
                        "source": record["source"],
                    },
                    "context": {
                        "kind": record.get("kind", "system"),
                        "asset": path.name,
                        **record.get("context", {}),
                    },
                })
        # OMORI often reuses identical source strings. One editorial decision is
        # intentionally shared across those occurrences.
        grouped: dict[str, dict[str, Any]] = {}
        for record in records:
            source = record["source"]
            existing = grouped.get(source)
            occurrence = record["locator"]
            context = record.get("context", {})
            if existing:
                existing["locator"]["occurrences"].append(occurrence)
                primary = existing["context"]
                primary_key = (primary.get("kind"), primary.get("asset"), primary.get("messageId"), primary.get("field"))
                context_key = (context.get("kind"), context.get("asset"), context.get("messageId"), context.get("field"))
                if context_key != primary_key:
                    if _OMORI_CONTEXT_PRIORITY.get(context.get("kind"), 99) < _OMORI_CONTEXT_PRIORITY.get(primary.get("kind"), 99):
                        alternates = [primary] + primary.get("alternateContexts", [])
                        existing["context"] = {**context, "alternateContexts": alternates[:6]}
                    else:
                        alternates = primary.setdefault("alternateContexts", [])
                        if len(alternates) < 6 and context_key not in {
                            (item.get("kind"), item.get("asset"), item.get("messageId"), item.get("field"))
                            for item in alternates
                        }:
                            alternates.append(context)
            else:
                grouped[source] = {
                    "id": hashlib.sha256(("omori-source\0" + source).encode("utf-8")).hexdigest()[:24],
                    "source": source,
                    "locator": {"kind": "omori-source", "source": source, "occurrences": [occurrence]},
                    "context": context,
                }
        for entry in grouped.values():
            entry["context"]["occurrenceCount"] = len(entry["locator"]["occurrences"])
        if not grouped:
            raise AdapterError("source_empty", "No OMORI localization strings were found", 422)
        return list(grouped.values())

    def build(self, project: dict[str, Any], destination: Path) -> dict[str, Any]:
        from .omori_assets import decrypt_omori_data

        root = _omori_root(_source_path(project))
        translations = {entry["source"]: entry["final"] for entry in project["entries"]}
        safe_id = re.sub(r"[^a-z0-9-]+", "-", project["id"].casefold()).strip("-")
        name = f"{safe_id}-{project['targetLanguage']}-oneloader.zip"
        output = destination / name
        text_files: list[str] = []
        data_files: list[str] = []
        hero_targets: dict[str, dict[int, set[str]]] = {}
        kel_targets: dict[str, list[tuple[str, str, str]]] = {}
        for entry in project["entries"]:
            for occurrence in entry.get("locator", {}).get("occurrences", []):
                if occurrence.get("kind") == "hero" and isinstance(occurrence.get("line"), int):
                    lines = hero_targets.setdefault(occurrence["file"], {})
                    lines.setdefault(occurrence["line"], set()).add(entry["source"])
                elif occurrence.get("kind") == "kel" and isinstance(occurrence.get("pointer"), str):
                    kel_targets.setdefault(occurrence["file"], []).append(
                        (occurrence["pointer"], entry["source"], entry["final"])
                    )
        with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for filename, target_sources in sorted(hero_targets.items()):
                source = root / "languages/en" / filename
                decrypted = decrypt_omori_data(source.read_bytes()).decode("utf-8")
                translated = _replace_yaml_scalars(decrypted, translations, target_sources)
                filename = source.with_suffix(".yml").name
                text_files.append(filename)
                archive.writestr("text/" + filename, translated)
            for filename, replacements in sorted(kel_targets.items()):
                source = root / "data" / filename
                document = json.loads(decrypt_omori_data(source.read_bytes()).decode("utf-8"))
                for pointer, expected, translated in replacements:
                    current = _get_pointer(document, pointer)
                    if current != expected:
                        raise AdapterError("source_changed", f"OMORI source changed at {filename}{pointer}", 409)
                    _set_pointer(document, pointer, translated)
                filename = source.with_suffix(".json").name
                data_files.append(filename)
                archive.writestr("data/" + filename, json.dumps(document, ensure_ascii=False, separators=(",", ":")))
            manifest = {
                "$schema": "https://rph.space/oneloader.manifestv1.schema.json",
                "id": safe_id,
                "name": f"{project['title']} — {project['targetLanguageName']}",
                "description": "Editor-reviewed localization built with VN Revival Localization Workbench.",
                "manifestVersion": 1,
                "version": str(project.get("configuration", {}).get("version", "1.0.0")),
                "files": {"text": text_files, "data": data_files},
            }
            archive.writestr("mod.json", json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
            archive.writestr("LOCALIZATION.json", json.dumps({
                "schemaVersion": 1,
                "projectId": project["id"],
                "sourceLanguage": project["sourceLanguage"],
                "targetLanguage": project["targetLanguage"],
                "reviewedEntries": len(project["entries"]),
                "glossaryFingerprint": project["glossary"]["fingerprint"],
                "sourceFingerprint": hashlib.sha256("\0".join(sorted(translations)).encode("utf-8")).hexdigest(),
            }, ensure_ascii=False, indent=2) + "\n")
        return {"name": name, "path": str(output), "format": "omori-oneloader", "bytes": output.stat().st_size}


_ADAPTERS: dict[str, LocalizationAdapter] = {
    adapter.id: adapter for adapter in (PortableJsonAdapter(), JsonTreeAdapter(), OmoriOneLoaderAdapter())
}


def get_adapter(adapter_id: str) -> LocalizationAdapter:
    adapter = _ADAPTERS.get(adapter_id)
    if adapter is None:
        raise AdapterError("adapter_not_found", f"Unknown localization adapter: {adapter_id}", 404)
    return adapter


def adapter_catalog() -> list[dict[str, str]]:
    return [{"id": adapter.id, "title": adapter.title, "description": adapter.description} for adapter in _ADAPTERS.values()]
