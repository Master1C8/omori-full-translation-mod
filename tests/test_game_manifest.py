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
CATALOG_SPEC = importlib.util.spec_from_file_location("game_catalog", ROOT / "scripts/game-catalog.py")
CATALOG_MODULE = importlib.util.module_from_spec(CATALOG_SPEC)
CATALOG_SPEC.loader.exec_module(CATALOG_MODULE)


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
        self.assertEqual(manifest["officialLocalizations"], ["en", "ja", "ko", "zh"])
        self.assertEqual(manifest["translationStrategy"], "asset-cache")

    def test_realtime_prototype_manifest_is_valid_without_asset_profile(self):
        manifest = MODULE.load_manifest(ROOT / "src/games/coc2/game.json")
        self.assertEqual(manifest["translationStrategy"], "realtime-dom")
        self.assertEqual(manifest["releaseStatus"], "prototype")
        self.assertNotIn("localizationProfileFile", manifest)
        self.assertNotIn("testPhraseSource", manifest)

    def test_launcher_catalog_contains_both_games_in_ui_order(self):
        games = CATALOG_MODULE.load_catalog(ROOT / "src/games/catalog.json")
        self.assertEqual([game["id"] for game in games], ["omori", "coc2"])
        self.assertEqual(games[0]["releaseStatus"], "production")
        self.assertEqual(games[1]["releaseStatus"], "prototype")

    def test_windows_launcher_catalog_is_generated_from_manifests(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "game-catalog.generated.h"
            subprocess.run([
                "python3", str(ROOT / "scripts/generate-windows-game-catalog.py"),
                str(ROOT / "src/games/catalog.json"), str(output),
            ], check=True)
            source = output.read_text(encoding="utf-8")
            self.assertIn('L"omori", L"OMORI"', source)
            self.assertIn('L"coc2", L"Corruption of Champions II", L"Corruption of Champions II — Prototype"', source)

    def test_translation_strategy_controls_asset_requirements(self):
        with tempfile.TemporaryDirectory() as directory:
            value = copy.deepcopy(self.valid)
            value["translationStrategy"] = "asset-cache"
            value.pop("localizationProfileFile")
            with self.assertRaises(ValueError):
                MODULE.load_manifest(self.write_manifest(directory, value))
            value["translationStrategy"] = "realtime-dom"
            value["releaseStatus"] = "prototype"
            value.pop("testPhraseSource")
            self.assertEqual(
                MODULE.load_manifest(self.write_manifest(directory, value))["translationStrategy"],
                "realtime-dom",
            )

    def test_update_identity_must_match_game(self):
        with tempfile.TemporaryDirectory() as directory:
            value = copy.deepcopy(self.valid)
            value["updateManifestUrl"] = "https://vnrevival.fun/downloads/coc2/latest.json"
            with self.assertRaises(ValueError):
                MODULE.load_manifest(self.write_manifest(directory, value))
            value = copy.deepcopy(self.valid)
            value["updateProduct"] = "coc2-translator"
            with self.assertRaises(ValueError):
                MODULE.load_manifest(self.write_manifest(directory, value))

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
