from __future__ import annotations

import re


PROTECTED_TOKEN = re.compile(
    r"(?:\\[A-Za-z]+(?:\[[^\]\r\n]*\]|<[^>\r\n]*>)?|%(?:\d+|[sdif])|\{[^{}\r\n]+\}|<[^<>\r\n]+>)"
)


def protected_tokens(value: str) -> list[str]:
    return PROTECTED_TOKEN.findall(value)


def preserves_protected_tokens(source: str, translation: str) -> bool:
    """Require the same protected tokens in the same order."""
    return protected_tokens(source) == protected_tokens(translation)
