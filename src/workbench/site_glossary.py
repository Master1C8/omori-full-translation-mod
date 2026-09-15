from __future__ import annotations

import hashlib
import json
import re
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


SITE_BASE_URL = "https://vnrevival.fun"
MAX_GLOSSARY_BYTES = 4 * 1024 * 1024


class SiteGlossaryError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


def _identifier(value: Any, field: str) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,79}", value.strip()):
        raise SiteGlossaryError("invalid_glossary_identity", f"{field} is invalid")
    return value.strip()


def _normalize_entry(value: Any) -> dict[str, str]:
    if not isinstance(value, dict) or not isinstance(value.get("translation"), dict):
        raise SiteGlossaryError("glossary_translation_missing", "VN Revival has no complete glossary translation for this language", 409)
    required = {
        "id": value.get("id"),
        "priority": value.get("priority"),
        "source": value.get("term"),
        "sourceMeaning": value.get("meaning"),
        "target": value["translation"].get("term"),
        "targetMeaning": value["translation"].get("meaning"),
    }
    if not all(isinstance(item, str) and item.strip() for item in required.values()):
        raise SiteGlossaryError("glossary_entry_invalid", "VN Revival returned an incomplete glossary entry", 502)
    if required["priority"] not in {"P0", "P1", "P2"}:
        raise SiteGlossaryError("glossary_entry_invalid", "VN Revival returned an invalid glossary priority", 502)
    result = {key: item.strip() for key, item in required.items()}
    category = value.get("category")
    if isinstance(category, str) and category.strip():
        result["category"] = category.strip()
    return result


def normalize_site_glossary(payload: Any, *, game_slug: str, locale: str, source_url: str) -> dict[str, Any]:
    if not isinstance(payload, dict) or not isinstance(payload.get("entries"), list) or not isinstance(payload.get("total"), int):
        raise SiteGlossaryError("glossary_response_invalid", "VN Revival returned an invalid glossary response", 502)
    entries = [_normalize_entry(value) for value in payload["entries"]]
    if not entries or payload["total"] != len(entries):
        raise SiteGlossaryError("glossary_incomplete", "VN Revival did not return the complete glossary", 502)
    ids = [entry["id"] for entry in entries]
    if len(ids) != len(set(ids)):
        raise SiteGlossaryError("glossary_response_invalid", "VN Revival returned duplicate glossary IDs", 502)
    canonical = json.dumps(entries, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return {
        "source": "vn-revival",
        "gameSlug": game_slug,
        "locale": locale,
        "sourceURL": source_url,
        "fingerprint": hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
        "total": len(entries),
        "entries": entries,
    }


def fetch_site_glossary(game_slug: Any, locale: Any, *, base_url: str = SITE_BASE_URL) -> dict[str, Any]:
    slug = _identifier(game_slug, "gameSlug").lower()
    language = _identifier(locale, "targetLanguage")
    parsed = urllib.parse.urlsplit(base_url.rstrip("/"))
    if parsed.scheme != "https" or not parsed.hostname or parsed.query or parsed.fragment or parsed.username or parsed.password:
        raise SiteGlossaryError("invalid_site_url", "VN Revival glossary source must use HTTPS")
    query = urllib.parse.urlencode({"locale": language, "offset": 0, "limit": 1000})
    url = f"{base_url.rstrip('/')}/games/{urllib.parse.quote(slug)}/glossary?{query}"
    request = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "VNRevival-Localization-Workbench/1"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read(MAX_GLOSSARY_BYTES + 1)
    except urllib.error.HTTPError as error:
        if error.code == 404:
            raise SiteGlossaryError("site_game_not_found", "This game or its published glossary was not found on VN Revival", 404) from error
        raise SiteGlossaryError("glossary_site_failed", f"VN Revival returned HTTP {error.code}", 502) from error
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise SiteGlossaryError("glossary_site_unavailable", "Could not reach VN Revival to synchronize the glossary", 503) from error
    if len(raw) > MAX_GLOSSARY_BYTES:
        raise SiteGlossaryError("glossary_response_too_large", "VN Revival glossary response is too large", 502)
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeError, json.JSONDecodeError) as error:
        raise SiteGlossaryError("glossary_response_invalid", "VN Revival returned invalid glossary JSON", 502) from error
    return normalize_site_glossary(payload, game_slug=slug, locale=language, source_url=url)
