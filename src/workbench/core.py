from __future__ import annotations

import hashlib
import json
import os
import re
import threading
import time
import uuid
from pathlib import Path
from typing import Any

from .adapters import AdapterError, adapter_catalog, get_adapter
from .integrity import preserves_protected_tokens


PROJECT_SCHEMA = 1
ENTRY_STATES = frozenset({"new", "draft", "needs-review", "reviewed"})
MAX_PROJECT_BYTES = 128 * 1024 * 1024


class WorkbenchError(Exception):
    def __init__(self, code: str, message: str, status: int = 400, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.code = code
        self.status = status
        self.details = dict(details or {})


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _clean_text(value: Any, field: str, maximum: int, *, required: bool = True) -> str:
    if not isinstance(value, str):
        raise WorkbenchError("invalid_project", f"{field} must be text")
    result = value.strip()
    if (required and not result) or len(result) > maximum or any(ord(char) < 32 and char not in "\n\t" for char in result):
        raise WorkbenchError("invalid_project", f"{field} is invalid")
    return result


def _entry_id(adapter_id: str, locator: Any, source: str) -> str:
    identity = locator if locator not in (None, {}, []) else {"source": source}
    payload = json.dumps([adapter_id, identity], ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:24]


class WorkbenchStore:
    """Durable projects with a strict draft/final editorial boundary."""

    def __init__(self, data_dir: Path):
        self.data_dir = data_dir.expanduser().resolve()
        self.projects_dir = self.data_dir / "projects"
        self.artifacts_dir = self.data_dir / "artifacts"
        self.projects_dir.mkdir(parents=True, exist_ok=True)
        self.artifacts_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()

    @staticmethod
    def adapters() -> list[dict[str, Any]]:
        return adapter_catalog()

    def _project_path(self, project_id: str) -> Path:
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,79}", project_id or ""):
            raise WorkbenchError("invalid_project_id", "Project ID is invalid")
        return self.projects_dir / project_id / "project.json"

    @staticmethod
    def _summary(project: dict[str, Any]) -> dict[str, Any]:
        counts = {state: 0 for state in ENTRY_STATES}
        for entry in project.get("entries", []):
            counts[entry.get("state", "new")] = counts.get(entry.get("state", "new"), 0) + 1
        total = len(project.get("entries", []))
        glossary = project.get("glossary", {})
        glossary = glossary if isinstance(glossary, dict) else {}
        glossary_ready = bool(glossary.get("entries"))
        return {
            key: project[key]
            for key in ("id", "title", "gameSlug", "adapter", "sourceLanguage", "targetLanguage", "targetLanguageName", "createdAt", "updatedAt")
        } | {
            "counts": counts,
            "total": total,
            "glossaryReady": glossary_ready,
            "glossaryCount": len(glossary.get("entries", [])),
            "readyToBuild": glossary_ready and total > 0 and counts.get("reviewed", 0) == total,
        }

    def list_projects(self) -> list[dict[str, Any]]:
        projects = []
        for path in self.projects_dir.glob("*/project.json"):
            try:
                projects.append(self._summary(self._read(path)))
            except (OSError, UnicodeError, json.JSONDecodeError, WorkbenchError):
                continue
        return sorted(projects, key=lambda value: value["updatedAt"], reverse=True)

    def create_project(self, payload: dict[str, Any]) -> dict[str, Any]:
        adapter_id = _clean_text(payload.get("adapter", "portable-json"), "adapter", 80)
        try:
            adapter = get_adapter(adapter_id)
        except AdapterError as error:
            raise WorkbenchError(error.code, str(error), error.status) from error
        title = _clean_text(payload.get("title"), "title", 160)
        game_slug = _clean_text(payload.get("gameSlug"), "gameSlug", 80).lower()
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,79}", game_slug):
            raise WorkbenchError("invalid_game_slug", "gameSlug must match the published VN Revival game slug")
        source_language = _clean_text(payload.get("sourceLanguage", "en"), "sourceLanguage", 24)
        target_language = _clean_text(payload.get("targetLanguage"), "targetLanguage", 24)
        target_name = _clean_text(payload.get("targetLanguageName", target_language), "targetLanguageName", 100)
        requested_id = payload.get("id")
        if requested_id:
            project_id = _clean_text(requested_id, "id", 80).lower()
            if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,79}", project_id):
                raise WorkbenchError("invalid_project_id", "Project ID must use lowercase letters, digits, and hyphens")
        else:
            slug = re.sub(r"[^a-z0-9]+", "-", title.casefold()).strip("-")[:48] or "localization"
            project_id = f"{slug}-{uuid.uuid4().hex[:8]}"
        path = self._project_path(project_id)
        if path.exists():
            raise WorkbenchError("project_exists", "A project with this ID already exists", 409)
        source_path = _clean_text(payload.get("sourcePath", ""), "sourcePath", 4096, required=False)
        configuration = payload.get("configuration", {})
        if not isinstance(configuration, dict):
            raise WorkbenchError("invalid_project", "configuration must be an object")
        profile = payload.get("profile", {})
        if not isinstance(profile, dict):
            raise WorkbenchError("invalid_project", "profile must be an object")
        now = _now()
        project = {
            "schemaVersion": PROJECT_SCHEMA,
            "id": project_id,
            "title": title,
            "gameSlug": game_slug,
            "adapter": adapter.id,
            "sourceLanguage": source_language,
            "targetLanguage": target_language,
            "targetLanguageName": target_name,
            "sourcePath": source_path,
            "configuration": configuration,
            "profile": self._normalize_profile(profile),
            "glossary": {},
            "createdAt": now,
            "updatedAt": now,
            "entries": [],
            "builds": [],
        }
        with self._lock:
            self._write(path, project)
        return self._summary(project)

    @staticmethod
    def _normalize_profile(value: dict[str, Any]) -> dict[str, Any]:
        style = value.get("style", [])
        if not isinstance(style, list) or not all(isinstance(item, str) and item.strip() for item in style):
            raise WorkbenchError("invalid_profile", "profile.style must contain non-empty strings")
        if value.get("glossary") not in (None, []):
            raise WorkbenchError("local_glossary_forbidden", "Glossaries must be synchronized from VN Revival")
        return {"style": [item.strip() for item in style]}

    def apply_site_glossary(self, project_id: str, glossary: Any) -> dict[str, Any]:
        if not isinstance(glossary, dict) or glossary.get("source") != "vn-revival" or not isinstance(glossary.get("entries"), list):
            raise WorkbenchError("invalid_site_glossary", "Glossary data must come from VN Revival")
        with self._lock:
            project = self._load(project_id)
            if glossary.get("gameSlug") != project["gameSlug"] or glossary.get("locale") != project["targetLanguage"]:
                raise WorkbenchError("glossary_project_mismatch", "The VN Revival glossary belongs to another game or language", 409)
            if glossary.get("total") != len(glossary["entries"]) or not glossary["entries"]:
                raise WorkbenchError("glossary_incomplete", "The VN Revival glossary is incomplete", 409)
            project["glossary"] = {**glossary, "syncedAt": _now()}
            project["updatedAt"] = _now()
            self._write(self._project_path(project_id), project)
            return self._summary(project)

    @staticmethod
    def _require_glossary(project: dict[str, Any]) -> None:
        glossary = project.get("glossary", {})
        glossary = glossary if isinstance(glossary, dict) else {}
        entries = glossary.get("entries", [])
        if glossary.get("source") != "vn-revival" or glossary.get("gameSlug") != project.get("gameSlug") \
                or glossary.get("locale") != project.get("targetLanguage") or not entries \
                or glossary.get("total") != len(entries):
            raise WorkbenchError("glossary_required", "Synchronize the complete game glossary from VN Revival first", 409)

    def get_project(self, project_id: str, *, include_entries: bool = False) -> dict[str, Any]:
        project = self._load(project_id)
        result = dict(project) if include_entries else {key: value for key, value in project.items() if key != "entries"}
        result["summary"] = self._summary(project)
        return result

    def extract(self, project_id: str) -> dict[str, Any]:
        with self._lock:
            project = self._load(project_id)
            try:
                records = get_adapter(project["adapter"]).extract(project)
            except AdapterError as error:
                raise WorkbenchError(error.code, str(error), error.status, error.details) from error
            previous = {entry["id"]: entry for entry in project["entries"]}
            entries = []
            seen = set()
            for raw in records:
                source = raw.get("source") if isinstance(raw, dict) else None
                if not isinstance(source, str) or not source.strip():
                    continue
                source = source.replace("\r", "")
                locator = raw.get("locator", {})
                entry_id = raw.get("id") if isinstance(raw.get("id"), str) else _entry_id(project["adapter"], locator, source)
                if not re.fullmatch(r"[A-Za-z0-9._:-]{1,160}", entry_id) or entry_id in seen:
                    entry_id = _entry_id(project["adapter"], [locator, source, len(entries)], source)
                seen.add(entry_id)
                old = previous.get(entry_id)
                unchanged = old is not None and old.get("source") == source
                entry = {
                    "id": entry_id,
                    "source": source,
                    "context": raw.get("context", {}) if isinstance(raw.get("context", {}), dict) else {},
                    "locator": locator,
                    "draft": old.get("draft", "") if unchanged else "",
                    "final": old.get("final", "") if unchanged else "",
                    "state": old.get("state", "new") if unchanged else "new",
                    "issues": old.get("issues", []) if unchanged else [],
                    "draftMeta": old.get("draftMeta") if unchanged else None,
                    "updatedAt": old.get("updatedAt", _now()) if unchanged else _now(),
                }
                entries.append(entry)
            project["entries"] = entries
            project["updatedAt"] = _now()
            self._write(self._project_path(project_id), project)
            return self._summary(project)

    def entries(self, project_id: str, *, state: str = "", query: str = "", offset: int = 0, limit: int = 100) -> dict[str, Any]:
        project = self._load(project_id)
        values = project["entries"]
        if state:
            if state not in ENTRY_STATES:
                raise WorkbenchError("invalid_state", "Unknown entry state")
            values = [entry for entry in values if entry["state"] == state]
        if query:
            needle = query.casefold()
            values = [entry for entry in values if needle in entry["source"].casefold() or needle in entry.get("draft", "").casefold() or needle in entry.get("final", "").casefold()]
        offset = max(0, int(offset))
        limit = min(500, max(1, int(limit)))
        return {"total": len(values), "offset": offset, "limit": limit, "entries": values[offset:offset + limit]}

    def save_review(self, project_id: str, entry_id: str, final: Any, reviewed: bool) -> dict[str, Any]:
        final_text = _clean_text(final, "final", 120_000)
        with self._lock:
            project = self._load(project_id)
            entry = next((item for item in project["entries"] if item["id"] == entry_id), None)
            if entry is None:
                raise WorkbenchError("entry_not_found", "Entry was not found", 404)
            if not preserves_protected_tokens(entry["source"], final_text):
                raise WorkbenchError("protected_tokens_changed", "Final text must preserve every placeholder and control code in source order", 422)
            entry["final"] = final_text
            entry["state"] = "reviewed" if reviewed else "needs-review"
            entry["updatedAt"] = _now()
            project["updatedAt"] = _now()
            self._write(self._project_path(project_id), project)
            return entry

    def draft_candidates(self, project_id: str, limit: int) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        project = self._load(project_id)
        self._require_glossary(project)
        candidates = [entry for entry in project["entries"] if entry["state"] in {"new", "needs-review"}]
        return project, candidates[:min(50, max(1, limit))]

    def apply_drafts(self, project_id: str, translations: dict[str, str], metadata: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            project = self._load(project_id)
            changed = 0
            for entry in project["entries"]:
                value = translations.get(entry["id"])
                if entry["state"] not in {"new", "needs-review"} or not isinstance(value, str) or not value.strip():
                    continue
                entry["draft"] = value.strip()
                entry["final"] = ""
                entry["state"] = "draft"
                entry["draftMeta"] = metadata
                entry["updatedAt"] = _now()
                changed += 1
            project["updatedAt"] = _now()
            self._write(self._project_path(project_id), project)
            return {"updated": changed, "summary": self._summary(project)}

    def review_bundle(self, project_id: str) -> dict[str, Any]:
        project = self._load(project_id)
        return {
            "schemaVersion": 1,
            "kind": "vn-revival-editorial-review",
            "project": {key: project[key] for key in ("id", "title", "gameSlug", "sourceLanguage", "targetLanguage", "targetLanguageName", "profile", "glossary")},
            "instructions": "Edit final directly, set reviewed=true only after editorial review. Do not change id or source.",
            "entries": [{
                "id": entry["id"], "source": entry["source"], "context": entry["context"],
                "draft": entry["draft"], "final": entry["final"] or entry["draft"],
                "reviewed": entry["state"] == "reviewed", "issues": entry["issues"],
            } for entry in project["entries"]],
        }

    def import_review_bundle(self, project_id: str, bundle: Any) -> dict[str, Any]:
        if not isinstance(bundle, dict) or bundle.get("kind") != "vn-revival-editorial-review" or not isinstance(bundle.get("entries"), list):
            raise WorkbenchError("invalid_review_bundle", "This is not a workbench review bundle")
        identity = bundle.get("project", {})
        if not isinstance(identity, dict) or identity.get("id") != project_id:
            raise WorkbenchError("review_project_mismatch", "The review bundle belongs to another project", 409)
        with self._lock:
            project = self._load(project_id)
            bundled_glossary = identity.get("glossary", {})
            if not isinstance(bundled_glossary, dict) or bundled_glossary.get("fingerprint") != project.get("glossary", {}).get("fingerprint"):
                raise WorkbenchError("review_glossary_changed", "The VN Revival glossary changed after this review bundle was exported", 409)
            current = {entry["id"]: entry for entry in project["entries"]}
            changed = 0
            for reviewed in bundle["entries"]:
                if not isinstance(reviewed, dict):
                    continue
                entry = current.get(reviewed.get("id"))
                if entry is None or reviewed.get("source") != entry["source"]:
                    raise WorkbenchError("review_source_changed", "Review bundle source identities no longer match", 409)
                final = reviewed.get("final")
                if not isinstance(final, str) or not final.strip():
                    continue
                if not preserves_protected_tokens(entry["source"], final):
                    raise WorkbenchError("protected_tokens_changed", f"Final text for {entry['id']} changed a placeholder or control code", 422)
                entry["final"] = final.strip()
                entry["state"] = "reviewed" if reviewed.get("reviewed") is True else "needs-review"
                entry["issues"] = reviewed.get("issues", []) if isinstance(reviewed.get("issues", []), list) else []
                entry["updatedAt"] = _now()
                changed += 1
            project["updatedAt"] = _now()
            self._write(self._project_path(project_id), project)
            return {"updated": changed, "summary": self._summary(project)}

    def build(self, project_id: str) -> dict[str, Any]:
        with self._lock:
            project = self._load(project_id)
            self._require_glossary(project)
            incomplete = [entry["id"] for entry in project["entries"] if entry["state"] != "reviewed" or not entry["final"]]
            if not project["entries"] or incomplete:
                raise WorkbenchError("editorial_review_incomplete", "Every entry must have an editor-approved final translation before build", 409, {"remaining": len(incomplete)})
            invalid = [entry["id"] for entry in project["entries"] if not preserves_protected_tokens(entry["source"], entry["final"])]
            if invalid:
                raise WorkbenchError("protected_tokens_changed", "Reviewed text changed placeholders or control codes", 422, {"invalid": len(invalid)})
            destination = self.artifacts_dir / project_id
            destination.mkdir(parents=True, exist_ok=True)
            try:
                artifact = get_adapter(project["adapter"]).build(project, destination)
            except AdapterError as error:
                raise WorkbenchError(error.code, str(error), error.status, error.details) from error
            record = {"createdAt": _now(), **artifact}
            project["builds"] = (project.get("builds", []) + [record])[-20:]
            project["updatedAt"] = _now()
            self._write(self._project_path(project_id), project)
            return record

    def artifact_path(self, project_id: str, name: str) -> Path:
        if Path(name).name != name:
            raise WorkbenchError("invalid_artifact", "Artifact name is invalid")
        project = self._load(project_id)
        if not any(record.get("name") == name for record in project.get("builds", [])):
            raise WorkbenchError("artifact_not_found", "Artifact was not found", 404)
        path = (self.artifacts_dir / project_id / name).resolve()
        if not path.is_file() or path.parent != (self.artifacts_dir / project_id).resolve():
            raise WorkbenchError("artifact_not_found", "Artifact was not found", 404)
        return path

    def _load(self, project_id: str) -> dict[str, Any]:
        path = self._project_path(project_id)
        if not path.is_file():
            raise WorkbenchError("project_not_found", "Project was not found", 404)
        return self._read(path)

    @staticmethod
    def _read(path: Path) -> dict[str, Any]:
        if path.stat().st_size > MAX_PROJECT_BYTES:
            raise WorkbenchError("project_too_large", "Project data is too large", 507)
        value = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(value, dict) or value.get("schemaVersion") != PROJECT_SCHEMA or not isinstance(value.get("entries"), list):
            raise WorkbenchError("project_corrupt", "Project data is invalid", 500)
        return value

    @staticmethod
    def _write(path: Path, value: dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(f".{path.name}.{os.getpid()}.{threading.get_ident()}.tmp")
        encoded = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
        if len(encoded.encode("utf-8")) > MAX_PROJECT_BYTES:
            raise WorkbenchError("project_too_large", "Project data is too large", 507)
        try:
            temporary.write_text(encoded, encoding="utf-8")
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)
