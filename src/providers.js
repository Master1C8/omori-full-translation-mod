(function (root) {
  "use strict";

  const core = root.VNRevivalTranslationCore;
  if (!core) throw new Error("VN Revival translation core is missing before providers");

  const providers = [
    {
      id: "google",
      label: "Google Translate",
      concurrency: 1,
      delay: 1200,
      delayJitter: 600,
      bulkDelay: 1200,
      bulkDelayJitter: 600,
      bulkMaxDelay: 5000,
      bulkMaxItems: 12,
      bulkMaxSegments: 16,
      bulkConsecutiveFailureLimit: 3,
      retries: 3,
      contextLimit: 3200,
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
      },
      async translateChunks(context) {
        const target = core.providerLanguageCode("google", context.language);
        if (!target) throw new Error("The selected language is not supported by this service");
        const response = await context.fetch(
          core.buildGoogleBatchUrl(context.texts, target, context.sourceLanguage),
          { signal: context.signal, cache: "no-store" }
        );
        if (!response.ok) throw new Error("HTTP " + response.status);
        return core.parseGoogleBatchResponse(await response.json(), context.texts.length)
          .map((translation) => context.decodeHtmlEntities(translation));
      }
    },
    {
      id: "gemini",
      label: "Gemini AI",
      concurrency: 1,
      delay: 250,
      retries: 3,
      contextLimit: 6000,
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
            targetName: context.languageName || context.language,
            context: context.translationContext
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
      id: "lmstudio",
      label: "LM Studio Local AI",
      concurrency: 1,
      delay: 0,
      retries: 2,
      contextLimit: 6000,
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
            model: context.model,
            context: context.translationContext
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
      credentialManager: "openai-compatible",
      modelManager: "openai-compatible",
      supportsLanguage(code) {
        return !!String(code || "");
      },
      splitText(text) {
        return core.splitLongText(text, 6000);
      },
      hint() {
        return "OpenAI-compatible: connect OpenCode Go, OpenCode Zen, OpenRouter, DeepSeek, LM Studio, or a custom Chat Completions endpoint.";
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
            baseURL: connection.baseURL,
            context: context.translationContext
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
