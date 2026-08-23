"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../src/translation-core.js");

const gameId = process.env.VNREVIVAL_GAME;
assert.ok(gameId, "VNREVIVAL_GAME must select exactly one build target");
const gameDirectory = path.join(__dirname, "..", "src", "games", gameId);
const manifest = JSON.parse(fs.readFileSync(path.join(gameDirectory, "game.json"), "utf8"));
require(path.join(gameDirectory, "adapter.js"));
const adapter = globalThis.VNRevivalGameAdapter;
const runtimeSource = fs.readFileSync(path.join(__dirname, "..", "src", "translator-runtime.js"), "utf8");

test("selected game manifest supplies universal runtime identity", () => {
  assert.equal(manifest.id, gameId);
  assert.equal(manifest.sourceLanguage, "en");
  assert.equal(manifest.launchStrategy, "electron-cdp");
  assert.ok(manifest.translatorName);
  assert.ok(manifest.storageNamespace);
  assert.ok(manifest.windowsExecutable.toLowerCase().endsWith(".exe"));
  assert.ok(manifest.debugTargetTitleContains || manifest.debugTargetUrlContains);
});

test("selected DOM adapter satisfies contract version 2", () => {
  assert.equal(adapter.contractVersion, 2);
  assert.ok(Array.isArray(adapter.privateSelectors));
  assert.equal(typeof adapter.categorySelectors, "object");
  assert.ok(Array.isArray(adapter.contextSelectors));
  assert.equal(adapter.hasSourceText("Continue adventure", core), true);
  assert.equal(adapter.hasSourceText("12345", core), false);
  for (const duplicatedField of ["id", "title", "sourceLanguage", "storageNamespace", "supportedVersions"]) {
    assert.equal(Object.hasOwn(adapter, duplicatedField), false, duplicatedField);
  }
});

test("translator panel restores position, drags globally, and collapses to one button", () => {
  assert.match(runtimeSource, /Number\.isFinite\(settings\.x\)/);
  assert.match(runtimeSource, /window\.addEventListener\("pointermove"/);
  assert.match(runtimeSource, /window\.addEventListener\("pointercancel"/);
  assert.match(runtimeSource, /bar\.setPointerCapture/);
  assert.match(runtimeSource, /bar\.addEventListener\("mousedown"/);
  assert.match(runtimeSource, /window\.addEventListener\("mousemove"/);
  assert.match(runtimeSource, /translate3d\(/);
  assert.match(runtimeSource, /getBoundingClientRect\(\)/);
  assert.match(runtimeSource, /style\.setProperty\("--vr-left", left\)/);
  assert.match(runtimeSource, /setProperty\("transform", `translate3d/);
  assert.match(runtimeSource, /\.panel\.collapsed\{width:30px!important/);
  assert.match(runtimeSource, /\.panel\.collapsed \.barTitle\{display:none!important/);
  assert.match(runtimeSource, /\.panel\.collapsed \.bar\{[^}]*cursor:move!important/);
  assert.match(runtimeSource, /const startedOnCollapse = event\.target === collapseButton/);
  assert.match(runtimeSource, /Math\.hypot\(event\.clientX - drag\.startX/);
  assert.doesNotMatch(runtimeSource, /event\.target === collapseButton \|\| settings\.collapsed/);
  assert.match(runtimeSource, /if \(startedOnCollapse && !settings\.collapsed\) \{\s*suppressCollapseClick = false;\s*return;/);
  assert.match(runtimeSource, /if \(!startedOnCollapse\) event\.preventDefault\(\);/);
  assert.match(runtimeSource, /const activateCollapsedButton = event\.type !== "pointercancel"/);
  assert.match(runtimeSource, /completedDrag\.startedOnCollapse && !completedDrag\.moved && settings\.collapsed/);
  assert.match(runtimeSource, /if \(activateCollapsedButton\) \{\s*settings\.collapsed = false;\s*updateCollapsedState\(\);/);
  assert.match(runtimeSource, /collapsed: false,/);
  assert.doesNotMatch(runtimeSource, /settings\.collapsed = !settings\.collapsed;\s*updateCollapsedState\(\);\s*saveSettings\(\)/);
});

test("full-translation mode keeps gameplay cache-only and gates bulk uploads", () => {
  assert.match(runtimeSource, /translateText\(job\.source, language, provider, signal, false\)/);
  assert.match(runtimeSource, /await ensureBulkProviderReady\(\)/);
  assert.match(runtimeSource, /providerRequiresPrivacy\(settings\.provider\) && !settings\.privacyAccepted/);
  assert.match(runtimeSource, /allowBulk/);
  assert.doesNotMatch(runtimeSource, /isBulkMode/);
  assert.doesNotMatch(runtimeSource, /allowAuto/);
});

test("translator panel uses always-on cache application without obsolete manual controls", () => {
  assert.match(runtimeSource, /const AUTO_APPLY_TRANSLATIONS = true/);
  assert.doesNotMatch(runtimeSource, /Sync Translation/);
  assert.doesNotMatch(runtimeSource, /Ctrl\+Shift\+T/);
  assert.doesNotMatch(runtimeSource, /class="auto"/);
  assert.doesNotMatch(runtimeSource, /Automatically apply translations from cache/);
  assert.doesNotMatch(runtimeSource, /mainButton|autoCheckbox/);
});

test("expanded panel shows all settings with one collapse control and a mode toggle", () => {
  assert.match(runtimeSource, /<div class="settings open">/);
  assert.match(runtimeSource, /class="secondary mode modeToggle"/);
  assert.match(runtimeSource, /class="modeChoice translationChoice">Translation/);
  assert.match(runtimeSource, /class="modeChoice originalChoice">Original/);
  assert.doesNotMatch(runtimeSource, /<button class="gear"/);
  assert.equal((runtimeSource.match(/class="collapseToggle"/g) || []).length, 1);
});

test("bulk controls show immediate activity, lock the panel, and report ETA", () => {
  const bulkButtonIndex = runtimeSource.indexOf('class="primary bulkTranslate"');
  const superBulkButtonIndex = runtimeSource.indexOf('class="primary superBulkTranslate"');
  const importButtonIndex = runtimeSource.indexOf('class="secondary importCache"');
  const exportButtonIndex = runtimeSource.indexOf('class="secondary exportCache"');
  assert.ok(bulkButtonIndex > 0 && bulkButtonIndex < superBulkButtonIndex
    && superBulkButtonIndex < importButtonIndex && importButtonIndex < exportButtonIndex);
  assert.match(runtimeSource, /setBulkButtonWorking\("Starting…"\)/);
  assert.match(runtimeSource, /bulkButton\.classList\.add\("working"\)/);
  assert.match(runtimeSource, /\.bulkTranslate\.working::before/);
  assert.match(runtimeSource, /setBulkUiBusy\(true\)/);
  assert.match(runtimeSource, /activeOperation === "test-phrase" \? testPhraseButton : bulkButton/);
  assert.match(runtimeSource, /control === collapseButton \|\| control === cancelButton/);
  assert.match(runtimeSource, /elapsedMs >= 30000/);
  assert.match(runtimeSource, /about \$\{remainingMinutes\} min left/);
});

test("Super Bulk translates the required 17 languages in a fixed sequential order", () => {
  const languageBlock = runtimeSource.slice(
    runtimeSource.indexOf("const SUPER_BULK_LANGUAGES"),
    runtimeSource.indexOf("const AUTO_APPLY_TRANSLATIONS")
  );
  const codes = Array.from(languageBlock.matchAll(/code: "([^"]+)"/g), (match) => match[1]);
  assert.deepEqual(codes, [
    "es", "de", "pl", "vi", "ru", "ar", "fa", "iw", "zh-CN",
    "zh-TW", "ja", "ko", "hi", "bn", "th", "my", "ka"
  ]);
  assert.match(runtimeSource, /class="primary superBulkTranslate"/);
  assert.match(runtimeSource, /async function superBulkTranslateAll\(\)/);
  assert.match(runtimeSource, /for \(let languageIndex = 0; languageIndex < SUPER_BULK_LANGUAGES\.length; languageIndex \+= 1\)/);
  assert.match(runtimeSource, /const result = await translateBulkLanguage\(/);
  assert.match(runtimeSource, /activeOperation = "super-bulk"/);
  assert.match(runtimeSource, /Completed translations stay cached if you cancel/);
  assert.match(runtimeSource, /providerUsesArgos\(settings\.provider\)/);
});

test("test phrase control builds one exact live-dialogue cache entry for every available language", () => {
  assert.match(runtimeSource, /const LANGUAGE_TEST_PHRASE_SOURCE = "<WordWrap>\\\\marHi, OMORI!/);
  assert.match(runtimeSource, /class="primary testPhraseTranslate"/);
  assert.match(runtimeSource, /async function translateTestPhraseAllLanguages\(\)/);
  assert.match(runtimeSource, /const targets = languagesForProvider\(provider\)/);
  assert.match(runtimeSource, /makeTranslationCacheKey\(LANGUAGE_TEST_PHRASE_SOURCE, language, provider\)/);
  assert.match(runtimeSource, /const gameText = "\\\\mar" \+ translated/);
  assert.match(runtimeSource, /Existing cached languages will be skipped/);
  assert.match(runtimeSource, /activeOperation = "test-phrase"/);
  assert.match(runtimeSource, /Test phrase ready in \$\{targets\.length\} languages/);
});

test("project website opens through the operating system browser", () => {
  assert.match(runtimeSource, /class="projectSite"/);
  assert.match(runtimeSource, /window\.nw\.Shell\.openExternal\(target\)/);
  assert.match(runtimeSource, /projectSiteLink\.addEventListener\("click"/);
  assert.match(runtimeSource, /https:\/\/opencode\.ai\/go\?ref=SS6M8DKPP0/);
  assert.match(runtimeSource, /openCodeGoReferralLink\.addEventListener\("click"/);
  assert.match(runtimeSource, /event\.preventDefault\(\)/);
});

test("changing the target language immediately refreshes its cache statistics", () => {
  assert.match(runtimeSource, /const onLanguageChange = \(\) => \{\s*persistControlSettings\(\);\s*refreshCacheStats\(\);/);
});

test("changing language waits for its cache and redraws the current OMORI dialogue", () => {
  assert.match(runtimeSource, /Loading \$\{languageName\} cache/);
  assert.match(runtimeSource, /generation !== settingsGeneration \|\| language !== settings\.language \|\| provider !== settings\.provider/);
  assert.match(runtimeSource, /Ready: \$\{languageName\} cache loaded/);
  assert.equal(typeof adapter.onLanguageChanged, "function");

  let messageRestarts = 0;
  let choiceRefreshes = 0;
  global.window = {
    __vnRevivalTranslator: { getMode: () => "translated" },
    $gameMessage: { _texts: ["Hello"], hasText: () => true },
    SceneManager: {
      _scene: {
        _messageWindow: { pause: true, _waitCount: 12, isOpen: () => true, startMessage: () => { messageRestarts += 1; } },
        _choiceListWindow: { visible: true, refresh: () => { choiceRefreshes += 1; } }
      }
    }
  };
  try {
    adapter.onLanguageChanged("pl", "google");
    assert.equal(global.window.__vnRevival_isTranslatedMode, true);
    assert.equal(messageRestarts, 1);
    assert.equal(global.window.SceneManager._scene._messageWindow.pause, false);
    assert.equal(global.window.SceneManager._scene._messageWindow._waitCount, 0);
    assert.equal(choiceRefreshes, 2);

    global.window.$gameMessage._vnRevivalRawText = "Hello";
    global.window.$gameMessage._texts = [];
    global.window.$gameMessage.hasText = () => false;
    global.window.SceneManager._scene._messageWindow._vnRevivalCurrentText = "Hello";
    global.window.SceneManager._scene._messageWindow.pause = true;
    global.window.SceneManager._scene._messageWindow._waitCount = 20;
    global.window.SceneManager._scene._messageWindow.startMessage = () => {
      assert.deepEqual(global.window.$gameMessage._texts, ["Hello"]);
      messageRestarts += 1;
    };
    adapter.onLanguageChanged("ru", "google");
    assert.equal(messageRestarts, 2);
    assert.equal(global.window.SceneManager._scene._messageWindow.pause, false);
    assert.equal(global.window.SceneManager._scene._messageWindow._waitCount, 0);
    assert.deepEqual(global.window.$gameMessage._texts, []);
    assert.equal(choiceRefreshes, 4);

    let directRedraws = 0;
    global.window.__vnRevivalRedrawCompletedMessage = (raw, mode) => {
      assert.equal(raw, "Hello");
      assert.equal(mode, "translated");
      directRedraws += 1;
      return true;
    };
    global.window.$gameMessage._texts = ["Hello"];
    global.window.SceneManager._scene._messageWindow._textState = null;
    global.window.SceneManager._scene._messageWindow.pause = true;
    adapter.onLanguageChanged("zh-CN", "google");
    assert.equal(directRedraws, 1);
    assert.equal(messageRestarts, 2);
    assert.equal(choiceRefreshes, 6);
  } finally {
    delete global.window;
  }
});

test("bulk translation continues while the game window is hidden", () => {
  assert.match(runtimeSource, /activeOperation !== "bulk" && activeOperation !== "super-bulk"/);
});

test("incomplete bulk translation reports its cancellation or provider failure", () => {
  assert.match(runtimeSource, /Bulk stopped at \$\{done\}\/\$\{strings\.length\}: \$\{activeAbortReason/);
  assert.match(runtimeSource, /Bulk incomplete: \$\{strings\.length - failed\}\/\$\{strings\.length\} saved/);
  assert.match(runtimeSource, /describeTranslationFailure\(error, provider\)/);
  assert.match(runtimeSource, /abortActiveOperation\("target language changed"\)/);
});
