"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

require("../src/translation-core.js");
require("../src/providers.js");
const registry = globalThis.VNRevivalTranslationProviders;

test("provider registry exposes a stable extension contract", () => {
  assert.equal(registry.contractVersion, 1);
  assert.deepEqual(registry.list.map(({ id }) => id), ["google", "gemini", "mymemory", "argos", "lmstudio"]);
  for (const provider of registry.list) {
    assert.equal(typeof provider.supportsLanguage, "function");
    assert.equal(typeof provider.splitText, "function");
    assert.equal(typeof provider.translateChunk, "function");
    assert.ok(provider.concurrency > 0);
  }
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
