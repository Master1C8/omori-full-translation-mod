"""Declarative POST routing for the local VN Revival service."""

from __future__ import annotations

from typing import Any


class ServiceRouteError(Exception):
    def __init__(self, code: str, message: str, status: int):
        super().__init__(message)
        self.code = code
        self.status = status


class LocalPostRouter:
    ROUTES = {
        "/v1/gemini/key": ("set_gemini_key", ("apiKey",)),
        "/v1/gemini/key/remove": ("remove_gemini_key", ()),
        "/v1/gemini/translate": ("gemini_translate", ("target", "targetName", "text")),
        "/v1/lmstudio/translate": ("lmstudio_translate", ("target", "targetName", "text", "model")),
        "/v1/openai-compatible/status": ("openai_compatible_status", ("preset", "baseURL")),
        "/v1/openai-compatible/key": ("set_openai_compatible_key", ("preset", "baseURL", "apiKey")),
        "/v1/openai-compatible/key/remove": ("remove_openai_compatible_key", ("preset", "baseURL")),
        "/v1/openai-compatible/translate": (
            "openai_compatible_translate", ("target", "targetName", "text", "model", "preset", "baseURL")
        ),
        "/v1/reset": ("reset_all_data", ("openAIBaseURLs",)),
        "/v1/launcher/reselect-executable": ("request_game_executable_change", ()),
    }
    CONFIRMATION_REQUIRED = frozenset({
        "/v1/gemini/key/remove",
        "/v1/openai-compatible/key/remove",
        "/v1/reset",
        "/v1/launcher/reselect-executable",
    })

    def __init__(self, bridge: Any):
        self.bridge = bridge

    def dispatch(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        if path == "/v1/log/activity":
            self.bridge.log_activity(
                payload.get("provider", "unknown"),
                payload.get("source", ""),
                payload.get("translation", ""),
                payload.get("cached", False),
            )
            return {"ok": True}
        if path == "/v1/log/translation":
            appended = self.bridge.log_translation(
                payload.get("provider", "unknown"),
                payload.get("language", ""),
                payload.get("source", ""),
                payload.get("translation", ""),
                payload.get("cached") is True,
            )
            return {"ok": True, "appended": appended}

        route = self.ROUTES.get(path)
        if route is None:
            raise ServiceRouteError("not_found", "Unknown endpoint", 404)
        if path in self.CONFIRMATION_REQUIRED and payload.get("accepted") is not True:
            raise ServiceRouteError("confirmation_required", "Explicit confirmation is required", 400)
        method_name, fields = route
        method = getattr(self.bridge, method_name)
        return method(*(payload.get(field) for field in fields))
