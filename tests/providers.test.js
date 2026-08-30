"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

require("../src/translation-core.js");
require("../src/languages.js");
require("../src/providers.js");
const registry = globalThis.VNRevivalTranslationProviders;

test("language catalog matches the VN Revival Stardew Valley editions", () => {
  assert.deepEqual(globalThis.VNRevivalTranslatorLanguages.map(([code]) => code), [
    "en", "ru", "fr", "de", "es", "pl", "tr", "ar", "pt", "ja", "ko", "zh-CN", "zh-TW",
    "it", "th", "vi", "id", "fa", "hi", "bn", "ur", "ta", "te", "my", "mr", "ml", "kn",
    "uz", "sw", "am"
  ]);
});

test("provider registry exposes a stable extension contract", () => {
  assert.equal(registry.contractVersion, 1);
  assert.deepEqual(registry.list.map(({ id }) => id), [
    "google", "gemini", "lmstudio", "openai-compatible"
  ]);
  for (const provider of registry.list) {
    assert.equal(typeof provider.supportsLanguage, "function");
    assert.equal(typeof provider.splitText, "function");
    assert.equal(typeof provider.translateChunk, "function");
    assert.ok(provider.concurrency > 0);
    assert.equal(Object.prototype.hasOwnProperty.call(provider, "requiresPrivacy"), false);
  }
});

test("removed Bergamot provider is absent", () => {
  assert.equal(registry.byId.bergamot, undefined);
});

test("removed MyMemory provider is absent", () => {
  assert.equal(registry.byId.mymemory, undefined);
});

test("removed managed offline providers are absent", () => {
  assert.equal(registry.byId.argos, undefined);
  assert.equal(registry.byId["ctranslate2-opus"], undefined);
});

test("online providers own URL construction and response parsing", async () => {
  let requestedURL = "";
  const translated = await registry.byId.google.translateChunk({
    text: "Hello", language: "ru", sourceLanguage: "en", signal: undefined,
    decodeHtmlEntities: (value) => value,
    fetch: async (url) => {
      requestedURL = url;
      return { ok: true, json: async () => [[["Привет", "Hello"]]] };
    }
  });
  assert.equal(translated, "Привет");
  assert.equal(new URL(requestedURL).searchParams.get("tl"), "ru");
  assert.equal(registry.byId.google.concurrency, 1);
  assert.equal(registry.byId.google.delay, 1200);
  assert.equal(registry.byId.google.delayJitter, 600);
  assert.equal(registry.byId.google.bulkDelay, 1200);
  assert.equal(registry.byId.google.bulkDelayJitter, 600);
  assert.equal(registry.byId.google.bulkMaxDelay, 5000);
  assert.equal(registry.byId.google.bulkMaxItems, 12);
  assert.equal(registry.byId.google.bulkMaxSegments, 16);
  assert.equal(registry.byId.google.bulkConsecutiveFailureLimit, 3);

  let batchURL = "";
  const translatedBatch = await registry.byId.google.translateChunks({
    texts: ["Hello", "Goodbye"], language: "ru", sourceLanguage: "en", signal: undefined,
    decodeHtmlEntities: (value) => value,
    fetch: async (url) => {
      batchURL = url;
      return { ok: true, json: async () => ["Привет", "До свидания"] };
    }
  });
  assert.deepEqual(translatedBatch, ["Привет", "До свидания"]);
  assert.equal(new URL(batchURL).pathname, "/translate_a/t");
  assert.deepEqual(new URL(batchURL).searchParams.getAll("q"), ["Hello", "Goodbye"]);
});

test("Gemini delegates contextual translation without exposing its API key", async () => {
  let request = null;
  const translated = await registry.byId.gemini.translateChunk({
    text: "Hello, adventurer.", language: "ru", languageName: "Russian", signal: undefined,
    localRequest: async (path, options) => {
      request = { path, options };
      return { translatedText: "Привет, искатель приключений." };
    }
  });
  assert.equal(translated, "Привет, искатель приключений.");
  assert.equal(request.path, "/v1/gemini/translate");
  assert.deepEqual(request.options.body, {
    text: "Hello, adventurer.", target: "ru", targetName: "Russian"
  });
  assert.equal(registry.byId.gemini.credentialManager, "gemini");
  assert.equal(registry.byId.gemini.concurrency, 1);
});

test("LM Studio delegates translation and selected model to the local helper", async () => {
  let request = null;
  const translated = await registry.byId.lmstudio.translateChunk({
    text: "Hello", language: "ru", languageName: "Russian", model: "local/qwen",
    signal: undefined,
    localRequest: async (path, options) => {
      request = { path, options };
      return { translatedText: "Привет" };
    }
  });
  assert.equal(translated, "Привет");
  assert.equal(request.path, "/v1/lmstudio/translate");
  assert.deepEqual(request.options.body, {
    text: "Hello", target: "ru", targetName: "Russian", model: "local/qwen"
  });
  assert.equal(registry.byId.lmstudio.modelManager, "lmstudio");
  assert.equal(registry.byId.lmstudio.concurrency, 1);
});

test("OpenAI-compatible delegates endpoint profile and model without exposing its API key", async () => {
  let request = null;
  const translated = await registry.byId["openai-compatible"].translateChunk({
    text: "Hello", language: "ru", languageName: "Russian", signal: undefined,
    openAICompatible: {
      preset: "opencode-go", baseURL: "https://opencode.ai/zen/go/v1", model: "kimi-k3"
    },
    localRequest: async (path, options) => {
      request = { path, options };
      return { translatedText: "Привет" };
    }
  });
  assert.equal(translated, "Привет");
  assert.equal(request.path, "/v1/openai-compatible/translate");
  assert.deepEqual(request.options.body, {
    text: "Hello", target: "ru", targetName: "Russian", model: "kimi-k3",
    preset: "opencode-go", baseURL: "https://opencode.ai/zen/go/v1"
  });
  assert.equal(registry.byId["openai-compatible"].credentialManager, "openai-compatible");
  assert.equal(registry.byId["openai-compatible"].modelManager, "openai-compatible");
});
