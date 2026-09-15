"""Read-only OMORI localization asset decoding and extraction."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any


MAX_TEXT_CHARS = 120_000
OMORI_EXCLUDED_HERO_FILES = frozenset({"00_template.hero", "album_test.hero", "test.hero"})
OMORI_DATABASE_FIELDS = {
    "actors.kel": ("name", "nickname", "profile"),
    "armors.kel": ("name", "description"),
    "classes.kel": ("name",),
    "enemies.kel": ("name",),
    "items.kel": ("name", "description"),
    "skills.kel": ("name", "description", "message1", "message2"),
    "states.kel": ("name", "message1", "message2", "message3", "message4"),
    "weapons.kel": ("name", "description"),
}

_HERO_NON_TEXT_SECTIONS = frozenset({"inputkeystable", "inputicons", "inputnames"})
_HERO_RESOURCE_PARENTS = frozenset({"background", "character"})
_MESSAGE_REFERENCE = re.compile(r"^[A-Za-z0-9_.-]+\.message_\d+$", re.I)
_SCRIPT_VALUE = re.compile(r"^(?:this\.|\$game|function\b|return\b|(?:new\s+)?(?:window|scene|sprite)_)", re.I)

_AES_SBOX = bytes.fromhex(
    "637c777bf26b6fc53001672bfed7ab76ca82c97dfa5947f0add4a2af9ca472c0"
    "b7fd9326363ff7cc34a5e5f171d8311504c723c31896059a071280e2eb27b275"
    "09832c1a1b6e5aa0523bd6b329e32f8453d100ed20fcb15b6acbbe394a4c58cf"
    "d0efaafb434d338545f9027f503c9fa851a3408f929d38f5bcb6da2110fff3d2"
    "cd0c13ec5f974417c4a77e3d645d197360814fdc222a908846eeb814de5e0bdb"
    "e0323a0a4906245cc2d3ac629195e479e7c8376d8dd54ea96c56f4ea657aae08"
    "ba78252e1ca6b4c6e8dd741f4bbd8b8a703eb5664803f60e613557b986c11d9e"
    "e1f8981169d98e949b1e87e9ce5528df8ca1890dbfe6426841992d0fb054bb16"
)


def _round_keys(key: bytes) -> list[bytes]:
    words = [list(key[index:index + 4]) for index in range(0, len(key), 4)]
    rcon = 1
    while len(words) < 60:
        index = len(words)
        value = words[-1][:]
        if index % 8 == 0:
            value = value[1:] + value[:1]
            value = [_AES_SBOX[byte] for byte in value]
            value[0] ^= rcon
            rcon = ((rcon << 1) ^ (0x11B if rcon & 0x80 else 0)) & 0xFF
        elif index % 8 == 4:
            value = [_AES_SBOX[byte] for byte in value]
        words.append([words[index - 8][offset] ^ value[offset] for offset in range(4)])
    return [bytes(sum(words[index:index + 4], [])) for index in range(0, 60, 4)]


def _xtime(value: int) -> int:
    return ((value << 1) ^ (0x11B if value & 0x80 else 0)) & 0xFF


def _encrypt_block(block: bytes, round_keys: list[bytes]) -> bytes:
    state = [value ^ round_keys[0][index] for index, value in enumerate(block)]
    for round_index in range(1, 15):
        state = [_AES_SBOX[value] for value in state]
        shifted = state[:]
        for row in range(1, 4):
            values = [state[row + 4 * column] for column in range(4)]
            values = values[row:] + values[:row]
            for column, value in enumerate(values):
                shifted[row + 4 * column] = value
        state = shifted
        if round_index != 14:
            for column in range(4):
                offset = column * 4
                a0, a1, a2, a3 = state[offset:offset + 4]
                combined = a0 ^ a1 ^ a2 ^ a3
                state[offset] = a0 ^ combined ^ _xtime(a0 ^ a1)
                state[offset + 1] = a1 ^ combined ^ _xtime(a1 ^ a2)
                state[offset + 2] = a2 ^ combined ^ _xtime(a2 ^ a3)
                state[offset + 3] = a3 ^ combined ^ _xtime(a3 ^ a0)
        state = [value ^ round_keys[round_index][index] for index, value in enumerate(state)]
    return bytes(state)


def decrypt_omori_data(data: bytes) -> bytes:
    if len(data) < 16:
        raise ValueError("OMORI asset is shorter than its AES counter")
    key = b"6bdb2e585882fbd48826ef9cffd4c511"
    try:
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
        decryptor = Cipher(algorithms.AES(key), modes.CTR(data[:16])).decryptor()
        return decryptor.update(data[16:]) + decryptor.finalize()
    except ImportError:
        pass
    counter = int.from_bytes(data[:16], "big")
    round_keys = _round_keys(key)
    output = bytearray()
    for offset in range(16, len(data), 16):
        chunk = data[offset:offset + 16]
        stream = _encrypt_block(counter.to_bytes(16, "big"), round_keys)
        output.extend(value ^ stream[index] for index, value in enumerate(chunk))
        counter = (counter + 1) & ((1 << 128) - 1)
    return bytes(output)


def _quoted_values(value: str) -> list[str]:
    values = []
    index = 0
    while index < len(value):
        quote = value[index]
        if quote not in {"'", '"'} or (index and value[index - 1] not in " \t[,{:"):
            index += 1
            continue
        index += 1
        decoded = []
        while index < len(value):
            character = value[index]
            if quote == "'" and character == "'" and index + 1 < len(value) and value[index + 1] == "'":
                decoded.append("'")
                index += 2
            elif character == quote:
                index += 1
                values.append("".join(decoded))
                break
            elif quote == '"' and character == "\\" and index + 1 < len(value):
                replacement = {"n": "\n", "r": "\r", "t": "\t", '"': '"', "\\": "\\"}.get(value[index + 1])
                if replacement is None:
                    decoded.extend((character, value[index + 1]))
                else:
                    decoded.append(replacement)
                index += 2
            else:
                decoded.append(character)
                index += 1
    return values


def _scalar_values(value: str) -> list[str]:
    quoted = _quoted_values(value)
    if quoted:
        return quoted
    value = value.split(" #", 1)[0].strip()
    if value.startswith("[") and value.endswith("]"):
        return [part.strip() for part in value[1:-1].split(",")]
    return [] if not value or value.startswith(("{", "[")) else [value]


def _block_scalar(lines: list[str], index: int, base_indent: int, marker: str) -> tuple[str, int]:
    block = []
    cursor = index + 1
    while cursor < len(lines):
        line = lines[cursor]
        if line.strip() and len(line) - len(line.lstrip()) <= base_indent:
            break
        block.append(line)
        cursor += 1
    indent = min((len(line) - len(line.lstrip()) for line in block if line.strip()), default=base_indent + 2)
    normalized = [line[indent:] if line.strip() else "" for line in block]
    if marker[0] == ">":
        folded: list[str] = []
        for line in normalized:
            if folded and line and folded[-1]:
                folded[-1] += " " + line
            else:
                folded.append(line)
        text = "\n".join(folded)
    else:
        text = "\n".join(normalized)
    text = text.rstrip("\n")
    if text and marker[1:2] != "-":
        text += "\n"
    return text, cursor


def _explicit_speaker(text: str) -> dict[str, str] | None:
    matches = list(re.finditer(r"\\n<([^>\r\n]{1,120})>|\\>([^:\r\n]{1,120}):\s*\\<", text, re.I))
    if not matches:
        return None
    name = (matches[-1].group(1) or matches[-1].group(2) or "").strip()
    if not name or name == "???":
        return None
    speaker_id = re.sub(r"[^a-z0-9]+", "-", name.casefold()).strip("-") or "named-speaker"
    return {"id": speaker_id[:80], "sourceName": name[:120], "evidence": "source-name"}


def _localizable_hero_scalar(path: tuple[str, ...], key: str, value: str) -> bool:
    candidate = value.strip()
    lowered_path = {part.casefold() for part in path}
    if not candidate or len(candidate) > MAX_TEXT_CHARS or sum(char.isalpha() for char in candidate) < 2:
        return False
    if candidate.casefold() in {"null", "true", "false"} or key.casefold() in {"faceset", "source"}:
        return False
    if lowered_path & _HERO_NON_TEXT_SECTIONS:
        return False
    if len(path) > 1 and path[-2].casefold() in _HERO_RESOURCE_PARENTS and key.casefold() == "name":
        return False
    if _MESSAGE_REFERENCE.fullmatch(candidate) or _SCRIPT_VALUE.match(candidate):
        return False
    return True


def _hero_scalar_records(path: Path, text: str) -> list[dict[str, Any]]:
    """Read localizable YAML scalars without interpreting OMORI control codes."""
    lines = text.splitlines()
    records: list[dict[str, Any]] = []
    stack: list[tuple[int, str]] = []
    section = ""
    section_metadata: dict[str, dict[str, Any]] = {}
    index = 0
    while index < len(lines):
        line = lines[index]
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            index += 1
            continue
        indent = len(line) - len(line.lstrip())
        match = re.match(r"^(\s*)([^:#][^:]{0,200}):\s*(.*)$", line)
        if not match:
            sequence = re.match(r"^(\s*)-\s+(.*)$", line)
            if sequence:
                yaml_path = tuple(part for _, part in stack) + ("[]",)
                for value_index, value in enumerate(_scalar_values(sequence.group(2).strip())):
                    value = value.replace("\r", "")
                    if _localizable_hero_scalar(yaml_path, "[]", value):
                        records.append({
                            "source": value,
                            "kind": "ui",
                            "asset": path.name,
                            "messageId": section[:160],
                            "field": "[]",
                            "yamlPath": list(yaml_path),
                            "line": index,
                            "valueIndex": value_index,
                        })
            index += 1
            continue
        key = match.group(2).strip().strip("'\"")
        raw_value = match.group(3).strip()
        while stack and stack[-1][0] >= indent:
            stack.pop()
        yaml_path = tuple(part for _, part in stack) + (key,)
        if indent == 0:
            section = key
        metadata = section_metadata.setdefault(section, {})
        if key.casefold() == "faceset":
            values = _scalar_values(raw_value)
            if values:
                metadata["faceset"] = values[0]
        elif key.casefold() == "faceindex":
            try:
                metadata["faceindex"] = int(raw_value.split(" #", 1)[0].strip())
            except ValueError:
                pass

        next_index = index + 1
        values: list[str] = []
        if stripped.startswith("- {") or raw_value.startswith("{"):
            # Flow mappings frequently contain resource names and multiple
            # structural fields. Their visible wording is extracted from the
            # canonical scalar fields elsewhere, never from the whole mapping.
            values = []
        elif re.fullmatch(r"[>|][+-]?", raw_value):
            block_value, next_index = _block_scalar(lines, index, indent, raw_value)
            values = [block_value]
        elif raw_value:
            values = _scalar_values(raw_value)
        else:
            stack.append((indent, key))

        for value_index, value in enumerate(values):
            value = value.replace("\r", "")
            if not _localizable_hero_scalar(yaml_path, key, value):
                continue
            kind = "dialogue" if key.casefold() == "text" and "message" in section.casefold() else \
                "lore" if path.name.casefold() == "bestiary.hero" else "ui"
            record: dict[str, Any] = {
                "source": value,
                "kind": kind,
                "asset": path.name,
                "messageId": section[:160],
                "field": key[:160],
                "yamlPath": list(yaml_path),
                "line": index,
                "valueIndex": value_index,
            }
            if metadata.get("faceset"):
                record["portrait"] = {
                    "faceset": metadata["faceset"],
                    "faceindex": metadata.get("faceindex"),
                }
            speaker = _explicit_speaker(value)
            if speaker:
                record["speaker"] = speaker
            records.append(record)
        index = next_index
    return records


def extract_records_from_hero(path: Path) -> list[dict[str, Any]]:
    if path.name.casefold() in OMORI_EXCLUDED_HERO_FILES:
        return []
    text = decrypt_omori_data(path.read_bytes()).decode("utf-8", errors="strict").replace("\r", "")
    return _hero_scalar_records(path, text)


def apply_message_speaker_context(records: list[dict[str, Any]]) -> None:
    portrait_speakers: dict[tuple[str, int | None], dict[str, str] | None] = {}
    for record in records:
        portrait = record.get("portrait")
        speaker = record.get("speaker")
        if not isinstance(portrait, dict) or not isinstance(speaker, dict):
            continue
        key = (str(portrait.get("faceset", "")), portrait.get("faceindex"))
        current = portrait_speakers.get(key)
        if key not in portrait_speakers:
            portrait_speakers[key] = speaker
        elif current and current.get("id") != speaker.get("id"):
            portrait_speakers[key] = None
    for record in records:
        if "speaker" not in record:
            portrait = record.get("portrait")
            key = (str(portrait.get("faceset", "")), portrait.get("faceindex")) if isinstance(portrait, dict) else None
            inferred = portrait_speakers.get(key) if key else None
            if inferred:
                record["speaker"] = {**inferred, "evidence": "portrait-inference"}
            else:
                name = "NARRATOR" if record.get("kind") == "dialogue" else "SYSTEM"
                record["speaker"] = {"id": name.casefold(), "sourceName": name, "evidence": "fallback"}


def _kel_record(source: str, pointer: list[str | int], kind: str, **context: Any) -> dict[str, Any]:
    return {
        "source": source.replace("\r", ""),
        "kind": kind,
        "pointer": pointer,
        "context": context,
    }


def _nested_kel_records(value: Any, pointer: list[str | int], kind: str) -> list[dict[str, Any]]:
    if isinstance(value, str):
        return [_kel_record(value, pointer, kind)] if value.strip() else []
    if isinstance(value, list):
        return [record for index, item in enumerate(value) for record in _nested_kel_records(item, pointer + [index], kind)]
    if isinstance(value, dict):
        return [record for key, item in value.items() for record in _nested_kel_records(item, pointer + [str(key)], kind)]
    return []


def extract_records_from_kel(path: Path) -> list[dict[str, Any]]:
    data = json.loads(decrypt_omori_data(path.read_bytes()).decode("utf-8", errors="strict"))
    name = path.name.casefold()
    records: list[dict[str, Any]] = []
    if name == "system.kel":
        if not isinstance(data, dict):
            raise ValueError("OMORI System.KEL must contain an object")
        for key in ("terms", "currencyUnit", "gameTitle", "armorTypes", "equipTypes", "skillTypes", "weaponTypes"):
            records.extend(_nested_kel_records(data.get(key), [key], "system"))
    elif name in OMORI_DATABASE_FIELDS and isinstance(data, list):
        fields = OMORI_DATABASE_FIELDS[name]
        for index, item in enumerate(data):
            if isinstance(item, dict):
                for field in fields:
                    value = item.get(field)
                    if isinstance(value, str) and value.strip():
                        records.append(_kel_record(value, [index, field], "database", field=field, databaseId=item.get("id", index)))

    if isinstance(data, dict) and isinstance(data.get("displayName"), str) and data["displayName"].strip():
        records.append(_kel_record(data["displayName"], ["displayName"], "map-name"))

    def visit(value: Any, pointer: list[str | int]) -> None:
        if isinstance(value, dict):
            code = value.get("code")
            parameters = value.get("parameters")
            if isinstance(code, int) and isinstance(parameters, list):
                if code in {401, 405} and parameters and isinstance(parameters[0], str) and parameters[0].strip():
                    records.append(_kel_record(parameters[0], pointer + ["parameters", 0], "event-dialogue", eventCode=code))
                elif code == 102 and parameters and isinstance(parameters[0], list):
                    for choice_index, choice in enumerate(parameters[0]):
                        if isinstance(choice, str) and choice.strip():
                            records.append(_kel_record(choice, pointer + ["parameters", 0, choice_index], "choice", eventCode=code))
                elif code == 402 and len(parameters) > 1 and isinstance(parameters[1], str) and parameters[1].strip():
                    records.append(_kel_record(parameters[1], pointer + ["parameters", 1], "choice-branch", eventCode=code))
            for key, item in value.items():
                visit(item, pointer + [str(key)])
        elif isinstance(value, list):
            for index, item in enumerate(value):
                visit(item, pointer + [index])

    if name == "commonevents.kel" or name == "troops.kel" or name.startswith("map"):
        visit(data, [])
    return [record for record in records if 0 < len(record["source"]) <= MAX_TEXT_CHARS]


def extract_strings_from_kel(path: Path) -> list[str]:
    """Compatibility helper for callers that only need the extracted wording."""
    return [record["source"] for record in extract_records_from_kel(path)]
