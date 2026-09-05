"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const gameId = process.env.VNREVIVAL_GAME;
assert.ok(gameId, "VNREVIVAL_GAME must select a prototype target");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "src", "games", gameId, "game.json"), "utf8"));
const runtime = fs.readFileSync(path.join(root, "src", "translator-runtime.js"), "utf8");
const panel = fs.readFileSync(path.join(root, "src", "runtime-panel.js"), "utf8");
const build = fs.readFileSync(path.join(root, "scripts", "build.sh"), "utf8");
const prepareResources = fs.readFileSync(path.join(root, "scripts", "prepare-game-resources.sh"), "utf8");
const macLauncher = fs.readFileSync(path.join(root, "launcher", "macos", "launch.sh"), "utf8");
const windowsLauncher = fs.readFileSync(path.join(root, "launcher", "windows", "launcher.c"), "utf8");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "src", "games", "catalog.json"), "utf8"));

test("second-game prototype is realtime-only and cache-isolated", () => {
  assert.equal(manifest.id, "coc2");
  assert.equal(manifest.translationStrategy, "realtime-dom");
  assert.equal(manifest.releaseStatus, "prototype");
  assert.deepEqual(manifest.officialLocalizations, ["en"]);
  assert.notEqual(manifest.storageNamespace, "omori-translator");
  assert.notEqual(manifest.cacheDatabase, "omori-translator-cache");
  assert.equal(Object.hasOwn(manifest, "localizationProfileFile"), false);
  assert.equal(Object.hasOwn(manifest, "testPhraseSource"), false);
});

test("launcher asks for a game before resolving its paths and bundle", () => {
  assert.deepEqual(catalog.games, ["omori", "coc2"]);
  assert.match(macLauncher, /choose from list gameOptions/);
  assert.match(macLauncher, /TRANSLATOR="\$GAME_RESOURCE_DIR\/translator\.bundle\.js"/);
  assert.match(macLauncher, /--game-config "\$GAME_RESOURCE_DIR\/game\.json"/);
  assert.match(windowsLauncher, /TaskDialogIndirect/);
  assert.match(windowsLauncher, /path_join\(game_resources, PATH_CAP, games_root, GAME_ID_W\)/);
  assert.match(windowsLauncher, /path_join\(bundle, PATH_CAP, game_resources, L"translator\.bundle\.js"\)/);
  assert.match(build, /prepare-game-resources\.sh/);
  assert.match(build, /GAME_RESOURCE_BUILD/);
  assert.match(prepareResources, /game-catalog\.py/);
  assert.match(prepareResources, /build-game-bundle\.sh/);
});

test("runtime capabilities prohibit asset paths for realtime games", () => {
  assert.match(runtime, /const REALTIME_DOM_TRANSLATION = TRANSLATION_STRATEGY === "realtime-dom"/);
  assert.match(runtime, /const ASSET_TRANSLATION = TRANSLATION_STRATEGY === "asset-cache"/);
  assert.match(runtime, /if \(!ASSET_TRANSLATION\) return/);
  assert.match(runtime, /allowNetwork: manualScreen \|\| automaticRealtime/);
  assert.match(runtime, /automaticScreen: automaticRealtime/);
  assert.match(runtime, /row\.hidden = !ASSET_TRANSLATION/);
  assert.match(panel, /\.bulkActionRow\[hidden\]\{display:none!important\}/);
  assert.match(build, /Prototype target \$GAME_ID cannot produce release archives/);
});
