(function (root) {
  "use strict";

  const core = root.VNRevivalTranslationCore;
  if (!core) throw new Error("VN Revival translation core is missing before providers");

  const providers = [
    {
      id: "google",
      label: "Google Translate",
      concurrency: 1,
      delay: 1000,
      retries: 3,
      contextLimit: 3200,
      requiresPrivacy: true,
      supportsLanguage(code) {
        return core.providerSupportsLanguage("google", code);
      },
      splitText(text) {
        return core.splitLongText(text, core.GOOGLE_MAX_CHARS);
      },
      hint() {
        return "Google translate: May rate-limit. Average quality and average speed. Can be limited by Google but usually work fine. Need Internet for work";
      },
      async translateChunk(context) {
        const target = core.providerLanguageCode("google", context.language);
        if (!target) throw new Error("The selected language is not supported by this service");
        const response = await context.fetch(core.buildGoogleUrl(context.text, target, context.sourceLanguage), {
          signal: context.signal, cache: "no-store"
        });
        if (!response.ok) throw new Error("HTTP " + response.status);
        return context.decodeHtmlEntities(core.parseGoogleResponse(await response.json()));
      }
    },
    {
      id: "gemini",
      label: "Gemini AI",
      concurrency: 1,
      delay: 250,
      retries: 3,
      contextLimit: 6000,
      requiresPrivacy: true,
      credentialManager: "gemini",
      supportsLanguage(code) {
        return core.providerSupportsLanguage("google", code);
      },
      splitText(text) {
        return core.splitLongText(text, 6000);
      },
      hint() {
        return "Gemini: contextual AI translation using your own API key. Free-tier content may be used by Google to improve its products. Best quality and fast. Need Internet for work";
      },
      async translateChunk(context) {
        const payload = await context.localRequest("/v1/gemini/translate", {
          body: {
            text: context.text,
            target: context.language,
            targetName: context.languageName || context.language
          },
          signal: context.signal
        });
        if (typeof payload.translatedText !== "string" || !payload.translatedText.trim()) {
          throw new Error("Gemini returned an empty translation");
        }
        return payload.translatedText;
      }
    },
    {
      id: "mymemory",
      label: "MyMemory",
      concurrency: 2,
      delay: 120,
      retries: 3,
      contextLimit: 420,
      requiresPrivacy: true,
      supportsLanguage(code) {
        return core.providerSupportsLanguage("mymemory", code);
      },
      splitText(text) {
        return core.splitUtf8Text(text, core.MYMEMORY_MAX_BYTES);
      },
      hint(languageCount) {
        return `MyMemory: ${languageCount} language codes can be selected, but the service does not guarantee machine translation for every pair. Poor quality, but fast. Need Internet for work.`;
      },
      async translateChunk(context) {
        const target = core.providerLanguageCode("mymemory", context.language);
        if (!target) throw new Error("The selected language is not supported by this service");
        const response = await context.fetch(core.buildMyMemoryUrl(context.text, target, context.sourceLanguage), {
          signal: context.signal, cache: "no-store"
        });
        if (!response.ok) throw new Error("HTTP " + response.status);
        return context.decodeHtmlEntities(core.parseMyMemoryResponse(await response.json()));
      }
    },
    {
      id: "argos",
      label: "Argos Offline",
      concurrency: 1,
      batchSize: 1,
      delay: 0,
      retries: 1,
      contextLimit: 3200,
      requiresPrivacy: false,
      modelManager: "argos",
      supportsLanguage(code, context) {
        return core.providerSupportsLanguage("argos", code, context && context.localLanguages);
      },
      splitText(text) {
        return [text];
      },
      hint() {
        return "Argos: translation runs on this computer and does not send text online. Mediocre quality and slow. Support limited amount of language";
      },
      async translateChunk(context) {
        const payload = await context.localRequest("/v1/translate", {
          body: { text: context.text, target: context.language }, signal: context.signal
        });
        if (typeof payload.translatedText !== "string" || !payload.translatedText.trim()) {
          throw new Error("Argos returned an empty translation");
        }
        return payload.translatedText;
      }
    },
    {
      id: "ctranslate2-opus",
      label: "CTranslate2 + OPUS-MT",
      concurrency: 1,
      delay: 0,
      retries: 1,
      contextLimit: 3200,
      requiresPrivacy: false,
      modelManager: "ctranslate2-opus",
      supportsLanguage(code, context) {
        return core.providerSupportsLanguage("argos", code, context && context.localLanguages);
      },
      splitText(text) {
        return core.splitLongText(text, 800);
      },
      hint() {
        return "CTranslate2 + OPUS-MT: optimized INT8 neural translation runs locally. Models are larger and conversion during the first install can take several minutes.";
      },
      async translateChunk(context) {
        const payload = await context.localRequest("/v1/ctranslate2/translate", {
          body: { text: context.text, target: context.language }, signal: context.signal
        });
        if (typeof payload.translatedText !== "string" || !payload.translatedText.trim()) {
          throw new Error("CTranslate2 returned an empty translation");
        }
        return payload.translatedText;
      }
    },
    {
      id: "lmstudio",
      label: "LM Studio Local AI",
      concurrency: 1,
      delay: 0,
      retries: 2,
      contextLimit: 6000,
      requiresPrivacy: false,
      modelManager: "lmstudio",
      supportsLanguage(code) {
        return !!String(code || "");
      },
      splitText(text) {
        return core.splitLongText(text, 6000);
      },
      hint() {
        return "LM Studio: AI translation runs through a model on this computer. Start the local server and load or select a model in LM Studio first.";
      },
      async translateChunk(context) {
        const payload = await context.localRequest("/v1/lmstudio/translate", {
          body: {
            text: context.text,
            target: context.language,
            targetName: context.languageName || context.language,
            model: context.model
          },
          signal: context.signal
        });
        if (typeof payload.translatedText !== "string" || !payload.translatedText.trim()) {
          throw new Error("LM Studio returned an empty translation");
        }
        return payload.translatedText;
      }
    },
    {
      id: "openai-compatible",
      label: "OpenAI-compatible AI",
      concurrency: 1,
      delay: 100,
      retries: 3,
      contextLimit: 6000,
      requiresPrivacy: true,
      credentialManager: "openai-compatible",
      modelManager: "openai-compatible",
      supportsLanguage(code) {
        return !!String(code || "");
      },
      splitText(text) {
        return core.splitLongText(text, 6000);
      },
      hint() {
        return "OpenAI-compatible: connect OpenCode Go, OpenRouter, DeepSeek, LM Studio, or a custom Chat Completions endpoint.";
      },
      async translateChunk(context) {
        const connection = context.openAICompatible || {};
        const payload = await context.localRequest("/v1/openai-compatible/translate", {
          body: {
            text: context.text,
            target: context.language,
            targetName: context.languageName || context.language,
            model: connection.model,
            preset: connection.preset,
            baseURL: connection.baseURL
          },
          signal: context.signal
        });
        if (typeof payload.translatedText !== "string" || !payload.translatedText.trim()) {
          throw new Error("The OpenAI-compatible provider returned an empty translation");
        }
        return payload.translatedText;
      }
    }
  ].map((provider) => Object.freeze(provider));

  root.VNRevivalTranslationProviders = Object.freeze({
    contractVersion: 1,
    list: Object.freeze(providers),
    byId: Object.freeze(Object.fromEntries(providers.map((provider) => [provider.id, provider])))
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
