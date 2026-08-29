"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

require("../src/translation-core.js");
require("../src/providers.js");
const registry = globalThis.VNRevivalTranslationProviders;

test("provider registry exposes a stable extension contract", () => {
  assert.equal(registry.contractVersion, 1);
  assert.deepEqual(registry.list.map(({ id }) => id), [
    "google", "gemini", "argos", "ctranslate2-opus", "lmstudio", "openai-compatible"
  ]);
  for (const provider of registry.list) {
    assert.equal(typeof provider.supportsLanguage, "function");
    assert.equal(typeof provider.splitText, "function");
    assert.equal(typeof provider.translateChunk, "function");
    assert.ok(provider.concurrency > 0);
  }
});

test("CTranslate2 OPUS provider stays behind its local engine contract", async () => {
  let ctranslate2Call = null;
  const opus = await registry.byId["ctranslate2-opus"].translateChunk({
    text: "Hello", language: "ru", signal: undefined,
    localRequest: async (path, options) => {
      ctranslate2Call = { path, options };
      return { translatedText: "Привет" };
    }
  });
  assert.equal(opus, "Привет");
  assert.equal(ctranslate2Call.path, "/v1/ctranslate2/translate");
  assert.deepEqual(ctranslate2Call.options.body, { text: "Hello", target: "ru" });
  assert.equal(registry.byId["ctranslate2-opus"].modelManager, "ctranslate2-opus");
  assert.equal(registry.byId["ctranslate2-opus"].requiresPrivacy, false);
});

test("removed Bergamot provider is absent", () => {
  assert.equal(registry.byId.bergamot, undefined);
});

test("removed MyMemory provider is absent", () => {
  assert.equal(registry.byId.mymemory, undefined);
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
  assert.equal(registry.byId.google.delay, 1000);
});

test("offline provider delegates translation to the authenticated local helper", async () => {
  let request = null;
  const translated = await registry.byId.argos.translateChunk({
    text: "Hello", language: "ru", signal: undefined,
    localRequest: async (path, options) => {
      request = { path, options };
      return { translatedText: "Привет" };
    }
  });
  assert.equal(translated, "Привет");
  assert.equal(request.path, "/v1/translate");
  assert.deepEqual(request.options.body, { text: "Hello", target: "ru" });
});

test("Argos keeps the measured faster single-item path with unchanged order", async () => {
  const calls = [];
  const localRequest = async (path, options) => {
    calls.push({ path, body: options.body });
    return { translatedText: `RU:${options.body.text}` };
  };
  const values = await Promise.all(["one", "two", "three"].map((text) => (
    registry.byId.argos.translateChunk({ text, language: "ru", signal: undefined, localRequest })
  )));
  assert.deepEqual(values, ["RU:one", "RU:two", "RU:three"]);
  assert.deepEqual(calls, ["one", "two", "three"].map((text) => ({
    path: "/v1/translate",
    body: { text, target: "ru" }
  })));
  assert.equal(registry.byId.argos.concurrency, 1);
  assert.equal(registry.byId.argos.batchSize, 1);
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
  assert.equal(registry.byId.lmstudio.requiresPrivacy, false);
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
  assert.equal(registry.byId["openai-compatible"].requiresPrivacy, true);
});
