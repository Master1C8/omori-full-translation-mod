import sys
import tempfile
import unittest
import io
import json
import urllib.error
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

import local_service


class FakeCredentialStore:
    backend = "test credential vault"

    def __init__(self, value=None):
        self.value = value

    def get(self):
        return self.value

    def set(self, value):
        self.value = value

    def delete(self):
        self.value = None


class FakeHTTPResponse:
    def __init__(self, payload):
        self.payload = json.dumps(payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self, _limit=-1):
        return self.payload


class LocalServiceTests(unittest.TestCase):
    def test_post_router_rejects_removed_offline_engine_routes(self):
        router = local_service.LocalPostRouter(mock.Mock())
        for path in ("/v1/translate", "/v1/ctranslate2/translate", "/v1/models/install"):
            with self.assertRaises(local_service.ServiceRouteError) as caught:
                router.dispatch(path, {"target": "ru", "text": "Hello"})
            self.assertEqual(caught.exception.code, "not_found")

    def test_post_router_preserves_confirmation_and_log_semantics(self):
        bridge = mock.Mock()
        router = local_service.LocalPostRouter(bridge)
        with self.assertRaises(local_service.ServiceRouteError) as caught:
            router.dispatch("/v1/gemini/key/remove", {})
        self.assertEqual(caught.exception.code, "confirmation_required")
        bridge.remove_gemini_key.assert_not_called()

        bridge.remove_gemini_key.return_value = {"configured": False}
        self.assertEqual(
            router.dispatch("/v1/gemini/key/remove", {"accepted": True}),
            {"configured": False},
        )
        with self.assertRaises(local_service.ServiceRouteError) as caught:
            router.dispatch("/v1/reset", {"openAIBaseURLs": []})
        self.assertEqual(caught.exception.code, "confirmation_required")
        bridge.reset_all_data.assert_not_called()
        bridge.reset_all_data.return_value = {"factoryReset": True}
        self.assertEqual(
            router.dispatch("/v1/reset", {"accepted": True, "openAIBaseURLs": ["https://example.com/v1"]}),
            {"factoryReset": True},
        )
        bridge.reset_all_data.assert_called_once_with(["https://example.com/v1"])
        bridge.log_translation.return_value = True
        result = router.dispatch("/v1/log/translation", {
            "provider": "google", "language": "ru", "source": "Hello",
            "translation": "Привет", "cached": True,
        })
        self.assertEqual(result, {"ok": True, "appended": True})
        bridge.log_translation.assert_called_once_with("google", "ru", "Hello", "Привет", True)
        bridge.log_batch.return_value = {"processed": 2, "appended": 1}
        self.assertEqual(
            router.dispatch("/v1/log/batch", {"entries": [{"source": "Hello"}]}),
            {"ok": True, "processed": 2, "appended": 1},
        )
        bridge.log_performance.return_value = 2
        self.assertEqual(
            router.dispatch("/v1/log/performance", {"events": [{"requests": 2}]}),
            {"ok": True, "appended": 2},
        )
        bridge.log_failures.return_value = 1
        self.assertEqual(
            router.dispatch("/v1/log/failures", {"entries": [{"source": "Hello"}]}),
            {"ok": True, "appended": 1},
        )

    def test_post_router_rejects_unknown_paths(self):
        router = local_service.LocalPostRouter(mock.Mock())
        with self.assertRaises(local_service.ServiceRouteError) as caught:
            router.dispatch("/v1/unknown", {})
        self.assertEqual(caught.exception.code, "not_found")
        self.assertEqual(caught.exception.status, 404)

    def test_pure_python_aes256_matches_nist_ctr_vector(self):
        key = bytes.fromhex(
            "603deb1015ca71be2b73aef0857d7781"
            "1f352c073b6108d72d9810a30914dff4"
        )
        counter = bytes.fromhex("f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff")
        plaintext = bytes.fromhex("6bc1bee22e409f96e93d7e117393172a")
        expected = bytes.fromhex("601ec313775789a5b7a7f504bbf3d228")
        stream = local_service._aes256_encrypt_block(
            counter, local_service._aes256_round_keys(key)
        )
        self.assertEqual(bytes(value ^ stream[index] for index, value in enumerate(plaintext)), expected)

    def test_game_language_candidates_follow_selected_windows_executable(self):
        with tempfile.TemporaryDirectory() as directory:
            game_root = Path(directory) / "OMORI"
            executable = game_root / "OMORI.exe"
            language_dir = game_root / "www" / "languages" / "en"
            language_dir.mkdir(parents=True)
            executable.write_bytes(b"MZ")
            self.assertEqual(
                next(path for path in local_service.game_language_candidates(executable) if path.is_dir()),
                language_dir,
            )

    def test_system_asset_extraction_includes_structured_ui_but_skips_internal_values(self):
        system_yaml = b'''terms:
  command:
    6: "EQUIP"
    11: "OPTIONS"
  param:
    0: "Max HP"
    6: "Speed"
plugins:
  mainMenu:
    commands:
      - ['???', 'TAG', 'STAB']
      - POCKET
  itemMenu:
    categories: [SNACKS, TOYS, IMPORTANT]
  optionsMenu:
    inputWarning:
      keyboardMessage: "You can't edit KEYBOARD inputs using your GAMEPAD!"
    itemTrash:
      text: 'ARE YOU SURE?'
  itemShopMenu:
    shopName: WE'RE FAMILY-OWNED!
    texts:
      maxItemMessage: 'dreamworld_extras_shop.message_185'
InputNames:
  keyboard:
    16: shift
'''
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "System.HERO"
            path.write_bytes(b"encrypted")
            with mock.patch.object(local_service, "decrypt_omori_data", return_value=system_yaml):
                values = local_service.extract_strings_from_hero(path)

        self.assertTrue({
            "EQUIP", "OPTIONS", "HEART:", "SPEED:", "TAG", "STAB", "POCKET",
            "SNACKS", "TOYS", "IMPORTANT",
            "You can't edit KEYBOARD inputs using your GAMEPAD!", "ARE YOU SURE?", "WE'RE FAMILY-OWNED!",
        }.issubset(values))
        self.assertNotIn("???", values)
        self.assertNotIn("dreamworld_extras_shop.message_185", values)
        self.assertNotIn("shift", values)

    def test_database_extraction_includes_visible_fields_and_constructed_stat_labels(self):
        weapons = [
            None,
            {
                "id": 2,
                "name": "SHINY KNIFE",
                "description": "A shiny new knife.<br>\nYou can see your reflection in the blade.",
                "note": "<IconIndex:0>",
            },
            {"id": 3, "name": "// WEAPONS //", "description": "", "note": "internal"},
        ]
        system = {
            "terms": {"params": ["Max HP", "Max MP", "Attack", "Defense", "Hit"]},
            "currencyUnit": "CLAMS",
            "gameTitle": "OMORI",
        }
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            weapon_path = root / "Weapons.KEL"
            system_path = root / "System.KEL"
            weapon_path.write_bytes(b"encrypted weapons")
            system_path.write_bytes(b"encrypted system")
            payloads = {
                b"encrypted weapons": json.dumps(weapons).encode(),
                b"encrypted system": json.dumps(system).encode(),
            }
            with mock.patch.object(
                local_service, "decrypt_omori_data", side_effect=lambda value: payloads[value]
            ):
                weapon_values = local_service.extract_strings_from_kel(weapon_path)
                system_values = local_service.extract_strings_from_kel(system_path)

        self.assertEqual(weapon_values, [
            "SHINY KNIFE", "A shiny new knife.<br>\nYou can see your reflection in the blade.",
        ])
        self.assertNotIn("<IconIndex:0>", weapon_values)
        self.assertNotIn("// WEAPONS //", weapon_values)
        self.assertTrue({
            "HEART:", "JUICE:", "ATTACK:", "DEFENSE:", "HIT:", "CLAMS", "OMORI",
        }.issubset(system_values))

    def test_hero_extraction_decodes_visible_block_text_and_constructed_option_labels(self):
        hero_yaml = r'''message_0:
  text: >
    MARI's picnic basket. \!Would you like to SAVE?
message_empty:
  text: >
plugins:
  optionsMenu:
    general:
      fullscreen:
        text: FULLSCREEN
'''
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "System.HERO"
            path.write_bytes(b"encrypted")
            with mock.patch.object(local_service, "decrypt_omori_data", return_value=hero_yaml.encode()):
                values = local_service.extract_strings_from_hero(path)

        self.assertIn("MARI's picnic basket. \\!Would you like to SAVE?\n", values)
        self.assertNotIn("\n", values)
        self.assertIn("FULLSCREEN", values)
        self.assertIn("FULLSCREEN:", values)

    def test_xx_blue_extraction_includes_visible_options_save_and_chapter_fields(self):
        hero_yaml = '''Chapter_Names:
  unknown: "???"
  prologue: PROLOGUE
Omori_Mainmenu_Sceneoptions:
  commands: ["GENERAL", "AUDIO", "CONTROLS", "SYSTEM"]
Omori_Save_Load:
  file: "FILE %1:"
  level: "LEVEL:"
  playtime: "TOTAL PLAYTIME:"
  location: "LOCATION:"
  overwrite_file: Overwrite this file?
  load_file: Load this file?
  save_command: SAVE
  load_command: LOAD
Yin_Blackjack:
  maincommands: [New Game, Continue, Quit]
'''
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "XX_BLUE.HERO"
            path.write_bytes(b"encrypted")
            with mock.patch.object(local_service, "decrypt_omori_data", return_value=hero_yaml.encode()):
                values = local_service.extract_strings_from_hero(path)

        self.assertTrue({
            "PROLOGUE", "GENERAL", "AUDIO", "CONTROLS", "SYSTEM", "FILE %1:",
            "LEVEL:", "TOTAL PLAYTIME:", "LOCATION:", "Overwrite this file?",
            "Load this file?", "SAVE", "LOAD",
        }.issubset(values))
        self.assertNotIn("???", values)
        self.assertNotIn("New Game", values)

    def test_hero_records_link_dialogue_to_source_markers_faces_and_narrator_fallback(self):
        hero_yaml = r'''message_1:
  faceset: MainCharacters_DreamWorld
  faceindex: 2
  text: \aubHello there!
message_2:
  faceset: MainCharacters_DreamWorld
  faceindex: 2
  text: Still me.
message_3:
  faceset: MainCharacters_DreamWorld
  faceindex: 2
  text: \aubOne more line.
message_4:
  text: The room is completely silent.
'''
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "dialogue.HERO"
            path.write_bytes(b"encrypted")
            profile_payload = json.loads(Path(local_service.__file__).with_name(
                local_service.LOCALIZATION_PROFILE_FILE
            ).read_text(encoding="utf-8"))
            profile = local_service._validated_localization_profile(profile_payload, "ru")
            with mock.patch.object(local_service, "decrypt_omori_data", return_value=hero_yaml.encode()):
                records = local_service.extract_records_from_hero(path, profile)
            local_service.apply_message_speaker_context(records)

        self.assertEqual([record["speaker"]["id"] for record in records], [
            "aubrey", "aubrey", "aubrey", "narrator",
        ])
        self.assertEqual(records[1]["speaker"]["evidence"], "face")
        self.assertEqual(records[3]["speaker"]["evidence"], "fallback")

    def test_bulk_extraction_uses_selected_game_and_reports_asset_failures(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            executable = root / "OMORI.exe"
            executable.write_bytes(b"MZ")
            language_dir = root / "www" / "languages" / "en"
            language_dir.mkdir(parents=True)
            asset = language_dir / "dialogue.HERO"
            asset.write_bytes(b"encrypted")
            bridge = local_service.LocalServiceBridge(root / "data", game_path=executable)
            extractor = mock.Mock(return_value=[{
                "source": "Hello", "kind": "dialogue", "asset": "dialogue.HERO",
                "messageId": "message_1", "speaker": {
                    "id": "hero", "sourceName": "HERO", "evidence": "source-code",
                },
            }])
            with mock.patch.object(local_service, "extract_records_from_hero", extractor):
                result = bridge.get_game_strings("omori")
            self.assertEqual(result["strings"], ["Hello"])
            self.assertEqual(result["assetFiles"], 1)
            self.assertEqual(result["failedFiles"], 0)
            self.assertEqual(result["assetCache"], "rebuilt")
            with mock.patch.object(local_service, "extract_records_from_hero", side_effect=AssertionError("cache miss")):
                cached = bridge.get_game_strings("omori")
            self.assertEqual(cached["strings"], ["Hello"])
            self.assertEqual(cached["assetCache"], "hit")
            self.assertEqual(extractor.call_count, 1)

            asset.write_bytes(b"changed encrypted asset")
            with mock.patch.object(local_service, "extract_records_from_hero", side_effect=ValueError("bad")):
                with self.assertRaises(local_service.BridgeError) as caught:
                    bridge.get_game_strings("omori")
            self.assertEqual(caught.exception.code, "game_asset_decode_failed")

    def test_bulk_asset_index_recovers_from_corruption(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            executable = root / "OMORI.exe"
            executable.write_bytes(b"MZ")
            language_dir = root / "www" / "languages" / "en"
            language_dir.mkdir(parents=True)
            (language_dir / "dialogue.HERO").write_bytes(b"encrypted")
            bridge = local_service.LocalServiceBridge(root / "data", game_path=executable)
            first = [{
                "source": "First", "kind": "narration", "asset": "dialogue.HERO",
                "messageId": "message_1", "speaker": {
                    "id": "narrator", "sourceName": "NARRATOR", "evidence": "fallback",
                },
            }]
            with mock.patch.object(local_service, "extract_records_from_hero", return_value=first):
                bridge.get_game_strings("omori")
            bridge.asset_index_path.write_text("{broken", encoding="utf-8")
            recovered = [{
                "source": "Recovered", "kind": "narration", "asset": "dialogue.HERO",
                "messageId": "message_2", "speaker": {
                    "id": "narrator", "sourceName": "NARRATOR", "evidence": "fallback",
                },
            }]
            with mock.patch.object(local_service, "extract_records_from_hero", return_value=recovered) as extractor:
                result = bridge.get_game_strings("omori")
            self.assertEqual(result["strings"], ["Recovered"])
            self.assertEqual(result["assetCache"], "rebuilt")
            extractor.assert_called_once()

    def test_request_logging_is_safe_without_console(self):
        handler = object.__new__(local_service.LocalServiceRequestHandler)
        with mock.patch.object(local_service.sys, "stderr", None):
            handler.log_message("%s", "request")

    def test_game_executable_change_creates_next_launch_marker(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = local_service.LocalServiceBridge(Path(directory))
            result = bridge.request_game_executable_change()
            self.assertTrue(result["reselectOnNextLaunch"])
            self.assertEqual(
                (Path(directory) / ".reselect-game-executable").read_text(encoding="utf-8"),
                "requested\n",
            )

    def test_factory_reset_removes_translator_data_but_preserves_game_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            game = root / "OMORI.exe"
            game.write_bytes(b"MZ")
            gemini_store = FakeCredentialStore("gemini-secret")
            openai_store = FakeCredentialStore("openai-secret")
            bridge = local_service.LocalServiceBridge(
                root / "data", credential_store=gemini_store,
                openai_credential_store=openai_store, game_path=game,
            )
            generated = [
                bridge.runtime_dir / "argostranslate" / "__init__.py",
                bridge.packages_dir / "translate-en_ru.argosmodel",
                bridge.cache_dir / "downloads" / "model.zip",
                bridge.data_dir / "ctranslate2-opus" / "models" / "ru" / "model.bin",
            ]
            for path in generated:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("generated", encoding="utf-8")
            for path in (
                bridge.activity_log, bridge.translation_log, bridge.performance_log,
                bridge.failure_log,
                bridge.openai_usage_log, bridge.asset_index_path,
                bridge.credential_scopes_path, bridge.data_dir / "argos-service.log",
                bridge.data_dir / ".reselect-game-executable",
            ):
                path.write_text("generated\n", encoding="utf-8")

            with mock.patch.object(bridge, "_clear_saved_game_path") as clear_saved_path:
                result = bridge.reset_all_data(["https://custom.example/v1"])

            self.assertTrue(result["factoryReset"])
            self.assertTrue(result["restartRequired"])
            clear_saved_path.assert_called_once_with()
            self.assertTrue(game.is_file())
            self.assertIsNone(gemini_store.value)
            self.assertIsNone(openai_store.value)
            self.assertTrue(all(not path.exists() for path in generated))
            self.assertFalse(bridge.activity_log.exists())
            self.assertFalse(bridge.translation_log.exists())
            self.assertFalse(bridge.performance_log.exists())
            self.assertFalse(bridge.failure_log.exists())
            self.assertFalse(bridge.openai_usage_log.exists())
            self.assertFalse(bridge.asset_index_path.exists())
            self.assertFalse(bridge.credential_scopes_path.exists())
            self.assertFalse((bridge.data_dir / "argos-service.log").exists())
            self.assertTrue(bridge.data_dir.is_dir())
            self.assertFalse(bridge.runtime_dir.exists())
            self.assertFalse(bridge.packages_dir.exists())
            self.assertFalse(bridge.cache_dir.exists())
            self.assertFalse((bridge.data_dir / "ctranslate2-opus").exists())

    def test_gemini_key_uses_injected_secure_store(self):
        with tempfile.TemporaryDirectory() as directory:
            store = FakeCredentialStore()
            bridge = local_service.LocalServiceBridge(Path(directory), credential_store=store)
            self.assertFalse(bridge.gemini_status()["configured"])
            result = bridge.set_gemini_key("A" * 32)
            self.assertTrue(result["configured"])
            self.assertEqual(store.value, "A" * 32)
            self.assertNotIn("apiKey", result)
            self.assertFalse(bridge.remove_gemini_key()["configured"])

    def test_gemini_rejects_invalid_keys_without_saving_them(self):
        with tempfile.TemporaryDirectory() as directory:
            store = FakeCredentialStore()
            bridge = local_service.LocalServiceBridge(Path(directory), credential_store=store)
            with self.assertRaises(local_service.BridgeError) as caught:
                bridge.set_gemini_key("short key")
            self.assertEqual(caught.exception.code, "invalid_api_key")
            self.assertIsNone(store.value)

    def test_macos_keychain_receives_secret_twice_over_stdin_not_process_arguments(self):
        store = local_service.GeminiCredentialStore("omori")
        api_key = "secret-key-that-is-long-enough"
        completed = mock.Mock(returncode=0, stderr="")
        with mock.patch.object(local_service.sys, "platform", "darwin"), \
                mock.patch.object(local_service.subprocess, "run", return_value=completed) as run:
            store.set(api_key)
        command = run.call_args.args[0]
        self.assertNotIn(api_key, command)
        self.assertEqual(command[-1], "-w")
        self.assertEqual(run.call_args.kwargs["input"], f"{api_key}\n{api_key}\n")

    def test_gemini_translation_uses_structured_output_and_relaxed_adjustable_filters(self):
        with tempfile.TemporaryDirectory() as directory:
            store = FakeCredentialStore("secret-key-that-is-long-enough")
            bridge = local_service.LocalServiceBridge(Path(directory), credential_store=store)
            captured = {}

            def fake_open(request, timeout):
                captured["request"] = request
                captured["timeout"] = timeout
                return FakeHTTPResponse({
                    "candidates": [{
                        "finishReason": "STOP",
                        "content": {"parts": [{"text": json.dumps({"translation": "Привет"})}]},
                    }]
                })

            with mock.patch.object(local_service.urllib.request, "urlopen", side_effect=fake_open):
                result = bridge.gemini_translate("ru", "Russian", "Hello", {
                    "kind": "dialogue", "sourceText": r"\aubHello", "evidence": "fallback",
                })
            self.assertEqual(result["translatedText"], "Привет")
            self.assertEqual(result["model"], local_service.GEMINI_MODEL)
            request_body = json.loads(captured["request"].data.decode("utf-8"))
            self.assertEqual(request_body["generationConfig"]["responseMimeType"], "application/json")
            instruction = request_body["systemInstruction"]["parts"][0]["text"]
            user_content = json.loads(request_body["contents"][0]["parts"][0]["text"])
            self.assertEqual(user_content["source"], "Hello")
            self.assertEqual(user_content["context"]["speakerId"], "aubrey")
            self.assertEqual(user_content["context"]["speakerName"], "AUBREY")
            self.assertIn("MR. PLANTEGG", instruction)
            self.assertNotIn("RPG Maker", instruction)
            self.assertNotIn("VRCTXSEP", instruction)
            self.assertTrue(all(setting["threshold"] == "OFF" for setting in request_body["safetySettings"]))
            self.assertEqual(captured["request"].get_header("X-goog-api-key"), store.value)
            self.assertNotIn(store.value, captured["request"].full_url)

    def test_gemini_maps_quota_and_safety_failures(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = local_service.LocalServiceBridge(
                Path(directory), credential_store=FakeCredentialStore("secret-key-that-is-long-enough")
            )
            quota_error = urllib.error.HTTPError(
                local_service.GEMINI_API_URL, 429, "quota", {},
                io.BytesIO(b'{"error":{"message":"quota"}}'),
            )
            with mock.patch.object(local_service.urllib.request, "urlopen", side_effect=quota_error):
                with self.assertRaises(local_service.BridgeError) as caught:
                    bridge.gemini_translate("ru", "Russian", "Hello")
            self.assertEqual(caught.exception.code, "gemini_quota_exceeded")
            with mock.patch.object(
                local_service.urllib.request, "urlopen",
                return_value=FakeHTTPResponse({"promptFeedback": {"blockReason": "SAFETY"}}),
            ):
                with self.assertRaises(local_service.BridgeError) as caught:
                    bridge.gemini_translate("ru", "Russian", "Explicit text")
            self.assertEqual(caught.exception.code, "gemini_safety_block")

    def test_lmstudio_status_lists_models_from_local_openai_endpoint(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = local_service.LocalServiceBridge(Path(directory))
            captured = {}

            def fake_open(request, timeout):
                captured["request"] = request
                captured["timeout"] = timeout
                return FakeHTTPResponse({
                    "object": "list",
                    "data": [{"id": "local/qwen"}, {"id": "local/gemma"}],
                })

            with mock.patch.object(local_service.urllib.request, "urlopen", side_effect=fake_open):
                status = bridge.lmstudio_status()
            self.assertTrue(status["available"])
            self.assertEqual(status["models"], ["local/qwen", "local/gemma"])
            self.assertEqual(captured["request"].full_url, "http://127.0.0.1:1234/v1/models")
            self.assertEqual(captured["request"].method, "GET")
            self.assertEqual(captured["timeout"], 3)

    def test_lmstudio_status_reports_stopped_server_without_failing_helper(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = local_service.LocalServiceBridge(Path(directory))
            with mock.patch.object(
                local_service.urllib.request, "urlopen",
                side_effect=urllib.error.URLError("connection refused"),
            ):
                status = bridge.lmstudio_status()
            self.assertTrue(status["ok"])
            self.assertFalse(status["available"])
            self.assertEqual(status["models"], [])
            self.assertIn("Start the LM Studio", status["message"])

    def test_lmstudio_translation_uses_selected_model_and_structured_output(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = local_service.LocalServiceBridge(Path(directory))
            captured = {}
            source = r"Hello \N[1]! VRCTXSEP1X Welcome."
            translated = r"Привет, \N[1]! VRCTXSEP1X Добро пожаловать."

            def fake_open(request, timeout):
                captured["request"] = request
                captured["timeout"] = timeout
                return FakeHTTPResponse({
                    "choices": [{"message": {"content": json.dumps({"translation": translated})}}]
                })

            with mock.patch.object(local_service.urllib.request, "urlopen", side_effect=fake_open):
                result = bridge.lmstudio_translate("ru", "Russian", source, "local/qwen")
            self.assertEqual(result["translatedText"], translated)
            self.assertTrue(result["offline"])
            self.assertEqual(result["promptVersion"], local_service.LM_STUDIO_PROMPT_VERSION)
            request_body = json.loads(captured["request"].data.decode("utf-8"))
            self.assertEqual(request_body["model"], "local/qwen")
            self.assertEqual(request_body["temperature"], 0)
            self.assertFalse(request_body["stream"])
            self.assertEqual(request_body["response_format"]["type"], "json_schema")
            user_content = json.loads(request_body["messages"][1]["content"])
            self.assertEqual(user_content["source"], source)
            self.assertEqual(user_content["context"]["speakerId"], "narrator")
            self.assertIn("MR. PLANTEGG", request_body["messages"][0]["content"])
            self.assertNotIn("RPG Maker", request_body["messages"][0]["content"])
            self.assertNotIn("VRCTXSEP", request_body["messages"][0]["content"])
            self.assertEqual(captured["timeout"], 300)

    def test_lmstudio_rejects_changed_game_control_codes(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = local_service.LocalServiceBridge(Path(directory))
            response = FakeHTTPResponse({
                "choices": [{"message": {"content": json.dumps({"translation": "Привет"})}}]
            })
            with mock.patch.object(local_service.urllib.request, "urlopen", return_value=response):
                with self.assertRaises(local_service.BridgeError) as caught:
                    bridge.lmstudio_translate("ru", "Russian", r"Hello \N[1]", "local/qwen")
            self.assertEqual(caught.exception.code, "lmstudio_format_invalid")

    def test_lmstudio_bridge_rejects_non_loopback_base_urls(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):
                local_service.LocalServiceBridge(Path(directory), lmstudio_base_url="http://192.168.1.10:1234")

    def test_openai_compatible_presets_and_custom_url_validation(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = local_service.LocalServiceBridge(
                Path(directory), openai_credential_store=FakeCredentialStore()
            )
            connection = bridge._openai_connection("opencode-go", "https://ignored.example/v1")
            self.assertEqual(connection["baseURL"], "https://opencode.ai/zen/go/v1")
            self.assertTrue(connection["requiresKey"])
            zen = bridge._openai_connection("opencode-zen", "https://ignored.example/v1")
            self.assertEqual(zen["baseURL"], "https://opencode.ai/zen/v1")
            self.assertTrue(zen["requiresKey"])
            local = bridge._openai_connection("custom", "http://127.0.0.1:8000/v1/")
            self.assertEqual(local["baseURL"], "http://127.0.0.1:8000/v1")
            self.assertTrue(local["offline"])
            with self.assertRaises(local_service.BridgeError) as caught:
                bridge._openai_connection("custom", "http://api.example.com/v1")
            self.assertEqual(caught.exception.code, "openai_url_insecure")

    def test_openai_compatible_key_and_models_use_secure_bearer_header(self):
        with tempfile.TemporaryDirectory() as directory:
            store = FakeCredentialStore()
            bridge = local_service.LocalServiceBridge(
                Path(directory), openai_credential_store=store
            )
            captured = {}

            def fake_open(request, timeout):
                captured["request"] = request
                captured["timeout"] = timeout
                return FakeHTTPResponse({"data": [{"id": "kimi-k3"}, {"id": "glm-5.3"}]})

            with mock.patch.object(local_service.urllib.request, "urlopen", side_effect=fake_open):
                status = bridge.set_openai_compatible_key("opencode-go", "", "secret-key-123456")
            self.assertTrue(status["configured"])
            self.assertEqual(status["models"], ["kimi-k3", "glm-5.3"])
            self.assertNotIn("apiKey", status)
            self.assertEqual(captured["request"].get_header("Authorization"), "Bearer secret-key-123456")
            self.assertNotIn("secret-key-123456", captured["request"].full_url)
            self.assertEqual(captured["request"].full_url, "https://opencode.ai/zen/go/v1/models")

    def test_openai_compatible_translation_uses_chat_completions_and_cache_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            store = FakeCredentialStore("secret-key-123456")
            bridge = local_service.LocalServiceBridge(
                Path(directory), openai_credential_store=store
            )
            captured = {}
            source = r"Hello \\N[1]! VRCTXSEP1X Welcome."
            translated = r"Привет, \\N[1]! VRCTXSEP1X Добро пожаловать."

            def fake_open(request, timeout):
                captured["request"] = request
                captured["timeout"] = timeout
                return FakeHTTPResponse({
                    "choices": [{"message": {"content": json.dumps({"translation": translated})}}]
                })

            with mock.patch.object(local_service.urllib.request, "urlopen", side_effect=fake_open):
                result = bridge.openai_compatible_translate(
                    "ru", "Russian", source, "kimi-k3", "opencode-go", ""
                )
            self.assertEqual(result["translatedText"], translated)
            self.assertFalse(result["offline"])
            self.assertEqual(result["promptVersion"], local_service.OPENAI_COMPATIBLE_PROMPT_VERSION)
            self.assertIsNone(result["usage"])
            self.assertEqual(result["usageSummary"]["requests"], 1)
            self.assertEqual(result["usageSummary"]["usageReports"], 0)
            self.assertEqual(result["usageSummary"]["costs"], [])
            self.assertEqual(
                captured["request"].full_url,
                "https://opencode.ai/zen/go/v1/chat/completions",
            )
            request_body = json.loads(captured["request"].data.decode("utf-8"))
            self.assertEqual(request_body["model"], "kimi-k3")
            self.assertEqual(
                request_body["max_tokens"],
                local_service.OPENAI_COMPATIBLE_MIN_COMPLETION_TOKENS,
            )
            self.assertEqual(request_body["response_format"]["type"], "json_schema")
            self.assertNotIn("RPG Maker", request_body["messages"][0]["content"])
            self.assertNotIn("VRCTXSEP", request_body["messages"][0]["content"])
            self.assertEqual(captured["request"].get_header("Authorization"), "Bearer secret-key-123456")

    def test_openai_compatible_records_only_exact_provider_reported_usage(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = local_service.LocalServiceBridge(
                Path(directory), openai_credential_store=FakeCredentialStore("secret-key-123456")
            )
            translated = "Привет"
            response = {
                "id": "gen-exact-usage",
                "choices": [{"message": {"content": json.dumps({"translation": translated})}}],
                "usage": {
                    "prompt_tokens": 120,
                    "completion_tokens": 30,
                    "total_tokens": 150,
                    "prompt_tokens_details": {"cached_tokens": 20},
                    "completion_tokens_details": {"reasoning_tokens": 7},
                    "cost": 0.000123,
                    "cost_details": {"upstream_inference_cost": 0.0001},
                },
            }
            with mock.patch.object(
                local_service.urllib.request, "urlopen", return_value=FakeHTTPResponse(response)
            ):
                result = bridge.openai_compatible_translate(
                    "ru", "Russian", "Hello", "openai/gpt-test", "openrouter", ""
                )

            self.assertEqual(result["usage"], {
                "promptTokens": 120,
                "promptTokensField": "prompt_tokens",
                "completionTokens": 30,
                "completionTokensField": "completion_tokens",
                "totalTokens": 150,
                "totalTokensField": "total_tokens",
                "cachedTokens": 20,
                "reasoningTokens": 7,
                "cost": "0.000123",
                "costUnit": "credits",
                "upstreamInferenceCost": "0.0001",
            })
            self.assertEqual(result["usageSummary"]["requests"], 1)
            self.assertEqual(result["usageSummary"]["usageReports"], 1)
            self.assertEqual(result["usageSummary"]["tokens"]["totalTokens"], {
                "value": 150, "reports": 1,
            })
            self.assertEqual(result["usageSummary"]["costs"], [{
                "unit": "credits", "value": "0.000123", "reports": 1,
            }])

            record = json.loads(bridge.openai_usage_log.read_text(encoding="utf-8").strip())
            self.assertEqual(record["responseId"], "gen-exact-usage")
            self.assertEqual(record["usage"], result["usage"])
            self.assertNotIn("source", record)
            self.assertNotIn("translation", record)

            reloaded = local_service.LocalServiceBridge(
                Path(directory), openai_credential_store=FakeCredentialStore("secret-key-123456")
            )
            self.assertEqual(
                reloaded.openai_usage_summary("openrouter", "https://openrouter.ai/api/v1"),
                result["usageSummary"],
            )

    def test_openai_compatible_accepts_plain_text_when_schema_is_ignored(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = local_service.LocalServiceBridge(
                Path(directory), openai_credential_store=FakeCredentialStore("secret-key-123456")
            )
            response = {
                "choices": [{"message": {"content": "Привет"}}],
                "usage": {
                    "prompt_tokens": 90,
                    "completion_tokens": 414,
                    "total_tokens": 504,
                    "completion_tokens_details": {"reasoning_tokens": 388},
                },
            }
            with mock.patch.object(
                local_service.urllib.request, "urlopen", return_value=FakeHTTPResponse(response)
            ):
                result = bridge.openai_compatible_translate(
                    "ru", "Russian", "Hello", "glm-5.3-flash", "opencode-go", ""
                )

            self.assertEqual(result["translatedText"], "Привет")
            self.assertEqual(result["usage"]["reasoningTokens"], 388)

    def test_openai_compatible_accepts_fenced_schema_output(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = local_service.LocalServiceBridge(
                Path(directory), openai_credential_store=FakeCredentialStore("secret-key-123456")
            )
            response = {
                "choices": [{"message": {
                    "content": '```json\n{"translation": "Привет"}\n```'
                }}],
            }
            with mock.patch.object(
                local_service.urllib.request, "urlopen", return_value=FakeHTTPResponse(response)
            ):
                result = bridge.openai_compatible_translate(
                    "ru", "Russian", "Hello", "glm-5.3-flash", "opencode-go", ""
                )

            self.assertEqual(result["translatedText"], "Привет")

    def test_openai_compatible_records_usage_before_rejecting_invalid_translation(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = local_service.LocalServiceBridge(
                Path(directory), openai_credential_store=FakeCredentialStore("secret-key-123456")
            )
            response = {
                "choices": [{"message": {"content": json.dumps({"translation": "Привет"})}}],
                "usage": {"prompt_tokens": 9, "completion_tokens": 1, "total_tokens": 10},
            }
            with mock.patch.object(
                local_service.urllib.request, "urlopen", return_value=FakeHTTPResponse(response)
            ):
                with self.assertRaises(local_service.BridgeError) as caught:
                    bridge.openai_compatible_translate(
                        "ru", "Russian", r"Hello \\N[1]", "kimi-k3", "opencode-go", ""
                    )

            self.assertEqual(caught.exception.code, "openai_format_invalid")
            self.assertEqual(caught.exception.details["usage"]["totalTokens"], 10)
            self.assertEqual(caught.exception.details["usageSummary"]["requests"], 1)
            record = json.loads(bridge.openai_usage_log.read_text(encoding="utf-8").strip())
            self.assertEqual(record["usage"]["totalTokens"], 10)

    def test_openai_compatible_stops_when_reasoning_consumes_the_completion_budget(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = local_service.LocalServiceBridge(
                Path(directory), openai_credential_store=FakeCredentialStore("secret-key-123456")
            )
            response = {
                "choices": [{"finish_reason": "length", "message": {"content": ""}}],
                "usage": {
                    "prompt_tokens": 70,
                    "completion_tokens": 2048,
                    "total_tokens": 2118,
                    "completion_tokens_details": {"reasoning_tokens": 2048},
                },
            }
            with mock.patch.object(
                local_service.urllib.request, "urlopen", return_value=FakeHTTPResponse(response)
            ):
                with self.assertRaises(local_service.BridgeError) as caught:
                    bridge.openai_compatible_translate(
                        "ru", "Russian", "Hello", "glm-5.3-flash", "opencode-go", ""
                    )

            self.assertEqual(caught.exception.code, "openai_reasoning_budget_exhausted")
            self.assertEqual(caught.exception.details["usage"]["reasoningTokens"], 2048)
            self.assertEqual(caught.exception.details["usageSummary"]["requests"], 1)

    def test_openai_compatible_remote_provider_requires_saved_key(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = local_service.LocalServiceBridge(
                Path(directory), openai_credential_store=FakeCredentialStore()
            )
            with self.assertRaises(local_service.BridgeError) as caught:
                bridge.openai_compatible_translate(
                    "ru", "Russian", "Hello", "kimi-k3", "opencode-go", ""
                )
            self.assertEqual(caught.exception.code, "openai_key_missing")

    def test_translation_history_persists_and_reads_newest_first(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = local_service.LocalServiceBridge(Path(directory))
            bridge.log_translation("google", "ru", "Hello", "Привет")
            bridge.log_translation("gemini", "de", "Bye", "Tschüss", cached=True)
            self.assertFalse(bridge.log_translation("gemini", "de", "Bye", "Tschüss", cached=True))

            history = bridge.read_translation_log(1)
            self.assertTrue(history["ok"])
            self.assertEqual(history["limit"], 1)
            self.assertEqual(len(history["entries"]), 1)
            self.assertEqual(history["entries"][0]["provider"], "gemini")
            self.assertEqual(history["entries"][0]["language"], "de")
            self.assertEqual(history["entries"][0]["source"], "Bye")
            self.assertEqual(history["entries"][0]["translation"], "Tschüss")
            self.assertTrue(history["entries"][0]["cached"])

            lines = bridge.translation_log.read_text(encoding="utf-8").splitlines()
            self.assertEqual(len(lines), 2)
            self.assertEqual(json.loads(lines[0])["source"], "Hello")

            reloaded = local_service.LocalServiceBridge(Path(directory))
            self.assertFalse(reloaded.log_translation("google", "ru", "Hello", "Привет", cached=True))
            self.assertEqual(len(reloaded.translation_log.read_text(encoding="utf-8").splitlines()), 2)

    def test_batched_translation_and_performance_logs_use_bounded_writes(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = local_service.LocalServiceBridge(Path(directory))
            result = bridge.log_batch([
                {"provider": "google", "language": "ru", "source": "Hello", "translation": "Привет"},
                {"provider": "google", "language": "ru", "source": "Bye", "translation": "Пока", "cached": True},
                {"provider": "google", "language": "ru", "source": "Hello", "translation": "Привет"},
            ])
            self.assertEqual(result, {"processed": 3, "appended": 2})
            self.assertEqual(len(bridge.activity_log.read_text(encoding="utf-8").splitlines()), 3)
            self.assertEqual(len(bridge.translation_log.read_text(encoding="utf-8").splitlines()), 2)

            self.assertEqual(bridge.log_performance([
                {"type": "request", "requests": 1, "durationMs": 125.4, "ignored": ["unsafe"]},
                "invalid",
            ]), 1)
            event = json.loads(bridge.performance_log.read_text(encoding="utf-8").strip())
            self.assertEqual(event["type"], "request")
            self.assertEqual(event["requests"], 1)
            self.assertNotIn("ignored", event)

            self.assertEqual(bridge.log_failures([
                {
                    "provider": "google", "language": "ru", "source": "\\c[4]Hello\\c[0]",
                    "code": "markup_format_invalid", "reason": "Protected markup failed",
                    "detail": "markup_layout", "candidate": "\\c[4]Привет\\c[0]",
                },
                {"provider": "google", "source": ""},
                "invalid",
            ]), 1)
            failure = json.loads(bridge.failure_log.read_text(encoding="utf-8").strip())
            self.assertEqual(failure["source"], "\\c[4]Hello\\c[0]")
            self.assertEqual(failure["code"], "markup_format_invalid")
            self.assertEqual(failure["reason"], "Protected markup failed")
            self.assertEqual(failure["detail"], "markup_layout")
            self.assertEqual(failure["candidate"], "\\c[4]Привет\\c[0]")

    def test_update_check_validates_manifest_and_reports_network_failure(self):
        class FakeResponse:
            def __init__(self, payload):
                self.payload = payload

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def geturl(self):
                return local_service.UPDATE_MANIFEST_URL

            def read(self, _limit):
                return self.payload

        manifest = json.dumps({
            "schemaVersion": 1,
            "product": "omori-translator",
            "version": "0.9.33",
            "cacheCompatibility": "rebuild",
            "cacheSchema": 4,
            "changes": ["Placeholder improvement", "Placeholder bug fix"],
        }).encode("utf-8")
        with tempfile.TemporaryDirectory() as directory:
            bridge = local_service.LocalServiceBridge(Path(directory))
            with mock.patch.object(local_service.urllib.request, "urlopen", return_value=FakeResponse(manifest)):
                result = bridge.check_for_updates()
            self.assertEqual(result["latestVersion"], "0.9.33")
            self.assertEqual(result["cacheCompatibility"], "rebuild")
            self.assertEqual(result["cacheSchema"], 4)
            self.assertEqual(result["changes"], ["Placeholder improvement", "Placeholder bug fix"])

            failure = urllib.error.URLError("offline")
            with mock.patch.object(local_service.urllib.request, "urlopen", side_effect=failure):
                with self.assertRaises(local_service.BridgeError) as caught:
                    bridge.check_for_updates()
            self.assertEqual(caught.exception.code, "update_check_failed")
            self.assertEqual(str(caught.exception), "Could not check for updates")


if __name__ == "__main__":
    unittest.main()
