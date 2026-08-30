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

test("maps provider language codes and rejects removed providers", () => {
  assert.equal(core.providerLanguageCode("google", "iw"), "iw");
  assert.equal(core.providerSupportsLanguage("google", "ab"), true);
  assert.equal(core.providerSupportsLanguage("argos", "ru"), false);
  assert.equal(core.providerSupportsLanguage("ctranslate2-opus", "ru"), false);
  assert.equal(core.providerSupportsLanguage("mymemory", "zh-TW"), false);
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
  assert.equal(core.hasEnglishText("We don't have time for this..."), true);
  assert.equal(core.hasEnglishText("When a friend/foe is SAD, they become DEPRESSED."), true);
  assert.equal(core.hasEnglishText("2+2 = 4... I guess?"), true);
  assert.equal(core.hasEnglishText("\\n<12/25 - CHRISTMAS>My first photo!"), true);
  assert.equal(core.hasEnglishText("123 + 45"), false);
  assert.equal(core.hasEnglishText("portrait.png"), false);
  assert.equal(core.hasEnglishText("https://example.com"), false);
  assert.equal(core.hasEnglishText("A04F99BB11"), false);
});

test("filters markup-only, font coverage, and encoded ROBOHEART assets before providers", () => {
  assert.equal(core.hasTranslatableText("\\aub"), false);
  assert.equal(core.hasTranslatableText("\\bas...\\| ..."), false);
  assert.equal(core.hasTranslatableText("\\\\fs[30]ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789\\n"), false);
  assert.equal(core.hasTranslatableText("V2lsbCB5b3UgbG92ZSBtZT8=\\n<ROBOHEART>"), false);
  assert.equal(core.hasTranslatableText("1F"), false);
  assert.equal(core.hasTranslatableText("DW itemBuyingPromptMessage"), false);
  assert.equal(core.hasTranslatableText("DW onItemListSellOkMessage"), false);
  assert.equal(core.hasTranslatableText("\\artThe piece is finally done!"), true);
});

test("normalizes OMORI HTML and runtime line breaks to the same fuzzy source", () => {
  const asset = 'What\'s the rush, OMORI?\\!<br>We should say "hello" first!\\aub';
  const runtime = '<WordWrap>What\'s the rush, OMORI?\\!\nWe should say "hello" first!\\aub';
  assert.equal(core.stripOmoriPrefixes(asset), core.stripOmoriPrefixes(runtime));
  assert.equal(core.stripOmoriPrefixes('<WordWrap: 720>' + asset), core.stripOmoriPrefixes(asset));
  assert.equal(core.stripOmoriPrefixes("\\n<RED SMILE>"), "");
});

test("lexes OMORI controls and metadata without consuming dialogue text", () => {
  const source = '<WordWrap>\\marHi, OMORI!\\!<br>Use \\N[1] and \\n<RED SMILE>.\\aub [TRASH] VRCTXSEP1X';
  assert.deepEqual(core.protectedMarkupTokens(source), [
    "<WordWrap>", "\\mar", "\\!", "<br>", "\\N[1]", "\\n<RED SMILE>", "\\aub", "[TRASH]", "VRCTXSEP1X"
  ]);
  assert.equal(core.tokenizeProtectedMarkup("\\aubHmph!")[1].value, "Hmph!");
  assert.deepEqual(
    core.protectedMarkupTokens('A \\"FOR SALE\\" sign.\\sxbf\\spxh\\shaw\\itemget\\LECLEAR\\OOOO'),
    ['\\"', '\\"', "\\sxbf", "\\spxh", "\\shaw", "\\itemget", "\\LECLEAR", "\\OOOO"]
  );
  assert.deepEqual(core.protectedMarkupTokens("\\artThe piece is done.\\ber"), ["\\art", "\\ber"]);
  assert.equal(core.stripOmoriPrefixes("\\artThe piece is done."), "The piece is done.");
  assert.equal(core.stripOmoriPrefixes("\\berAUBREY!"), "AUBREY!");
});

test("keeps ARTIST and BERLY speaker controls outside every provider request", async () => {
  const calls = [];
  const source = "\\artThe piece is finally done!\\!<br>About time!\\ber";
  const result = await core.translateProtectedText(source, async (text) => {
    calls.push(text);
    assert.equal(/\\(?:art|ber)/i.test(text), false);
    if (text === "The piece is finally done!") return "Картина наконец-то закончена!";
    if (text === "About time!") return "Давно пора!";
    return text;
  });
  assert.deepEqual(calls, ["The piece is finally done!", "About time!"]);
  assert.equal(result.text, "\\artКартина наконец-то закончена!\\!<br>Давно пора!\\ber");
  assert.equal(core.protectedMarkupLayoutMatches(source, result.text), true);
});

test("translates only text segments and never exposes protected OMORI markup", async () => {
  const source = "Hmph...\\! You kids are pretty strong.\\!<br>Now.\\jaw [TRASH]";
  const calls = [];
  const translations = new Map([
    ["Hmph...", "Хмм..."],
    ["You kids are pretty strong.", "Вы, дети, очень сильны."],
    ["Now.", "Сейчас."]
  ]);
  const result = await core.translateProtectedText(source, async (text) => {
    calls.push(text);
    assert.deepEqual(core.protectedMarkupTokens(text), []);
    return translations.get(text) || text;
  });
  assert.equal(result.segmented, true);
  assert.equal(result.text, "Хмм...\\! Вы, дети, очень сильны.\\!<br>Сейчас.\\jaw [TRASH]");
  assert.deepEqual(calls, ["Hmph...", "You kids are pretty strong.", "Now."]);
  assert.equal(core.protectedMarkupMatches(source, "Хмм...\\! Дети.\\!<br>Сейчас.\\jaw [TRASH]"), true);
  assert.equal(core.protectedMarkupMatches(source, "Хмм...\\！ Дети.<br>Сейчас. [мусор]"), false);
});

test("uses the same protected segment pipeline for weak models", async () => {
  const source = "Hmph!\\! Took you long enough!\\aub";
  const calls = [];
  const result = await core.translateProtectedText(source, async (text) => {
    calls.push(text);
    if (text === "Hmph!") return "Хмм!";
    if (text === "Took you long enough!") return "Долго же вы!";
    return text;
  });
  assert.equal(result.segmented, true);
  assert.equal(result.text, "Хмм!\\! Долго же вы!\\aub");
  assert.deepEqual(core.protectedMarkupTokens(result.text), ["\\!", "\\aub"]);
  assert.deepEqual(calls, ["Hmph!", "Took you long enough!"]);
});

test("uses one markup-free context request when segment markers survive", async () => {
  const calls = [];
  const source = "Delicious \\c[3]COOKIES\\c[0]!";
  const result = await core.translateProtectedText(source, async (text) => {
    calls.push(text);
    assert.equal(text.includes("\\c["), false);
    return "Вкусное VRCTXSEP1X печенье";
  }, { language: "ru", contextual: true });
  assert.deepEqual(calls, ["Delicious VRCTXSEP1X Cookies"]);
  assert.equal(result.text, "Вкусное \\c[3]ПЕЧЕНЬЕ\\c[0]!");
  assert.equal(result.contextual, true);
});

test("falls back to isolated segments when a weak model damages context markers", async () => {
  const calls = [];
  const source = "Hmph!\\! Took you long enough!\\aub";
  const result = await core.translateProtectedText(source, async (text) => {
    calls.push(text);
    assert.equal(/\\(?:!|aub)/.test(text), false);
    if (text.includes("VRCTXSEP")) return "Хмм! разделитель Долго же вы!";
    if (text === "Hmph!") return "Хмм!";
    if (text === "Took you long enough!") return "Долго же вы!";
    return text;
  }, { language: "ru", contextual: true });
  assert.deepEqual(calls, ["Hmph! VRCTXSEP1X Took you long enough!", "Hmph!", "Took you long enough!"]);
  assert.equal(result.text, "Хмм!\\! Долго же вы!\\aub");
  assert.equal(result.contextual, undefined);
});

test("preserves the original skeleton whitespace around rigid controls", async () => {
  const source = "Fine...\\! Next<br>Line\\her";
  const translations = new Map([["Fine...", "Ладно..."], ["Next", "Дальше"], ["Line", "Строка"]]);
  const result = await core.translateProtectedText(source, async (text) => translations.get(text));
  assert.equal(result.text, "Ладно...\\! Дальше<br>Строка\\her");
  assert.equal(core.protectedMarkupLayoutMatches(source, "Ладно... \\! Дальше<br> Строка \\her"), false);
});

test("keeps terminal commands outside the provider request", async () => {
  const source = "All done.\\her";
  const calls = [];
  const result = await core.translateProtectedText(source, async (text) => {
    calls.push(text);
    if (text === "All done.") return "Всё готово.";
    return text;
  });
  assert.equal(result.segmented, true);
  assert.equal(result.text, "Всё готово.\\her");
  assert.deepEqual(calls, ["All done."]);
});

test("preserves escaped quotes without sending them to providers", async () => {
  const source = 'A \\"FOR SALE\\" sign.';
  const translations = new Map([["A", "Табличка"], ["For Sale", "Продается"], ["sign.", "."]]);
  const result = await core.translateProtectedText(source, async (text) => {
    assert.equal(text.includes('\\"'), false);
    return translations.get(text);
  });
  assert.equal(result.text, 'Табличка \\"ПРОДАЕТСЯ\\" .');
});

test("normalizes all-caps source terms locally and restores their display case", async () => {
  const calls = [];
  const source = "You got a \\c[4]COOL KEY CARD\\c[0]!";
  const result = await core.translateProtectedText(source, async (text) => {
    calls.push(text);
    if (text === "You got a") return "Ты получил";
    if (text === "Cool Key Card") return "крутая ключ-карта";
    return text;
  });
  assert.deepEqual(calls, ["You got a", "Cool Key Card"]);
  assert.equal(result.text, "Ты получил \\c[4]КРУТАЯ КЛЮЧ-КАРТА\\c[0]!");
});

test("protects placeholders, currency, numbers, and punctuation beside flow controls", async () => {
  const source = "\\kelOh, whoa\\!! I found $\\v[604].00.\\!<br>The password is ☐☐☐☐☐☐☐.";
  const calls = [];
  const translations = new Map([
    ["Oh, whoa", "Ого"],
    ["I found", "Я нашёл"],
    ["The password is", "Пароль"]
  ]);
  const result = await core.translateProtectedText(source, async (text) => {
    calls.push(text);
    return translations.get(text) || text;
  });
  assert.deepEqual(calls, ["Oh, whoa", "I found", "The password is"]);
  assert.equal(result.text, "\\kelОго\\!! Я нашёл $\\v[604].00.\\!<br>Пароль ☐☐☐☐☐☐☐.");
  assert.equal(core.protectedMarkupLayoutMatches(source, result.text), true);
});

test("rejects obvious truncation and runaway expansion before caching", async () => {
  const source = "Come on, let's go! Everyone's waiting for us!";
  assert.equal(core.translationQualityMatches(source, "Пошли! Все нас ждут!"), true);
  assert.equal(core.translationQualityMatches(source, "行こう！みんなが待っている！"), true);
  assert.equal(core.translationQualityMatches(source, "Все нас ждут!"), false);
  assert.equal(core.translationQualityMatches("Uh-oh... It's SWEETHEART!", "О-о-о-о-о-о-о-о-о-о-о-о-о-о-о!"), false);
  await assert.rejects(
    core.translateProtectedText(source, async () => "Все нас ждут!"),
    (error) => error && error.code === "translation_quality_invalid"
  );
});

test("validates numbers and currency without fixing their word position", () => {
  assert.equal(
    core.translationQualityMatches("There are 10 KEYS left.", "Осталось 10 ключей."),
    true
  );
  assert.equal(
    core.translationQualityMatches("It costs $10.00.", "Это стоит $10.00."),
    true
  );
  assert.equal(
    core.translationQualityMatches("It costs $10.00.", "Это стоит 10 долларов."),
    false
  );
});

test("rejects substantial untranslated English carryover for Cyrillic targets", () => {
  assert.equal(
    core.translationQualityMatches("Delicious COOKIES!", "Вкусный ФАЙЛЫ COOKIE!", "ru"),
    false
  );
  assert.equal(
    core.translationQualityMatches("A plant nursery full of VEGGIE KIDS!", "Питомник, полный Veggie Kids!", "ru"),
    false
  );
  assert.equal(core.translationQualityMatches("Chock-full of DVDs.", "Полно DVD.", "ru"), true);
  assert.equal(core.translationQualityMatches("Sweetheart doll.", "Muñeca Sweetheart.", "es"), true);
});

test("keeps stylized repeated product names and elongated vocalizations", () => {
  const vocalization = "...\\! Ah...\\! Ahhh...\\! \\sinv[1]Ahhhhhh...";
  const translatedVocalization = "...\\! Ах...\\! Ahhh...\\! \\sinv[1]Ahhhhhh...";
  assert.equal(core.translationQualityMatches(vocalization, translatedVocalization, "ru"), true);

  const product = "A \\c[3]SNO-CONE\\c[0] machine.\\!<br>Would you like to use a \\c[4]SNO-CONE TICKET\\c[0]?";
  const translatedProduct = "Автомат \\c[3]SNO-CONE\\c[0].\\!<br>Использовать \\c[4]БИЛЕТ SNO-CONE\\c[0]?";
  assert.equal(core.translationQualityMatches(product, translatedProduct, "ru"), true);
});

test("returns opaque technical text unchanged without making a provider request", async () => {
  let calls = 0;
  const source = "V2lsbCB5b3UgbG92ZSBtZT8=\\n<ROBOHEART>";
  const result = await core.translateProtectedText(source, async () => { calls += 1; return "broken"; });
  assert.equal(calls, 0);
  assert.equal(result.text, source);
  assert.equal(result.skipped, true);
});

test("keeps contextual separators local while translating every part", async () => {
  const source = core.buildContextSource(["You see", "a beautiful woman", "near the door."]);
  const translations = new Map([
    ["You see", "Вы видите"],
    ["a beautiful woman", "красивую женщину"],
    ["near the door.", "возле двери."]
  ]);
  const calls = [];
  const result = await core.translateProtectedText(source, async (text) => {
    calls.push(text);
    assert.equal(text.includes("VRCTXSEP"), false);
    return translations.get(text);
  });
  assert.deepEqual(calls, ["You see", "a beautiful woman", "near the door."]);
  assert.deepEqual(core.parseContextTranslation(result.text, 3), [
    "Вы видите", "красивую женщину", "возле двери."
  ]);
});

test("lets Bulk validate contextual parts individually without starting a hidden fallback", async () => {
  const sources = [
    "OMORI walks through the beautiful garden together with all his friends.",
    "OMORI quietly waits beside the old house until everyone comes home."
  ];
  const translations = [
    "OMORI гуляет по прекрасному саду вместе со всеми своими друзьями.",
    "OMORI тихо ждёт возле старого дома, пока все не вернутся."
  ];
  const source = core.buildContextSource(sources);
  const translated = core.buildContextSource(translations);
  assert.equal(core.translationQualityMatches(source, translated, "ru"), false);
  assert.deepEqual(
    translations.map((value, index) => core.translationQualityMatches(sources[index], value, "ru")),
    [true, true]
  );
  let calls = 0;
  const result = await core.translateProtectedText(source, async () => {
    calls += 1;
    return translated;
  }, {
    language: "ru", contextual: true, contextFallback: false, contextualQuality: false
  });
  assert.equal(calls, 1);
  assert.deepEqual(core.parseContextTranslation(result.text, sources.length), translations);
});

test("can reject a damaged contextual block without post-request segment retries", async () => {
  const source = core.buildContextSource(["One complete line.", "Another complete line."]);
  let calls = 0;
  await assert.rejects(
    core.translateProtectedText(source, async () => {
      calls += 1;
      return "Google removed the separator";
    }, { language: "ru", contextual: true, contextFallback: false }),
    (error) => error && error.code === "markup_format_invalid"
  );
  assert.equal(calls, 1);
});

test("rejects markup invented by a provider even when the source has no controls", async () => {
  await assert.rejects(
    core.translateProtectedText("An old smelly sock", async () => "Старый носок [TRASH]"),
    (error) => error && error.code === "markup_format_invalid"
  );
});

test("splits long Google text on Unicode-safe boundaries", () => {
  const text = "A long sentence with an emoji 😀. ".repeat(300);
  const chunks = core.splitLongText(text, 3500);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 3500));
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

test("persists bounded rate-limit backoff state across restarts", () => {
  const now = 1_000_000;
  const initial = 15 * 60 * 1000;
  const maximum = 60 * 60 * 1000;
  const first = core.createRateLimitState(initial, now, initial, maximum);
  assert.deepEqual(first, { until: now + initial, nextDelay: 30 * 60 * 1000 });
  assert.deepEqual(
    core.parseRateLimitState(JSON.stringify(first), null, now + initial, initial, maximum),
    first
  );
  const second = core.createRateLimitState(first.nextDelay, now + initial, initial, maximum);
  assert.deepEqual(second, { until: now + 45 * 60 * 1000, nextDelay: maximum });
  const capped = core.createRateLimitState(second.nextDelay, second.until, initial, maximum);
  assert.equal(capped.nextDelay, maximum);
  assert.deepEqual(
    core.parseRateLimitState(null, now + initial, now, initial, maximum),
    { until: now + initial, nextDelay: 30 * 60 * 1000 }
  );
  assert.deepEqual(
    core.parseRateLimitState("broken", now - 1, now, initial, maximum),
    { until: 0, nextDelay: initial }
  );
});

test("cache separates providers and languages while retaining legacy Google keys", () => {
  const googleRu = core.makeCacheKey("Hello", "ru", "google");
  const googleDe = core.makeCacheKey("Hello", "de", "google");
  const geminiRu = core.makeCacheKey("Hello", "ru", "gemini");
  assert.notEqual(googleRu, googleDe);
  assert.notEqual(googleRu, geminiRu);
  assert.equal(core.cacheKeyLanguage(googleRu), "ru");
  assert.equal(core.cacheKeyProvider(googleRu), "google");
  assert.equal(core.cacheKeyLanguage(geminiRu), "ru");
  assert.equal(core.cacheKeyProvider(geminiRu), "gemini");
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
  assert.equal(core.cacheKeySource(qwen), "Hello");
  assert.equal(core.cacheKeyVariant(qwen), core.fingerprint("qwen\nprompt-v1"));
});
