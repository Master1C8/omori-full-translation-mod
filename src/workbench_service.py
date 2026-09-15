#!/usr/bin/env python3
"""Standalone local UI and API for producing editor-reviewed game localizations."""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import re
import secrets
import sys
import threading
import urllib.parse
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from workbench import WorkbenchError, WorkbenchStore
from workbench.openai_provider import OpenAICompatibleProvider, OpenAIError
from workbench.site_glossary import fetch_site_glossary, SiteGlossaryError


MAX_BODY_BYTES = 32 * 1024 * 1024
STATIC_ROOT = Path(__file__).resolve().with_name("workbench_ui")


class WorkbenchHandler(BaseHTTPRequestHandler):
    server_version = "VNRevivalLocalizationWorkbench/1"

    @property
    def store(self) -> WorkbenchStore:
        return self.server.store

    @property
    def provider(self) -> OpenAICompatibleProvider:
        return self.server.provider

    def log_message(self, fmt: str, *args: Any) -> None:
        return

    def _json(self, value: Any, status: int = 200) -> None:
        data = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)

    def _error(self, error: Exception) -> None:
        if isinstance(error, (WorkbenchError, OpenAIError, SiteGlossaryError)):
            payload = {"ok": False, "error": error.code, "message": str(error)}
            if isinstance(error, WorkbenchError):
                payload.update(error.details)
            self._json(payload, error.status)
        else:
            self._json({"ok": False, "error": "internal_error", "message": str(error)}, 500)

    def _authorized(self) -> bool:
        return secrets.compare_digest(self.headers.get("X-Workbench-Token", ""), self.server.auth_token)

    def _require_auth(self) -> None:
        if not self._authorized():
            raise WorkbenchError("unauthorized", "The local workbench token is missing", 401)

    def _body(self) -> dict[str, Any]:
        raw = self.headers.get("Content-Length", "0")
        if not raw.isdigit() or not 0 < int(raw) <= MAX_BODY_BYTES:
            raise WorkbenchError("invalid_request", "Request body size is invalid", 413)
        try:
            value = json.loads(self.rfile.read(int(raw)).decode("utf-8"))
        except (UnicodeError, json.JSONDecodeError) as error:
            raise WorkbenchError("invalid_json", "Request body must be a JSON object") from error
        if not isinstance(value, dict):
            raise WorkbenchError("invalid_json", "Request body must be a JSON object")
        return value

    @staticmethod
    def _parts(path: str) -> list[str]:
        return [urllib.parse.unquote(value) for value in urllib.parse.urlsplit(path).path.strip("/").split("/") if value]

    def _serve_static(self, path: str) -> None:
        requested = urllib.parse.urlsplit(path).path
        name = "index.html" if requested in {"", "/"} else requested.lstrip("/")
        candidate = (STATIC_ROOT / name).resolve()
        if candidate.parent != STATIC_ROOT.resolve() or not candidate.is_file():
            self.send_error(404)
            return
        data = candidate.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(candidate.name)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        try:
            parts = self._parts(self.path)
            if not parts or parts[0] != "api":
                self._serve_static(self.path)
                return
            self._require_auth()
            query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
            if parts == ["api", "state"]:
                self._json({"ok": True, "adapters": self.store.adapters(), "projects": self.store.list_projects()})
                return
            if len(parts) == 3 and parts[:2] == ["api", "projects"]:
                self._json({"ok": True, "project": self.store.get_project(parts[2])})
                return
            if len(parts) == 4 and parts[:2] == ["api", "projects"] and parts[3] == "entries":
                result = self.store.entries(
                    parts[2], state=query.get("state", [""])[0], query=query.get("q", [""])[0],
                    offset=int(query.get("offset", [0])[0]), limit=int(query.get("limit", [100])[0]),
                )
                self._json({"ok": True, **result})
                return
            if len(parts) == 4 and parts[:2] == ["api", "projects"] and parts[3] == "review-bundle":
                self._download_json(self.store.review_bundle(parts[2]), f"{parts[2]}-editorial-review.json")
                return
            if len(parts) == 5 and parts[:2] == ["api", "projects"] and parts[3] == "artifacts":
                self._download_file(self.store.artifact_path(parts[2], parts[4]))
                return
            raise WorkbenchError("not_found", "Unknown endpoint", 404)
        except Exception as error:
            self._error(error)

    def do_POST(self) -> None:
        try:
            self._require_auth()
            parts = self._parts(self.path)
            body = self._body()
            if parts == ["api", "projects"]:
                glossary = fetch_site_glossary(body.get("gameSlug"), body.get("targetLanguage"))
                project = self.store.create_project(body)
                project = self.store.apply_site_glossary(project["id"], glossary)
                self._json({"ok": True, "project": project}, 201)
                return
            if parts == ["api", "openai", "key"]:
                self._json({"ok": True, **self.provider.save_key(body.get("baseURL"), body.get("apiKey"))})
                return
            if parts == ["api", "openai", "status"]:
                self._json({"ok": True, **self.provider.status(body.get("baseURL"))})
                return
            if len(parts) == 4 and parts[:2] == ["api", "projects"]:
                project_id, action = parts[2], parts[3]
                if action == "extract":
                    self._json({"ok": True, "summary": self.store.extract(project_id)})
                    return
                if action == "sync-glossary":
                    project = self.store.get_project(project_id)
                    glossary = fetch_site_glossary(project["gameSlug"], project["targetLanguage"])
                    self._json({"ok": True, "summary": self.store.apply_site_glossary(project_id, glossary)})
                    return
                if action == "draft":
                    project, entries = self.store.draft_candidates(project_id, int(body.get("limit", 40)))
                    if not entries:
                        raise WorkbenchError("no_draft_candidates", "There are no untranslated or rejected entries", 409)
                    translations, metadata = self.provider.draft(project, entries, base_url=body.get("baseURL"), model=body.get("model"))
                    self._json({"ok": True, **self.store.apply_drafts(project_id, translations, metadata)})
                    return
                if action == "import-review":
                    self._json({"ok": True, **self.store.import_review_bundle(project_id, body.get("bundle"))})
                    return
                if action == "build":
                    self._json({"ok": True, "artifact": self.store.build(project_id)})
                    return
            raise WorkbenchError("not_found", "Unknown endpoint", 404)
        except Exception as error:
            self._error(error)

    def do_PATCH(self) -> None:
        try:
            self._require_auth()
            parts = self._parts(self.path)
            body = self._body()
            if len(parts) == 5 and parts[:2] == ["api", "projects"] and parts[3] == "entries":
                entry = self.store.save_review(parts[2], parts[4], body.get("final"), body.get("reviewed") is True)
                self._json({"ok": True, "entry": entry})
                return
            raise WorkbenchError("not_found", "Unknown endpoint", 404)
        except Exception as error:
            self._error(error)

    def _download_json(self, value: Any, name: str) -> None:
        data = (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Disposition", f'attachment; filename="{name}"')
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _download_file(self, path: Path) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "application/zip" if path.suffix == ".zip" else "application/octet-stream")
        self.send_header("Content-Disposition", f'attachment; filename="{path.name}"')
        self.send_header("Content-Length", str(path.stat().st_size))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        with path.open("rb") as source:
            while chunk := source.read(1024 * 1024):
                self.wfile.write(chunk)


class WorkbenchServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address: tuple[str, int], data_dir: Path, auth_token: str):
        super().__init__(address, WorkbenchHandler)
        self.auth_token = auth_token
        self.store = WorkbenchStore(data_dir)
        self.provider = OpenAICompatibleProvider(data_dir / "openai-usage.jsonl")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="VN Revival Localization Workbench")
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument("--token", default="")
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--no-open", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    token = args.token if len(args.token) >= 16 else secrets.token_urlsafe(32)
    server = WorkbenchServer(("127.0.0.1", args.port), args.data_dir, token)
    url = f"http://127.0.0.1:{server.server_port}/#token={urllib.parse.quote(token)}"
    print(url, flush=True)
    if not args.no_open:
        threading.Timer(0.25, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever(poll_interval=0.25)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
