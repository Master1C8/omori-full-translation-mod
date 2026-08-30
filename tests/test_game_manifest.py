import copy
import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("game_manifest", ROOT / "scripts/game-manifest.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class GameManifestTests(unittest.TestCase):
    def setUp(self):
        self.manifest_path = ROOT / "src/games/omori/game.json"
        self.valid = json.loads(self.manifest_path.read_text(encoding="utf-8"))

    def write_manifest(self, directory, value):
        path = Path(directory) / "game.json"
        path.write_text(json.dumps(value), encoding="utf-8")
        return path

    def test_current_manifest_is_valid(self):
        manifest = MODULE.load_manifest(self.manifest_path)
        self.assertEqual(manifest["id"], "omori")
        self.assertEqual(manifest["officialLocalizations"], ["en", "ja", "ko", "zh-CN"])

    def test_official_localizations_are_required_unique_and_include_source(self):
        with tempfile.TemporaryDirectory() as directory:
            for localizations in ([], ["ja"], ["en", "ja", "ja"], ["en", "invalid-code"]):
                value = copy.deepcopy(self.valid)
                value["officialLocalizations"] = localizations
                with self.subTest(localizations=localizations), self.assertRaises(ValueError):
                    MODULE.load_manifest(self.write_manifest(directory, value))

    def test_executable_filename_is_allowed_but_paths_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            value = copy.deepcopy(self.valid)
            value["windowsExecutable"] = "Novel Game.exe"
            self.assertEqual(MODULE.load_manifest(self.write_manifest(directory, value))["windowsExecutable"], "Novel Game.exe")
            value["windowsExecutable"] = "bin/Novel Game.exe"
            with self.assertRaises(ValueError):
                MODULE.load_manifest(self.write_manifest(directory, value))

    def test_traversal_and_non_english_source_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            for field, invalid in (
                ("dataDirectory", "../escape"),
                ("crossOverGamePath", "/absolute/game.exe"),
                ("iconPng", "../icon.png"),
                ("iconIcns", "icon.png"),
                ("sourceLanguage", "ja"),
            ):
                value = copy.deepcopy(self.valid)
                value[field] = invalid
                with self.subTest(field=field), self.assertRaises(ValueError):
                    MODULE.load_manifest(self.write_manifest(directory, value))

    def test_legacy_compatibility_is_game_owned_and_validated(self):
        with tempfile.TemporaryDirectory() as directory:
            value = copy.deepcopy(self.valid)
            value["legacyCompatibility"] = {
                "cacheFormats": ["omori-legacy-cache"],
                "coreGlobal": "OMORITranslationCore",
                "languagesGlobal": "OMORITranslatorLanguages",
                "translatorGlobal": "__omoriTranslator"
            }
            manifest = MODULE.load_manifest(self.write_manifest(directory, value))
            self.assertIn("omori-legacy-cache", manifest["legacyCompatibility"]["cacheFormats"])

            value["legacyCompatibility"]["translatorGlobal"] = "bad-name"
            with self.assertRaises(ValueError):
                MODULE.load_manifest(self.write_manifest(directory, value))

    def test_legacy_compatibility_is_optional_for_new_games(self):
        with tempfile.TemporaryDirectory() as directory:
            value = copy.deepcopy(self.valid)
            value.pop("legacyCompatibility", None)
            self.assertNotIn("legacyCompatibility", MODULE.load_manifest(self.write_manifest(directory, value)))

    def test_template_renderer_escapes_xml_and_c_strings(self):
        with tempfile.TemporaryDirectory() as directory:
            template = Path(directory) / "template.txt"
            output = Path(directory) / "output.txt"
            template.write_text("<x>__TITLE_XML__</x> L\"__TITLE_C__\"", encoding="utf-8")
            subprocess.run([
                "python3", str(ROOT / "scripts/render-template.py"), str(template), str(output),
                "TITLE", 'A & B "Edition"'
            ], check=True)
            self.assertEqual(output.read_text(encoding="utf-8"), '<x>A &amp; B &quot;Edition&quot;</x> L"A & B \\"Edition\\""')


if __name__ == "__main__":
    unittest.main()
