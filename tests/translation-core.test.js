"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../src/translation-core.js");

test("normalizes layout whitespace without flattening lines", () => {
  assert.equal(core.normalizeText("  Hello\u00a0 world \n next  "), "Hello world\nnext");
});

test("recognizes right-to-left target languages and normalizes Hebrew for HTML", () => {
  for (const language of ["ar", "bal", "bm-Nkoo", "ckb", "dv", "fa", "fa-AF", "iw", "ms-Arab", "pa-Arab", "ps", "sd", "ug", "ur", "yi"]) {
    assert.equal(core.isRtlLanguage(language), true, language);
  }
  for (const language of ["en", "ru", "no", "ku", "zh-CN"]) {
    assert.equal(core.isRtlLanguage(language), false, language);
  }
  assert.equal(core.htmlLanguageCode("iw"), "he");
  assert.equal(core.htmlLanguageCode("jw"), "jv");
  assert.equal(core.htmlLanguageCode("zh-CN"), "zh-Hans");
  assert.equal(core.htmlLanguageCode("zh-TW"), "zh-Hant");
  assert.equal(core.htmlLanguageCode("fa-AF"), "fa-AF");
});

test("maps provider language codes and filters Argos to its model catalog", () => {
  assert.equal(core.providerLanguageCode("google", "iw"), "iw");
  assert.equal(core.providerLanguageCode("mymemory", "iw"), "he");
  assert.equal(core.providerLanguageCode("mymemory", "tl"), "fil");
  assert.equal(core.providerSupportsLanguage("google", "ab"), true);
  assert.equal(core.providerSupportsLanguage("mymemory", "zh-TW"), true);
  assert.equal(core.providerSupportsLanguage("argos", "ru", ["de", "ru"]), true);
  assert.equal(core.providerSupportsLanguage("argos", "ab", ["de", "ru"]), false);
});

test("selects script-aware font fallbacks without dropping universal fonts", () => {
  assert.ok(core.fontFallbacks("ar").includes("Noto Sans Arabic"));
  assert.ok(core.fontFallbacks("hi").includes("Noto Sans Devanagari"));
  assert.ok(core.fontFallbacks("zh-TW").includes("PingFang TC"));
  assert.ok(core.fontFallbacks("zh-CN").includes("Songti SC"));
  assert.ok(core.fontFallbacks("zh-TW").includes("Songti TC"));
  assert.ok(core.fontFallbacks("bm-Nkoo").includes("Noto Sans NKo"));
  assert.ok(core.fontFallbacks("no").includes("Noto Sans"));
  assert.equal(core.fontFallbacks("no").at(-1), "sans-serif");
});

test("keeps user-perceived characters intact when splitting", () => {
  const graphemes = ["कि", "e\u0301", "👩‍👩‍👧‍👦", "🇳🇴", "ก้"];
  assert.deepEqual(core.splitGraphemes(graphemes.join("")), graphemes);
  const text = graphemes.join("").repeat(40);
  const chunks = core.splitLongText(text, 64);
  assert.equal(chunks.join(""), text);
  assert.ok(chunks.every((chunk) => graphemes.includes(core.splitGraphemes(chunk).at(-1))));
});

test("round-trips contextual translation markers and rejects damaged output", () => {
  const source = core.buildContextSource(["You see", "a beautiful woman", "near the door."]);
  assert.equal(source, "You see VRCTXSEP1X a beautiful woman VRCTXSEP2X near the door.");
  assert.deepEqual(
    core.parseContextTranslation("Вы видите VRCTXSEP1X красивую женщину VRCTXSEP2X возле двери.", 3),
    ["Вы видите", "красивую женщину", "возле двери."]
  );
  assert.equal(core.parseContextTranslation("Маркер был удалён", 3), null);
});

test("detects natural English and rejects paths, assets, hashes, and numbers", () => {
  assert.equal(core.hasEnglishText("Continue adventure"), true);
  assert.equal(core.hasEnglishText("123 + 45"), false);
  assert.equal(core.hasEnglishText("portrait.png"), false);
  assert.equal(core.hasEnglishText("https://example.com"), false);
  assert.equal(core.hasEnglishText("A04F99BB11"), false);
});

test("normalizes OMORI HTML and runtime line breaks to the same fuzzy source", () => {
  const asset = 'What\'s the rush, OMORI?\\!<br>We should say "hello" first!\\aub';
  const runtime = '<WordWrap>What\'s the rush, OMORI?\\!\nWe should say "hello" first!\\aub';
  assert.equal(core.stripOmoriPrefixes(asset), core.stripOmoriPrefixes(runtime));
  assert.equal(core.stripOmoriPrefixes('<WordWrap: 720>' + asset), core.stripOmoriPrefixes(asset));
  assert.equal(core.stripOmoriPrefixes("\\n<RED SMILE>"), "");
});

test("splits long Google text on Unicode-safe boundaries", () => {
  const text = "A long sentence with an emoji 😀. ".repeat(300);
  const chunks = core.splitLongText(text, 3500);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 3500));
  assert.ok(chunks.every((chunk) => !/[\uD800-\uDBFF]$/.test(chunk)));
});

test("splits MyMemory text by UTF-8 byte count", () => {
  const text = "English 😀 Кириллица. ".repeat(80);
  const chunks = core.splitUtf8Text(text, 480);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => core.utf8Length(chunk) <= 480));
  assert.ok(chunks.every((chunk) => !/[\uD800-\uDBFF]$/.test(chunk)));
});

test("builds and parses Google requests", () => {
  const url = new URL(core.buildGoogleUrl("Hello & goodbye", "ru"));
  assert.equal(url.hostname, "translate.googleapis.com");
  assert.equal(url.searchParams.get("sl"), "en");
  assert.equal(url.searchParams.get("tl"), "ru");
  assert.equal(url.searchParams.get("q"), "Hello & goodbye");
  assert.equal(new URL(core.buildGoogleUrl("Bonjour", "de", "fr")).searchParams.get("sl"), "fr");
  assert.equal(core.parseGoogleResponse([[['Привет ', 'Hello '], ['мир', 'world']]]), "Привет мир");
  assert.throws(() => core.parseGoogleResponse({ nope: true }));
});

test("builds and parses MyMemory requests", () => {
  const url = new URL(core.buildMyMemoryUrl("Hello world", "de"));
  assert.equal(url.hostname, "api.mymemory.translated.net");
  assert.equal(url.searchParams.get("langpair"), "en|de");
  assert.equal(url.searchParams.get("q"), "Hello world");
  assert.equal(new URL(core.buildMyMemoryUrl("Bonjour", "de", "fr")).searchParams.get("langpair"), "fr|de");
  assert.equal(core.parseMyMemoryResponse({ responseStatus: 200, responseData: { translatedText: "Hallo Welt" } }), "Hallo Welt");
  assert.throws(() => core.parseMyMemoryResponse({ responseStatus: 403, responseDetails: "limit" }));
});

test("cache separates providers and languages while retaining legacy Google keys", () => {
  const googleRu = core.makeCacheKey("Hello", "ru", "google");
  const googleDe = core.makeCacheKey("Hello", "de", "google");
  const memoryRu = core.makeCacheKey("Hello", "ru", "mymemory");
  assert.notEqual(googleRu, googleDe);
  assert.notEqual(googleRu, memoryRu);
  assert.equal(core.cacheKeyLanguage(googleRu), "ru");
  assert.equal(core.cacheKeyProvider(googleRu), "google");
  assert.equal(core.cacheKeyLanguage(memoryRu), "ru");
  assert.equal(core.cacheKeyProvider(memoryRu), "mymemory");
  assert.equal(googleRu.split("\n")[0], "v1");
});

test("v3 cache keys isolate games and expose their owning adapter", () => {
  const omori = core.makeCacheKey("Hello", "ru", "google", "omori");
  const other = core.makeCacheKey("Hello", "ru", "google", "other-game");
  assert.notEqual(omori, other);
  assert.equal(omori.split("\n")[0], "v3");
  assert.equal(core.cacheKeyGame(omori), "omori");
  assert.equal(core.cacheKeyLanguage(omori), "ru");
  assert.equal(core.cacheKeyProvider(omori), "google");
  assert.equal(core.cacheKeyGame(core.makeCacheKey("Hello", "ru", "google")), "");
});

test("v4 cache keys isolate local model and prompt variants", () => {
  const qwen = core.makeCacheKey("Hello", "ru", "lmstudio", "omori", "qwen\nprompt-v1");
  const gemma = core.makeCacheKey("Hello", "ru", "lmstudio", "omori", "gemma\nprompt-v1");
  assert.notEqual(qwen, gemma);
  assert.equal(qwen.split("\n")[0], "v4");
  assert.equal(core.cacheKeyGame(qwen), "omori");
  assert.equal(core.cacheKeyProvider(qwen), "lmstudio");
  assert.equal(core.cacheKeyLanguage(qwen), "ru");
  assert.equal(core.cacheKeyVariant(qwen), core.fingerprint("qwen\nprompt-v1"));
});
