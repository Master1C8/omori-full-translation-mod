import sys
import tempfile
import unittest
import io
import json
import shutil
import urllib.error
import zipfile
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
            asset = language_dir / "dialogue.HERO"
            asset.write_bytes(b"encrypted")
            bridge = argos_service.ArgosBridge(root / "data", game_path=executable)
            extractor = mock.Mock(return_value=["Hello", "123"])
            with mock.patch.object(argos_service, "extract_strings_from_hero", extractor):
                result = bridge.get_game_strings("omori")
            self.assertEqual(result["strings"], ["Hello"])
            self.assertEqual(result["assetFiles"], 1)
            self.assertEqual(result["failedFiles"], 0)
            self.assertEqual(result["assetCache"], "rebuilt")
            with mock.patch.object(argos_service, "extract_strings_from_hero", side_effect=AssertionError("cache miss")):
                cached = bridge.get_game_strings("omori")
            self.assertEqual(cached["strings"], ["Hello"])
            self.assertEqual(cached["assetCache"], "hit")
            self.assertEqual(extractor.call_count, 1)

            asset.write_bytes(b"changed encrypted asset")
            with mock.patch.object(argos_service, "extract_strings_from_hero", side_effect=ValueError("bad")):
                with self.assertRaises(argos_service.BridgeError) as caught:
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
            bridge = argos_service.ArgosBridge(root / "data", game_path=executable)
            with mock.patch.object(argos_service, "extract_strings_from_hero", return_value=["First"]):
                bridge.get_game_strings("omori")
            bridge.asset_index_path.write_text("{broken", encoding="utf-8")
            with mock.patch.object(argos_service, "extract_strings_from_hero", return_value=["Recovered"]) as extractor:
                result = bridge.get_game_strings("omori")
            self.assertEqual(result["strings"], ["Recovered"])
            self.assertEqual(result["assetCache"], "rebuilt")
            extractor.assert_called_once()

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

    def test_runtime_install_uses_hash_locked_binary_requirements(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            requirements = root / "requirements-runtime-macos.txt"
            requirements.write_text(
                "example-runtime==1.0 --hash=sha256:" + "a" * 64 + "\n",
                encoding="utf-8",
            )
            bridge = argos_service.ArgosBridge(root / "data")
            completed = mock.Mock(returncode=0, stdout="installed\n")
            with mock.patch.object(argos_service, "RUNTIME_REQUIREMENTS_PATH", requirements), \
                    mock.patch.object(argos_service.subprocess, "run", return_value=completed) as run:
                bridge._pip_install_runtime()
            command = run.call_args.args[0]
            self.assertIn("--require-hashes", command)
            self.assertIn("--no-deps", command)
            self.assertIn("--only-binary=:all:", command)
            self.assertEqual(command[command.index("--requirement") + 1], str(requirements))

    def test_ctranslate2_opus_translates_with_persistent_int8_model(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / "opus.zip"
            with zipfile.ZipFile(archive, "w") as bundle:
                bundle.writestr("opus/decoder.yml", "models:\n  - model.npz\nvocabs:\n  - source.spm\n  - target.spm\n")
                bundle.writestr("opus/model.npz", b"marian")
                bundle.writestr("opus/source.spm", b"source")
                bundle.writestr("opus/target.spm", b"target")
            bridge = argos_service.ArgosBridge(root / "data")

            class FakeTranslator:
                def __init__(self, *_args, **_kwargs):
                    pass

                def translate_batch(self, batches, beam_size):
                    self.batches = batches
                    self.beam_size = beam_size
                    return [mock.Mock(hypotheses=[["Привет"]])]

            class FakeSentencePieceProcessor:
                def __init__(self, model_file):
                    self.model_file = model_file

                def encode(self, text, out_type):
                    self.assert_out_type = out_type
                    return text.split()

                def decode(self, tokens):
                    return " ".join(tokens)

            class FakeConverter:
                def __init__(self, model_root):
                    self.model_root = model_root

                def convert(self, destination, quantization):
                    self.quantization = quantization
                    output = Path(destination)
                    output.mkdir(parents=True)
                    (output / "model.bin").write_bytes(b"int8")
                    (output / "config.json").write_text("{}", encoding="utf-8")

            def fake_download(_links, destination, _maximum):
                shutil.copy2(archive, destination)
                return destination

            bridge._ctranslate2_module = mock.Mock(Translator=FakeTranslator, __version__="4.8.1")
            bridge._sentencepiece_module = mock.Mock(SentencePieceProcessor=FakeSentencePieceProcessor)
            bridge._opus_converter_class = FakeConverter
            with mock.patch.object(bridge, "_opus_model_url", return_value="https://models.example/opus.zip"), \
                    mock.patch.object(bridge, "_download_https", side_effect=fake_download):
                status = bridge.install_ctranslate2_model("ru")
            self.assertTrue(status["offlineReady"])
            metadata = json.loads((bridge.ctranslate2_models_dir / "ru" / "vnrevival-model.json").read_text())
            self.assertEqual(metadata["quantization"], "int8")
            result = bridge.ctranslate2_translate("ru", "Hello there")
            self.assertEqual(result["translatedText"], "Привет")
            self.assertTrue(result["offline"])

    def test_rejects_unknown_languages_before_translation(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = argos_service.ArgosBridge(Path(directory))
            with self.assertRaises(argos_service.BridgeError) as caught:
                bridge.translate("xx-unknown", "Hello")
            self.assertEqual(caught.exception.code, "unsupported_language")

    def test_argos_batch_flattens_sentences_and_restores_item_order_without_changing_beam(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = argos_service.ArgosBridge(Path(directory))
            captured = {}

            class FakeTokenizer:
                @staticmethod
                def encode(text):
                    return [text]

                @staticmethod
                def decode(tokens):
                    return " ".join(tokens)

            class FakeTranslator:
                def translate_batch(self, batches, **kwargs):
                    captured["batches"] = batches
                    captured["kwargs"] = kwargs
                    return [
                        mock.Mock(hypotheses=[[
                            token.upper() for token in batch
                        ]])
                        for batch in batches
                    ]

            package = mock.Mock(
                tokenizer=FakeTokenizer(), target_prefix="", package_path=Path(directory)
            )
            package_translation = mock.Mock(
                pkg=package,
                sentencizer=mock.Mock(
                    split_sentences=lambda text: argos_service.BasicSentenceDetector("en").sentences(text)
                ),
                translator=FakeTranslator(),
            )
            wrapped_translation = type("WrappedTranslation", (), {
                "underlying": package_translation
            })()
            bridge._translate_module = mock.Mock(
                get_translation_from_codes=mock.Mock(return_value=wrapped_translation)
            )
            bridge._installed_package = mock.Mock(return_value=object())
            fake_settings = mock.Mock(batch_size=64, beam_size=4)
            with mock.patch.object(
                argos_service.importlib, "import_module", return_value=fake_settings
            ):
                result = bridge.translate_batch(
                    "ru", ["Hello. Next!", "Second line.\nLast one!"]
                )

            self.assertEqual(result["translations"], [
                "HELLO. NEXT!", "SECOND LINE.\nLAST ONE!"
            ])
            self.assertEqual(captured["batches"], [
                ["Hello."], ["Next!"], ["Second line."], ["Last one!"]
            ])
            self.assertEqual(captured["kwargs"]["beam_size"], 4)
            self.assertEqual(captured["kwargs"]["num_hypotheses"], 1)
            self.assertEqual(captured["kwargs"]["max_batch_size"], 64)

            with self.assertRaises(argos_service.BridgeError) as caught:
                bridge.translate_batch("ru", ["text"] * (argos_service.ARGOS_BATCH_MAX_ITEMS + 1))
            self.assertEqual(caught.exception.code, "invalid_batch")

    def test_argos_cpu_settings_use_measured_conservative_cap(self):
        self.assertEqual(argos_service.adaptive_argos_cpu_settings(1), {
            "interThreads": 1, "intraThreads": 1, "batchSize": 32,
        })
        self.assertEqual(argos_service.adaptive_argos_cpu_settings(4), {
            "interThreads": 1, "intraThreads": 4, "batchSize": 32,
        })
        self.assertEqual(argos_service.adaptive_argos_cpu_settings(10), {
            "interThreads": 1, "intraThreads": 4, "batchSize": 32,
        })

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

    def test_openai_compatible_presets_and_custom_url_validation(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = argos_service.ArgosBridge(
                Path(directory), openai_credential_store=FakeCredentialStore()
            )
            connection = bridge._openai_connection("opencode-go", "https://ignored.example/v1")
            self.assertEqual(connection["baseURL"], "https://opencode.ai/zen/go/v1")
            self.assertTrue(connection["requiresKey"])
            local = bridge._openai_connection("custom", "http://127.0.0.1:8000/v1/")
            self.assertEqual(local["baseURL"], "http://127.0.0.1:8000/v1")
            self.assertTrue(local["offline"])
            with self.assertRaises(argos_service.BridgeError) as caught:
                bridge._openai_connection("custom", "http://api.example.com/v1")
            self.assertEqual(caught.exception.code, "openai_url_insecure")

    def test_openai_compatible_key_and_models_use_secure_bearer_header(self):
        with tempfile.TemporaryDirectory() as directory:
            store = FakeCredentialStore()
            bridge = argos_service.ArgosBridge(
                Path(directory), openai_credential_store=store
            )
            captured = {}

            def fake_open(request, timeout):
                captured["request"] = request
                captured["timeout"] = timeout
                return FakeHTTPResponse({"data": [{"id": "kimi-k3"}, {"id": "glm-5.3"}]})

            with mock.patch.object(argos_service.urllib.request, "urlopen", side_effect=fake_open):
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
            bridge = argos_service.ArgosBridge(
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

            with mock.patch.object(argos_service.urllib.request, "urlopen", side_effect=fake_open):
                result = bridge.openai_compatible_translate(
                    "ru", "Russian", source, "kimi-k3", "opencode-go", ""
                )
            self.assertEqual(result["translatedText"], translated)
            self.assertFalse(result["offline"])
            self.assertEqual(result["promptVersion"], argos_service.OPENAI_COMPATIBLE_PROMPT_VERSION)
            self.assertEqual(
                captured["request"].full_url,
                "https://opencode.ai/zen/go/v1/chat/completions",
            )
            request_body = json.loads(captured["request"].data.decode("utf-8"))
            self.assertEqual(request_body["model"], "kimi-k3")
            self.assertEqual(request_body["response_format"]["type"], "json_schema")
            self.assertEqual(captured["request"].get_header("Authorization"), "Bearer secret-key-123456")

    def test_openai_compatible_remote_provider_requires_saved_key(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = argos_service.ArgosBridge(
                Path(directory), openai_credential_store=FakeCredentialStore()
            )
            with self.assertRaises(argos_service.BridgeError) as caught:
                bridge.openai_compatible_translate(
                    "ru", "Russian", "Hello", "kimi-k3", "opencode-go", ""
                )
            self.assertEqual(caught.exception.code, "openai_key_missing")

    def test_translation_history_persists_and_reads_newest_first(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = argos_service.ArgosBridge(Path(directory))
            bridge.log_translation("google", "ru", "Hello", "Привет")
            bridge.log_translation("argos", "de", "Bye", "Tschüss", cached=True)
            self.assertFalse(bridge.log_translation("argos", "de", "Bye", "Tschüss", cached=True))

            history = bridge.read_translation_log(1)
            self.assertTrue(history["ok"])
            self.assertEqual(history["limit"], 1)
            self.assertEqual(len(history["entries"]), 1)
            self.assertEqual(history["entries"][0]["provider"], "argos")
            self.assertEqual(history["entries"][0]["language"], "de")
            self.assertEqual(history["entries"][0]["source"], "Bye")
            self.assertEqual(history["entries"][0]["translation"], "Tschüss")
            self.assertTrue(history["entries"][0]["cached"])

            lines = bridge.translation_log.read_text(encoding="utf-8").splitlines()
            self.assertEqual(len(lines), 2)
            self.assertEqual(json.loads(lines[0])["source"], "Hello")

            reloaded = argos_service.ArgosBridge(Path(directory))
            self.assertFalse(reloaded.log_translation("google", "ru", "Hello", "Привет", cached=True))
            self.assertEqual(len(reloaded.translation_log.read_text(encoding="utf-8").splitlines()), 2)

    def test_update_check_validates_manifest_and_reports_network_failure(self):
        class FakeResponse:
            def __init__(self, payload):
                self.payload = payload

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def geturl(self):
                return argos_service.UPDATE_MANIFEST_URL

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
            bridge = argos_service.ArgosBridge(Path(directory))
            with mock.patch.object(argos_service.urllib.request, "urlopen", return_value=FakeResponse(manifest)):
                result = bridge.check_for_updates()
            self.assertEqual(result["latestVersion"], "0.9.33")
            self.assertEqual(result["cacheCompatibility"], "rebuild")
            self.assertEqual(result["cacheSchema"], 4)
            self.assertEqual(result["changes"], ["Placeholder improvement", "Placeholder bug fix"])

            failure = urllib.error.URLError("offline")
            with mock.patch.object(argos_service.urllib.request, "urlopen", side_effect=failure):
                with self.assertRaises(argos_service.BridgeError) as caught:
                    bridge.check_for_updates()
            self.assertEqual(caught.exception.code, "update_check_failed")
            self.assertEqual(str(caught.exception), "Could not check for updates")


if __name__ == "__main__":
    unittest.main()
