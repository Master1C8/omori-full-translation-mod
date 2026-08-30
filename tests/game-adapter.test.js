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
const runtimeSource = ["translator-runtime.js", "runtime-panel.js"]
  .map((file) => fs.readFileSync(path.join(__dirname, "..", "src", file), "utf8"))
  .join("\n");
const runtimeUISource = fs.readFileSync(path.join(__dirname, "..", "src", "runtime-ui.js"), "utf8");
const runtimeProgressSource = fs.readFileSync(path.join(__dirname, "..", "src", "runtime-progress.js"), "utf8");
const createRequestPacerSource = runtimeSource.match(
  /function createRequestPacer\(initialDelay, maximumDelay, delayJitter\) \{[\s\S]*?\n  \}/
);
assert.ok(createRequestPacerSource, "shared request pacer must exist");
const reducedGoogleBulkBlockSizeSource = runtimeSource.match(
  /function reducedGoogleBulkBlockSize\(currentSize, blockLength, error\) \{[\s\S]*?\n  \}/
);
assert.ok(reducedGoogleBulkBlockSizeSource, "adaptive Google Bulk size helper must exist");
const reducedGoogleBulkBlockSize = Function(
  `"use strict"; return (${reducedGoogleBulkBlockSizeSource[0]});`
)();
const buildGoogleBulkBlocksSource = runtimeSource.match(
  /function buildGoogleBulkBlocks\(entries, providerConfig\) \{[\s\S]*?\n  \}/
);
assert.ok(buildGoogleBulkBlocksSource, "Google Bulk block builder must exist");
const buildGoogleBulkBlocks = Function(
  "core", `"use strict"; return (${buildGoogleBulkBlocksSource[0]});`
)(core);

test("selected game manifest supplies universal runtime identity", () => {
  assert.equal(manifest.id, gameId);
  assert.equal(manifest.sourceLanguage, "en");
  assert.equal(manifest.launchStrategy, "electron-cdp");
  assert.ok(manifest.translatorName);
  assert.ok(manifest.storageNamespace);
  assert.deepEqual(manifest.officialLocalizations, ["en", "ja", "ko", "zh-CN"]);
  assert.ok(manifest.officialLocalizations.includes(manifest.sourceLanguage));
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

test("full-translation mode keeps gameplay cache-only and starts explicit translations directly", () => {
  assert.match(runtimeSource, /const manualScreen = isManual && settings\.translationScope === "screen"/);
  assert.match(runtimeSource, /allowNetwork: manualScreen/);
  assert.match(runtimeSource, /ensureTranslationProviderReady\(automaticScreen \? "auto-screen" : "screen"\)/);
  assert.match(runtimeSource, /ensureTranslationProviderReady\("bulk"\)/);
  assert.doesNotMatch(runtimeSource, /privacyAccepted|providerRequiresPrivacy|allowBulk|cancelBulk/);
  assert.doesNotMatch(runtimeSource, /isBulkMode/);
  assert.doesNotMatch(runtimeSource, /allowAuto/);
});

test("official game localizations disable translator activity except language selection", () => {
  assert.match(runtimeSource, /const OFFICIAL_LOCALIZATIONS = new Set\(game\.officialLocalizations \|\| \[\]\)/);
  assert.match(runtimeSource, /function hasOfficialLocalization\(language = settings\.language\)/);
  assert.match(runtimeSource, /if \(hasOfficialLocalization\(language\)\) \{\s*return \{ text: source, cached: true, officialLocalization: true \};/);
  assert.match(runtimeSource, /if \(control !== languageSelect\) control\.disabled = true/);
  assert.match(runtimeSource, /languageSelect\.disabled = false/);
  assert.match(runtimeSource, /!hasOfficialLocalization\(code\) && providerConfig\.supportsLanguage\(code\)/);
  assert.match(runtimeSource, /!hasOfficialLocalization\(\) && settings\.autoScreenTranslation/);
  assert.match(runtimeSource, /if \(!hasOfficialLocalization\(\) && settings\.mode === "translated"/);
});

test("natural OMORI dialogue is not rejected by broad code punctuation heuristics", () => {
  assert.doesNotMatch(runtimeSource, /source\.includes\("this\."\)/);
  assert.doesNotMatch(runtimeSource, /\/\[\\\+\\\*\\\/\]\/\.test\(source\)/);
  assert.match(runtimeSource, /!core\.hasTranslatableText\(source\)/);
});

test("cache mutations wait for IndexedDB commit before updating in-memory state", () => {
  const cachePutBody = runtimeSource.slice(
    runtimeSource.indexOf("async function cachePut"),
    runtimeSource.indexOf("async function preloadMemoryCache")
  );
  const clearAllBody = runtimeSource.slice(
    runtimeSource.indexOf("async function clearAllCache"),
    runtimeSource.indexOf("function sleep")
  );
  assert.ok(cachePutBody.indexOf("transaction.oncomplete") < cachePutBody.indexOf("memoryCacheSet(entry.key, entry.value)"));
  assert.match(cachePutBody, /transaction\.onabort/);
  assert.doesNotMatch(cachePutBody, /catch \(_\) \{ return false; \}/);
  assert.ok(clearAllBody.indexOf("transaction.oncomplete") < clearAllBody.indexOf("memoryCache.clear()"));
  assert.match(clearAllBody, /transaction\.onabort/);
  assert.doesNotMatch(clearAllBody, /catch \(_\)/);
  assert.match(cachePutBody, /async function cachePutBatch\(entries\)/);
  assert.match(cachePutBody, /for \(const entry of normalized\)/);
  assert.match(runtimeSource, /knownCacheKeysComplete\s*&& knownCacheScope === translationCacheScope/);
  assert.match(runtimeSource, /!cacheKeyIsKnownMissing\(key, language, provider\)/);
});

test("cache-only gameplay does not write per-frame activity logs", () => {
  const cachedBranch = runtimeSource.slice(
    runtimeSource.indexOf("if (cached) {", runtimeSource.indexOf("async function translateText")),
    runtimeSource.indexOf("if (!allowNetwork)", runtimeSource.indexOf("async function translateText"))
  );
  assert.match(cachedBranch, /if \(logCachedResult\)/);
  assert.match(cachedBranch, /logActivityToBridge\(provider, source, cached, true\)/);
  assert.doesNotMatch(cachedBranch, /}\s*logActivityToBridge\(provider, source, cached, true\)/);
});

test("every provider path protects OMORI markup and rejects unsafe cached output", () => {
  assert.match(runtimeSource, /core\.translateProtectedText\(/);
  assert.match(runtimeSource, /\{ language, contextual: true \}/);
  assert.match(runtimeSource, /translateWithProtectedMarkup\(\s*source, language, provider/);
  assert.match(runtimeSource, /translateWithProtectedMarkup\(\s*LANGUAGE_TEST_PHRASE_SOURCE/);
  assert.match(runtimeSource, /core\.adaptTranslationToSourceLayout\(source, cached\)/);
  assert.match(runtimeSource, /core\.adaptTranslationToSourceLayout\(source, hit\)/);
  assert.match(runtimeSource, /core\.PROTECTED_MARKUP_VERSION/);
  assert.match(runtimeSource, /indexedDB\.open\(DB_NAME, 5\)/);
  assert.match(runtimeSource, /event\.oldVersion < 5/);
});

test("Google context isolates and narrowly removes only its old selected-language cache", () => {
  assert.match(runtimeSource, /const GOOGLE_CONTEXT_VERSION = "google-context-v1"/);
  assert.match(runtimeSource, /provider === "google"\) providerVariant = GOOGLE_CONTEXT_VERSION/);
  const migrationBody = runtimeSource.slice(
    runtimeSource.indexOf("async function clearLegacyGoogleSegmentCache"),
    runtimeSource.indexOf("async function clearAllCache")
  );
  assert.match(migrationBody, /core\.cacheKeyGame\(cursor\.key\) === game\.id/);
  assert.match(migrationBody, /core\.cacheKeyProvider\(cursor\.key\) === "google"/);
  assert.match(migrationBody, /core\.cacheKeyLanguage\(cursor\.key\) === language/);
  assert.match(migrationBody, /core\.cacheKeyVariant\(cursor\.key\) === legacyVariant/);
  assert.match(migrationBody, /await rebuildCacheMetadata\(\)/);
  assert.doesNotMatch(migrationBody, /TRANSLATION_PACK_STORE_NAME|clearCacheForProvider/);
});

test("translator panel keeps cache application automatic and offers opt-in completed-dialogue Screen translation", () => {
  assert.match(runtimeSource, /const AUTO_APPLY_TRANSLATIONS = true/);
  assert.doesNotMatch(runtimeSource, /Sync Translation/);
  assert.doesNotMatch(runtimeSource, /class="auto"/);
  assert.doesNotMatch(runtimeSource, /Automatically apply translations from cache/);
  assert.doesNotMatch(runtimeSource, /mainButton|autoCheckbox/);
  assert.match(runtimeSource, /class="primary screenTranslate"[^>]*aria-keyshortcuts="Control\+Shift\+T"[^>]*>Translate current screen \(Ctrl\+Shift\+T\)<\/button>/);
  assert.match(runtimeSource, /const SCREEN_TRANSLATION_CANCEL_LABEL = "Cancel current screen \(Ctrl\+Shift\+T\)"/);
  assert.match(runtimeSource, /screenTranslateButton\.addEventListener\("click", triggerScreenTranslation\)/);
  assert.match(runtimeSource, /autoScreenTranslation: false/);
  assert.match(runtimeSource, /source\.autoScreenTranslation === true/);
  assert.match(runtimeSource, /class="screenAuto" type="checkbox"/);
  assert.match(runtimeSource, /screenAutoCheckbox\.addEventListener\("change"/);
  assert.match(runtimeSource, /registerCompletedScreenText/);
  assert.match(runtimeSource, /automaticScreen: true/);
  assert.match(runtimeSource, /activeOperation = automaticScreen \? "screen-auto"/);
  assert.match(runtimeSource, /event\.ctrlKey && event\.shiftKey && !event\.altKey && !event\.metaKey/);
  assert.match(runtimeSource, /event\.code === "KeyT"/);
  assert.match(runtimeSource, /settings\.translationScope !== "screen"/);
  assert.match(runtimeSource, /origin\.matches\("input,textarea,select,\[contenteditable='true'\]"\)/);
  assert.match(runtimeSource, /allowNetwork: manualScreen/);
  assert.match(runtimeSource, /adapter\.collectVisibleTexts\(\)/);
  assert.match(runtimeSource, /translateText\(\s*job\.source, language, provider, signal, allowNetwork === true/);
  assert.match(runtimeSource, /function buildScreenAdapterJobs\(sources\)/);
  assert.match(runtimeSource, /Math\.min\(12, freshSources\.length - offset\)/);
  assert.match(runtimeSource, /contextSource = core\.buildContextSource\(slice\)/);
  assert.match(runtimeSource, /parts: slice\.map\(\(source\) => \(\{ source, node: null, kind: "ui" \}\)\)/);
  assert.match(runtimeSource, /queryMemoryTranslation\(source\)\) cachedJobs\.push\(job\)/);
  assert.match(runtimeSource, /if \(!isManual && settings\.translationScope === "screen"\)/);
  assert.match(runtimeSource, /settings\.translationScope !== "screen" && hasSourceText\(text\)/);
  assert.match(runtimeSource, /if \(nextScope === "screen"\) invalidateAppliedTranslations\(\)/);
});

test("expanded panel shows all settings with one collapse control and a mode toggle", () => {
  assert.match(runtimeSource, /<div class="settings open">/);
  assert.match(runtimeSource, /class="secondary mode modeToggle"/);
  assert.match(runtimeSource, /aria-label="Dialogue display"/);
  assert.match(runtimeSource, /class="modeChoice translationChoice">Translation/);
  assert.match(runtimeSource, /class="modeChoice originalChoice">Original/);
  assert.match(runtimeSource, /class="scopeChoice storyTranslationScope active" type="button" aria-pressed="true"/);
  assert.match(runtimeSource, /class="scopeChoice fullTranslationScope" type="button" aria-pressed="false"/);
  assert.match(runtimeSource, /class="scopeChoice screenTranslationScope" type="button" aria-pressed="false"/);
  assert.match(runtimeSource, /Stable · dialogue windows/);
  assert.match(runtimeSource, /Experimental · menus \+ dialogue/);
  assert.match(runtimeSource, /\["story", "full", "screen"\]\.includes\(source\.translationScope\)/);
  assert.match(runtimeSource, /fullTranslationScopeButton\.addEventListener\("click", \(\) => setTranslationScope\("full"\)\)/);
  assert.match(runtimeSource, /screenTranslationScopeButton\.addEventListener\("click", \(\) => setTranslationScope\("screen"\)\)/);
  assert.match(runtimeSource, /getTranslationScope: \(\) => settings\.translationScope/);
  assert.doesNotMatch(runtimeSource, /<button class="gear"/);
  assert.equal((runtimeSource.match(/class="collapseToggle"/g) || []).length, 1);
});

test("active translation uses the full app for word progress, live log, and its cancel button", () => {
  const bulkButtonIndex = runtimeSource.indexOf('class="primary bulkTranslate"');
  const testPhraseButtonIndex = runtimeSource.indexOf('class="primary testPhraseTranslate"');
  const importButtonIndex = runtimeSource.indexOf('class="secondary importCache"');
  const exportButtonIndex = runtimeSource.indexOf('class="secondary exportCache"');
  assert.ok(bulkButtonIndex > 0 && bulkButtonIndex < testPhraseButtonIndex
    && testPhraseButtonIndex < importButtonIndex && importButtonIndex < exportButtonIndex);
  assert.match(runtimeSource, /setBulkButtonWorking\("Starting…"\)/);
  assert.match(runtimeSource, /runtimeUI\.setButtonState\(bulkButton, \{ working: true, label, disabled: false \}\)/);
  assert.match(runtimeUISource, /button\.classList\.toggle\("working", working\)/);
  assert.match(runtimeSource, /\.bulkTranslate\.working::before/);
  assert.match(runtimeSource, /\.bulkCancel\.working::before/);
  assert.match(runtimeSource, /Interrupt translation \(progress will be saved\)/);
  assert.match(runtimeSource, /setBulkUiBusy\(true\)/);
  assert.match(runtimeSource, /const bulkCancelButton = shadow\.querySelector\("\.bulkCancel"\)/);
  assert.match(runtimeSource, /activeOperation === "test-phrase" \? testPhraseButton : bulkButton/);
  assert.match(runtimeSource, /host\.classList\.toggle\("bulkBusyHost", busy\)/);
  assert.match(runtimeSource, /row\.classList\.toggle\("activeBulkAction", busy && row\.contains\(cancelButton\)\)/);
  assert.match(runtimeSource, /if \(busy\) translationLogBox\.open = true/);
  assert.match(runtimeSource, /:host\(\.bulkBusyHost\)\{left:0!important;top:0!important;right:0!important;width:100vw!important;height:100vh!important\}/);
  assert.match(runtimeSource, /\.panel\.bulkBusy>\*\{display:none!important\}/);
  assert.match(runtimeSource, /\.panel\.bulkBusy \.cacheBox>\.translationLogBox\{display:flex!important;flex:1 1 auto!important/);
  assert.match(runtimeSource, /\.panel\.bulkBusy>\.bulkCancelBar\{display:flex!important;flex:0 0 auto!important/);
  assert.match(runtimeSource, /bulkCancelButton\.addEventListener\("click"/);
  assert.match(runtimeSource, /bulkCancelButton\.style\.background = cancelButton\.style\.background/);
  assert.match(runtimeSource, /function setBulkUiFinished\(\) \{[\s\S]{0,500}bulkCancelButton\.textContent = "Finish";[\s\S]{0,300}bulkCancelButton\.classList\.add\("finished"\)/);
  assert.match(runtimeSource, /setStatus\(`Bulk complete:[\s\S]{0,220}keepWorkspaceOpen = true;\s*workspaceFinished = true;/);
  assert.match(runtimeSource, /setStatus\(`Test phrase ready[\s\S]{0,220}keepWorkspaceOpen = true;\s*workspaceFinished = true;/);
  assert.match(runtimeSource, /if \(workspaceFinished\) setBulkUiFinished\(\);\s*else setBulkUiStopped\(\);/);
  assert.match(runtimeSource, /function countTranslationWords\(value\)/);
  assert.match(runtimeSource, /runtimeProgress\.countTranslationWords\(value, core\.tokenizeProtectedMarkup\)/);
  assert.match(runtimeSource, /function createTranslationEtaTracker\(\)/);
  assert.match(runtimeSource, /runtimeProgress\.createEtaTracker\(\(\) => performance\.now\(\)\)/);
  assert.match(runtimeProgressSource, /points\.length > 12 \|\| activeTime - points\[0\]\.time > 90000/);
  assert.match(runtimeProgressSource, /lastEstimate \* 0\.65/);
  assert.match(runtimeSource, /function translationProgressText\(completedWords, totalWords, remainingMs, waitSeconds, provider\)/);
  assert.match(runtimeProgressSource, /`Words: \$\{completed\.toLocaleString\("en-US"\)\}\/\$\{total\.toLocaleString\("en-US"\)\}`/);
  assert.match(runtimeProgressSource, /Rate limited by \$\{providerLabel\} · retrying in \$\{formatRetryCountdown\(Math\.ceil\(options\.waitSeconds\)\)\}/);
  assert.match(runtimeProgressSource, /Time left: about \$\{Math\.ceil\(options\.remainingMs \/ 60000\)\} min/);
  assert.match(runtimeSource, /appendTranslationLog\(LANGUAGE_TEST_PHRASE_SOURCE, translated, language, provider, false\)/);
  assert.match(runtimeSource, /appendTranslationLog\(LANGUAGE_TEST_PHRASE_SOURCE, existing, language, existingImported \? "Imported translation" : provider, true\)/);
});

test("ETA throughput uses only fresh translations from the current operation", () => {
  assert.match(runtimeSource,
    /etaTracker\.update\(newlyTranslated, newlyTranslated \+ remainingJobs\)/);
  assert.match(runtimeSource,
    /etaTracker\.update\(created, created \+ Math\.max\(0, targets\.length - done\)\)/);
  assert.doesNotMatch(runtimeSource, /etaTracker\.update\(done, strings\.length\)/);
  assert.doesNotMatch(runtimeSource, /etaTracker\.update\(done, targets\.length\)/);
});

test("reset all data shows activity until cache deletion finishes", () => {
  assert.match(runtimeSource, /\.reset\.working::before/);
  assert.match(runtimeSource, /function setResetButtonWorking\(\)/);
  assert.match(runtimeSource, /runtimeUI\.setButtonState\(resetButton, \{ working: true, label: "Resetting…", disabled: true \}\)/);
  assert.match(runtimeSource, /resetButton\.addEventListener\("click", async \(\) =>/);
  assert.match(runtimeSource, /Factory reset permanently deletes all translator caches, imported packs, saved translation history/);
  assert.match(runtimeSource, /OMORI saves and game files are not affected/);
  assert.match(runtimeSource, /requestLocalHelper\("\/v1\/reset"/);
  assert.match(runtimeSource, /body: \{ accepted: true, openAIBaseURLs: credentialScopes \}/);
  assert.match(runtimeSource, /fuzzyMemoryCache\.clear\(\)/);
  assert.match(runtimeSource, /key\.startsWith\(storagePrefix\)/);
  assert.match(runtimeSource, /clearTranslationLog\(\)/);
  assert.match(runtimeSource, /Factory reset complete · restart the translator/);
  assert.match(runtimeSource, /await deleteAllTranslatorData\(\)/);
  assert.match(runtimeSource, /finally \{\s*setResetButtonIdle\(\)/);
});

test("live translation log shows new source and target pairs without unbounded growth", () => {
  assert.match(runtimeSource, /<summary>Live translation log<\/summary>/);
  assert.match(runtimeSource, /appendTranslationLog\(source, translated, language, provider, false\)/);
  assert.match(runtimeSource, /appendTranslationLog\(source, cached, language, provider, true\)/);
  assert.match(runtimeSource, /translateText\(\s*source, language, provider, signal, true, true,/);
  assert.match(runtimeSource, /cached \? " · cache" : ""/);
  assert.match(runtimeSource, /sourceLine\.textContent = `EN: \$\{source\}`/);
  assert.match(runtimeSource, /targetLine\.textContent = `\$\{String\(language \|\| "translation"\)\.toUpperCase\(\)\}: \$\{translation\}`/);
  assert.match(runtimeSource, /const TRANSLATION_LOG_LIMIT = 40/);
  assert.match(runtimeSource, /translationLogEntries\.children\.length > TRANSLATION_LOG_LIMIT/);
  assert.match(runtimeSource, /translationLogBox\.open = true/);
  assert.match(runtimeSource, /class="secondary translationLogHold"[^>]+aria-pressed="false"/);
  assert.match(runtimeSource, /setTranslationLogScrollPaused\(!translationLogScrollPaused\)/);
  assert.match(runtimeSource, /control === translationLogHoldButton/);
  assert.match(runtimeSource, /const viewport = translationLogScrollPaused \? translationLogPausedViewport : null/);
  assert.match(runtimeSource, /translationLogPausedViewport = translationLogScrollPaused \? captureTranslationLogViewport\(\) : null/);
  assert.match(runtimeSource, /addEventListener\("wheel", rememberManuallyScrolledLogViewport/);
  assert.doesNotMatch(runtimeSource, /translationLogEntries\.addEventListener\("scroll"/);
  assert.match(runtimeSource, /viewport\.anchor\.getBoundingClientRect\(\)\.top - viewportTop/);
  assert.match(runtimeSource, /children\.slice\(anchorIndex, anchorIndex \+ TRANSLATION_LOG_LIMIT\)/);
  assert.match(runtimeSource, /if \(!retained\.has\(child\)\) child\.remove\(\)/);
  assert.match(runtimeSource, /pruneTranslationLogEntries\(null\);\s*translationLogEntries\.scrollTop = 0/);
  assert.match(runtimeSource, /translationLogEntries\.scrollTop = 0/);
  assert.match(runtimeSource, /overflow-anchor:none/);
  assert.match(runtimeSource, /translationLogClearButton\.addEventListener\("click", clearTranslationLog\)/);
  assert.match(runtimeSource, /activeOperation = "bulk";[\s\S]{0,300}setBulkUiBusy\(true\);\s*clearTranslationLog\(\)/);
  assert.match(runtimeSource, /activeOperation = "test-phrase";[\s\S]{0,300}setBulkUiBusy\(true\);\s*clearTranslationLog\(\)/);
});

test("translation history persists locally and can be viewed or saved", () => {
  assert.match(runtimeSource, /await logTranslationToBridge\(provider, language, source, translated, false\)/);
  assert.match(runtimeSource, /await logTranslationToBridge\(provider, language, source, cached, true\)/);
  assert.match(runtimeSource, /requestLocalHelper\("\/v1\/log\/translation"/);
  assert.match(runtimeSource, /const TRANSLATION_LOG_VIEW_LIMIT = 200/);
  assert.match(runtimeSource, />View saved<\/button>/);
  assert.match(runtimeSource, />Save file<\/button>/);
  assert.match(runtimeSource, />Clear view<\/button>/);
  assert.match(runtimeSource, /requestLocalHelper\(`\/v1\/log\/translations\?limit=\$\{TRANSLATION_LOG_VIEW_LIMIT\}`\)/);
  assert.match(runtimeSource, /\/v1\/log\/translations\/download/);
  assert.match(runtimeSource, /OMORI-translation-history-\$\{new Date\(\)\.toISOString\(\)\.slice\(0, 10\)\}\.jsonl/);
  assert.match(runtimeSource, /Saved history remains on disk/);
  assert.match(runtimeSource, /sourceLine\.textContent/);
  assert.doesNotMatch(runtimeSource, /translationLogEntries\.innerHTML/);
});

test("shared translation files are inspected, confirmed, and stored as a reversible overlay", () => {
  assert.match(runtimeSource, /const TRANSLATION_PACK_STORE_NAME = "translationPackEntries"/);
  assert.match(runtimeSource, /indexedDB\.open\(DB_NAME, 5\)/);
  assert.match(runtimeSource, /createObjectStore\(TRANSLATION_PACK_STORE_NAME, \{ keyPath: "key" \}\)/);
  assert.match(runtimeSource, /async function inspectTranslationFile\(file\)/);
  assert.match(runtimeSource, /core\.cacheKeyLanguage\(entry\[0\]\)/);
  assert.match(runtimeSource, /core\.protectedMarkupLayoutMatches\(source, translation\)/);
  assert.match(runtimeSource, /class="packModal" role="dialog" aria-modal="true"/);
  assert.match(runtimeSource, />Cancel<\/button><button class="primary packConfirm" type="button">Import<\/button>/);
  assert.match(runtimeSource, /The imported translation will be shown before your own provider cache/);
  assert.match(runtimeSource, /const importedTranslation = await importedPackGet\(source, language\)/);
  assert.match(runtimeSource, /const imported = importedPackMemoryGet\(source, language\)/);
  assert.match(runtimeSource, /async function deleteTranslationPackEntries\(packId\)/);
  assert.match(runtimeSource, />Load translation file<\/button>/);
  assert.match(runtimeSource, />Remove imported<\/button>/);
});

test("startup update check reports availability, cache impact, and failure", () => {
  assert.match(runtimeSource, /<div class="updateStatus">Checking for updates…<\/div>/);
  assert.match(runtimeSource, /requestLocalHelper\("\/v1\/update\/check"/);
  assert.match(runtimeSource, /function compareVersions\(left, right\)/);
  assert.match(runtimeSource, /Update \$\{latest\} available · \$\{cacheMessage\}/);
  assert.match(runtimeSource, /translation cache rebuild required/);
  assert.match(runtimeSource, /translation cache will be kept/);
  assert.match(runtimeSource, /function showUpdateChanges\(changes\)/);
  assert.match(runtimeSource, /slice\(0, 3\)/);
  assert.match(runtimeSource, /Update notes placeholder — details source will be configured later\./);
  assert.match(runtimeSource, /item\.textContent = change\.trim\(\)\.slice\(0, 200\)/);
  assert.match(runtimeSource, /showUpdateChanges\(payload\.changes\)/);
  assert.match(runtimeSource, /Could not check for updates/);
  assert.match(runtimeSource, /checkForUpdates\(\);/);
});

test("removed Super Bulk mode is absent from the runtime", () => {
  assert.doesNotMatch(runtimeSource, /SUPER_BULK_LANGUAGES|superBulkTranslateAll|superBulkTranslate|super-bulk|Super Bulk/);
});

test("test phrase control builds one exact live-dialogue cache entry for every available language", () => {
  assert.match(runtimeSource, /const LANGUAGE_TEST_PHRASE_SOURCE = "<WordWrap>\\\\marHi, OMORI!/);
  assert.match(runtimeSource, /class="primary testPhraseTranslate"/);
  assert.match(runtimeSource, /async function translateTestPhraseAllLanguages\(\)/);
  assert.match(runtimeSource, /requestAnimationFrame\(finish\);\s*setTimeout\(finish, 100\)/);
  assert.match(runtimeSource, /const targets = languagesForProvider\(provider\)/);
  assert.match(runtimeSource, /makeTranslationCacheKey\(LANGUAGE_TEST_PHRASE_SOURCE, language, provider\)/);
  assert.match(runtimeSource, /translateWithProtectedMarkup\(\s*LANGUAGE_TEST_PHRASE_SOURCE/);
  assert.match(runtimeSource, /await cachePut\(key, translated\)/);
  assert.match(runtimeSource, /Existing cached languages will be skipped/);
  assert.match(runtimeSource, /activeOperation = "test-phrase"/);
  assert.match(runtimeSource, /async function requestRateLimitedChunk/);
  assert.match(runtimeSource, /deferRateLimits: true/);
  assert.match(runtimeSource, /googleRateLimitRemaining/);
  assert.match(runtimeSource, /GOOGLE_RATE_LIMIT_STATE_KEY/);
  assert.match(runtimeSource, /LEGACY_GOOGLE_RATE_LIMIT_UNTIL_KEY/);
  assert.match(runtimeSource, /core\.parseRateLimitState/);
  assert.match(runtimeSource, /core\.createRateLimitState/);
  assert.match(runtimeSource, /retryDelay = googleRateLimitState\(\)\.nextDelay/);
  assert.match(runtimeSource, /rememberGoogleRateLimit/);
  assert.match(runtimeSource, /Google waits a random 1\.2–1\.8 seconds between languages/);
  assert.match(runtimeSource, /etaTracker\.pause\(\);\s*setStatus\(translationProgressText\(\s*done \* phraseWords, totalWords, etaTracker\.current\(\), seconds/);
  assert.match(runtimeSource, /const concurrency = 1/);
  assert.match(runtimeSource, /createRequestPacer\(\s*TEST_PHRASE_GOOGLE_DELAY,\s*TEST_PHRASE_GOOGLE_DELAY,\s*TEST_PHRASE_GOOGLE_DELAY_JITTER/);
  assert.match(runtimeSource, /requestPacer \? 0 : undefined/);
  assert.doesNotMatch(runtimeSource, /Math\.max\(TEST_PHRASE_GOOGLE_DELAY, providerConfig\.delay\)/);
  assert.match(runtimeSource, /Test phrase ready in \$\{targets\.length\} languages/);
});

test("Bulk pauses and retries the current request when a provider rate-limits", () => {
  assert.match(runtimeSource, /requestRateLimitedChunk\(provider, text, language, signal, onRateLimitWait, requestOptions\)/);
  assert.match(runtimeSource, /waitReported = true/);
  assert.match(runtimeSource, /rateLimitSeconds: seconds/);
  assert.match(runtimeSource, /done, completedWords, totalWords, newlyTranslated, failed, rateLimitSeconds: seconds/);
  assert.match(runtimeSource, /providerConfig\.batchSize \|\| 3/);
  assert.match(runtimeSource, /etaTracker\.pause\(\);\s*setStatus\(translationProgressText\(\s*completedWords, totalWords, etaTracker\.current\(\), rateLimitSeconds/);
  assert.match(runtimeProgressSource, /return `\$\{wordProgress\} · Rate limited by \$\{providerLabel\} · retrying in \$\{formatRetryCountdown\(Math\.ceil\(options\.waitSeconds\)\)\}`/);
});

test("Google Bulk groups only fresh strings into paced validated blocks", () => {
  assert.match(runtimeSource, /if \(provider === "google"\) \{\s*return translateGoogleBulkLanguage/);
  assert.match(runtimeSource, /function buildGoogleBulkBlocks\(entries, providerConfig\)/);
  assert.match(runtimeSource, /function reducedGoogleBulkBlockSize\(currentSize, blockLength, error\)/);
  assert.match(runtimeSource, /if \(length < 3\) return current/);
  assert.match(runtimeSource, /acceptedCount > 0\s*\? Math\.max\(3, current - 2\)\s*:\s*Math\.max\(3, Math\.ceil\(Math\.min\(current, length\) \/ 2\)\)/);
  assert.match(runtimeSource, /providerConfig\.bulkMaxItems/);
  assert.match(runtimeSource, /providerConfig\.bulkMaxSegments/);
  assert.match(runtimeSource, /blockSegments \+ entrySegments <= maximumSegments/);
  assert.match(runtimeSource, /core\.tokenizeProtectedMarkup\(entry\.source\)/);
  assert.match(runtimeSource, /core\.utf8Length\(contextSource\) <= maximumSize/);
  assert.match(runtimeSource, /translateText\(entry\.source, language, provider, signal, false, false\)/);
  assert.match(runtimeSource, /createRequestPacer\(\s*providerConfig\.bulkDelay,\s*providerConfig\.bulkMaxDelay \|\| providerConfig\.bulkDelay/);
  assert.match(runtimeSource, /providerConfig\.bulkDelayJitter/);
  assert.match(runtimeSource, /nextRequestAt = Date\.now\(\) \+ delay \+ Math\.random\(\) \* jitter/);
  assert.match(runtimeSource, /beforeAttempt: options\.pacer \? \(\) => options\.pacer\.wait\(signal\) : null/);
  assert.match(runtimeSource, /requestPacer\.setDelay\(requestPacer\.maximum\)/);
  assert.match(runtimeSource, /core\.buildContextSource\(entries\.map\(\(entry\) => entry\.source\)\)/);
  assert.match(runtimeSource, /core\.parseContextTranslation\(result\.text, entries\.length\)/);
  assert.match(runtimeSource, /core\.translationQualityMatches\(entries\[index\]\.source, translations\[index\], language\)/);
  assert.match(runtimeSource, /await cachePutBatch\(acceptedEntries\.map/);
  assert.match(runtimeSource, /await logTranslationBatchToBridge\(logEntries\)/);
  assert.match(runtimeSource, /contextual: entries\.length > 1 && requestOptions\.isolatedSegments !== true/);
  assert.match(runtimeSource, /contextFallback: entries\.length === 1/);
  assert.match(runtimeSource, /acceptedEntries: acceptedEntries\.map\(\(accepted\) => accepted\.entry\)/);
  assert.match(runtimeSource, /error\.rejectedEntries = saved\.rejectedEntries/);
  assert.match(runtimeSource, /async function finishAdaptiveGoogleBlock\(entries, error\)/);
  assert.match(runtimeSource, /error && error\.code === "translation_quality_invalid"/);
  assert.match(runtimeSource, /error\.code !== "markup_format_invalid"\s*&& error\.code !== "google_context_format_invalid"/);
  assert.match(runtimeSource, /quality-rejected strings once, individually/);
  assert.match(runtimeSource, /requestFor\("quality-retry", 1\)/);
  assert.match(runtimeSource, /\{ isolatedSegments: true, contextRepair: true \}/);
  assert.match(runtimeSource, /measured\.batch = async function requestMeasuredGoogleBatch/);
  assert.match(runtimeSource, /requestRateLimitedChunks\(/);
  assert.match(runtimeSource, /options\.translateBatch = \(texts\) => request\.batch\(texts\)/);
  assert.match(runtimeSource, /logFailureBatchToBridge\(entries\.slice/);
  assert.match(runtimeSource, /const middle = Math\.ceil\(rejectedEntries\.length \/ 2\)/);
  assert.match(runtimeSource, /rejectedEntries\.slice\(0, middle\), rejectedEntries\.slice\(middle\)/);
  assert.match(runtimeSource, /requestFor\("structural-split", part\.length\)/);
  assert.match(runtimeSource, /await finishAdaptiveGoogleBlock\(part, partError\)/);
  assert.match(runtimeSource, /providerConfig\.bulkConsecutiveFailureLimit/);
  assert.match(runtimeSource, /const pendingBlocks = buildGoogleBulkBlocks\(freshEntries, providerConfig\)/);
  assert.match(runtimeSource, /pendingBlock\.slice\(0, adaptiveBlockSize\)/);
  assert.match(runtimeSource, /pendingBlocks\.unshift\(pendingBlock\.slice\(block\.length\)\)/);
  assert.match(runtimeSource, /consecutiveCleanBlocks >= 4/);
  assert.match(runtimeSource, /adaptiveBlockSize = Math\.min\(maximumAdaptiveBlockSize, adaptiveBlockSize \+ 2\)/);
  assert.match(runtimeSource, /reducedGoogleBulkBlockSize\(adaptiveBlockSize, block\.length, error\)/);
  assert.match(runtimeSource, /const translatedBeforeFallback = newlyTranslated/);
  assert.match(runtimeSource, /await finishAdaptiveGoogleBlock\(block, error\)/);
  assert.match(runtimeSource, /const fallbackTranslated = newlyTranslated - translatedBeforeFallback/);
  assert.match(runtimeSource, /terminalSystemicFailures \+= await finishAdaptiveGoogleBlock\(part, partError\)/);
  assert.match(runtimeSource, /const blockFailedAfterFallback = fallbackTranslated === 0\s*&& fallbackFailed >= block\.length\s*&& terminalSystemicFailures >= block\.length/);
  assert.match(runtimeSource, /if \(blockFailedAfterFallback\) \{\s*requestPacer\.setDelay\(requestPacer\.getDelay\(\) \+ 1000\);/);
  assert.doesNotMatch(runtimeSource, /if \(isSystemicGoogleBulkFailure\(error\)\) \{\s*requestPacer\.setDelay/);
  assert.match(runtimeSource, /consecutiveFullBlockFailures >= consecutiveFailureLimit/);
  assert.match(runtimeSource, /Google Bulk stopped after \$\{consecutiveFailureLimit\} consecutive systemic block failures/);
  assert.match(runtimeSource, /logPerformanceToBridge\(events\.slice/);
  assert.match(runtimeSource, /averageAcceptedPerRequest/);
  assert.doesNotMatch(runtimeSource, /consecutiveFullBlockFailures = acceptedCount \? 0/);
  assert.match(runtimeSource, /function setStatus\(text\) \{\s*if \(bulkWorkspaceAwaitingDismissal\) return;/);
});

test("Google request pacer adds independent jitter above its minimum delay", async () => {
  let now = 1000;
  const waits = [];
  const createRequestPacer = Function(
    "sleep", "Date", "Math",
    `"use strict"; return (${createRequestPacerSource[0]});`
  )(
    async (milliseconds) => { waits.push(milliseconds); now += milliseconds; },
    { now: () => now },
    { max: Math.max, min: Math.min, random: () => 0.5 }
  );
  const pacer = createRequestPacer(1200, 5000, 600);

  await pacer.wait({ aborted: false });
  await pacer.wait({ aborted: false });

  assert.deepEqual(waits, [1500]);
  assert.equal(pacer.minimum, 1200);
  assert.equal(pacer.maximum, 5000);
  assert.equal(pacer.getDelay(), 1200);
});

test("OpenAI-compatible usage displays only exact provider-reported values", () => {
  assert.match(runtimeSource, /function formatOpenAICompatibleUsage\(summary\)/);
  assert.match(runtimeSource, /Exact usage: no provider responses recorded/);
  assert.match(runtimeSource, /tokens not reported/);
  assert.match(runtimeSource, /cost not reported/);
  assert.match(runtimeSource, /payload && payload\.usageSummary/);
  assert.match(runtimeSource, /error\.code === "openai_usage_tracking_failed"/);
  assert.doesNotMatch(runtimeSource, /estimateOpenAI|estimated.*(?:token|cost)|pricePerToken/i);
});

test("Google Bulk adapts future block size without penalizing short tails", () => {
  assert.equal(reducedGoogleBulkBlockSize(12, 12, {}), 6);
  assert.equal(reducedGoogleBulkBlockSize(6, 6, {}), 3);
  assert.equal(reducedGoogleBulkBlockSize(12, 12, { acceptedEntries: [{}] }), 10);
  assert.equal(reducedGoogleBulkBlockSize(12, 2, {}), 12);
});

test("Google Bulk limits protected text segments as well as source lines", () => {
  const entries = Array.from({ length: 6 }, (_, index) => ({
    source: `A \\c[4]DISC ${index}\\c[0].\\! Buy it now?`
  }));
  const blocks = buildGoogleBulkBlocks(entries, {
    bulkMaxItems: 12, bulkMaxSegments: 16, contextLimit: 3200
  });
  assert.deepEqual(blocks.map((block) => block.length), [5, 1]);
  assert.ok(blocks.every((block) => block.reduce((count, entry) =>
    count + Math.max(1, core.tokenizeProtectedMarkup(entry.source).filter((segment) =>
      segment.type === "text" && core.hasTranslatableText(segment.value)).length), 0) <= 16));
});

test("removed managed offline providers leave no panel or runtime controls", () => {
  assert.doesNotMatch(runtimeSource, /Argos Offline|CTranslate2 \+ OPUS-MT|providerUsesManagedOffline/);
  assert.doesNotMatch(runtimeSource, /argosBox|argosActionButton|argosRemoveButton|prepareManagedOfflineTestPhraseTarget/);
  assert.doesNotMatch(runtimeSource, /\/v1\/ctranslate2\//);
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
    assert.equal(choiceRefreshes, 1);

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
    assert.equal(choiceRefreshes, 2);

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
    assert.equal(choiceRefreshes, 3);
  } finally {
    delete global.window;
  }
});

test("bulk translation continues while the game window is hidden", () => {
  assert.match(runtimeSource, /activeOperation !== "bulk" && activeOperation !== "test-phrase"/);
});

test("incomplete bulk translation reports its cancellation or provider failure", () => {
  assert.match(runtimeSource, /Bulk stopped at \$\{done\}\/\$\{strings\.length\}: \$\{activeAbortReason/);
  assert.match(runtimeSource, /Bulk incomplete: \$\{strings\.length - failed\}\/\$\{strings\.length\} saved/);
  assert.match(runtimeSource, /describeTranslationFailure\(error, provider\)/);
  assert.match(runtimeSource, /abortActiveOperation\("target language changed"\)/);
});
