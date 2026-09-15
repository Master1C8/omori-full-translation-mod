from __future__ import annotations

import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest import mock

from workbench import WorkbenchError, WorkbenchStore
from workbench.adapters import OmoriOneLoaderAdapter, _replace_yaml_scalars
from workbench.omori_assets import (
    _encrypt_block,
    _round_keys,
    extract_records_from_hero,
    extract_records_from_kel,
)
from workbench.integrity import protected_tokens
from workbench.openai_provider import normalize_base_url, OpenAIError
from workbench.openai_provider import OpenAICompatibleProvider
from workbench.site_glossary import normalize_site_glossary, SiteGlossaryError


def _encrypt_omori_plaintext(plaintext: bytes) -> bytes:
    counter_bytes = bytes(16)
    counter = 0
    keys = _round_keys(b"6bdb2e585882fbd48826ef9cffd4c511")
    encrypted = bytearray(counter_bytes)
    for offset in range(0, len(plaintext), 16):
        chunk = plaintext[offset:offset + 16]
        stream = _encrypt_block(counter.to_bytes(16, "big"), keys)
        encrypted.extend(value ^ stream[index] for index, value in enumerate(chunk))
        counter += 1
    return bytes(encrypted)


class WorkbenchStoreTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.source = self.root / "source.json"
        self.source.write_text(json.dumps({"menu": {"start": "New Game"}, "lines": ["Hello, %1!"]}), encoding="utf-8")
        self.store = WorkbenchStore(self.root / "state")
        self.project = self.store.create_project({
            "title": "Example Russian",
            "gameSlug": "example-game",
            "adapter": "json-tree",
            "sourcePath": str(self.source),
            "sourceLanguage": "en",
            "targetLanguage": "ru",
            "targetLanguageName": "Russian",
            "profile": {"style": ["Keep menus concise"]},
        })
        self.store.apply_site_glossary(self.project["id"], {
            "source": "vn-revival", "gameSlug": "example-game", "locale": "ru",
            "sourceURL": "https://vnrevival.fun/games/example-game/glossary?locale=ru",
            "fingerprint": "a" * 64, "total": 1,
            "entries": [{"id": "new-game", "priority": "P0", "source": "New Game", "sourceMeaning": "Start command", "target": "Новая игра", "targetMeaning": "Команда запуска"}],
        })

    def tearDown(self):
        self.temporary.cleanup()

    def test_drafts_cannot_be_built_until_every_final_is_reviewed(self):
        summary = self.store.extract(self.project["id"])
        self.assertEqual(summary["total"], 2)
        entries = self.store.entries(self.project["id"])["entries"]
        translations = {entries[0]["id"]: "Новая игра", entries[1]["id"]: "Привет, %1!"}
        result = self.store.apply_drafts(self.project["id"], translations, {"provider": "test"})
        self.assertEqual(result["summary"]["counts"]["draft"], 2)
        with self.assertRaisesRegex(WorkbenchError, "editor-approved") as blocked:
            self.store.build(self.project["id"])
        self.assertEqual(blocked.exception.code, "editorial_review_incomplete")
        for entry in self.store.entries(self.project["id"])["entries"]:
            self.store.save_review(self.project["id"], entry["id"], translations[entry["id"]], True)
        artifact = self.store.build(self.project["id"])
        localized = json.loads(Path(artifact["path"]).read_text(encoding="utf-8"))
        self.assertEqual(localized, {"menu": {"start": "Новая игра"}, "lines": ["Привет, %1!"]})

    def test_reextract_preserves_unchanged_editorial_work_and_resets_changed_source(self):
        self.store.extract(self.project["id"])
        entries = self.store.entries(self.project["id"])["entries"]
        first = next(entry for entry in entries if entry["source"] == "New Game")
        self.store.save_review(self.project["id"], first["id"], "Новая игра", True)
        self.source.write_text(json.dumps({"menu": {"start": "Begin Game"}, "lines": ["Hello, %1!"]}), encoding="utf-8")
        summary = self.store.extract(self.project["id"])
        self.assertEqual(summary["counts"]["reviewed"], 0)
        changed = next(entry for entry in self.store.entries(self.project["id"])["entries"] if entry["source"] == "Begin Game")
        self.assertEqual(changed["state"], "new")
        self.assertEqual(changed["final"], "")

    def test_editorial_bundle_rejects_source_identity_changes(self):
        self.store.extract(self.project["id"])
        bundle = self.store.review_bundle(self.project["id"])
        bundle["entries"][0]["source"] = "tampered"
        with self.assertRaises(WorkbenchError) as blocked:
            self.store.import_review_bundle(self.project["id"], bundle)
        self.assertEqual(blocked.exception.code, "review_source_changed")

    def test_editorial_bundle_rejects_a_changed_site_glossary(self):
        self.store.extract(self.project["id"])
        bundle = self.store.review_bundle(self.project["id"])
        bundle["project"]["glossary"]["fingerprint"] = "b" * 64
        with self.assertRaises(WorkbenchError) as blocked:
            self.store.import_review_bundle(self.project["id"], bundle)
        self.assertEqual(blocked.exception.code, "review_glossary_changed")

    def test_editor_cannot_approve_a_lost_placeholder(self):
        self.store.extract(self.project["id"])
        entry = next(value for value in self.store.entries(self.project["id"])["entries"] if "%1" in value["source"])
        with self.assertRaises(WorkbenchError) as blocked:
            self.store.save_review(self.project["id"], entry["id"], "Привет!", True)
        self.assertEqual(blocked.exception.code, "protected_tokens_changed")

    def test_late_draft_result_cannot_overwrite_an_approved_final(self):
        self.store.extract(self.project["id"])
        entry = next(value for value in self.store.entries(self.project["id"])["entries"] if value["source"] == "New Game")
        self.store.save_review(self.project["id"], entry["id"], "Новая игра", True)
        result = self.store.apply_drafts(self.project["id"], {entry["id"]: "Начать игру"}, {"provider": "test"})
        self.assertEqual(result["updated"], 0)
        current = next(value for value in self.store.entries(self.project["id"])["entries"] if value["id"] == entry["id"])
        self.assertEqual((current["state"], current["final"]), ("reviewed", "Новая игра"))

    def test_drafting_and_build_are_blocked_without_the_site_glossary(self):
        project = self.store.create_project({
            "title": "Unsynchronized Russian", "gameSlug": "example-game",
            "adapter": "json-tree", "sourcePath": str(self.source),
            "sourceLanguage": "en", "targetLanguage": "ru", "targetLanguageName": "Russian",
        })
        self.store.extract(project["id"])
        with self.assertRaises(WorkbenchError) as draft_blocked:
            self.store.draft_candidates(project["id"], 10)
        self.assertEqual(draft_blocked.exception.code, "glossary_required")
        entries = self.store.entries(project["id"])["entries"]
        for entry in entries:
            final = "Новая игра" if entry["source"] == "New Game" else "Привет, %1!"
            self.store.save_review(project["id"], entry["id"], final, True)
        with self.assertRaises(WorkbenchError) as build_blocked:
            self.store.build(project["id"])
        self.assertEqual(build_blocked.exception.code, "glossary_required")


class AdapterAndProviderTests(unittest.TestCase):
    def test_opencode_go_requests_include_a_stable_session_header(self):
        response = mock.MagicMock()
        response.read.return_value = b'{"data": []}'
        response.__enter__.return_value = response
        with tempfile.TemporaryDirectory() as directory:
            provider = OpenAICompatibleProvider(Path(directory) / "usage.jsonl")
            with mock.patch("urllib.request.urlopen", return_value=response) as open_url:
                provider._request("https://opencode.ai/zen/go/v1", "/models", "secret-key", None, 15)
        request = open_url.call_args.args[0]
        headers = {key.casefold(): value for key, value in request.header_items()}
        self.assertEqual(headers["x-opencode-session"], provider.session_id)
        self.assertEqual(headers["authorization"], "Bearer secret-key")

    def test_only_batch_relevant_glossary_entries_are_selected(self):
        glossary = [
            {"source": "OMORI", "target": "ОМОРИ"},
            {"source": "FARAWAY TOWN", "target": "ДАЛЁКИЙ ГОРОДОК"},
        ]
        selected = OpenAICompatibleProvider._relevant_glossary(glossary, [{"source": "OMORI looks away."}])
        self.assertEqual(selected, [{"source": "OMORI", "target": "ОМОРИ"}])

    def test_site_glossary_requires_a_complete_target_layer(self):
        payload = {"total": 1, "entries": [{
            "id": "omori", "priority": "P0", "term": "OMORI", "meaning": "A character",
        }]}
        with self.assertRaises(SiteGlossaryError) as blocked:
            normalize_site_glossary(payload, game_slug="omori", locale="ru", source_url="https://vnrevival.fun/test")
        self.assertEqual(blocked.exception.code, "glossary_translation_missing")

    def test_site_glossary_gets_a_stable_fingerprint(self):
        payload = {"total": 1, "entries": [{
            "id": "omori", "priority": "P0", "term": "OMORI", "meaning": "A character",
            "translation": {"term": "ОМОРИ", "meaning": "Персонаж"},
        }]}
        first = normalize_site_glossary(payload, game_slug="omori", locale="ru", source_url="https://vnrevival.fun/test")
        second = normalize_site_glossary(payload, game_slug="omori", locale="ru", source_url="https://vnrevival.fun/test")
        self.assertEqual(first["fingerprint"], second["fingerprint"])

    def test_pure_python_aes_matches_the_aes_256_reference_vector(self):
        key = bytes.fromhex("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f")
        block = bytes.fromhex("00112233445566778899aabbccddeeff")
        self.assertEqual(
            _encrypt_block(block, _round_keys(key)).hex(),
            "8ea2b7ca516745bfeafc49904b496089",
        )

    def test_hero_extractor_advances_after_inline_and_block_text(self):
        plaintext = b'Message_1:\n  text: "Hello"\nMessage_2:\n  text: |-\n    Second line\n'
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "dialogue.HERO"
            path.write_bytes(_encrypt_omori_plaintext(plaintext))
            records = extract_records_from_hero(path)
        self.assertEqual([record["source"] for record in records], ["Hello", "Second line"])

    def test_hero_extractor_includes_visible_ui_fields_but_not_resource_names(self):
        plaintext = (
            b'Information:\n'
            b'  name: "FOREST BUNNY"\n'
            b'  help: "Choose a foe."\n'
            b'  background:\n'
            b'    name: battleback_vf_default\n'
            b'  faceset: MainCharacters_DreamWorld\n'
            b'  itemBuyingPromptMessage: faraway_shop.message_100\n'
        )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "Bestiary.HERO"
            path.write_bytes(_encrypt_omori_plaintext(plaintext))
            records = extract_records_from_hero(path)
        self.assertEqual([record["source"] for record in records], ["FOREST BUNNY", "Choose a foe."])
        self.assertEqual([record["line"] for record in records], [1, 2])

    def test_hero_extractor_skips_known_test_catalogs(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "ALBUM_test.HERO"
            path.write_bytes(_encrypt_omori_plaintext(b'Message_1:\n  text: "Debug text"\n'))
            self.assertEqual(extract_records_from_hero(path), [])

    def test_kel_extractor_finds_direct_event_text_choices_and_map_names(self):
        document = {
            "displayName": "NEIGHBOR'S ROOM",
            "events": [{"pages": [{"list": [
                {"code": 401, "parameters": ["A direct line."]},
                {"code": 102, "parameters": [["Yes", "No"], 0, 0, 2, 0]},
                {"code": 402, "parameters": [0, "Yes"]},
            ]}]}],
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "Map001.KEL"
            path.write_bytes(_encrypt_omori_plaintext(json.dumps(document).encode("utf-8")))
            records = extract_records_from_kel(path)
        self.assertEqual([record["source"] for record in records], ["NEIGHBOR'S ROOM", "A direct line.", "Yes", "No", "Yes"])
        self.assertEqual(records[1]["pointer"], ["events", 0, "pages", 0, "list", 0, "parameters", 0])

    def test_yaml_replacement_can_be_limited_to_extracted_lines(self):
        source = 'visible: "Same"\nresource: "Same"\n'
        result = _replace_yaml_scalars(source, {"Same": "То же"}, {0: {"Same"}})
        self.assertEqual(result, 'visible: "То же"\nresource: "Same"\n')

    def test_omori_adapter_builds_targeted_text_and_event_patches_only(self):
        hero = b'Message_1:\n  text: "Hello"\n'
        kel = {"events": [{"pages": [{"list": [
            {"code": 401, "parameters": ["Direct line"]},
            {"code": 102, "parameters": [["Yes", "No"], 0, 0, 2, 0]},
        ]}]}]}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "languages/en").mkdir(parents=True)
            (root / "data").mkdir()
            (root / "languages/en/dialogue.HERO").write_bytes(_encrypt_omori_plaintext(hero))
            (root / "data/Map001.KEL").write_bytes(_encrypt_omori_plaintext(json.dumps(kel).encode("utf-8")))
            project = {
                "id": "omori-test", "title": "OMORI test", "sourcePath": str(root),
                "sourceLanguage": "en", "targetLanguage": "ru", "targetLanguageName": "Russian",
                "configuration": {}, "glossary": {"fingerprint": "a" * 64},
            }
            adapter = OmoriOneLoaderAdapter()
            project["entries"] = adapter.extract(project)
            translations = {"Hello": "Привет", "Direct line": "Прямая реплика", "Yes": "Да", "No": "Нет"}
            for entry in project["entries"]:
                entry["final"] = translations[entry["source"]]
            destination = root / "artifact"
            destination.mkdir()
            artifact = adapter.build(project, destination)
            with zipfile.ZipFile(artifact["path"]) as archive:
                names = archive.namelist()
                localized_map = json.loads(archive.read("data/Map001.json"))
                manifest = json.loads(archive.read("mod.json"))
        commands = localized_map["events"][0]["pages"][0]["list"]
        self.assertEqual(commands[0]["parameters"][0], "Прямая реплика")
        self.assertEqual(commands[1]["parameters"][0], ["Да", "Нет"])
        self.assertEqual(manifest["files"], {"text": ["dialogue.yml"], "data": ["Map001.json"]})
        self.assertFalse(any(name.lower().endswith((".png", ".jpg", ".webp")) for name in names))

    def test_yaml_replacement_handles_quoted_plain_and_block_scalars(self):
        source = 'title: "New Game"\nplain: Cancel\nmessage:\n  text: >-\n    Hello from\n    the block\n'
        result = _replace_yaml_scalars(source, {
            "New Game": "Новая игра", "Cancel": "Отмена", "Hello from the block": "Привет из блока",
        })
        self.assertIn('title: "Новая игра"', result)
        self.assertIn('plain: "Отмена"', result)
        self.assertIn("text: |-\n    Привет из блока", result)

    def test_remote_http_endpoint_is_rejected_but_loopback_is_allowed(self):
        self.assertEqual(normalize_base_url("http://127.0.0.1:1234/v1/"), "http://127.0.0.1:1234/v1")
        with self.assertRaises(OpenAIError):
            normalize_base_url("http://example.com/v1")

    def test_protected_tokens_are_order_sensitive(self):
        source = r"Hello, %1! \n<HERO>"
        good = r"Привет, %1! \n<HERO>"
        bad = r"Привет! \n<HERO> %1"
        self.assertEqual(protected_tokens(source), protected_tokens(good))
        self.assertNotEqual(protected_tokens(source), protected_tokens(bad))


class UIRegressionTests(unittest.TestCase):
    def test_author_styles_cannot_override_the_hidden_attribute(self):
        stylesheet = (Path(__file__).parents[1] / "src/workbench_ui/styles.css").read_text(encoding="utf-8")
        compact = "".join(stylesheet.split())
        self.assertIn("[hidden]{display:none!important;}", compact)

    def test_static_assets_have_cache_busting_versions(self):
        document = (Path(__file__).parents[1] / "src/workbench_ui/index.html").read_text(encoding="utf-8")
        self.assertRegex(document, r'href="styles\.css\?v=[^"]+"')
        self.assertRegex(document, r'src="app\.js\?v=[^"]+"')

    def test_opencode_go_glm_53_is_the_default_draft_engine(self):
        document = (Path(__file__).parents[1] / "src/workbench_ui/index.html").read_text(encoding="utf-8")
        self.assertIn('id="base-url" value="https://opencode.ai/zen/go/v1"', document)
        self.assertIn('id="model" list="models" value="glm-5.3"', document)


if __name__ == "__main__":
    unittest.main()
