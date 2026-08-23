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

import argos_service


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


class ArgosServiceTests(unittest.TestCase):
    def test_pure_python_aes256_matches_nist_ctr_vector(self):
        key = bytes.fromhex(
            "603deb1015ca71be2b73aef0857d7781"
            "1f352c073b6108d72d9810a30914dff4"
        )
        counter = bytes.fromhex("f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff")
        plaintext = bytes.fromhex("6bc1bee22e409f96e93d7e117393172a")
        expected = bytes.fromhex("601ec313775789a5b7a7f504bbf3d228")
        stream = argos_service._aes256_encrypt_block(
            counter, argos_service._aes256_round_keys(key)
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
                next(path for path in argos_service.game_language_candidates(executable) if path.is_dir()),
                language_dir,
            )

    def test_bulk_extraction_uses_selected_game_and_reports_asset_failures(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            executable = root / "OMORI.exe"
            executable.write_bytes(b"MZ")
            language_dir = root / "www" / "languages" / "en"
            language_dir.mkdir(parents=True)
            (language_dir / "dialogue.HERO").write_bytes(b"encrypted")
            bridge = argos_service.ArgosBridge(root / "data", game_path=executable)
            with mock.patch.object(argos_service, "extract_strings_from_hero", return_value=["Hello", "123"]):
                result = bridge.get_game_strings("omori")
            self.assertEqual(result["strings"], ["Hello"])
            self.assertEqual(result["assetFiles"], 1)
            self.assertEqual(result["failedFiles"], 0)
            with mock.patch.object(argos_service, "extract_strings_from_hero", side_effect=ValueError("bad")):
                with self.assertRaises(argos_service.BridgeError) as caught:
                    bridge.get_game_strings("omori")
            self.assertEqual(caught.exception.code, "game_asset_decode_failed")

    def test_builtin_sentence_detector_keeps_punctuation(self):
        detector = argos_service.BasicSentenceDetector("en")
        self.assertEqual(
            detector.sentences("Hello there. How are you? Fine!"),
            ["Hello there.", "How are you?", "Fine!"],
        )

    def test_maps_google_language_codes_to_direct_argos_models(self):
        self.assertEqual(len(argos_service.ARGOS_LANGUAGE_CODES), 48)
        self.assertEqual(argos_service.normalize_target("ru"), "ru")
        self.assertEqual(argos_service.normalize_target("no"), "nb")
        self.assertEqual(argos_service.normalize_target("zh-CN"), "zh")
        self.assertEqual(argos_service.normalize_target("zh-TW"), "zt")
        self.assertEqual(argos_service.normalize_target("iw"), "he")
        self.assertIsNone(argos_service.normalize_target("ab"))

    def test_reports_missing_runtime_without_touching_global_argos_folders(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = argos_service.ArgosBridge(Path(directory))
            status = bridge.status("ru")
            self.assertTrue(status["supported"])
            self.assertFalse(status["runtimeInstalled"])
            self.assertFalse(status["sentenceModelInstalled"])
            self.assertFalse(status["modelInstalled"])
            self.assertFalse(status["offlineReady"])
            self.assertEqual(status["modelBytes"], 0)
            self.assertIn("ru", status["supportedLanguages"])
            self.assertIn("zh-TW", status["supportedLanguages"])
            self.assertNotIn("ab", status["supportedLanguages"])

    def test_rejects_unknown_languages_before_translation(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = argos_service.ArgosBridge(Path(directory))
            with self.assertRaises(argos_service.BridgeError) as caught:
                bridge.translate("xx-unknown", "Hello")
            self.assertEqual(caught.exception.code, "unsupported_language")

    def test_directory_size_counts_regular_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "nested").mkdir()
            (root / "a.bin").write_bytes(b"123")
            (root / "nested" / "b.bin").write_bytes(b"4567")
            self.assertEqual(argos_service.directory_size(root), 7)

    def test_request_logging_is_safe_without_console(self):
        handler = object.__new__(argos_service.ArgosRequestHandler)
        with mock.patch.object(argos_service.sys, "stderr", None):
            handler.log_message("%s", "request")

    def test_bundled_runtime_size_uses_build_marker(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime = Path(directory) / "runtime"
            runtime.mkdir()
            (runtime / ".vnrevival-runtime-bytes").write_text("123456\n", encoding="ascii")
            bridge = argos_service.ArgosBridge(Path(directory) / "data", runtime)
            with mock.patch.object(argos_service, "directory_size", side_effect=AssertionError("unexpected scan")):
                self.assertEqual(bridge._runtime_size(), 123456)

    def test_game_executable_change_creates_next_launch_marker(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = argos_service.ArgosBridge(Path(directory))
            result = bridge.request_game_executable_change()
            self.assertTrue(result["reselectOnNextLaunch"])
            self.assertEqual(
                (Path(directory) / ".reselect-game-executable").read_text(encoding="utf-8"),
                "requested\n",
            )

    def test_gemini_key_uses_injected_secure_store(self):
        with tempfile.TemporaryDirectory() as directory:
            store = FakeCredentialStore()
            bridge = argos_service.ArgosBridge(Path(directory), credential_store=store)
            self.assertFalse(bridge.gemini_status()["configured"])
            result = bridge.set_gemini_key("A" * 32)
            self.assertTrue(result["configured"])
            self.assertEqual(store.value, "A" * 32)
            self.assertNotIn("apiKey", result)
            self.assertFalse(bridge.remove_gemini_key()["configured"])

    def test_gemini_rejects_invalid_keys_without_saving_them(self):
        with tempfile.TemporaryDirectory() as directory:
            store = FakeCredentialStore()
            bridge = argos_service.ArgosBridge(Path(directory), credential_store=store)
            with self.assertRaises(argos_service.BridgeError) as caught:
                bridge.set_gemini_key("short key")
            self.assertEqual(caught.exception.code, "invalid_api_key")
            self.assertIsNone(store.value)

    def test_macos_keychain_receives_secret_over_stdin_not_process_arguments(self):
        store = argos_service.GeminiCredentialStore("omori")
        api_key = "secret-key-that-is-long-enough"
        completed = mock.Mock(returncode=0, stderr="")
        with mock.patch.object(argos_service.sys, "platform", "darwin"), \
                mock.patch.object(argos_service.subprocess, "run", return_value=completed) as run:
            store.set(api_key)
        command = run.call_args.args[0]
        self.assertNotIn(api_key, command)
        self.assertEqual(command[-1], "-w")
        self.assertEqual(run.call_args.kwargs["input"], api_key + "\n")

    def test_gemini_translation_uses_structured_output_and_relaxed_adjustable_filters(self):
        with tempfile.TemporaryDirectory() as directory:
            store = FakeCredentialStore("secret-key-that-is-long-enough")
            bridge = argos_service.ArgosBridge(Path(directory), credential_store=store)
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

            with mock.patch.object(argos_service.urllib.request, "urlopen", side_effect=fake_open):
                result = bridge.gemini_translate("ru", "Russian", "Hello")
            self.assertEqual(result["translatedText"], "Привет")
            self.assertEqual(result["model"], argos_service.GEMINI_MODEL)
            request_body = json.loads(captured["request"].data.decode("utf-8"))
            self.assertEqual(request_body["generationConfig"]["responseMimeType"], "application/json")
            self.assertTrue(all(setting["threshold"] == "OFF" for setting in request_body["safetySettings"]))
            self.assertEqual(captured["request"].get_header("X-goog-api-key"), store.value)
            self.assertNotIn(store.value, captured["request"].full_url)

    def test_gemini_maps_quota_and_safety_failures(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = argos_service.ArgosBridge(
                Path(directory), credential_store=FakeCredentialStore("secret-key-that-is-long-enough")
            )
            quota_error = urllib.error.HTTPError(
                argos_service.GEMINI_API_URL, 429, "quota", {},
                io.BytesIO(b'{"error":{"message":"quota"}}'),
            )
            with mock.patch.object(argos_service.urllib.request, "urlopen", side_effect=quota_error):
                with self.assertRaises(argos_service.BridgeError) as caught:
                    bridge.gemini_translate("ru", "Russian", "Hello")
            self.assertEqual(caught.exception.code, "gemini_quota_exceeded")
            with mock.patch.object(
                argos_service.urllib.request, "urlopen",
                return_value=FakeHTTPResponse({"promptFeedback": {"blockReason": "SAFETY"}}),
            ):
                with self.assertRaises(argos_service.BridgeError) as caught:
                    bridge.gemini_translate("ru", "Russian", "Explicit text")
            self.assertEqual(caught.exception.code, "gemini_safety_block")

    def test_lmstudio_status_lists_models_from_local_openai_endpoint(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = argos_service.ArgosBridge(Path(directory))
            captured = {}

            def fake_open(request, timeout):
                captured["request"] = request
                captured["timeout"] = timeout
                return FakeHTTPResponse({
                    "object": "list",
                    "data": [{"id": "local/qwen"}, {"id": "local/gemma"}],
                })

            with mock.patch.object(argos_service.urllib.request, "urlopen", side_effect=fake_open):
                status = bridge.lmstudio_status()
            self.assertTrue(status["available"])
            self.assertEqual(status["models"], ["local/qwen", "local/gemma"])
            self.assertEqual(captured["request"].full_url, "http://127.0.0.1:1234/v1/models")
            self.assertEqual(captured["request"].method, "GET")
            self.assertEqual(captured["timeout"], 3)

    def test_lmstudio_status_reports_stopped_server_without_failing_helper(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = argos_service.ArgosBridge(Path(directory))
            with mock.patch.object(
                argos_service.urllib.request, "urlopen",
                side_effect=urllib.error.URLError("connection refused"),
            ):
                status = bridge.lmstudio_status()
            self.assertTrue(status["ok"])
            self.assertFalse(status["available"])
            self.assertEqual(status["models"], [])
            self.assertIn("Start the LM Studio", status["message"])

    def test_lmstudio_translation_uses_selected_model_and_structured_output(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = argos_service.ArgosBridge(Path(directory))
            captured = {}
            source = r"Hello \N[1]! VRCTXSEP1X Welcome."
            translated = r"Привет, \N[1]! VRCTXSEP1X Добро пожаловать."

            def fake_open(request, timeout):
                captured["request"] = request
                captured["timeout"] = timeout
                return FakeHTTPResponse({
                    "choices": [{"message": {"content": json.dumps({"translation": translated})}}]
                })

            with mock.patch.object(argos_service.urllib.request, "urlopen", side_effect=fake_open):
                result = bridge.lmstudio_translate("ru", "Russian", source, "local/qwen")
            self.assertEqual(result["translatedText"], translated)
            self.assertTrue(result["offline"])
            self.assertEqual(result["promptVersion"], argos_service.LM_STUDIO_PROMPT_VERSION)
            request_body = json.loads(captured["request"].data.decode("utf-8"))
            self.assertEqual(request_body["model"], "local/qwen")
            self.assertEqual(request_body["temperature"], 0)
            self.assertFalse(request_body["stream"])
            self.assertEqual(request_body["response_format"]["type"], "json_schema")
            self.assertEqual(request_body["messages"][1]["content"], source)
            self.assertEqual(captured["timeout"], 300)

    def test_lmstudio_rejects_changed_game_control_codes(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = argos_service.ArgosBridge(Path(directory))
            response = FakeHTTPResponse({
                "choices": [{"message": {"content": json.dumps({"translation": "Привет"})}}]
            })
            with mock.patch.object(argos_service.urllib.request, "urlopen", return_value=response):
                with self.assertRaises(argos_service.BridgeError) as caught:
                    bridge.lmstudio_translate("ru", "Russian", r"Hello \N[1]", "local/qwen")
            self.assertEqual(caught.exception.code, "lmstudio_format_invalid")

    def test_lmstudio_bridge_rejects_non_loopback_base_urls(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):
                argos_service.ArgosBridge(Path(directory), lmstudio_base_url="http://192.168.1.10:1234")


if __name__ == "__main__":
    unittest.main()
