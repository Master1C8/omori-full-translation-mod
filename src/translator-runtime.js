(function () {
  "use strict";
  if (window.__vnRevivalTranslator && window.__vnRevivalTranslator.version) return;

  const core = window.VNRevivalTranslationCore;
  const game = window.VNRevivalGameConfig;
  const adapter = window.VNRevivalGameAdapter;
  const providerRegistry = window.VNRevivalTranslationProviders;
  if (!core) throw new Error("VN Revival translation core is missing");
  if (!game || !game.id || !game.translatorName || !game.storageNamespace || game.sourceLanguage !== "en") {
    throw new Error("VN Revival game config is missing or incompatible");
  }
  if (!adapter || adapter.contractVersion !== 2) {
    throw new Error("VN Revival DOM adapter is missing or incompatible");
  }
  if (!providerRegistry || providerRegistry.contractVersion !== 1 || !Array.isArray(providerRegistry.list)) {
    throw new Error("VN Revival provider registry is missing or incompatible");
  }

  const VERSION = "__VERSION__";
  const SUPPORTED_GAME_VERSIONS = Array.isArray(game.supportedVersions) ? game.supportedVersions : [];
  const PRODUCT_NAME = game.translatorName;
  const GAME_TITLE = game.title || game.id;
  const GAME_SHORT_TITLE = game.shortTitle || GAME_TITLE;
  const SOURCE_LANGUAGE = game.sourceLanguage || "en";
  const SITE_NAME = "VN Revival";
  const SITE_URL = "https://vnrevival.fun/";
  const OPENCODE_GO_REFERRAL_URL = "https://opencode.ai/go?ref=SS6M8DKPP0";
  const LM_STUDIO_PROMPT_VERSION = "omori-translation-v1";
  const OPENAI_COMPATIBLE_PROMPT_VERSION = "omori-openai-compatible-v1";
  const OPENAI_COMPATIBLE_PRESETS = Object.freeze({
    "opencode-go": Object.freeze({ name: "OpenCode Go", baseURL: "https://opencode.ai/zen/go/v1", requiresKey: true }),
    openrouter: Object.freeze({ name: "OpenRouter", baseURL: "https://openrouter.ai/api/v1", requiresKey: true }),
    deepseek: Object.freeze({ name: "DeepSeek", baseURL: "https://api.deepseek.com", requiresKey: true }),
    lmstudio: Object.freeze({ name: "LM Studio", baseURL: "http://127.0.0.1:1234/v1", requiresKey: false }),
    custom: Object.freeze({ name: "Custom", baseURL: "", requiresKey: false })
  });
  const SUPER_BULK_LANGUAGES = Object.freeze([
    Object.freeze({ code: "es", name: "Spanish" }),
    Object.freeze({ code: "de", name: "German" }),
    Object.freeze({ code: "pl", name: "Polish" }),
    Object.freeze({ code: "vi", name: "Vietnamese" }),
    Object.freeze({ code: "ru", name: "Russian" }),
    Object.freeze({ code: "ar", name: "Arabic" }),
    Object.freeze({ code: "fa", name: "Persian" }),
    Object.freeze({ code: "iw", name: "Hebrew" }),
    Object.freeze({ code: "zh-CN", name: "Chinese Simplified" }),
    Object.freeze({ code: "zh-TW", name: "Chinese Traditional" }),
    Object.freeze({ code: "ja", name: "Japanese" }),
    Object.freeze({ code: "ko", name: "Korean" }),
    Object.freeze({ code: "hi", name: "Hindi" }),
    Object.freeze({ code: "bn", name: "Bengali" }),
    Object.freeze({ code: "th", name: "Thai" }),
    Object.freeze({ code: "my", name: "Myanmar" }),
    Object.freeze({ code: "ka", name: "Georgian" })
  ]);
  const LANGUAGE_TEST_PHRASE_SOURCE = "<WordWrap>\\marHi, OMORI! Cliff-faced as usual, I see.\\!<br>You should totally smile more! I've always liked your smile.";
  const AUTO_APPLY_TRANSLATIONS = true;
  const SETTINGS_KEY = `${game.storageNamespace}.settings.v2`;
  const LEGACY_SETTINGS_KEY = `${game.storageNamespace}.settings.v1`;
  const CACHE_META_KEY = `${game.storageNamespace}.cache-meta.v3`;
  const CACHE_DIRTY_KEY = `${game.storageNamespace}.cache-meta-dirty.v3`;
  const LEGACY_CACHE_META_KEYS = Object.freeze([
    `${game.storageNamespace}.cache-meta.v1`, `${game.storageNamespace}.cache-meta.v2`
  ]);
  const LEGACY_CACHE_DIRTY_KEYS = Object.freeze([
    `${game.storageNamespace}.cache-meta-dirty.v1`, `${game.storageNamespace}.cache-meta-dirty.v2`
  ]);
  const DB_NAME = game.cacheDatabase || `${game.storageNamespace}-cache`;
  const STORE_NAME = "translations";
  const CACHE_FORMAT = "vnrevival-translator-cache";
  const legacyCompatibility = game.legacyCompatibility || {};
  const LEGACY_CACHE_FORMATS = Array.isArray(legacyCompatibility.cacheFormats)
    ? legacyCompatibility.cacheFormats.filter((value) => typeof value === "string" && value)
    : [];
  const MEMORY_CACHE_LIMIT = 50000;
  const CACHE_IO_BATCH_SIZE = 250;
  const CACHE_IMPORT_ENTRY_LIMIT = 500000;
  const TRANSLATION_LOG_LIMIT = 40;
  const TRANSLATION_LOG_VIEW_LIMIT = 200;
  const UPDATE_CHECK_TIMEOUT = 12000;
  const TEST_PHRASE_GOOGLE_DELAY = 5000;
  const TEST_PHRASE_RATE_LIMIT_DELAY = 15000;
  const TEST_PHRASE_RATE_LIMIT_MAX_DELAY = 120000;
  const TEST_PHRASE_GOOGLE_RATE_LIMIT_DELAY = 15 * 60 * 1000;
  const TEST_PHRASE_GOOGLE_RATE_LIMIT_MAX_DELAY = 60 * 60 * 1000;
  const GOOGLE_RATE_LIMIT_STATE_KEY = `${game.storageNamespace}.google-rate-limit-state.v2`;
  const LEGACY_GOOGLE_RATE_LIMIT_UNTIL_KEY = `${game.storageNamespace}.google-rate-limit-until.v1`;
  const LANGUAGES = window.VNRevivalTranslatorLanguages;
  const PROVIDER_LIST = providerRegistry.list;
  const PROVIDERS = providerRegistry.byId;
  const injectedLocalBridge = window.__vnRevivalLocalBridge || window.__vnRevivalArgosBridge
    || (legacyCompatibility.argosBridgeGlobal ? window[legacyCompatibility.argosBridgeGlobal] : null);
  const LOCAL_BRIDGE = injectedLocalBridge
    && /^http:\/\/127\.0\.0\.1:\d+$/.test(String(injectedLocalBridge.baseURL || ""))
    && /^[A-Za-z0-9-]{16,}$/.test(String(injectedLocalBridge.token || ""))
    ? Object.freeze({ baseURL: injectedLocalBridge.baseURL, token: injectedLocalBridge.token })
    : null;
  const defaults = {
    language: "ru",
    provider: "google",
    autoTranslate: AUTO_APPLY_TRANSLATIONS,
    privacyAccepted: false,
    mode: "translated",
    lmStudioModel: "",
    openAICompatiblePreset: "opencode-go",
    openAICompatibleBaseURL: OPENAI_COMPATIBLE_PRESETS["opencode-go"].baseURL,
    openAICompatibleModel: "",
    collapsed: false,
    x: null,
    y: null
  };

  if (!Array.isArray(LANGUAGES) || LANGUAGES.length < 200) throw new Error("VN Revival language catalog is missing");
  if (!PROVIDERS.google || !PROVIDER_LIST.every((provider) => provider && provider.id && provider.label
    && typeof provider.supportsLanguage === "function" && typeof provider.splitText === "function"
    && typeof provider.translateChunk === "function")) throw new Error("VN Revival provider contract is invalid");

  let settings = loadSettings();
  let running = false;
  let bulkPreparing = false;
  let settingsGeneration = 0;
  let abortController = null;
  let activeOperation = null;
  let activeAbortReason = "";
  let selfMutation = false;
  let scanTimer = 0;
  let pendingAutoRun = false;
  let translationVisibilityObserver = null;
  let lastFailedJobs = [];
  let dbPromise = null;
  let cacheMetadata = loadCacheMetadata();
  let cacheMetadataPromise = null;
  let cacheMetadataVerified = false;
  let cacheMetadataSaveTimer = 0;
  let argosStatus = null;
  let argosBusy = false;
  let argosSupportedLanguages = null;
  let managedOfflineProvider = "";
  let geminiStatus = null;
  let geminiBusy = false;
  let lmStudioStatus = null;
  let lmStudioBusy = false;
  let openAICompatibleStatus = null;
  let openAICompatibleBusy = false;
  let bergamotRuntimePromise = null;
  const applied = new WeakMap();
  const appliedNodes = new Set();
  const originalPresentation = new WeakMap();
  const formattedElements = new Set();

  function abortActiveOperation(reason) {
    if (!abortController || abortController.signal.aborted) return;
    activeAbortReason = String(reason || "cancelled by user");
    abortController.abort();
  }
  const memoryCache = new Map();
  const fuzzyMemoryCache = new Map();
  const observedTranslationContainers = new WeakSet();
  const visibleTranslationContainers = new Set();
  const pendingTranslationRoots = new Set();
  const pendingAdapterTexts = new Set();

  function emptyCacheMetadata() {
    return { version: 1, records: 0, bytes: 0, languages: {} };
  }

  function isValidCacheMetric(value) {
    return value && Number.isFinite(value.records) && value.records >= 0
      && Number.isFinite(value.bytes) && value.bytes >= 0;
  }

  function loadCacheMetadata() {
    try {
      if (localStorage.getItem(CACHE_DIRTY_KEY) === "1") return null;
      const value = JSON.parse(localStorage.getItem(CACHE_META_KEY) || "null");
      if (!value || value.version !== 1 || !isValidCacheMetric(value) || !value.languages || typeof value.languages !== "object") return null;
      if (!Object.values(value.languages).every(isValidCacheMetric)) return null;
      return value;
    } catch (_) { return null; }
  }

  function markCacheMetadataDirty() {
    try { localStorage.setItem(CACHE_DIRTY_KEY, "1"); } catch (_) {}
  }

  function saveCacheMetadata(metadata) {
    try {
      localStorage.setItem(CACHE_META_KEY, JSON.stringify(metadata));
      localStorage.removeItem(CACHE_DIRTY_KEY);
    } catch (_) {}
  }

  function scheduleCacheMetadataSave() {
    clearTimeout(cacheMetadataSaveTimer);
    cacheMetadataSaveTimer = setTimeout(() => saveCacheMetadata(cacheMetadata), 500);
  }

  function cacheEntryBytes(key, value) {
    return core.utf8Length(String(key || "")) + core.utf8Length(String(value || ""));
  }

  function adjustCacheMetadata(metadata, key, value, direction) {
    if (!metadata || typeof value !== "string") return;
    const amount = direction < 0 ? -1 : 1;
    const bytes = cacheEntryBytes(key, value) * amount;
    metadata.records = Math.max(0, metadata.records + amount);
    metadata.bytes = Math.max(0, metadata.bytes + bytes);
    const language = core.cacheKeyLanguage(key);
    if (!language) return;
    const current = metadata.languages[language] || { records: 0, bytes: 0 };
    current.records = Math.max(0, current.records + amount);
    current.bytes = Math.max(0, current.bytes + bytes);
    if (current.records === 0) delete metadata.languages[language];
    else metadata.languages[language] = current;
  }

  function memoryCacheSet(key, value) {
    if (memoryCache.has(key)) memoryCache.delete(key);
    memoryCache.set(key, value);

    // Fuzzy indexing for quick lookups
    const parts = key.split("\n");
    if (parts[0] === "v3") {
      const source = parts[4];
      if (source) {
        const fuzzySource = core.stripOmoriPrefixes(source);
        if (fuzzySource) {
          const fuzzyKey = `${parts[1]}\n${parts[2]}\n${parts[3]}\n${fuzzySource}`;
          fuzzyMemoryCache.set(fuzzyKey, value);
        }
      }
    }
    if (parts[0] === "v4") {
      const source = parts[5];
      if (source) {
        const fuzzySource = core.stripOmoriPrefixes(source);
        if (fuzzySource) {
          const fuzzyKey = `${parts[1]}\n${parts[2]}@${parts[4]}\n${parts[3]}\n${fuzzySource}`;
          fuzzyMemoryCache.set(fuzzyKey, value);
        }
      }
    }

    while (memoryCache.size > MEMORY_CACHE_LIMIT) {
      const first = memoryCache.keys().next().value;
      memoryCache.delete(first);
      // Note: we don't prune fuzzy cache as it is small compared to memory limits
    }
  }

  function loadSettings() {
    let parsed = null;
    let migratedLegacy = false;
    try { parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null"); } catch (_) {}
    if (!parsed) {
      try {
        parsed = JSON.parse(localStorage.getItem(LEGACY_SETTINGS_KEY) || "null");
        migratedLegacy = !!parsed;
      } catch (_) {}
    }
    const source = parsed || {};
    const openAICompatiblePreset = Object.prototype.hasOwnProperty.call(
      OPENAI_COMPATIBLE_PRESETS, source.openAICompatiblePreset
    ) ? source.openAICompatiblePreset : defaults.openAICompatiblePreset;
    const presetBaseURL = OPENAI_COMPATIBLE_PRESETS[openAICompatiblePreset].baseURL;
    const customBaseURL = typeof source.openAICompatibleBaseURL === "string"
      && source.openAICompatibleBaseURL.length <= 2048 ? source.openAICompatibleBaseURL.trim() : "";
    return {
      language: LANGUAGES.some(([code]) => code === source.language) ? source.language : defaults.language,
      provider: PROVIDERS[source.provider] ? source.provider : defaults.provider,
      // Retain this field only for settings compatibility. Cache application is
      // intentionally always enabled and is no longer a user-facing option.
      autoTranslate: AUTO_APPLY_TRANSLATIONS,
      privacyAccepted: typeof source.privacyAccepted === "boolean" ? source.privacyAccepted : migratedLegacy,
      mode: source.mode === "source" ? "source" : defaults.mode,
      lmStudioModel: typeof source.lmStudioModel === "string" && source.lmStudioModel.length <= 512
        ? source.lmStudioModel : defaults.lmStudioModel,
      openAICompatiblePreset,
      openAICompatibleBaseURL: openAICompatiblePreset === "custom" ? customBaseURL : presetBaseURL,
      openAICompatibleModel: typeof source.openAICompatibleModel === "string"
        && source.openAICompatibleModel.length <= 512 ? source.openAICompatibleModel : defaults.openAICompatibleModel,
      collapsed: false,
      x: Number.isFinite(source.x) ? source.x : null,
      y: Number.isFinite(source.y) ? source.y : null
    };
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    localStorage.removeItem(LEGACY_SETTINGS_KEY);
  }

  function providerUsesLMStudio(provider) {
    return !!(PROVIDERS[provider] && PROVIDERS[provider].modelManager === "lmstudio");
  }

  function providerUsesOpenAICompatible(provider) {
    return !!(PROVIDERS[provider] && PROVIDERS[provider].modelManager === "openai-compatible");
  }

  function openAICompatibleConnection() {
    const preset = OPENAI_COMPATIBLE_PRESETS[settings.openAICompatiblePreset]
      ? settings.openAICompatiblePreset : defaults.openAICompatiblePreset;
    return {
      preset,
      baseURL: preset === "custom"
        ? String(settings.openAICompatibleBaseURL || "").trim()
        : OPENAI_COMPATIBLE_PRESETS[preset].baseURL,
      model: String(settings.openAICompatibleModel || "").trim()
    };
  }

  function providerCacheVariant(provider) {
    let providerVariant = "";
    if (providerUsesLMStudio(provider) && settings.lmStudioModel) {
      providerVariant = `${settings.lmStudioModel}\n${LM_STUDIO_PROMPT_VERSION}`;
    }
    if (providerUsesOpenAICompatible(provider)) {
      const connection = openAICompatibleConnection();
      providerVariant = connection.model
        ? `${connection.preset}\n${connection.baseURL}\n${connection.model}\n${OPENAI_COMPATIBLE_PROMPT_VERSION}` : "";
    }
    return providerVariant
      ? `${providerVariant}\n${core.PROTECTED_MARKUP_VERSION}`
      : core.PROTECTED_MARKUP_VERSION;
  }

  function providerCacheScope(provider) {
    const variant = providerCacheVariant(provider);
    return variant ? `${provider}@${core.fingerprint(variant)}` : provider;
  }

  function makeTranslationCacheKey(source, language, provider) {
    return core.makeCacheKey(source, language, provider, game.id, providerCacheVariant(provider));
  }

  function openExternalUrl(url) {
    const target = String(url || "");
    if (!/^https?:\/\//i.test(target)) return false;
    try {
      if (window.nw && window.nw.Shell && typeof window.nw.Shell.openExternal === "function") {
        window.nw.Shell.openExternal(target);
        return true;
      }
    } catch (_) {}
    try {
      if (typeof window.require === "function") {
        const gui = window.require("nw.gui");
        if (gui && gui.Shell && typeof gui.Shell.openExternal === "function") {
          gui.Shell.openExternal(target);
          return true;
        }
      }
    } catch (_) {}
    window.open(target, "_blank", "noopener,noreferrer");
    return true;
  }

  // Persist the sanitized v2 shape immediately so obsolete v1-only fields are discarded.
  saveSettings();

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 3);
      request.onupgradeneeded = (event) => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME);
        } else if (event.oldVersion < 3) {
          request.transaction.objectStore(STORE_NAME).clear();
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }

  async function cacheGet(key) {
    if (memoryCache.has(key)) {
      const value = memoryCache.get(key);
      memoryCacheSet(key, value);
      return value;
    }
    try {
      const db = await openDb();
      const value = await new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
        request.onsuccess = () => resolve(typeof request.result === "string" ? request.result : null);
        request.onerror = () => reject(request.error);
      });
      if (value) memoryCacheSet(key, value);
      return value;
    } catch (_) { return null; }
  }

  async function cachePut(key, value) {
    if (!key || !value) return false;
    memoryCacheSet(key, value);
    try {
      const metadata = await getCacheMetadata();
      const db = await openDb();
      markCacheMetadataDirty();
      const previous = await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const getRequest = store.get(key);
        getRequest.onerror = () => reject(getRequest.error);
        getRequest.onsuccess = () => {
          const oldValue = typeof getRequest.result === "string" ? getRequest.result : null;
          const putRequest = store.put(value, key);
          putRequest.onsuccess = () => resolve(oldValue);
          putRequest.onerror = () => reject(putRequest.error);
        };
      });
      if (previous !== null) adjustCacheMetadata(metadata, key, previous, -1);
      adjustCacheMetadata(metadata, key, value, 1);
      scheduleCacheMetadataSave();
      return true;
    } catch (_) { return false; }
  }

  async function preloadMemoryCache() {
    let loaded = 0;
    try {
      const language = settings.language;
      const provider = settings.provider;
      const variant = providerCacheVariant(provider);
      const variantFingerprint = variant ? core.fingerprint(variant) : "";
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.openCursor();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) { resolve(); return; }
          const key = cursor.key;
          if (typeof key === "string" && typeof cursor.value === "string") {
            if (core.cacheKeyLanguage(key) === language && core.cacheKeyProvider(key) === provider
              && (!variantFingerprint || core.cacheKeyVariant(key) === variantFingerprint)) {
              if (core.cacheKeyGame(key) === game.id || !core.cacheKeyGame(key)) {
                memoryCacheSet(key, cursor.value);
                loaded += 1;
              }
            }
          }
          cursor.continue();
        };
      });
    } catch (_) {}
    return loaded;
  }

  async function cacheDelete(key) {
    if (!key) return;
    memoryCache.delete(key);
    try {
      const metadata = await getCacheMetadata();
      const db = await openDb();
      markCacheMetadataDirty();
      const previous = await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const getRequest = store.get(key);
        getRequest.onerror = () => reject(getRequest.error);
        getRequest.onsuccess = () => {
          const oldValue = typeof getRequest.result === "string" ? getRequest.result : null;
          const deleteRequest = store.delete(key);
          deleteRequest.onsuccess = () => resolve(oldValue);
          deleteRequest.onerror = () => reject(deleteRequest.error);
        };
      });
      if (previous !== null) adjustCacheMetadata(metadata, key, previous, -1);
      scheduleCacheMetadataSave();
    } catch (_) {}
  }

  async function rebuildCacheMetadata() {
    const metadata = emptyCacheMetadata();
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).openCursor();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) { resolve(); return; }
        if (typeof cursor.key === "string" && typeof cursor.value === "string") {
          adjustCacheMetadata(metadata, cursor.key, cursor.value, 1);
        }
        cursor.continue();
      };
    });
    cacheMetadata = metadata;
    cacheMetadataVerified = true;
    saveCacheMetadata(metadata);
    return metadata;
  }

  async function verifyCacheMetadata(metadata) {
    try {
      const db = await openDb();
      const store = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME);
      if (typeof store.count !== "function") {
        cacheMetadataVerified = true;
        return metadata;
      }
      const records = await new Promise((resolve, reject) => {
        const request = store.count();
        request.onsuccess = () => resolve(Number(request.result) || 0);
        request.onerror = () => reject(request.error);
      });
      if (records !== metadata.records) return rebuildCacheMetadata();
      cacheMetadataVerified = true;
      return metadata;
    } catch (_) {
      cacheMetadataVerified = true;
      return metadata;
    }
  }

  async function getCacheMetadata() {
    if (cacheMetadata && cacheMetadataVerified) return cacheMetadata;
    if (!cacheMetadataPromise) {
      cacheMetadataPromise = (cacheMetadata ? verifyCacheMetadata(cacheMetadata) : rebuildCacheMetadata())
        .finally(() => { cacheMetadataPromise = null; });
    }
    return cacheMetadataPromise;
  }

  async function readCacheBatch(afterKey, limit) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const store = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME);
      const range = afterKey == null ? undefined : IDBKeyRange.lowerBound(afterKey, true);
      const keysRequest = store.getAllKeys(range, limit);
      const valuesRequest = store.getAll(range, limit);
      let keys = null;
      let values = null;
      const finish = () => {
        if (!keys || !values) return;
        resolve(keys.map((key, index) => [key, values[index]])
          .filter((entry) => typeof entry[0] === "string" && typeof entry[1] === "string"));
      };
      keysRequest.onsuccess = () => { keys = keysRequest.result || []; finish(); };
      valuesRequest.onsuccess = () => { values = valuesRequest.result || []; finish(); };
      keysRequest.onerror = () => reject(keysRequest.error);
      valuesRequest.onerror = () => reject(valuesRequest.error);
    });
  }

  function createCacheExportStream(exportedAt, onProgress) {
    const encoder = new TextEncoder();
    let started = false;
    let afterKey = null;
    let exported = 0;
    return new ReadableStream({
      async pull(controller) {
        if (!started) {
          started = true;
          controller.enqueue(encoder.encode(JSON.stringify({ format: CACHE_FORMAT, version: 2, gameId: game.id, exportedAt }) + "\n"));
          return;
        }
        const entries = await readCacheBatch(afterKey, CACHE_IO_BATCH_SIZE);
        if (!entries.length) {
          controller.close();
          return;
        }
        afterKey = entries[entries.length - 1][0];
        exported += entries.length;
        controller.enqueue(encoder.encode(entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n"));
        if (onProgress) onProgress(exported);
      }
    });
  }

  async function cacheStats() {
    try {
      const metadata = await getCacheMetadata();
      const language = metadata.languages[settings.language] || { records: 0, bytes: 0 };
      return { records: metadata.records, bytes: metadata.bytes, languageRecords: language.records, languageBytes: language.bytes };
    } catch (_) { return { records: 0, bytes: 0, languageRecords: 0, languageBytes: 0 }; }
  }

  async function clearCacheForLanguage(language) {
    const metadata = await getCacheMetadata();
    const db = await openDb();
    markCacheMetadataDirty();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const request = transaction.objectStore(STORE_NAME).openCursor();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (core.cacheKeyLanguage(cursor.key) === language) cursor.delete();
        cursor.continue();
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    memoryCache.clear();
    const removed = metadata.languages[language];
    if (removed) {
      metadata.records = Math.max(0, metadata.records - removed.records);
      metadata.bytes = Math.max(0, metadata.bytes - removed.bytes);
      delete metadata.languages[language];
    }
    saveCacheMetadata(metadata);
  }

  async function clearAllCache() {
    try {
      const db = await openDb();
      markCacheMetadataDirty();
      await new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      memoryCache.clear();
      cacheMetadata = emptyCacheMetadata();
      cacheMetadataVerified = true;
      saveCacheMetadata(cacheMetadata);
    } catch (_) {
      memoryCache.clear();
      cacheMetadata = null;
      cacheMetadataVerified = false;
    }
  }

  function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      if (signal) signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    });
  }

  function decodeHtmlEntities(value) {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = String(value || "");
    return textarea.value;
  }

  async function requestLocalHelper(path, options) {
    if (!LOCAL_BRIDGE) throw new Error("The local translation helper is unavailable");
    const requestOptions = options || {};
    const headers = { "X-VNRevival-Token": LOCAL_BRIDGE.token };
    const init = { method: requestOptions.body ? "POST" : "GET", headers, cache: "no-store", signal: requestOptions.signal };
    if (requestOptions.body) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(requestOptions.body);
    }
    const response = await fetch(LOCAL_BRIDGE.baseURL + path, init);
    let payload = null;
    try { payload = await response.json(); } catch (_) {}
    if (!response.ok || !payload || payload.ok === false) {
      const error = new Error(payload && payload.message ? payload.message : "Local translation helper error");
      error.code = payload && payload.error ? payload.error : "local_helper_error";
      throw error;
    }
    return payload;
  }

  async function logActivityToBridge(provider, source, translation, cached) {
    if (!LOCAL_BRIDGE) return;
    try {
      await requestLocalHelper("/v1/log/activity", {
        body: { provider, source, translation, cached }
      });
    } catch (_) {}
  }

  async function logTranslationToBridge(provider, language, source, translation, cached) {
    if (!LOCAL_BRIDGE) return;
    try {
      await requestLocalHelper("/v1/log/translation", {
        body: { provider, language, source, translation, cached: cached === true }
      });
    } catch (_) {}
  }

  async function fetchBergamotAsset(relative, responseType) {
    if (!LOCAL_BRIDGE) throw new Error("The local Bergamot helper is unavailable");
    const response = await fetch(`${LOCAL_BRIDGE.baseURL}/v1/bergamot/assets/${relative}`, {
      headers: { "X-VNRevival-Token": LOCAL_BRIDGE.token }, cache: "no-store"
    });
    if (!response.ok) throw new Error(`Could not load Bergamot asset: ${relative}`);
    return responseType === "arrayBuffer" ? response.arrayBuffer() : response.text();
  }

  function ensureBergamotRuntime() {
    if (bergamotRuntimePromise) return bergamotRuntimePromise;
    bergamotRuntimePromise = (async () => {
      const [moduleSource, workerSource, glueSource, wasmBuffer] = await Promise.all([
        fetchBergamotAsset("translator.js", "text"),
        fetchBergamotAsset("worker/translator-worker.js", "text"),
        fetchBergamotAsset("worker/bergamot-translator-worker.js", "text"),
        fetchBergamotAsset("worker/bergamot-translator-worker.wasm", "arrayBuffer")
      ]);
      const wasmNeedle = "new URL('./bergamot-translator-worker.wasm', self.location)";
      const glueNeedle = "self.importScripts('bergamot-translator-worker.js')";
      const moduleNeedle = "new Worker(new URL('./worker/translator-worker.js', import.meta.url))";
      if (!workerSource.includes(wasmNeedle) || !workerSource.includes(glueNeedle) || !moduleSource.includes(moduleNeedle)) {
        throw new Error("The bundled Bergamot runtime is incompatible");
      }
      const objectURLs = [];
      try {
        const wasmURL = URL.createObjectURL(new Blob([wasmBuffer], { type: "application/wasm" }));
        objectURLs.push(wasmURL);
        const patchedWorker = workerSource.replace(
          wasmNeedle,
          `new URL(${JSON.stringify(wasmURL)})`
        ).replace(
          glueNeedle,
          `eval.call(self, ${JSON.stringify(glueSource)})`
        );
        const workerURL = URL.createObjectURL(new Blob([patchedWorker], { type: "text/javascript" }));
        objectURLs.push(workerURL);
        const patchedModule = moduleSource.replace(
          moduleNeedle,
          `new Worker(${JSON.stringify(workerURL)})`
        );
        const moduleURL = URL.createObjectURL(new Blob([patchedModule], { type: "text/javascript" }));
        objectURLs.push(moduleURL);
        const bergamot = await import(moduleURL);
        class LocalBergamotBacking extends bergamot.TranslatorBacking {
          async loadModelRegistery() {
            const payload = await requestLocalHelper("/v1/bergamot/registry");
            return Array.isArray(payload.models) ? payload.models : [];
          }
          async fetch(url, _checksum, extra) {
            const path = String(url || "");
            if (!path.startsWith("/v1/bergamot/model-file?")) throw new Error("Invalid local Bergamot model URL");
            const response = await fetch(LOCAL_BRIDGE.baseURL + path, {
              headers: { "X-VNRevival-Token": LOCAL_BRIDGE.token },
              cache: "no-store", signal: extra && extra.signal
            });
            if (!response.ok) throw new Error("Could not read the installed Bergamot model");
            return response.arrayBuffer();
          }
        }
        const backing = new LocalBergamotBacking({ pivotLanguage: null, cacheSize: 256 });
        const translator = new bergamot.LatencyOptimisedTranslator({ pivotLanguage: null, cacheSize: 256 }, backing);
        await translator.worker;
        return translator;
      } finally {
        for (const url of objectURLs) URL.revokeObjectURL(url);
      }
    })().catch((error) => {
      bergamotRuntimePromise = null;
      throw error;
    });
    return bergamotRuntimePromise;
  }

  async function translateWithBergamot(text, language, signal) {
    const translator = await ensureBergamotRuntime();
    const response = await translator.translate({ from: "en", to: language, text, html: false }, { signal });
    const translated = response && response.target && response.target.text;
    if (typeof translated !== "string" || !translated.trim()) throw new Error("Bergamot returned an empty translation");
    return translated;
  }

  function resetBergamotRuntime() {
    const pending = bergamotRuntimePromise;
    bergamotRuntimePromise = null;
    if (pending) pending.then((translator) => {
      if (translator && typeof translator.delete === "function") translator.delete();
    }).catch(() => {});
  }

  function isTranslationRateLimited(error) {
    const code = String(error && error.code || "");
    const message = String(error && error.message || "");
    return code === "openai_rate_limited" || /HTTP 429|rate.?limit|too many requests/i.test(message);
  }

  async function requestChunk(provider, text, language, signal, options) {
    const selectedProvider = PROVIDERS[provider];
    if (!selectedProvider) throw new Error("Unknown translation service");
    const requestOptions = options || {};
    let lastError = null;
    const retries = Math.max(1, Number(selectedProvider.retries) || 1);
    for (let attempt = 0; attempt < retries; attempt += 1) {
      try {
        return await selectedProvider.translateChunk({
          text, language, sourceLanguage: SOURCE_LANGUAGE, signal,
          model: providerUsesLMStudio(provider) ? settings.lmStudioModel : "",
          openAICompatible: providerUsesOpenAICompatible(provider) ? openAICompatibleConnection() : null,
          bergamotTranslate: translateWithBergamot,
          languageName: (LANGUAGES.find(([code]) => code === language) || [null, language])[1],
          fetch: (input, init) => fetch(input, init),
          localRequest: requestLocalHelper,
          decodeHtmlEntities
        });
      } catch (error) {
        if (error && error.name === "AbortError") throw error;
        lastError = error;
        if (requestOptions.deferRateLimits && isTranslationRateLimited(error)) break;
        if (attempt + 1 < retries) await sleep(350 * Math.pow(2, attempt), signal);
      }
    }
    throw lastError || new Error("Translation failed");
  }

  function describeTranslationFailure(error, provider) {
    const code = String(error && error.code || "");
    if (code === "gemini_quota_exceeded") return "Gemini quota reached";
    if (code === "gemini_key_invalid") return "Gemini API key was rejected";
    if (code === "gemini_safety_block") return "Gemini safety filter blocked the text";
    if (code === "lmstudio_unavailable") return "LM Studio local server is unavailable";
    if (code === "lmstudio_model_missing" || code === "lmstudio_model_unavailable") return "Select an available LM Studio model";
    if (code === "lmstudio_format_invalid") return "LM Studio changed a protected game control code";
    if (code === "lmstudio_busy") return "LM Studio is busy";
    if (code === "openai_key_missing") return "Add the OpenAI-compatible API key";
    if (code === "openai_key_invalid") return "The OpenAI-compatible API key was rejected";
    if (code === "openai_model_missing" || code === "openai_model_unavailable") return "Select an available OpenAI-compatible model";
    if (code === "openai_format_invalid") return "The provider changed a protected game control code";
    if (code === "markup_format_invalid") return "The provider changed protected OMORI markup";
    if (code === "openai_rate_limited") return "The provider rate limit was reached";
    if (code === "openai_unavailable") return "The OpenAI-compatible provider is unavailable";
    const message = String(error && error.message || "").trim();
    const providerName = PROVIDERS[provider] ? PROVIDERS[provider].label : "Translation service";
    if (/HTTP 429|rate.?limit|too many requests/i.test(message)) return `${providerName} rate limit reached`;
    if (/HTTP 401|HTTP 403|unauthori[sz]ed|forbidden/i.test(message)) return `${providerName} rejected access`;
    if (/HTTP 5\d\d/i.test(message)) return `${providerName} is temporarily unavailable`;
    if (/failed to fetch|networkerror|network request failed|internet|offline/i.test(message)) return "Network connection failed";
    return message || `${providerName} failed`;
  }

  async function waitForRateLimitRetry(delay, signal, onWait) {
    const deadline = Date.now() + delay;
    while (!signal.aborted) {
      const remaining = Math.max(0, deadline - Date.now());
      if (!remaining) return;
      if (typeof onWait === "function") onWait(Math.max(1, Math.ceil(remaining / 1000)));
      await sleep(Math.min(1000, remaining), signal);
    }
  }

  function googleRateLimitState() {
    return core.parseRateLimitState(
      localStorage.getItem(GOOGLE_RATE_LIMIT_STATE_KEY),
      localStorage.getItem(LEGACY_GOOGLE_RATE_LIMIT_UNTIL_KEY),
      Date.now(),
      TEST_PHRASE_GOOGLE_RATE_LIMIT_DELAY,
      TEST_PHRASE_GOOGLE_RATE_LIMIT_MAX_DELAY
    );
  }

  function clearGoogleRateLimit() {
    localStorage.removeItem(GOOGLE_RATE_LIMIT_STATE_KEY);
    localStorage.removeItem(LEGACY_GOOGLE_RATE_LIMIT_UNTIL_KEY);
  }

  function googleRateLimitRemaining() {
    return Math.max(0, googleRateLimitState().until - Date.now());
  }

  function rememberGoogleRateLimit(delay) {
    const state = core.createRateLimitState(
      delay,
      Date.now(),
      TEST_PHRASE_GOOGLE_RATE_LIMIT_DELAY,
      TEST_PHRASE_GOOGLE_RATE_LIMIT_MAX_DELAY
    );
    localStorage.setItem(GOOGLE_RATE_LIMIT_STATE_KEY, JSON.stringify(state));
    localStorage.removeItem(LEGACY_GOOGLE_RATE_LIMIT_UNTIL_KEY);
  }

  function formatRetryCountdown(seconds) {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
  }

  function countTranslationWords(value) {
    const plainText = core.tokenizeProtectedMarkup(String(value || ""))
      .filter((segment) => segment.type === "text")
      .map((segment) => segment.value)
      .join(" ");
    const words = plainText.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu);
    return words ? words.length : 0;
  }

  function createTranslationEtaTracker() {
    const points = [];
    let pausedAt = 0;
    let pausedDuration = 0;
    let lastEstimate = null;

    function pause() {
      if (!pausedAt) pausedAt = performance.now();
      return lastEstimate;
    }

    function update(completedWords, totalWords) {
      const now = performance.now();
      if (pausedAt) {
        pausedDuration += now - pausedAt;
        pausedAt = 0;
      }
      const activeTime = now - pausedDuration;
      const completed = Math.max(0, Math.floor(Number(completedWords) || 0));
      const total = Math.max(completed, Math.floor(Number(totalWords) || 0));
      const previous = points[points.length - 1];
      if (!previous || completed > previous.words) points.push({ time: activeTime, words: completed });
      while (points.length > 2
        && (points.length > 12 || activeTime - points[0].time > 90000)) points.shift();
      if (points.length < 2 || completed >= total) {
        if (completed >= total && total > 0) lastEstimate = 0;
        return lastEstimate;
      }
      const first = points[0];
      const elapsed = activeTime - first.time;
      const processed = completed - first.words;
      if (elapsed < 2000 || processed <= 0) return lastEstimate;
      const estimate = (elapsed / processed) * (total - completed);
      lastEstimate = Number.isFinite(lastEstimate)
        ? (lastEstimate * 0.65) + (estimate * 0.35)
        : estimate;
      return lastEstimate;
    }

    return Object.freeze({ pause, update, current: () => lastEstimate });
  }

  function translationProgressText(completedWords, totalWords, remainingMs, waitSeconds) {
    const completed = Math.max(0, Math.floor(Number(completedWords) || 0));
    const total = Math.max(completed, Math.floor(Number(totalWords) || 0));
    const wordProgress = `Words: ${completed.toLocaleString("en-US")}/${total.toLocaleString("en-US")}`;
    if (Number(waitSeconds) > 0) {
      return `${wordProgress} · Waiting: ${formatRetryCountdown(Math.ceil(waitSeconds))}`;
    }
    if (!completed || !total || !Number.isFinite(remainingMs)) {
      return `${wordProgress} · Time left: calculating…`;
    }
    if (remainingMs < 60000) return `${wordProgress} · Time left: less than 1 min`;
    return `${wordProgress} · Time left: about ${Math.ceil(remainingMs / 60000)} min`;
  }

  async function requestRateLimitedChunk(provider, text, language, signal, onRateLimitWait) {
    const isGoogle = provider === "google";
    let retryDelay = isGoogle ? googleRateLimitState().nextDelay : TEST_PHRASE_RATE_LIMIT_DELAY;
    const maximumRetryDelay = isGoogle
      ? TEST_PHRASE_GOOGLE_RATE_LIMIT_MAX_DELAY
      : TEST_PHRASE_RATE_LIMIT_MAX_DELAY;
    while (!signal.aborted) {
      if (isGoogle) {
        const remaining = googleRateLimitRemaining();
        if (remaining) await waitForRateLimitRetry(remaining, signal, onRateLimitWait);
      }
      try {
        const translated = await requestChunk(provider, text, language, signal, { deferRateLimits: true });
        if (isGoogle) clearGoogleRateLimit();
        return translated;
      } catch (error) {
        if (error && error.name === "AbortError") throw error;
        if (!isTranslationRateLimited(error)) throw error;
        if (isGoogle) {
          retryDelay = googleRateLimitState().nextDelay;
          rememberGoogleRateLimit(retryDelay);
        }
        await waitForRateLimitRetry(retryDelay, signal, onRateLimitWait);
        if (!isGoogle) retryDelay = Math.min(retryDelay * 2, maximumRetryDelay);
      }
    }
    throw new DOMException("Aborted", "AbortError");
  }

  async function translateProviderText(provider, text, language, signal, request) {
    const selectedProvider = PROVIDERS[provider];
    if (!selectedProvider) throw new Error("Unknown translation service");
    const chunks = selectedProvider.splitText(text);
    const parts = [];
    for (const chunk of chunks) {
      parts.push(await request(chunk));
      await sleep(selectedProvider.delay, signal);
    }
    const translated = parts.join(" ").replace(/ +\n/g, "\n").trim();
    if (translated.toLowerCase().includes("undefined") && !text.toLowerCase().includes("undefined")) {
      throw new Error("Translation contains suspicious 'undefined' keyword");
    }
    return translated;
  }

  async function translateWithProtectedMarkup(source, language, provider, signal, request) {
    const markerNonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    return core.translateProtectedText(
      source,
      (text) => translateProviderText(provider, text, language, signal, (chunk) => request(chunk)),
      markerNonce
    );
  }

  async function translateText(source, language, provider, signal, allowNetwork, logCachedResult, onRateLimitWait) {
    if (!source || typeof source !== "string" || source.length < 2) return { text: source, cached: true };

    // Hard barrier: Never translate if Cyrillic is detected or if it looks like code
    if (/[\u0410-\u044F\u0401\u0451]/.test(source) || source.includes("this.") || /[\+\*\/]/.test(source)) {
      return { text: source, cached: true };
    }

    const key = makeTranslationCacheKey(source, language, provider);
    const fuzzyKey = `${game.id}\n${providerCacheScope(provider)}\n${language}\n${core.stripOmoriPrefixes(source)}`;

    let cached = memoryCache.get(key) || fuzzyMemoryCache.get(fuzzyKey);
    if (cached && !core.protectedMarkupLayoutMatches(source, cached)) cached = null;

    if (!cached) {
      cached = await cacheGet(key);
      if (!cached) {
        const legacyKey = providerCacheVariant(provider) ? "" : core.makeCacheKey(source, language, provider);
        cached = legacyKey ? await cacheGet(legacyKey) : null;
        if (cached && !core.protectedMarkupLayoutMatches(source, cached)) cached = null;
        if (cached) {
          if (await cachePut(key, cached)) await cacheDelete(legacyKey);
        }
      }
    }
    if (cached && !core.protectedMarkupLayoutMatches(source, cached)) {
      await cacheDelete(key);
      cached = null;
    }

    if (cached) {
      if (logCachedResult) {
        appendTranslationLog(source, cached, language, provider, true);
        await logTranslationToBridge(provider, language, source, cached, true);
      }
      logActivityToBridge(provider, source, cached, true);
      return { text: cached, cached: true };
    }

    if (!allowNetwork) return { text: source, cached: false, skipped: true };

    const protectedResult = await translateWithProtectedMarkup(
      source, language, provider, signal,
      (chunk) => onRateLimitWait
        ? requestRateLimitedChunk(provider, chunk, language, signal, onRateLimitWait)
        : requestChunk(provider, chunk, language, signal)
    );
    const translated = protectedResult.text;

    if (translated) {
      await cachePut(key, translated);
      appendTranslationLog(source, translated, language, provider, false);
      logActivityToBridge(provider, source, translated, false);
      await logTranslationToBridge(provider, language, source, translated, false);
    }
    return { text: translated, cached: false };
  }

  function hasSourceText(value) {
    if (typeof adapter.hasSourceText === "function") return !!adapter.hasSourceText(value, core);
    return core.hasEnglishText(value);
  }

  function isPrivateOrTechnical(element) {
    if (!element) return true;
    if (typeof adapter.isPrivateElement === "function" && adapter.isPrivateElement(element)) return true;
    const selectors = [
      "script", "style", "noscript", "input", "textarea", "[contenteditable='true']",
      "#loading", "#progressText", "progress", "[data-vnrevival-private]"
    ].concat(Array.isArray(adapter.privateSelectors) ? adapter.privateSelectors : []);
    return !!element.closest(selectors.join(","));
  }

  function isElementOnScreen(element) {
    if (!(element instanceof Element) || !element.isConnected) return false;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.right >= 0 && rect.top <= innerHeight && rect.left <= innerWidth;
  }

  function isVisible(element) {
    return isElementOnScreen(element) && !isPrivateOrTechnical(element);
  }

  function sourceForNode(node) {
    const current = core.normalizeText(node && node.nodeValue);
    const record = applied.get(node);
    if (!record) return current;
    if (current === core.normalizeText(record.source) || current === core.normalizeText(record.translation)) return record.source;
    applied.delete(node);
    appliedNodes.delete(node);
    return current;
  }

  function classifyNode(node) {
    if (typeof adapter.classifyNode === "function") {
      const category = adapter.classifyNode(node);
      if (category) return category;
    }
    const element = node.parentElement;
    const selectors = adapter.categorySelectors || {};
    if (selectors.story && element.closest(selectors.story)) return "story";
    if (selectors.control && element.closest(selectors.control)) return "control";
    if (selectors.tooltip && element.closest(selectors.tooltip)) return "tooltip";
    return "ui";
  }

  function normalizedScanRoots(roots) {
    if (!Array.isArray(roots)) return [document.body];
    const connected = Array.from(new Set(roots)).filter((root) => root instanceof Element && root.isConnected);
    return connected.filter((root, index) => !connected.some((other, otherIndex) => otherIndex !== index && other.contains(root)));
  }

  function textNodesWithinRoots(roots) {
    const result = [];
    const seen = new Set();
    for (const root of normalizedScanRoots(roots)) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (!seen.has(node)) {
          seen.add(node);
          result.push(node);
        }
      }
    }
    return result;
  }

  function collectVisibleTextNodes(options) {
    const includeCompleted = !!(options && options.includeCompleted);
    const result = [];
    const roots = options && Array.isArray(options.roots) ? options.roots : null;
    for (const node of textNodesWithinRoots(roots)) {
      if (!node.parentElement || !isVisible(node.parentElement)) continue;
      const source = sourceForNode(node);
      if (!hasSourceText(source)) continue;
      const record = applied.get(node);
      if (!includeCompleted && record && record.language === settings.language && record.provider === settings.provider && record.translation) {
        continue;
      }
      result.push(node);
    }
    return result;
  }

  function preserveWhitespace(original, translated) {
    const value = String(original || "");
    const lead = (value.match(/^\s*/) || [""])[0];
    const tail = (value.match(/\s*$/) || [""])[0];
    return lead + translated + tail;
  }

  function writeNode(node, value) {
    if (!node || !node.isConnected) return;
    selfMutation = true;
    node.nodeValue = preserveWhitespace(node.nodeValue, value);
    queueMicrotask(() => { selfMutation = false; });
  }

  function presentationContainerForNode(node) {
    let element = node && node.parentElement;
    const fallback = element;
    while (element && element !== document.body && element !== document.documentElement) {
      if (element.matches("button,a,[role='button'],[role='link'],li,p")) return element;
      const display = getComputedStyle(element).display;
      if (display !== "inline" && display !== "contents") return element;
      element = element.parentElement;
    }
    return fallback;
  }

  function queueTranslationContainer(element) {
    if (!(element instanceof Element) || !element.isConnected || element === document.body || element === document.documentElement) return;
    pendingTranslationRoots.add(element);
  }

  function registerTranslationContainers(root) {
    const roots = root instanceof Element ? [root] : (root && root.parentElement ? [root.parentElement] : []);
    for (const node of textNodesWithinRoots(roots)) {
      if (!node.parentElement || isPrivateOrTechnical(node.parentElement)) continue;
      if (!hasSourceText(sourceForNode(node))) continue;
      const container = presentationContainerForNode(node) || node.parentElement;
      if (!container || container === document.body || container === document.documentElement) continue;
      if (!observedTranslationContainers.has(container)) {
        observedTranslationContainers.add(container);
        if (translationVisibilityObserver) translationVisibilityObserver.observe(container);
      }
      if (!translationVisibilityObserver && isElementOnScreen(container)) queueTranslationContainer(container);
    }
  }

  function takeAutoTranslationRoots() {
    for (const element of visibleTranslationContainers) {
      if (element.isConnected) pendingTranslationRoots.add(element);
      else visibleTranslationContainers.delete(element);
    }
    const roots = normalizedScanRoots(Array.from(pendingTranslationRoots));
    pendingTranslationRoots.clear();
    return roots;
  }

  const TRANSLATION_STYLE_PROPERTIES = [
    "direction", "unicode-bidi", "text-align", "overflow-wrap", "word-break",
    "line-break", "line-height", "white-space", "height", "min-height", "font-family"
  ];

  function capturePresentation(element) {
    if (originalPresentation.has(element)) return originalPresentation.get(element);
    const attributes = {};
    for (const name of ["dir", "lang", "data-vnrevival-translated", "data-vnrevival-game", "data-vnrevival-language"]) {
      attributes[name] = { present: element.hasAttribute(name), value: element.getAttribute(name) };
    }
    const styles = {};
    for (const property of TRANSLATION_STYLE_PROPERTIES) {
      styles[property] = {
        value: element.style.getPropertyValue(property),
        priority: element.style.getPropertyPriority(property)
      };
    }
    const state = {
      attributes,
      styles,
      minimumHeight: Math.ceil(element.getBoundingClientRect().height || 0),
      computedFontFamily: getComputedStyle(element).fontFamily
    };
    originalPresentation.set(element, state);
    return state;
  }

  function restoreStyleProperty(element, property, value, priority) {
    if (value) element.style.setProperty(property, value, priority);
    else element.style.removeProperty(property);
  }

  function restoreLanguageFormatting() {
    for (const element of formattedElements) {
      const original = originalPresentation.get(element);
      if (!original) continue;
      for (const [name, attribute] of Object.entries(original.attributes)) {
        if (attribute.present) element.setAttribute(name, attribute.value);
        else element.removeAttribute(name);
      }
      for (const [property, style] of Object.entries(original.styles)) {
        restoreStyleProperty(element, property, style.value, style.priority);
      }
      originalPresentation.delete(element);
    }
    formattedElements.clear();
  }

  function applyLanguageFormatting(node, language) {
    const element = presentationContainerForNode(node);
    if (!element) return;
    const original = capturePresentation(element);
    formattedElements.add(element);
    element.setAttribute("lang", core.htmlLanguageCode(language));
    element.setAttribute("data-vnrevival-translated", "true");
    element.setAttribute("data-vnrevival-game", game.id);
    element.setAttribute("data-vnrevival-language", language);
    const fallbackFonts = core.fontFallbacks(language).map((font) => font === "sans-serif" ? font : JSON.stringify(font));
    const fontStack = [original.computedFontFamily].concat(fallbackFonts).filter(Boolean).join(", ");
    element.style.setProperty("font-family", fontStack, "important");
    element.style.setProperty("overflow-wrap", "anywhere", "important");
    element.style.setProperty("word-break", "normal", "important");
    if (core.isCjkLanguage(language)) element.style.setProperty("line-break", "auto", "important");
    if (core.isTallScriptLanguage(language)) element.style.setProperty("line-height", "1.35", "important");
    if (classifyNode(node) === "control") {
      element.style.setProperty("white-space", "normal", "important");
      element.style.setProperty("height", "auto", "important");
      if (original.minimumHeight) element.style.setProperty("min-height", `${original.minimumHeight}px`, "important");
    }
    if (core.isRtlLanguage(language)) {
      element.setAttribute("dir", "rtl");
      element.style.setProperty("direction", "rtl", "important");
      element.style.setProperty("unicode-bidi", "plaintext", "important");
      element.style.setProperty("text-align", "start", "important");
    }
  }

  function refreshLanguageFormatting() {
    restoreLanguageFormatting();
    if (settings.mode !== "translated") return;
    for (const node of appliedNodes) {
      const record = applied.get(node);
      if (record && node.isConnected) applyLanguageFormatting(node, record.language);
    }
  }

  function rememberTranslation(node, source, translation, language, provider) {
    if (!node || !node.isConnected || !translation) return;
    applied.set(node, { source, translation, language, provider });
    appliedNodes.add(node);
    if (settings.mode === "translated") {
      writeNode(node, translation);
      applyLanguageFormatting(node, language);
    }
  }

  function pruneAppliedNodes() {
    for (const node of appliedNodes) {
      if (!node.isConnected) {
        applied.delete(node);
        appliedNodes.delete(node);
      }
    }
  }

  function showOriginal() {
    settings.mode = "source";
    pruneAppliedNodes();
    for (const node of appliedNodes) {
      const record = applied.get(node);
      if (record) writeNode(node, record.source);
    }
    restoreLanguageFormatting();
    saveSettings();
    updateModeButton();
    setStatus("Showing original");
    if (typeof adapter.onModeChanged === "function") {
      adapter.onModeChanged("source");
    }
  }

  function showTranslations() {
    settings.mode = "translated";
    pruneAppliedNodes();
    for (const node of appliedNodes) {
      const record = applied.get(node);
      if (record) writeNode(node, record.translation);
    }
    refreshLanguageFormatting();
    saveSettings();
    updateModeButton();
    setStatus("Showing translation");
    if (typeof adapter.onModeChanged === "function") {
      adapter.onModeChanged("translated");
    }
    scheduleAutoTranslation(50);
  }

  function toggleMode() {
    if (settings.mode === "translated") showOriginal();
    else showTranslations();
  }

  function invalidateAppliedTranslations() {
    pruneAppliedNodes();
    for (const node of appliedNodes) {
      const record = applied.get(node);
      if (record) writeNode(node, record.source);
      applied.delete(node);
    }
    appliedNodes.clear();
    restoreLanguageFormatting();
  }

  function contextContainerForNode(node) {
    if (typeof adapter.findContextContainer === "function") {
      const container = adapter.findContextContainer(node);
      if (container) return container;
    }
    const element = node && node.parentElement;
    if (!element) return null;
    const selectors = Array.isArray(adapter.contextSelectors) ? adapter.contextSelectors : [];
    return (selectors.length ? element.closest(selectors.join(",")) : null) || element;
  }

  function buildJobs(nodes) {
    const blocks = new Map();
    for (const node of nodes) {
      const source = sourceForNode(node);
      if (!hasSourceText(source)) continue;
      const container = contextContainerForNode(node) || node.parentElement;
      if (!blocks.has(container)) blocks.set(container, []);
      blocks.get(container).push({ node, source, kind: classifyNode(node) });
    }
    const jobs = [];
    const simple = new Map();
    const contextLimit = Number(PROVIDERS[settings.provider] && PROVIDERS[settings.provider].contextLimit) || 3200;
    for (const entries of blocks.values()) {
      let offset = 0;
      while (offset < entries.length) {
        let size = Math.min(12, entries.length - offset);
        let slice = entries.slice(offset, offset + size);
        let contextSource = core.buildContextSource(slice.map((entry) => entry.source));
        while (size > 1 && (contextSource.length > contextLimit || core.utf8Length(contextSource) > contextLimit)) {
          size -= 1;
          slice = entries.slice(offset, offset + size);
          contextSource = core.buildContextSource(slice.map((entry) => entry.source));
        }
        if (size > 1) {
          jobs.push({
            source: contextSource,
            nodes: slice.map((entry) => entry.node),
            parts: slice,
            kind: slice[0].kind,
            contextual: true
          });
          offset += size;
          continue;
        }
        const entry = entries[offset];
        if (!simple.has(entry.source)) simple.set(entry.source, { source: entry.source, nodes: [], kind: entry.kind, contextual: false });
        simple.get(entry.source).nodes.push(entry.node);
        offset += 1;
      }
    }
    jobs.push(...simple.values());
    const priority = { story: 0, control: 1, tooltip: 2, ui: 3 };
    return jobs.sort((a, b) => priority[a.kind] - priority[b.kind]);
  }

  async function applyJobTranslation(job, language, provider, signal, generation) {
    const result = await translateText(job.source, language, provider, signal, false);
    if (generation !== settingsGeneration) throw new DOMException("Settings changed", "AbortError");
    if (result.skipped) {
      if (job.adapterOnly) pendingAdapterTexts.delete(job.source);
      return "missing";
    }
    if (job.adapterOnly) {
      pendingAdapterTexts.delete(job.source);
      return result.cached ? "hit" : "updated";
    }
    if (!job.contextual) {
      for (const node of job.nodes) {
        if (node.isConnected && sourceForNode(node) === job.source) rememberTranslation(node, job.source, result.text, language, provider);
      }
      return result.cached ? "hit" : "updated";
    }
    const contextualParts = core.parseContextTranslation(result.text, job.parts.length);
    if (contextualParts) {
      for (let index = 0; index < job.parts.length; index += 1) {
        const part = job.parts[index];
        if (!result.cached) {
          cachePut(makeTranslationCacheKey(part.source, language, provider), contextualParts[index]);
        }
        if (part.node.isConnected && sourceForNode(part.node) === part.source) {
          rememberTranslation(part.node, part.source, contextualParts[index], language, provider);
        }
      }
      return result.cached ? "hit" : "updated";
    }
    let allCached = true;
    for (const part of job.parts) {
      const fallback = await translateText(part.source, language, provider, signal, false);
      allCached = allCached && fallback.cached;
      if (part.node.isConnected && sourceForNode(part.node) === part.source) {
        rememberTranslation(part.node, part.source, fallback.text, language, provider);
      }
    }
    return allCached ? "hit" : "updated";
  }

  async function runJobs(jobs, options) {
    const manual = !!(options && options.manual);
    if (running) {
      if (manual) abortActiveOperation("cancelled by user");
      else pendingAutoRun = true;
      return;
    }
    if (!jobs.length) {
      setStatus("Screen already translated");
      return;
    }

    running = true;
    activeOperation = "screen";
    activeAbortReason = "";
    abortController = new AbortController();
    retryButton.hidden = true;
    lastFailedJobs = [];
    const language = settings.language;
    const provider = settings.provider;
    const generation = settingsGeneration;
    let nextIndex = 0;
    let done = 0;
    let cacheHits = 0;
    let cacheMisses = 0;
    let lastErrorCode = "";

    let adapterTextsAttempted = false;
    for (const job of jobs) { if (job.adapterOnly) { adapterTextsAttempted = true; break; } }

    async function worker() {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= jobs.length) return;
        const job = jobs[index];
        try {
          const outcome = await applyJobTranslation(job, language, provider, abortController.signal, generation);
          if (outcome === "hit") cacheHits += 1;
          else if (outcome === "missing") cacheMisses += 1;
        } catch (error) {
          if (error && error.name === "AbortError") throw error;
          lastErrorCode = error && error.code ? error.code : lastErrorCode;
          lastFailedJobs.push(job);
        }
        done += 1;
        setStatus(`Syncing ${done}/${jobs.length}`);
      }
    }

    try {
      const count = Math.min(PROVIDERS[provider].concurrency, jobs.length);
      await Promise.all(Array.from({ length: count }, () => worker()));
      if (adapterTextsAttempted && typeof adapter.onTranslationsChanged === "function") {
        try { adapter.onTranslationsChanged(); } catch (_) {}
      }
      if (lastFailedJobs.length) {
        if (lastErrorCode === "gemini_quota_exceeded") setStatus("Gemini quota reached · retry later");
        else if (lastErrorCode === "gemini_key_invalid") setStatus("Gemini API key was rejected");
        else if (lastErrorCode === "gemini_safety_block") setStatus(`Gemini blocked ${lastFailedJobs.length} text blocks`);
        else setStatus(`Done: ${jobs.length - lastFailedJobs.length}, errors: ${lastFailedJobs.length}`);
        retryButton.hidden = false;
      } else {
        setStatus(`Synced from cache: ${cacheHits}` + (cacheMisses ? ` · missing: ${cacheMisses}` : ""));
      }
    } catch (error) {
      setStatus(error && error.name === "AbortError"
        ? `Cancelled: ${activeAbortReason || "cancelled by user"}`
        : describeTranslationFailure(error, provider));
    } finally {
      running = false;
      abortController = null;
      activeOperation = null;
      activeAbortReason = "";
      refreshCacheStats();
      if (pendingAutoRun) {
        pendingAutoRun = false;
        scheduleAutoTranslation(250);
      }
    }
  }

  async function ensureBulkProviderReady() {
    if (providerUsesManagedOffline(settings.provider)) {
      const status = await refreshArgosStatus();
      if (!status || !status.offlineReady) {
        const engine = managedOfflineEngine(settings.provider);
        setStatus(status && status.runtimeInstalled && status.sentenceModelInstalled
          ? `Download the ${engine.name} model first` : `Install ${engine.name} first`);
        return false;
      }
    } else if (providerUsesGemini(settings.provider)) {
      const status = await refreshGeminiStatus();
      if (!status || !status.configured) {
        setStatus("Add a Gemini API key first");
        return false;
      }
    } else if (providerUsesLMStudio(settings.provider)) {
      const status = await refreshLMStudioStatus();
      if (!status || !status.available) {
        setStatus("Start the LM Studio local server first");
        return false;
      }
      if (!settings.lmStudioModel || !status.models.includes(settings.lmStudioModel)) {
        setStatus("Select an available LM Studio model first");
        return false;
      }
    } else if (providerUsesOpenAICompatible(settings.provider)) {
      const status = await refreshOpenAICompatibleStatus();
      if (!status) {
        setStatus("Configure the OpenAI-compatible connection first");
        return false;
      }
      if (status.requiresKey && !status.configured) {
        setStatus(`Add the ${status.name || "provider"} API key first`);
        return false;
      }
      if (!openAICompatibleConnection().model) {
        setStatus("Enter or select an OpenAI-compatible model first");
        return false;
      }
    }
    if (providerRequiresPrivacy(settings.provider) && !settings.privacyAccepted) {
      privacyBox.hidden = false;
      setStatus("Confirm bulk upload before translation");
      return false;
    }
    return true;
  }

  async function prepareManagedOfflineTestPhraseTarget(provider, language, name, signal, onProgress) {
    const engine = managedOfflineEngine(provider);
    const statusPath = engine.statusPath + "?target=" + encodeURIComponent(language);
    let status = await requestLocalHelper(statusPath, { signal });
    if (!status.supported) throw new Error(`${engine.name} has no English → ${name} model`);
    let installed = false;
    if (!status.runtimeInstalled || !status.sentenceModelInstalled) {
      if (!engine.runtimeInstallPath) throw new Error(`The bundled ${engine.name} engine is unavailable`);
      if (typeof onProgress === "function") onProgress(`installing the ${engine.name} engine for ${name}`);
      await requestLocalHelper(engine.runtimeInstallPath, { body: { accepted: true }, signal });
      status = await requestLocalHelper(statusPath, { signal });
    }
    if (!status.modelInstalled) {
      if (typeof onProgress === "function") onProgress(`preparing the English → ${name} ${engine.name} model`);
      status = await requestLocalHelper(engine.modelInstallPath, { body: { target: language }, signal });
      installed = true;
    }
    if (!status.offlineReady) throw new Error(`${engine.name} could not prepare the English → ${name} model`);
    return { installed, status };
  }

  async function translateAdapterText(source) {
    if (settings.mode !== "translated" || !hasSourceText(source)) return null;
    const result = await translateText(source, settings.language, settings.provider, null, false);
    pendingAdapterTexts.delete(source);
    if (typeof adapter.onTranslationsChanged === "function") adapter.onTranslationsChanged();
    return result;
  }

  function translateScreen(manual) {
    const isManual = manual !== false;
    if (running) {
      if (isManual) abortActiveOperation("cancelled by user");
      else pendingAutoRun = true;
      return;
    }
    const roots = isManual ? null : takeAutoTranslationRoots();
    if (!isManual && !roots.length && !pendingAdapterTexts.size) return Promise.resolve();
    const jobs = buildJobs(collectVisibleTextNodes(roots ? { roots } : null));
    if (pendingAdapterTexts.size > 0) {
      for (const source of pendingAdapterTexts) {
        jobs.push({ source, nodes: [], kind: "ui", contextual: false, adapterOnly: true });
      }
      pendingAdapterTexts.clear();
    }
    if (!isManual && !jobs.length) return Promise.resolve();
    return runJobs(jobs, { manual: isManual });
  }

  function retryFailed() {
    const jobs = lastFailedJobs.filter((job) => job.nodes.some((node) => node.isConnected));
    lastFailedJobs = [];
    return runJobs(jobs.length ? jobs : buildJobs(collectVisibleTextNodes()), { manual: true });
  }

  function reapplyKnownTranslations(roots) {
    for (const node of textNodesWithinRoots(roots)) {
      const record = applied.get(node);
      if (!record) continue;
      const current = core.normalizeText(node.nodeValue);
      if (current !== core.normalizeText(record.source) && current !== core.normalizeText(record.translation)) {
        applied.delete(node);
        appliedNodes.delete(node);
        continue;
      }
      if (settings.mode === "translated" && current === core.normalizeText(record.source)) {
        writeNode(node, record.translation);
        applyLanguageFormatting(node, record.language);
      }
      if (settings.mode === "source" && current === core.normalizeText(record.translation)) writeNode(node, record.source);
    }
  }

  function scheduleAutoTranslation(delay) {
    if (document.hidden || scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = 0;
      if (document.hidden) return;
      const loading = document.getElementById("loading");
      if (loading && isElementOnScreen(loading)) {
        scheduleAutoTranslation(1000);
        return;
      }
      const roots = takeAutoTranslationRoots();
      if (!roots.length && !pendingAdapterTexts.size) return;
      reapplyKnownTranslations(roots);
      for (const root of roots) pendingTranslationRoots.add(root);
      if (settings.mode === "translated") translateScreen(false);
    }, Number(delay) || 350);
  }

  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return value + " B";
    if (value < 1024 * 1024) return (value / 1024).toFixed(1) + " KB";
    return (value / (1024 * 1024)).toFixed(1) + " MB";
  }

  async function refreshCacheStats() {
    const stats = await cacheStats();
    cacheStatsElement.textContent = `This language: ${stats.languageRecords} entries, ${formatBytes(stats.languageBytes)} · Total: ${stats.records}, ${formatBytes(stats.bytes)}`;
  }

  async function exportCache() {
    try {
      const exportedAt = new Date().toISOString();
      const filename = `${game.id}-translator-cache-${exportedAt.slice(0, 10)}.jsonl`;
      let exported = 0;
      const makeStream = () => createCacheExportStream(exportedAt, (count) => {
        exported = count;
        setStatus(`Exporting: ${count}`);
      });
      let savedDirectly = false;
      if (typeof showSaveFilePicker === "function") {
        try {
          const handle = await showSaveFilePicker({
            suggestedName: filename,
            types: [{ description: `${PRODUCT_NAME} cache`, accept: { "application/x-ndjson": [".jsonl"] } }]
          });
          const writable = await handle.createWritable();
          await makeStream().pipeTo(writable);
          savedDirectly = true;
        } catch (error) {
          if (error && error.name === "AbortError") throw error;
        }
      }
      if (!savedDirectly) {
        exported = 0;
        const blob = await new Response(makeStream(), { headers: { "Content-Type": "application/x-ndjson" } }).blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.documentElement.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setStatus(`Exported: ${exported}`);
    } catch (error) {
      if (error && error.name === "AbortError") setStatus("Export cancelled");
      else setStatus("Could not export cache");
    }
  }

  function isValidCacheEntry(entry) {
    if (!(Array.isArray(entry)
      && typeof entry[0] === "string" && typeof entry[1] === "string"
      && core.cacheKeyLanguage(entry[0]) && core.cacheKeyProvider(entry[0])
      && entry[0].length < 120000 && entry[1].length < 120000)) return false;
    const entryGame = core.cacheKeyGame(entry[0]);
    return !entryGame || entryGame === game.id;
  }

  function isAcceptedCacheFormat(format) {
    return format === CACHE_FORMAT || LEGACY_CACHE_FORMATS.includes(format);
  }

  async function writeCacheEntries(entries) {
    if (!entries.length) return;
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      for (const [key, value] of entries) store.put(value, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error("Cache transaction aborted"));
    });
  }

  async function importJsonLinesCache(file, validateOnly) {
    const reader = file.stream().getReader();
    const decoder = new TextDecoder();
    let pending = "";
    let header = null;
    let imported = 0;
    let batch = [];
    async function consumeLine(line) {
      if (!line.trim()) return;
      if (line.length > 250000) throw new Error("Cache entry is too large");
      const value = JSON.parse(line);
      if (!header) {
        if (!value || !isAcceptedCacheFormat(value.format) || value.version !== 2
          || (value.gameId && value.gameId !== game.id)) throw new Error("Invalid format");
        header = value;
        return;
      }
      if (!isValidCacheEntry(value)) throw new Error("Invalid cache entry");
      imported += 1;
      if (imported > CACHE_IMPORT_ENTRY_LIMIT) throw new Error("Too many cache entries");
      if (!validateOnly) batch.push(value);
      if (!validateOnly && batch.length >= CACHE_IO_BATCH_SIZE) {
        await writeCacheEntries(batch);
        batch = [];
        setStatus(`Importing: ${imported}`);
      }
    }
    while (true) {
      const chunk = await reader.read();
      pending += decoder.decode(chunk.value || new Uint8Array(), { stream: !chunk.done });
      const lines = pending.split("\n");
      pending = lines.pop() || "";
      for (const line of lines) await consumeLine(line);
      if (chunk.done) break;
    }
    if (pending) await consumeLine(pending);
    if (!header) throw new Error("Invalid format");
    if (!validateOnly) await writeCacheEntries(batch);
    return imported;
  }

  async function importLegacyCache(file) {
    if (file.size > 25 * 1024 * 1024) throw new Error("Legacy cache file is too large");
    const payload = JSON.parse(await file.text());
    if (!payload || !isAcceptedCacheFormat(payload.format) || payload.version !== 1
      || (payload.gameId && payload.gameId !== game.id) || !Array.isArray(payload.entries)) {
      throw new Error("Invalid format");
    }
    const valid = payload.entries.filter(isValidCacheEntry).slice(0, 100000);
    await writeCacheEntries(valid);
    return valid.length;
  }

  async function cacheFileVersion(file) {
    const prefix = await file.slice(0, 512).text();
    const firstLine = prefix.split("\n", 1)[0];
    try {
      const value = JSON.parse(firstLine);
      return value && isAcceptedCacheFormat(value.format) ? Number(value.version) : 0;
    } catch (_) {}
    const formatMatch = prefix.match(/"format"\s*:\s*"([^"]+)"/);
    if (formatMatch && isAcceptedCacheFormat(formatMatch[1])
      && /"version"\s*:\s*1(?:\D|$)/.test(prefix)) return 1;
    return 0;
  }

  async function importCache(file) {
    try {
      if (!file) throw new Error("Missing file");
      const version = await cacheFileVersion(file);
      if (version !== 1 && version !== 2) throw new Error("Invalid format");
      markCacheMetadataDirty();
      if (version === 2) await importJsonLinesCache(file, true);
      const imported = version === 2 ? await importJsonLinesCache(file, false) : await importLegacyCache(file);
      memoryCache.clear();
      cacheMetadata = null;
      cacheMetadataVerified = false;
      await getCacheMetadata();
      await refreshCacheStats();
      await preloadMemoryCache();
      setStatus(`Imported: ${imported}`);
      scheduleAutoTranslation(50);
    } catch (_) { setStatus("Invalid cache file"); }
  }

  async function translateBulkLanguage(strings, language, provider, signal, onProgress) {
    const providerConfig = PROVIDERS[provider];
    const wordCounts = strings.map(countTranslationWords);
    const totalWords = wordCounts.reduce((sum, count) => sum + count, 0);
    let nextIndex = 0;
    let done = 0;
    let completedWords = 0;
    let newlyTranslated = 0;
    let failed = 0;
    const failureReasons = new Map();

    async function worker() {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= strings.length || signal.aborted) return;
        const source = strings[index];
        let waitReported = false;
        try {
          const result = await translateText(
            source, language, provider, signal, true, true,
            (seconds) => {
              waitReported = true;
              if (onProgress) onProgress({
                done, completedWords, totalWords, newlyTranslated, failed, rateLimitSeconds: seconds
              });
            }
          );
          if (!result.cached) newlyTranslated += 1;
        } catch (error) {
          if (error && error.name === "AbortError") return;
          failed += 1;
          const reason = describeTranslationFailure(error, provider);
          failureReasons.set(reason, (failureReasons.get(reason) || 0) + 1);
          console.error(`Bulk translation error for "${source}" (${language}):`, error);
        }
        done += 1;
        completedWords += wordCounts[index];
        if (onProgress && (waitReported || done % 5 === 0 || done === strings.length)) {
          onProgress({ done, completedWords, totalWords, newlyTranslated, failed, rateLimitSeconds: 0 });
        }
      }
    }

    const concurrency = Math.min(
      providerConfig.concurrency || 1,
      providerConfig.batchSize || 3
    );
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    return { done, completedWords, totalWords, newlyTranslated, failed, failureReasons };
  }

  async function bulkTranslateAll() {
    if (running) {
      if (activeOperation === "bulk") {
        bulkButton.textContent = "Cancelling…";
        bulkButton.disabled = true;
        abortActiveOperation("Cancel translation was pressed");
      } else {
        abortActiveOperation("cancelled by starting bulk translation");
      }
      return;
    }
    if (bulkPreparing) return;
    bulkPreparing = true;
    setBulkButtonWorking("Starting…");
    try {
      await new Promise((resolve) => {
        let settled = false;
        const finish = () => { if (!settled) { settled = true; resolve(); } };
        requestAnimationFrame(finish);
        setTimeout(finish, 100);
      });
      if (!(await ensureBulkProviderReady())) return;

      running = true;
      activeOperation = "bulk";
      activeAbortReason = "";
      abortController = new AbortController();
      setBulkUiBusy(true);
      setBulkButtonWorking("Cancel translation");
      setStatus("Words: 0/0 · Time left: calculating…");
      const payload = await requestLocalHelper(`/v1/game/strings?gameId=${game.id}`, { signal: abortController.signal });
      if (!payload || !Array.isArray(payload.strings)) throw new Error("Could not extract strings");

      const strings = payload.strings;
      if (!strings.length) {
        setStatus("No strings found in game assets");
        return;
      }

      const language = settings.language;
      const provider = settings.provider;
      let etaTracker = null;
      const result = await translateBulkLanguage(
        strings, language, provider, abortController.signal,
        ({ done, completedWords, totalWords, rateLimitSeconds }) => {
          if (!etaTracker) etaTracker = createTranslationEtaTracker();
          if (rateLimitSeconds > 0) {
            etaTracker.pause();
            setStatus(translationProgressText(
              completedWords, totalWords, etaTracker.current(), rateLimitSeconds
            ));
            return;
          }
          setStatus(translationProgressText(
            completedWords, totalWords, etaTracker.update(done, strings.length), 0
          ));
        }
      );
      const { done, newlyTranslated, failed, failureReasons } = result;

      if (abortController.signal.aborted) {
        setStatus(`Bulk stopped at ${done}/${strings.length}: ${activeAbortReason || "unknown cancellation reason"}`);
      } else if (failed > 0) {
        const reasons = Array.from(failureReasons.entries())
          .map(([reason, count]) => `${reason} (${count})`)
          .join("; ");
        setStatus(`Bulk incomplete: ${strings.length - failed}/${strings.length} saved · ${reasons}`);
      }
      else {
        await preloadMemoryCache();
        setStatus(`Bulk complete: ${strings.length} total, ${newlyTranslated} new`);
      }

    } catch (error) {
      if (error && error.name === "AbortError") {
        setStatus(`Bulk stopped: ${activeAbortReason || "cancelled by user"}`);
      } else {
        setStatus(error.message || "Bulk translation failed");
      }
    } finally {
      bulkPreparing = false;
      running = false;
      abortController = null;
      activeOperation = null;
      activeAbortReason = "";
      setBulkUiBusy(false);
      setBulkButtonIdle();
      refreshCacheStats();
    }
  }

  async function superBulkTranslateAll() {
    if (running) {
      if (activeOperation === "super-bulk") {
        superBulkButton.textContent = "Cancelling…";
        superBulkButton.disabled = true;
        abortActiveOperation("Cancel Super Bulk was pressed");
      } else {
        abortActiveOperation("cancelled by starting Super Bulk translation");
      }
      return;
    }
    if (bulkPreparing) return;
    bulkPreparing = true;
    setSuperBulkButtonWorking("Starting…");
    try {
      await new Promise((resolve) => {
        let settled = false;
        const finish = () => { if (!settled) { settled = true; resolve(); } };
        requestAnimationFrame(finish);
        setTimeout(finish, 100);
      });
      if (providerUsesManagedOffline(settings.provider)) {
        setStatus("Super Bulk needs a service that supports all 17 languages. Choose OpenAI-compatible, LM Studio, Gemini, Google, or MyMemory.");
        return;
      }
      const selectedProvider = PROVIDERS[settings.provider];
      const unsupported = SUPER_BULK_LANGUAGES.filter(({ code }) => !selectedProvider.supportsLanguage(code));
      if (unsupported.length) {
        setStatus(`Selected service does not support: ${unsupported.map(({ name }) => name).join(", ")}`);
        return;
      }
      if (!(await ensureBulkProviderReady())) return;
      if (!confirm(
        `Translate all OMORI dialogue sequentially into ${SUPER_BULK_LANGUAGES.length} languages using ${selectedProvider.label}? `
        + "This can take many hours. Completed translations stay cached if you cancel."
      )) {
        setStatus("Super Bulk cancelled before start");
        return;
      }

      running = true;
      activeOperation = "super-bulk";
      activeAbortReason = "";
      abortController = new AbortController();
      setBulkUiBusy(true);
      setSuperBulkButtonWorking("Cancel all languages");
      setStatus("Words: 0/0 · Time left: calculating…");
      const payload = await requestLocalHelper(`/v1/game/strings?gameId=${game.id}`, { signal: abortController.signal });
      if (!payload || !Array.isArray(payload.strings)) throw new Error("Could not extract strings");
      const strings = payload.strings;
      if (!strings.length) {
        setStatus("No strings found in game assets");
        return;
      }

      const provider = settings.provider;
      const totalJobs = strings.length * SUPER_BULK_LANGUAGES.length;
      const wordsPerLanguage = strings.reduce((sum, source) => sum + countTranslationWords(source), 0);
      const totalWords = wordsPerLanguage * SUPER_BULK_LANGUAGES.length;
      const etaTracker = createTranslationEtaTracker();
      let completedBeforeLanguage = 0;
      let completedWordsBeforeLanguage = 0;
      let totalNew = 0;
      let totalFailed = 0;
      const failureReasons = new Map();

      for (let languageIndex = 0; languageIndex < SUPER_BULK_LANGUAGES.length; languageIndex += 1) {
        if (abortController.signal.aborted) break;
        const { code, name } = SUPER_BULK_LANGUAGES[languageIndex];
        setStatus(translationProgressText(
          completedWordsBeforeLanguage,
          totalWords,
          etaTracker.update(completedBeforeLanguage, totalJobs),
          0
        ));
        const result = await translateBulkLanguage(
          strings, code, provider, abortController.signal,
          ({ done, completedWords, rateLimitSeconds }) => {
            const totalCompletedWords = completedWordsBeforeLanguage + completedWords;
            const totalCompletedJobs = completedBeforeLanguage + done;
            if (rateLimitSeconds > 0) etaTracker.pause();
            setStatus(translationProgressText(
              totalCompletedWords,
              totalWords,
              rateLimitSeconds > 0
                ? etaTracker.current()
                : etaTracker.update(totalCompletedJobs, totalJobs),
              rateLimitSeconds
            ));
          }
        );
        completedBeforeLanguage += result.done;
        completedWordsBeforeLanguage += result.completedWords;
        totalNew += result.newlyTranslated;
        totalFailed += result.failed;
        for (const [reason, count] of result.failureReasons) {
          failureReasons.set(reason, (failureReasons.get(reason) || 0) + count);
        }
      }

      if (abortController.signal.aborted) {
        setStatus(
          `Super Bulk stopped at ${completedBeforeLanguage}/${totalJobs}: `
          + (activeAbortReason || "cancelled by user")
        );
      } else if (totalFailed > 0) {
        const reasons = Array.from(failureReasons.entries())
          .map(([reason, count]) => `${reason} (${count})`)
          .join("; ");
        setStatus(`Super Bulk incomplete: ${totalJobs - totalFailed}/${totalJobs} saved · ${reasons}`);
      } else {
        await preloadMemoryCache();
        setStatus(`Super Bulk complete: ${SUPER_BULK_LANGUAGES.length} languages · ${totalNew} new translations`);
      }
    } catch (error) {
      if (error && error.name === "AbortError") {
        setStatus(`Super Bulk stopped: ${activeAbortReason || "cancelled by user"}`);
      } else {
        setStatus(error.message || "Super Bulk translation failed");
      }
    } finally {
      bulkPreparing = false;
      running = false;
      abortController = null;
      activeOperation = null;
      activeAbortReason = "";
      setBulkUiBusy(false);
      setSuperBulkButtonIdle();
      refreshCacheStats();
    }
  }

  async function translateTestPhraseAllLanguages() {
    if (running) {
      if (activeOperation === "test-phrase") {
        testPhraseButton.textContent = "Cancelling…";
        testPhraseButton.disabled = true;
        abortActiveOperation("Cancel test phrase translation was pressed");
      }
      return;
    }
    if (bulkPreparing) return;
    bulkPreparing = true;
    setTestPhraseButtonWorking("Starting…");
    try {
      await new Promise((resolve) => {
        let settled = false;
        const finish = () => { if (!settled) { settled = true; resolve(); } };
        requestAnimationFrame(finish);
        setTimeout(finish, 100);
      });
      const provider = settings.provider;
      const providerConfig = PROVIDERS[provider];
      if (providerUsesManagedOffline(provider)) {
        if (!LOCAL_BRIDGE) {
          setStatus(`The local offline translation helper is not running. Restart the game through ${PRODUCT_NAME}.`);
          return;
        }
        if (!(await refreshArgosStatus())) return;
      } else if (!(await ensureBulkProviderReady())) return;
      const targets = languagesForProvider(provider).filter(([code]) => providerConfig.supportsLanguage(code, {
        localLanguages: argosSupportedLanguages
      }));
      if (!targets.length) throw new Error("Selected service has no available target languages");
      if (!confirm(
        `Translate the current OMORI test phrase into ${targets.length} languages using ${providerConfig.label}? `
        + "Existing cached languages will be skipped."
        + (provider === "google" ? " Google processes one language every 5 seconds and may pause after a temporary block." : "")
        + (providerUsesManagedOffline(provider)
          ? " The offline engine and missing models will be prepared automatically; models stay on disk. This can use substantial disk space and take a long time."
          : "")
      )) {
        setStatus("Test phrase translation cancelled before start");
        return;
      }

      running = true;
      activeOperation = "test-phrase";
      activeAbortReason = "";
      abortController = new AbortController();
      setBulkUiBusy(true);
      setTestPhraseButtonWorking("Cancel test phrase");
      const signal = abortController.signal;
      const phraseWords = countTranslationWords(LANGUAGE_TEST_PHRASE_SOURCE);
      const totalWords = phraseWords * targets.length;
      const etaTracker = createTranslationEtaTracker();
      let nextIndex = 0;
      let done = 0;
      let cached = 0;
      let created = 0;
      let failed = 0;
      let installedModels = 0;
      const failureReasons = new Map();

      async function worker() {
        while (!signal.aborted) {
          const index = nextIndex;
          nextIndex += 1;
          if (index >= targets.length) return;
          const [language, name] = targets[index];
          const key = makeTranslationCacheKey(LANGUAGE_TEST_PHRASE_SOURCE, language, provider);
          try {
            let existing = await cacheGet(key);
            if (existing && !core.protectedMarkupLayoutMatches(LANGUAGE_TEST_PHRASE_SOURCE, existing)) existing = null;
            if (existing) {
              cached += 1;
              appendTranslationLog(LANGUAGE_TEST_PHRASE_SOURCE, existing, language, provider, true);
              await logTranslationToBridge(provider, language, LANGUAGE_TEST_PHRASE_SOURCE, existing, true);
            } else {
              if (providerUsesManagedOffline(provider)) {
                const prepared = await prepareManagedOfflineTestPhraseTarget(
                  provider,
                  language,
                  name,
                  signal,
                  () => {
                    etaTracker.pause();
                    setStatus(translationProgressText(
                      done * phraseWords, totalWords, etaTracker.current(), 0
                    ));
                  }
                );
                if (prepared.installed) installedModels += 1;
              }
              const protectedResult = await translateWithProtectedMarkup(
                LANGUAGE_TEST_PHRASE_SOURCE,
                language,
                provider,
                signal,
                (chunk) => requestRateLimitedChunk(
                  provider,
                  chunk,
                  language,
                  signal,
                  (seconds) => {
                    etaTracker.pause();
                    setStatus(translationProgressText(
                      done * phraseWords, totalWords, etaTracker.current(), seconds
                    ));
                  }
                )
              );
              const translated = String(protectedResult.text || "").trim();
              if (!translated || translated.toLowerCase().includes("undefined")) {
                throw new Error("Translation service returned an empty or invalid test phrase");
              }
              await cachePut(key, translated);
              created += 1;
              appendTranslationLog(LANGUAGE_TEST_PHRASE_SOURCE, translated, language, provider, false);
              await logTranslationToBridge(provider, language, LANGUAGE_TEST_PHRASE_SOURCE, translated, false);
              const testDelay = provider === "google"
                ? Math.max(TEST_PHRASE_GOOGLE_DELAY, providerConfig.delay)
                : providerConfig.delay;
              await sleep(testDelay, signal);
            }
          } catch (error) {
            if (error && error.name === "AbortError") return;
            failed += 1;
            const reason = describeTranslationFailure(error, provider);
            failureReasons.set(reason, (failureReasons.get(reason) || 0) + 1);
          }
          done += 1;
          setStatus(translationProgressText(
            done * phraseWords,
            totalWords,
            etaTracker.update(done, targets.length),
            0
          ));
        }
      }

      // Reliability matters more than speed here: 249 concurrent probe calls
      // trigger public-service burst limits and turn transient 429s into noise.
      const concurrency = 1;
      await Promise.all(Array.from({ length: concurrency }, () => worker()));
      if (signal.aborted) {
        setStatus(
          `Test phrase stopped at ${done}/${targets.length}: ${activeAbortReason || "cancelled by user"}`
          + (providerUsesManagedOffline(provider) ? ` · ${installedModels} models installed` : "")
        );
      } else if (failed) {
        const reasons = Array.from(failureReasons.entries()).map(([reason, count]) => `${reason} (${count})`).join("; ");
        setStatus(
          `Test phrase incomplete: ${targets.length - failed}/${targets.length} ready · ${reasons}`
          + (providerUsesManagedOffline(provider) ? ` · ${installedModels} models installed` : "")
        );
      } else {
        await reloadSelectedLanguageCache(false);
        setStatus(
          `Test phrase ready in ${targets.length} languages · ${created} new · ${cached} cached`
          + (providerUsesManagedOffline(provider) ? ` · ${installedModels} models installed` : "")
        );
      }
    } catch (error) {
      setStatus(error && error.name === "AbortError"
        ? `Test phrase stopped: ${activeAbortReason || "cancelled by user"}`
        : (error.message || "Test phrase translation failed"));
    } finally {
      bulkPreparing = false;
      running = false;
      abortController = null;
      activeOperation = null;
      activeAbortReason = "";
      setBulkUiBusy(false);
      setTestPhraseButtonIdle();
      if (providerUsesManagedOffline(settings.provider)) refreshArgosStatus();
      refreshCacheStats();
    }
  }

  async function deleteAllTranslatorData() {
    invalidateAppliedTranslations();
    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem(LEGACY_SETTINGS_KEY);
    await clearAllCache();
    localStorage.removeItem(CACHE_META_KEY);
    localStorage.removeItem(CACHE_DIRTY_KEY);
    for (const key of LEGACY_CACHE_META_KEYS) localStorage.removeItem(key);
    for (const key of LEGACY_CACHE_DIRTY_KEYS) localStorage.removeItem(key);
    settings = Object.assign({}, defaults);
    languageSelect.value = settings.language;
    providerSelect.value = settings.provider;
    privacyBox.hidden = true;
    updateProviderHint();
    updateModeButton();
    await refreshCacheStats();
    setStatus("All translator data deleted");
  }

  const host = document.createElement("div");
  host.id = `vnrevival-translator-${game.id}`;
  host.style.cssText = "position:fixed!important;z-index:9999999!important;pointer-events:auto!important;";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host{all:initial!important;display:block!important;position:fixed!important;z-index:9999999!important;left:var(--vr-left,auto)!important;top:var(--vr-top,14px)!important;right:var(--vr-right,14px)!important}*{box-sizing:border-box}.panel{width:306px!important;color:#fff!important;background:rgba(32,19,28,.97)!important;border:1px solid #c69b55!important;border-radius:9px!important;box-shadow:0 5px 24px rgba(0,0,0,0.95)!important;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif!important;overflow:hidden!important;position:relative!important;z-index:9999999!important}.bar{cursor:move;padding:7px 9px;color:#f4d18f;background:#412436;font-weight:700;user-select:none}.row{display:flex;gap:6px;padding:7px}.primary,.secondary,.gear,.danger{border:1px solid #c69b55;border-radius:6px;background:#6b344f;color:#fff;padding:7px 9px;cursor:pointer;font:inherit}.primary{flex:1;font-weight:700}.secondary{background:#442b39}.gear{width:38px}.status{min-height:23px;padding:0 9px 3px;color:#ddd;font-size:12px}.hotkey{padding:0 9px 7px;color:#f4d18f;font-size:11px}.retry{margin:0 8px 7px;width:calc(100% - 16px)}.settings{display:none;padding:0 8px 9px;border-top:1px solid #6e4d56}.settings.open{display:block}.settings label.title{display:block;margin:7px 0 3px}.settings select,.settings input{width:100%;border:1px solid #927047;border-radius:4px;background:#20131c;color:#fff;padding:6px}.check{display:flex;gap:7px;align-items:center;margin:8px 0}.hint,.providerHint,.cacheStats,.argosStatus,.geminiStatus,.geminiNotice,.lmStudioStatus,.lmStudioNotice,.openAICompatibleStatus,.openAICompatibleNotice{color:#bdaeb6;font-size:11px;line-height:1.3}.providerHint{margin-top:4px}.argosBox,.geminiBox,.lmStudioBox,.openAICompatibleBox,.cacheBox{margin-top:8px;padding:7px;border:1px solid #6e4d56;border-radius:6px}.geminiKey,.lmStudioModel,.openAICompatiblePreset,.openAICompatibleBaseURL,.openAICompatibleModel,.openAICompatibleKey{margin-top:6px}.argosActions,.geminiActions,.lmStudioActions,.openAICompatibleActions,.privacyActions{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}.argosActions button,.geminiActions button,.lmStudioActions button,.openAICompatibleActions button,.privacyActions button{flex:1;min-width:82px}.primary:disabled,.secondary:disabled,.danger:disabled{opacity:.55;cursor:default}.danger{background:#71313a}.privacy{margin:0 8px 8px;padding:8px;border:1px solid #d19a44;border-radius:6px;background:#38291f;color:#f8e5bf;font-size:12px}.compat{margin:0 8px 7px;padding:6px;border-radius:5px;background:#71431f;color:#ffe6be;font-size:11px}.site{padding:7px 9px;border-top:1px solid #6e4d56;text-align:center;color:#bdaeb6;font-size:11px}.site a,.geminiNotice a,.openAICompatibleNotice a{color:#f4d18f;font-weight:700;text-decoration:none}.site a:hover,.geminiNotice a:hover,.openAICompatibleNotice a:hover{text-decoration:underline}.hidden{display:none!important}
      .settings{display:block!important;max-height:calc(100vh - 92px);overflow-y:auto}.bar{display:flex;align-items:center;gap:8px;min-height:34px;touch-action:none}.barTitle{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.collapseToggle{width:24px;height:22px;padding:0;border:1px solid #c69b55;border-radius:5px;background:#6b344f;color:#fff;cursor:pointer;font:700 16px/18px -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}.collapseToggle:hover{background:#7b405d}.panel.collapsed{width:30px!important;border:0!important;border-radius:5px!important;background:transparent!important;box-shadow:none!important;overflow:visible!important}.panel.collapsed>:not(.bar){display:none!important}.panel.collapsed .bar{min-height:0!important;padding:0!important;background:transparent!important;cursor:move!important}.panel.collapsed .barTitle{display:none!important}.panel.collapsed .collapseToggle{width:30px;height:30px;line-height:26px;cursor:grab}.modeToggle{display:grid!important;grid-template-columns:1fr 1fr;gap:3px;width:100%;padding:3px!important;border-radius:8px!important}.modeChoice{padding:5px 8px;border-radius:5px;color:#bdaeb6;font-weight:600;text-align:center}.modeChoice.active{background:#6b344f;color:#fff;box-shadow:0 1px 4px rgba(0,0,0,.45)}.updateStatus{padding:0 9px 5px;color:#9d9098;font-size:11px;line-height:1.25}.updateStatus.available{color:#f4d18f}.updateStatus.error{color:#d9a0a0}.updateChanges{margin:-1px 9px 6px;padding-left:16px;color:#c9bdc4;font-size:10px;line-height:1.35}.updateChanges li+li{margin-top:2px}.bulkTranslate,.superBulkTranslate,.testPhraseTranslate,.reset{display:flex;align-items:center;justify-content:center;gap:8px}.bulkTranslate.working::before,.superBulkTranslate.working::before,.testPhraseTranslate.working::before,.reset.working::before{content:"";width:13px;height:13px;border:2px solid rgba(255,255,255,.45);border-top-color:#fff;border-radius:50%;animation:vr-spin .75s linear infinite}.translationLogBox{margin-top:7px;border:1px solid #6e4d56;border-radius:5px;background:#1b1218;color:#ddd;font-size:11px}.translationLogBox summary{padding:6px;cursor:pointer;color:#f4d18f;font-weight:700}.translationLogToolbar{display:flex;align-items:center;justify-content:space-between;gap:5px;padding:0 6px 5px;color:#8f8189;flex-wrap:wrap}.translationLogNote{flex:1;min-width:120px}.translationLogActions{display:flex;gap:4px;flex-wrap:wrap}.translationLogActions button{padding:3px 6px!important;font-size:10px!important}.translationLogEmpty{padding:4px 6px 7px;color:#8f8189}.translationLogEntries{max-height:170px;overflow:auto}.translationLogEntry{padding:6px;border-top:1px solid #49333f;overflow-wrap:anywhere}.translationLogMeta{margin-bottom:3px;color:#c69b55}.translationLogSource,.translationLogTarget{white-space:pre-wrap}.translationLogSource{color:#aaa}.translationLogArrow{color:#8f8189;padding:2px 0}@keyframes vr-spin{to{transform:rotate(360deg)}}
      :host(.bulkBusyHost){left:0!important;top:0!important;right:0!important;width:100vw!important;height:100vh!important}.panel.bulkBusy{display:flex!important;flex-direction:column!important;width:100vw!important;height:100vh!important;border-radius:0!important}.panel.bulkBusy>*{display:none!important}.panel.bulkBusy>.status{display:block!important;flex:0 0 auto!important;min-height:0!important;padding:10px 12px!important;background:#412436!important;color:#f4d18f!important;font-size:14px!important;font-weight:700!important;text-align:center!important}.panel.bulkBusy>.settings{display:flex!important;flex:1 1 auto!important;min-height:0!important;max-height:none!important;overflow:hidden!important;padding:0!important;border:0!important}.panel.bulkBusy .settings>*{display:none!important}.panel.bulkBusy .settings>.cacheBox{display:flex!important;flex:1 1 auto!important;flex-direction:column!important;min-height:0!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important}.panel.bulkBusy .cacheBox>*{display:none!important}.panel.bulkBusy .cacheBox>.translationLogBox{display:flex!important;flex:1 1 auto!important;flex-direction:column!important;min-height:0!important;margin:0!important;border-width:1px 0!important;border-radius:0!important}.panel.bulkBusy .translationLogBox summary{flex:0 0 auto!important;padding:10px 12px!important;font-size:14px!important}.panel.bulkBusy .translationLogToolbar{display:none!important}.panel.bulkBusy .translationLogEmpty{flex:0 0 auto!important;padding:10px 12px!important}.panel.bulkBusy .translationLogEntries{display:block!important;flex:1 1 auto!important;min-height:0!important;max-height:none!important;overflow-y:auto!important;font-size:13px!important}.panel.bulkBusy .cacheBox>.bulkActionRow.activeBulkAction{display:flex!important;flex:0 0 auto!important;margin:0!important;padding:10px 12px!important;background:#241720!important}.panel.bulkBusy .activeBulkAction>button{width:100%!important;min-height:48px!important;font-size:16px!important}
      .site{display:flex;align-items:center;justify-content:center;gap:7px;flex-wrap:wrap}.siteLabel{white-space:nowrap}.contacts{display:inline-flex;align-items:center;gap:5px}.site .contactIcon{display:inline-flex;align-items:center;justify-content:center;width:23px;height:23px;border:1px solid #6e4d56;border-radius:6px;background:#2c1b26;text-decoration:none}.site .contactIcon:hover{border-color:#c69b55;background:#412436;text-decoration:none}.contactIcon svg{display:block;width:15px;height:15px;fill:currentColor}.site .discord{color:#8c9eff}.site .telegram{color:#55bde9}.site .email{color:#9b87f5}
    </style>
    <div class="panel">
      <div class="bar"><span class="barTitle">${PRODUCT_NAME} ${VERSION}</span><button class="collapseToggle" type="button" title="Collapse translator" aria-label="Collapse translator">−</button></div>
      <div class="row"><button class="secondary mode modeToggle" type="button" aria-label="Translation mode"><span class="modeChoice translationChoice">Translation</span><span class="modeChoice originalChoice">Original</span></button></div>
      <div class="status">Ready</div>
      <div class="updateStatus">Checking for updates…</div>
      <ul class="updateChanges" hidden></ul>
      <button class="secondary retry" hidden>Retry failed</button>
      <div class="compat" hidden></div>
      <div class="privacy" hidden>
        Bulk translation sends all extracted OMORI dialogue strings to the selected online service. Gameplay remains offline after the cache is created.
        <div class="privacyActions"><button class="primary allowBulk">Allow bulk upload</button><button class="secondary cancelBulk">Cancel</button></div>
      </div>
      <div class="settings open">
        <label class="title">Bulk translation service</label><select class="provider"></select>
        <div class="providerHint"></div>
        <label class="title">Target Language</label><select class="language"></select>
        <div class="argosBox" hidden>
          <div class="argosStatus">Checking Argos…</div>
          <div class="argosActions"><button class="primary argosAction">Install Argos</button><button class="danger argosRemove" hidden>Remove model</button></div>
        </div>
        <div class="geminiBox" hidden>
          <div class="geminiStatus">Checking Gemini…</div>
          <input class="geminiKey" type="password" autocomplete="off" spellcheck="false" placeholder="Gemini API key">
          <div class="geminiActions"><button class="primary geminiSave">Save API key</button><button class="danger geminiRemove" hidden>Remove key</button></div>
          <div class="geminiNotice">Use your own key from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a>. Free-tier content may be used by Google to improve its products. Explicit text can still be blocked.</div>
        </div>
        <div class="lmStudioBox" hidden>
          <div class="lmStudioStatus">Checking LM Studio…</div>
          <select class="lmStudioModel" aria-label="LM Studio model" disabled></select>
          <div class="lmStudioActions"><button class="secondary lmStudioRefresh" type="button">Refresh models</button></div>
          <div class="lmStudioNotice">Start the local server in LM Studio Developer settings. Translation text stays on this computer.</div>
        </div>
        <div class="openAICompatibleBox" hidden>
          <div class="openAICompatibleStatus">Configure an OpenAI-compatible provider…</div>
          <select class="openAICompatiblePreset" aria-label="OpenAI-compatible preset">
            <option value="opencode-go">OpenCode Go</option>
            <option value="openrouter">OpenRouter</option>
            <option value="deepseek">DeepSeek</option>
            <option value="lmstudio">LM Studio</option>
            <option value="custom">Custom</option>
          </select>
          <input class="openAICompatibleBaseURL" type="url" autocomplete="off" spellcheck="false" placeholder="https://provider.example/v1">
          <input class="openAICompatibleModel" type="text" list="openAICompatibleModels" autocomplete="off" spellcheck="false" placeholder="Model ID">
          <datalist id="openAICompatibleModels"></datalist>
          <input class="openAICompatibleKey" type="password" autocomplete="off" spellcheck="false" placeholder="API key (stored securely)">
          <div class="openAICompatibleActions">
            <button class="primary openAICompatibleSave" type="button">Save API key</button>
            <button class="secondary openAICompatibleRefresh" type="button">Refresh models</button>
            <button class="danger openAICompatibleRemove" type="button" hidden>Remove key</button>
          </div>
          <div class="openAICompatibleNotice"><a class="openCodeGoReferral" href="${OPENCODE_GO_REFERRAL_URL}" target="_blank" rel="noopener noreferrer">Create an OpenCode Go account with our referral link and receive $5 in credits.</a><span class="openAICompatibleProtocol"> Uses OpenAI Chat Completions. Remote text is sent to the selected provider. Custom remote URLs must use HTTPS.</span></div>
        </div>
        <div class="cacheBox">
          <div class="cacheStats">Calculating cache…</div>
          <input type="file" class="cacheFile" accept=".jsonl,.json" style="display:none">
          <div class="row bulkActionRow" style="padding:7px 0 0">
            <button class="primary bulkTranslate" style="background:#4a69bd">Bulk Translate All Assets</button>
          </div>
          <div class="row bulkActionRow" style="padding:5px 0 0">
            <button class="primary superBulkTranslate" style="background:#7b3fb4">Super Bulk Translation · 17 languages</button>
          </div>
          <div class="row bulkActionRow" style="padding:5px 0 0">
            <button class="primary testPhraseTranslate" style="background:#287c68">Test Phrase · All Languages</button>
          </div>
          <details class="translationLogBox">
            <summary>Live translation log</summary>
            <div class="translationLogToolbar">
              <span class="translationLogNote">Saved locally · newest first</span>
              <span class="translationLogActions"><button class="secondary translationLogView" type="button">View saved</button><button class="secondary translationLogSave" type="button">Save file</button><button class="secondary translationLogClear" type="button">Clear view</button></span>
            </div>
            <div class="translationLogEmpty">New translations will appear here. Use View saved to load earlier entries.</div>
            <div class="translationLogEntries" aria-live="polite"></div>
          </details>
          <div class="row" style="padding:7px 0 0;gap:5px">
            <button class="secondary importCache" style="flex:1;padding:5px">Import cache</button>
            <button class="secondary exportCache" style="flex:1;padding:5px">Export cache</button>
          </div>
          <button class="danger reset" style="margin-top:7px;width:100%">Reset all data</button>
        </div>
        <div class="hint">Mod works OFFLINE during gameplay using your generated cache.</div>
      </div>
      <div class="site">
        <span class="siteLabel">Project website: <a class="projectSite" href="${SITE_URL}" target="_blank" rel="noopener noreferrer">${SITE_NAME}</a></span>
        <span class="contacts" aria-label="VN Revival contacts">
          <a class="contactIcon discord" href="https://discord.gg/QgyeWW3Jg" target="_blank" rel="noopener noreferrer" title="Discord" aria-label="VN Revival on Discord">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.1 6.2A15 15 0 0 1 10 5.3l.4.8a10 10 0 0 1 3.2 0l.4-.8a15 15 0 0 1 2.9.9c1.8 2.5 2.3 4.9 2 7.2a12 12 0 0 1-3.6 1.8l-.9-1.2c.7-.3 1.3-.6 1.8-1.1-3.4 1.6-7.2 1.6-10.5 0 .5.5 1.1.8 1.8 1.1l-.9 1.2A12 12 0 0 1 3 13.4c-.3-2.3.2-4.7 2-7.2.7-.3 1.4-.6 2.1-.8v.8Zm2.1 6.1c.8 0 1.4-.8 1.4-1.8S10 8.7 9.2 8.7s-1.4.8-1.4 1.8.6 1.8 1.4 1.8Zm5.6 0c.8 0 1.4-.8 1.4-1.8s-.6-1.8-1.4-1.8-1.4.8-1.4 1.8.6 1.8 1.4 1.8Z"/></svg>
          </a>
          <a class="contactIcon telegram" href="https://t.me/VnRevival" target="_blank" rel="noopener noreferrer" title="Telegram" aria-label="VN Revival on Telegram">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.5 3.4 18.3 19c-.2 1.1-.9 1.4-1.8.9l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.4-.1-.6-.6-.2L5.8 12.8.9 11.3c-1.1-.3-1.1-1 .2-1.5L20 2.5c.9-.3 1.7.2 1.5.9Z"/></svg>
          </a>
          <a class="contactIcon email" href="mailto:master1c8@proton.me" target="_blank" rel="noopener noreferrer" title="master1c8@proton.me" aria-label="Email master1c8@proton.me">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm9 7.1L20.2 7H3.8l8.2 5.1Zm0 2.3L3 8.8V17h18V8.8l-9 5.6Z"/></svg>
          </a>
        </span>
      </div>
    </div>`;
  const ensureHostOnTop = () => {
    try {
      if (document.body) {
        if (document.body.lastElementChild !== host) {
          document.body.appendChild(host);
        }
      } else if (document.documentElement && document.documentElement.lastElementChild !== host) {
        document.documentElement.appendChild(host);
      }
    } catch (_) {}
  };
  ensureHostOnTop();
  window.addEventListener("DOMContentLoaded", ensureHostOnTop);
  setInterval(ensureHostOnTop, 500);

  const panel = shadow.querySelector(".panel");
  const collapseButton = shadow.querySelector(".collapseToggle");
  const modeButton = shadow.querySelector(".mode");
  const retryButton = shadow.querySelector(".retry");
  const statusElement = shadow.querySelector(".status");
  const updateStatusElement = shadow.querySelector(".updateStatus");
  const updateChangesElement = shadow.querySelector(".updateChanges");
  const languageSelect = shadow.querySelector(".language");
  const providerSelect = shadow.querySelector(".provider");
  const providerHint = shadow.querySelector(".providerHint");
  const argosBox = shadow.querySelector(".argosBox");
  const argosStatusElement = shadow.querySelector(".argosStatus");
  const argosActionButton = shadow.querySelector(".argosAction");
  const argosRemoveButton = shadow.querySelector(".argosRemove");
  const geminiBox = shadow.querySelector(".geminiBox");
  const geminiStatusElement = shadow.querySelector(".geminiStatus");
  const geminiKeyInput = shadow.querySelector(".geminiKey");
  const geminiSaveButton = shadow.querySelector(".geminiSave");
  const geminiRemoveButton = shadow.querySelector(".geminiRemove");
  const lmStudioBox = shadow.querySelector(".lmStudioBox");
  const lmStudioStatusElement = shadow.querySelector(".lmStudioStatus");
  const lmStudioModelSelect = shadow.querySelector(".lmStudioModel");
  const lmStudioRefreshButton = shadow.querySelector(".lmStudioRefresh");
  const openAICompatibleBox = shadow.querySelector(".openAICompatibleBox");
  const openAICompatibleStatusElement = shadow.querySelector(".openAICompatibleStatus");
  const openAICompatiblePresetSelect = shadow.querySelector(".openAICompatiblePreset");
  const openAICompatibleBaseURLInput = shadow.querySelector(".openAICompatibleBaseURL");
  const openAICompatibleModelInput = shadow.querySelector(".openAICompatibleModel");
  const openAICompatibleModelsList = shadow.querySelector("#openAICompatibleModels");
  const openAICompatibleKeyInput = shadow.querySelector(".openAICompatibleKey");
  const openAICompatibleSaveButton = shadow.querySelector(".openAICompatibleSave");
  const openAICompatibleRefreshButton = shadow.querySelector(".openAICompatibleRefresh");
  const openAICompatibleRemoveButton = shadow.querySelector(".openAICompatibleRemove");
  const openCodeGoReferralLink = shadow.querySelector(".openCodeGoReferral");
  const resetButton = shadow.querySelector(".reset");
  const importButton = shadow.querySelector(".importCache");
  const exportButton = shadow.querySelector(".exportCache");
  const bulkButton = shadow.querySelector(".bulkTranslate");
  const superBulkButton = shadow.querySelector(".superBulkTranslate");
  const testPhraseButton = shadow.querySelector(".testPhraseTranslate");
  const translationLogBox = shadow.querySelector(".translationLogBox");
  const translationLogEntries = shadow.querySelector(".translationLogEntries");
  const translationLogEmpty = shadow.querySelector(".translationLogEmpty");
  const translationLogNote = shadow.querySelector(".translationLogNote");
  const translationLogViewButton = shadow.querySelector(".translationLogView");
  const translationLogSaveButton = shadow.querySelector(".translationLogSave");
  const translationLogClearButton = shadow.querySelector(".translationLogClear");
  const cacheFileInput = shadow.querySelector(".cacheFile");
  const cacheStatsElement = shadow.querySelector(".cacheStats");
  const privacyBox = shadow.querySelector(".privacy");
  const compatibilityBox = shadow.querySelector(".compat");
  const projectSiteLink = shadow.querySelector(".projectSite");
  const bulkControlState = new Map();

  function setBulkButtonWorking(label) {
    bulkButton.classList.add("working");
    bulkButton.textContent = label;
    bulkButton.disabled = false;
  }

  function setBulkButtonIdle() {
    bulkButton.classList.remove("working");
    bulkButton.textContent = "Bulk Translate All Assets";
    bulkButton.disabled = false;
  }

  function setSuperBulkButtonWorking(label) {
    superBulkButton.classList.add("working");
    superBulkButton.textContent = label;
    superBulkButton.disabled = false;
  }

  function setSuperBulkButtonIdle() {
    superBulkButton.classList.remove("working");
    superBulkButton.textContent = "Super Bulk Translation · 17 languages";
    superBulkButton.disabled = false;
  }

  function setTestPhraseButtonWorking(label) {
    testPhraseButton.classList.add("working");
    testPhraseButton.textContent = label;
    testPhraseButton.disabled = false;
  }

  function setTestPhraseButtonIdle() {
    testPhraseButton.classList.remove("working");
    testPhraseButton.textContent = "Test Phrase · All Languages";
    testPhraseButton.disabled = false;
  }

  function setResetButtonWorking() {
    resetButton.classList.add("working");
    resetButton.textContent = "Resetting…";
    resetButton.disabled = true;
  }

  function setResetButtonIdle() {
    resetButton.classList.remove("working");
    resetButton.textContent = "Reset all data";
    resetButton.disabled = false;
  }

  function setBulkUiBusy(busy) {
    panel.classList.toggle("bulkBusy", busy);
    host.classList.toggle("bulkBusyHost", busy);
    const cancelButton = activeOperation === "super-bulk"
      ? superBulkButton
      : (activeOperation === "test-phrase" ? testPhraseButton : bulkButton);
    for (const row of shadow.querySelectorAll(".bulkActionRow")) {
      row.classList.toggle("activeBulkAction", busy && row.contains(cancelButton));
    }
    if (busy) translationLogBox.open = true;
    for (const control of shadow.querySelectorAll("button, select, input")) {
      if (busy && control === cancelButton) continue;
      if (busy) {
        if (!bulkControlState.has(control)) bulkControlState.set(control, control.disabled);
        control.disabled = true;
      } else if (bulkControlState.has(control)) {
        control.disabled = bulkControlState.get(control);
        bulkControlState.delete(control);
      }
    }
    if (busy) cancelButton.disabled = false;
  }

  for (const provider of PROVIDER_LIST) {
    const option = document.createElement("option");
    option.value = provider.id;
    option.textContent = provider.label;
    providerSelect.appendChild(option);
  }
  providerSelect.value = settings.provider;
  populateLanguageOptions(settings.provider, settings.language);
  privacyBox.hidden = true;
  updateCollapsedState();

  function positionHost(left, top, right) {
    host.style.setProperty("--vr-left", left);
    host.style.setProperty("--vr-top", top);
    host.style.setProperty("--vr-right", right);
    panel.style.setProperty("transform", "none", "important");
  }
  if (Number.isFinite(settings.x) && Number.isFinite(settings.y)) {
    positionHost(
      Math.max(0, Math.min(innerWidth - 30, settings.x)) + "px",
      Math.max(0, Math.min(innerHeight - 30, settings.y)) + "px",
      "auto"
    );
  } else {
    positionHost("auto", "14px", "14px");
  }

  function setStatus(text) { statusElement.textContent = text; }
  function compareVersions(left, right) {
    const leftParts = String(left || "").split("-")[0].split(".").map(Number);
    const rightParts = String(right || "").split("-")[0].split(".").map(Number);
    for (let index = 0; index < 3; index += 1) {
      if (leftParts[index] !== rightParts[index]) return leftParts[index] > rightParts[index] ? 1 : -1;
    }
    return 0;
  }
  function showUpdateChanges(changes) {
    const safeChanges = Array.isArray(changes)
      ? changes.filter((item) => typeof item === "string" && item.trim()).slice(0, 3)
      : [];
    const visibleChanges = safeChanges.length
      ? safeChanges
      : ["Update notes placeholder — details source will be configured later."];
    updateChangesElement.replaceChildren();
    for (const change of visibleChanges) {
      const item = document.createElement("li");
      item.textContent = change.trim().slice(0, 200);
      updateChangesElement.append(item);
    }
    updateChangesElement.hidden = false;
  }
  async function checkForUpdates() {
    updateStatusElement.classList.remove("available", "error");
    updateStatusElement.textContent = "Checking for updates…";
    updateChangesElement.replaceChildren();
    updateChangesElement.hidden = true;
    if (!LOCAL_BRIDGE) {
      updateStatusElement.classList.add("error");
      updateStatusElement.textContent = "Could not check for updates";
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPDATE_CHECK_TIMEOUT);
    try {
      const payload = await requestLocalHelper("/v1/update/check", { signal: controller.signal });
      const latest = typeof payload.latestVersion === "string" ? payload.latestVersion : "";
      if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(latest)) throw new Error("Invalid update manifest");
      if (compareVersions(latest, VERSION) > 0) {
        const cacheMessage = payload.cacheCompatibility === "rebuild"
          ? "translation cache rebuild required"
          : "translation cache will be kept";
        updateStatusElement.classList.add("available");
        updateStatusElement.textContent = `Update ${latest} available · ${cacheMessage}`;
        showUpdateChanges(payload.changes);
      } else {
        updateStatusElement.textContent = `Up to date · ${VERSION}`;
      }
    } catch (_) {
      updateStatusElement.classList.add("error");
      updateStatusElement.textContent = "Could not check for updates";
    } finally {
      clearTimeout(timeout);
    }
  }
  function createTranslationLogEntry(source, translation, language, provider, timestamp, cached) {
    const providerConfig = PROVIDERS[provider];
    const languageEntry = LANGUAGES.find(([code]) => code === language);
    const entry = document.createElement("article");
    entry.className = "translationLogEntry";
    const meta = document.createElement("div");
    meta.className = "translationLogMeta";
    meta.textContent = `${timestamp ? `${timestamp} · ` : ""}${languageEntry ? languageEntry[1] : language} · ${providerConfig ? providerConfig.label : provider}${cached ? " · cache" : ""}`;
    const sourceLine = document.createElement("div");
    sourceLine.className = "translationLogSource";
    sourceLine.textContent = `EN: ${source}`;
    const arrow = document.createElement("div");
    arrow.className = "translationLogArrow";
    arrow.textContent = "↓";
    const targetLine = document.createElement("div");
    targetLine.className = "translationLogTarget";
    targetLine.textContent = `${String(language || "translation").toUpperCase()}: ${translation}`;
    entry.append(meta, sourceLine, arrow, targetLine);
    return entry;
  }
  function appendTranslationLog(source, translation, language, provider, cached) {
    if (!translationLogEntries || !source || !translation) return;
    const entry = createTranslationLogEntry(source, translation, language, provider, new Date().toLocaleString(), cached === true);
    translationLogEntries.prepend(entry);
    while (translationLogEntries.children.length > TRANSLATION_LOG_LIMIT) {
      translationLogEntries.lastElementChild.remove();
    }
    translationLogEmpty.hidden = true;
    translationLogNote.textContent = "Live · saved without duplicates · newest first";
    translationLogBox.open = true;
  }
  function clearTranslationLog() {
    translationLogEntries.replaceChildren();
    translationLogEmpty.textContent = "No entries in this view. Saved history remains on disk.";
    translationLogEmpty.hidden = false;
    translationLogNote.textContent = "Saved locally · newest first";
  }
  async function viewSavedTranslationLog() {
    if (!LOCAL_BRIDGE) {
      setStatus("Saved translation history is unavailable without the local helper");
      return;
    }
    translationLogViewButton.disabled = true;
    try {
      const payload = await requestLocalHelper(`/v1/log/translations?limit=${TRANSLATION_LOG_VIEW_LIMIT}`);
      const entries = Array.isArray(payload.entries) ? payload.entries : [];
      translationLogEntries.replaceChildren();
      for (const record of entries) {
        if (!record || typeof record.source !== "string" || typeof record.translation !== "string") continue;
        translationLogEntries.append(createTranslationLogEntry(
          record.source,
          record.translation,
          typeof record.language === "string" ? record.language : "",
          typeof record.provider === "string" ? record.provider : "unknown",
          typeof record.timestamp === "string" ? record.timestamp : "",
          record.cached === true
        ));
      }
      const count = translationLogEntries.children.length;
      translationLogEmpty.textContent = count ? "" : "No saved translations yet.";
      translationLogEmpty.hidden = count > 0;
      translationLogNote.textContent = `Latest ${count} saved translations · newest first`;
      translationLogBox.open = true;
      setStatus(count ? `Loaded ${count} saved translations` : "Translation history is empty");
    } catch (error) {
      setStatus(error && error.message ? error.message : "Could not load translation history");
    } finally {
      translationLogViewButton.disabled = false;
    }
  }
  async function saveTranslationLog() {
    if (!LOCAL_BRIDGE) {
      setStatus("Saved translation history is unavailable without the local helper");
      return;
    }
    translationLogSaveButton.disabled = true;
    try {
      const response = await fetch(`${LOCAL_BRIDGE.baseURL}/v1/log/translations/download`, {
        headers: { "X-VNRevival-Token": LOCAL_BRIDGE.token },
        cache: "no-store"
      });
      if (!response.ok) throw new Error("Could not download translation history");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `OMORI-translation-history-${new Date().toISOString().slice(0, 10)}.jsonl`;
      document.documentElement.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus(`Saved translation history: ${formatBytes(blob.size)}`);
    } catch (error) {
      setStatus(error && error.message ? error.message : "Could not save translation history");
    } finally {
      translationLogSaveButton.disabled = false;
    }
  }
  function updateModeButton() {
    const translated = settings.mode === "translated";
    modeButton.querySelector(".translationChoice").classList.toggle("active", translated);
    modeButton.querySelector(".originalChoice").classList.toggle("active", !translated);
    modeButton.setAttribute("aria-pressed", String(translated));
    modeButton.title = translated ? "Show original text" : "Show translation";
  }
  function updateCollapsedState() {
    panel.classList.toggle("collapsed", settings.collapsed);
    collapseButton.textContent = settings.collapsed ? "+" : "−";
    collapseButton.title = settings.collapsed ? "Expand translator" : "Collapse translator";
    collapseButton.setAttribute("aria-label", collapseButton.title);
    collapseButton.setAttribute("aria-expanded", String(!settings.collapsed));
  }
  function managedOfflineEngine(provider) {
    const manager = PROVIDERS[provider] && PROVIDERS[provider].modelManager;
    const engines = {
      argos: {
        name: "Argos", statusPath: "/v1/status", runtimeInstallPath: "/v1/runtime/install",
        modelInstallPath: "/v1/models/install", modelUninstallPath: "/v1/models/uninstall"
      },
      bergamot: {
        name: "Bergamot", statusPath: "/v1/bergamot/status", runtimeInstallPath: null,
        modelInstallPath: "/v1/bergamot/models/install", modelUninstallPath: "/v1/bergamot/models/uninstall"
      },
      "ctranslate2-opus": {
        name: "CTranslate2 + OPUS-MT", statusPath: "/v1/ctranslate2/status",
        runtimeInstallPath: "/v1/ctranslate2/runtime/install",
        modelInstallPath: "/v1/ctranslate2/models/install", modelUninstallPath: "/v1/ctranslate2/models/uninstall"
      }
    };
    return engines[manager] || null;
  }
  function providerUsesManagedOffline(provider) { return !!managedOfflineEngine(provider); }
  function providerUsesGemini(provider) { return !!(PROVIDERS[provider] && PROVIDERS[provider].credentialManager === "gemini"); }
  function openAICompatibleIsLocal() {
    try {
      const url = new URL(openAICompatibleConnection().baseURL);
      return url.protocol === "http:" && ["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname.toLowerCase());
    } catch (_) { return false; }
  }
  function providerRequiresPrivacy(provider) {
    if (providerUsesOpenAICompatible(provider) && openAICompatibleIsLocal()) return false;
    return !!(PROVIDERS[provider] && PROVIDERS[provider].requiresPrivacy);
  }
  function languagesForProvider(provider) {
    const selectedProvider = PROVIDERS[provider];
    if (!selectedProvider) return [];
    if (providerUsesManagedOffline(provider) && !Array.isArray(argosSupportedLanguages)) return LANGUAGES;
    return LANGUAGES.filter(([code]) => selectedProvider.supportsLanguage(code, { localLanguages: argosSupportedLanguages }));
  }
  function populateLanguageOptions(provider, preferredLanguage) {
    const previous = preferredLanguage || languageSelect.value || settings.language;
    const available = languagesForProvider(provider);
    languageSelect.replaceChildren();
    for (const [code, name] of available) {
      const option = document.createElement("option");
      option.value = code;
      option.textContent = name;
      languageSelect.appendChild(option);
    }
    const fallback = available.some(([code]) => code === defaults.language) ? defaults.language : (available[0] && available[0][0]);
    languageSelect.value = available.some(([code]) => code === previous) ? previous : (fallback || "");
    languageSelect.disabled = argosBusy || geminiBusy || lmStudioBusy || openAICompatibleBusy || !available.length;
    return languageSelect.value !== previous;
  }
  function selectedLanguageName() {
    return languageSelect.options[languageSelect.selectedIndex]
      ? languageSelect.options[languageSelect.selectedIndex].textContent
      : languageSelect.value;
  }
  function reloadSelectedLanguageCache(announce) {
    const generation = settingsGeneration;
    const language = settings.language;
    const provider = settings.provider;
    const languageName = selectedLanguageName();
    memoryCache.clear();
    fuzzyMemoryCache.clear();
    if (announce) setStatus(`Loading ${languageName} cache…`);
    return preloadMemoryCache().then((loaded) => {
      if (generation !== settingsGeneration || language !== settings.language || provider !== settings.provider) {
        return false;
      }
      if (typeof adapter.onLanguageChanged === "function") {
        adapter.onLanguageChanged(language, provider);
      }
      scheduleAutoTranslation(50);
      if (announce) setStatus(`Ready: ${languageName} cache loaded (${loaded.toLocaleString()})`);
      return true;
    });
  }
  function persistControlSettings() {
    const languageChanged = settings.language !== languageSelect.value;
    const providerChanged = settings.provider !== providerSelect.value;
    settings.language = languageSelect.value;
    settings.provider = providerSelect.value;
    settings.autoTranslate = AUTO_APPLY_TRANSLATIONS;
    if (languageChanged || providerChanged) {
      settingsGeneration += 1;
      if (languageChanged && providerChanged) abortActiveOperation("target language and translation service changed");
      else if (languageChanged) abortActiveOperation("target language changed");
      else abortActiveOperation("translation service changed");
      invalidateAppliedTranslations();
      reloadSelectedLanguageCache(true);
    }
    saveSettings();
    scheduleAutoTranslation(50);
  }
  function setArgosBusy(busy) {
    argosBusy = busy;
    argosActionButton.disabled = busy;
    argosRemoveButton.disabled = busy;
    languageSelect.disabled = busy || geminiBusy || lmStudioBusy || openAICompatibleBusy || !languageSelect.options.length;
    providerSelect.disabled = busy || geminiBusy || lmStudioBusy || openAICompatibleBusy;
  }
  function setGeminiBusy(busy) {
    geminiBusy = busy;
    geminiKeyInput.disabled = busy || !LOCAL_BRIDGE;
    geminiSaveButton.disabled = busy || !LOCAL_BRIDGE;
    geminiRemoveButton.disabled = busy || !LOCAL_BRIDGE;
    languageSelect.disabled = busy || argosBusy || lmStudioBusy || openAICompatibleBusy || !languageSelect.options.length;
    providerSelect.disabled = busy || argosBusy || lmStudioBusy || openAICompatibleBusy;
  }
  function setLMStudioBusy(busy) {
    lmStudioBusy = busy;
    lmStudioModelSelect.disabled = busy || !lmStudioStatus || !lmStudioStatus.available
      || !Array.isArray(lmStudioStatus.models) || !lmStudioStatus.models.length;
    lmStudioRefreshButton.disabled = busy || !LOCAL_BRIDGE;
    languageSelect.disabled = busy || argosBusy || geminiBusy || openAICompatibleBusy || !languageSelect.options.length;
    providerSelect.disabled = busy || argosBusy || geminiBusy || openAICompatibleBusy;
  }
  function setOpenAICompatibleBusy(busy) {
    openAICompatibleBusy = busy;
    for (const control of [
      openAICompatiblePresetSelect, openAICompatibleBaseURLInput, openAICompatibleModelInput,
      openAICompatibleKeyInput, openAICompatibleSaveButton, openAICompatibleRefreshButton,
      openAICompatibleRemoveButton
    ]) control.disabled = busy || !LOCAL_BRIDGE;
    if (!busy && openAICompatiblePresetSelect.value !== "custom") openAICompatibleBaseURLInput.disabled = true;
    languageSelect.disabled = busy || argosBusy || geminiBusy || lmStudioBusy || !languageSelect.options.length;
    providerSelect.disabled = busy || argosBusy || geminiBusy || lmStudioBusy;
  }
  function applyLMStudioModel(model, announce) {
    const value = typeof model === "string" ? model : "";
    if (settings.lmStudioModel === value) return false;
    abortActiveOperation("LM Studio model changed");
    settings.lmStudioModel = value;
    settingsGeneration += 1;
    invalidateAppliedTranslations();
    saveSettings();
    reloadSelectedLanguageCache(false).then((ready) => {
      if (ready && announce && value) setStatus(`LM Studio model: ${value}`);
    });
    return true;
  }
  async function refreshLMStudioStatus() {
    if (!providerUsesLMStudio(providerSelect.value)) {
      lmStudioBox.hidden = true;
      return lmStudioStatus;
    }
    lmStudioBox.hidden = false;
    if (!LOCAL_BRIDGE) {
      lmStudioStatus = null;
      lmStudioModelSelect.replaceChildren();
      lmStudioModelSelect.disabled = true;
      lmStudioRefreshButton.disabled = true;
      lmStudioStatusElement.textContent = `The local translation helper is not running. Restart the game through ${PRODUCT_NAME}.`;
      return null;
    }
    setLMStudioBusy(true);
    try {
      lmStudioStatus = await requestLocalHelper("/v1/lmstudio/status");
      const models = Array.isArray(lmStudioStatus.models)
        ? lmStudioStatus.models.filter((model) => typeof model === "string" && model)
        : [];
      lmStudioStatus.models = models;
      lmStudioModelSelect.replaceChildren();
      for (const model of models) {
        const option = document.createElement("option");
        option.value = model;
        option.textContent = model;
        lmStudioModelSelect.appendChild(option);
      }
      const selected = models.includes(settings.lmStudioModel) ? settings.lmStudioModel : (models[0] || "");
      lmStudioModelSelect.value = selected;
      applyLMStudioModel(selected, false);
      if (!lmStudioStatus.available) {
        lmStudioStatusElement.textContent = lmStudioStatus.message || "Start the LM Studio local server on 127.0.0.1:1234.";
      } else if (!models.length) {
        lmStudioStatusElement.textContent = lmStudioStatus.message || "LM Studio is running, but no model is available.";
      } else {
        lmStudioStatusElement.textContent = `Ready · ${selected} · ${lmStudioStatus.baseURL || "127.0.0.1:1234"}`;
      }
      return lmStudioStatus;
    } catch (error) {
      lmStudioStatus = null;
      lmStudioModelSelect.replaceChildren();
      lmStudioStatusElement.textContent = error && error.message ? error.message : "Could not check LM Studio";
      return null;
    } finally {
      setLMStudioBusy(false);
    }
  }
  function syncOpenAICompatibleInputs() {
    const connection = openAICompatibleConnection();
    openAICompatiblePresetSelect.value = connection.preset;
    openAICompatibleBaseURLInput.value = connection.baseURL;
    openAICompatibleBaseURLInput.disabled = openAICompatibleBusy || !LOCAL_BRIDGE || connection.preset !== "custom";
    openAICompatibleModelInput.value = connection.model;
    openCodeGoReferralLink.hidden = connection.preset !== "opencode-go";
  }
  function applyOpenAICompatibleSettings(next, announce) {
    const preset = OPENAI_COMPATIBLE_PRESETS[next.preset] ? next.preset : defaults.openAICompatiblePreset;
    const baseURL = preset === "custom"
      ? String(next.baseURL || "").trim().slice(0, 2048)
      : OPENAI_COMPATIBLE_PRESETS[preset].baseURL;
    const model = String(next.model || "").trim().slice(0, 512);
    const changed = settings.openAICompatiblePreset !== preset
      || settings.openAICompatibleBaseURL !== baseURL
      || settings.openAICompatibleModel !== model;
    if (!changed) return false;
    abortActiveOperation("OpenAI-compatible connection changed");
    settings.openAICompatiblePreset = preset;
    settings.openAICompatibleBaseURL = baseURL;
    settings.openAICompatibleModel = model;
    settingsGeneration += 1;
    invalidateAppliedTranslations();
    saveSettings();
    syncOpenAICompatibleInputs();
    reloadSelectedLanguageCache(false).then((ready) => {
      if (ready && announce) setStatus(`OpenAI-compatible: ${OPENAI_COMPATIBLE_PRESETS[preset].name}${model ? ` · ${model}` : ""}`);
    });
    return true;
  }
  async function refreshOpenAICompatibleStatus() {
    if (!providerUsesOpenAICompatible(providerSelect.value)) {
      openAICompatibleBox.hidden = true;
      return openAICompatibleStatus;
    }
    openAICompatibleBox.hidden = false;
    syncOpenAICompatibleInputs();
    openAICompatibleKeyInput.value = "";
    if (!LOCAL_BRIDGE) {
      openAICompatibleStatus = null;
      openAICompatibleModelsList.replaceChildren();
      openAICompatibleStatusElement.textContent = `The local translation helper is not running. Restart the game through ${PRODUCT_NAME}.`;
      setOpenAICompatibleBusy(false);
      return null;
    }
    setOpenAICompatibleBusy(true);
    try {
      const connection = openAICompatibleConnection();
      openAICompatibleStatus = await requestLocalHelper("/v1/openai-compatible/status", {
        body: { preset: connection.preset, baseURL: connection.baseURL }
      });
      const models = Array.isArray(openAICompatibleStatus.models)
        ? openAICompatibleStatus.models.filter((model) => typeof model === "string" && model)
        : [];
      openAICompatibleStatus.models = models;
      openAICompatibleModelsList.replaceChildren();
      for (const model of models) {
        const option = document.createElement("option");
        option.value = model;
        openAICompatibleModelsList.appendChild(option);
      }
      if (!settings.openAICompatibleModel && models.length) {
        applyOpenAICompatibleSettings(Object.assign({}, connection, { model: models[0] }), false);
      }
      openAICompatibleModelInput.value = settings.openAICompatibleModel;
      openAICompatibleRemoveButton.hidden = !openAICompatibleStatus.configured;
      openAICompatibleSaveButton.textContent = openAICompatibleStatus.configured
        ? "Replace API key"
        : (openAICompatibleStatus.requiresKey ? "Save API key" : "Save optional key");
      if (openAICompatibleStatus.available) {
        openAICompatibleStatusElement.textContent = `Ready · ${openAICompatibleStatus.name} · ${models.length} models`
          + (openAICompatibleStatus.configured ? ` · key in ${openAICompatibleStatus.credentialStorage}` : "");
      } else {
        openAICompatibleStatusElement.textContent = openAICompatibleStatus.message || "Connection could not be verified; enter a model ID manually.";
      }
      return openAICompatibleStatus;
    } catch (error) {
      openAICompatibleStatus = null;
      openAICompatibleModelsList.replaceChildren();
      openAICompatibleStatusElement.textContent = error && error.message ? error.message : "Could not check the OpenAI-compatible provider";
      return null;
    } finally {
      setOpenAICompatibleBusy(false);
    }
  }
  async function refreshGeminiStatus() {
    if (!providerUsesGemini(providerSelect.value)) {
      geminiBox.hidden = true;
      return geminiStatus;
    }
    geminiBox.hidden = false;
    geminiKeyInput.value = "";
    if (!LOCAL_BRIDGE) {
      geminiStatus = null;
      geminiStatusElement.textContent = `The local translation helper is not running. Restart the game through ${PRODUCT_NAME}.`;
      geminiKeyInput.disabled = true;
      geminiSaveButton.disabled = true;
      geminiRemoveButton.hidden = true;
      return null;
    }
    try {
      geminiStatus = await requestLocalHelper("/v1/gemini/status");
      geminiKeyInput.disabled = false;
      geminiSaveButton.disabled = false;
      geminiSaveButton.textContent = geminiStatus.configured ? "Replace API key" : "Save API key";
      geminiRemoveButton.hidden = !geminiStatus.configured;
      geminiStatusElement.textContent = geminiStatus.configured
        ? `Gemini is ready · ${geminiStatus.model} · key stored in ${geminiStatus.credentialStorage}`
        : `Add a Gemini API key. It will be stored in ${geminiStatus.credentialStorage}.`;
      return geminiStatus;
    } catch (error) {
      geminiStatus = null;
      geminiStatusElement.textContent = error && error.message ? error.message : "Could not check Gemini";
      geminiKeyInput.disabled = true;
      geminiSaveButton.disabled = true;
      geminiRemoveButton.hidden = true;
      return null;
    }
  }
  async function refreshArgosStatus() {
    if (!providerUsesManagedOffline(providerSelect.value)) {
      argosBox.hidden = true;
      return argosStatus;
    }
    const engine = managedOfflineEngine(providerSelect.value);
    argosBox.hidden = false;
    if (!LOCAL_BRIDGE) {
      argosStatus = null;
      argosStatusElement.textContent = `The local ${engine.name} helper is not running. Restart the game through ${PRODUCT_NAME}.`;
      argosActionButton.hidden = true;
      argosRemoveButton.hidden = true;
      return null;
    }
    try {
      const target = languageSelect.value;
      argosStatus = await requestLocalHelper(engine.statusPath + "?target=" + encodeURIComponent(target));
      if (Array.isArray(argosStatus.supportedLanguages)) {
        argosSupportedLanguages = argosStatus.supportedLanguages;
        if (populateLanguageOptions(providerSelect.value, target)) {
          if (providerUsesManagedOffline(settings.provider)) persistControlSettings();
          return refreshArgosStatus();
        }
      }
      if (!argosStatus.supported) {
        argosStatusElement.textContent = `${engine.name} has no offline model for ${selectedLanguageName()}. Choose another provider or language.`;
        argosActionButton.hidden = true;
        argosRemoveButton.hidden = true;
      } else if (!argosStatus.runtimeInstalled || !argosStatus.sentenceModelInstalled) {
        argosStatusElement.textContent = `${engine.name} is not fully installed. Internet is only required for engine and model installation.`;
        argosActionButton.textContent = `Install ${engine.name} and model`;
        argosActionButton.hidden = false;
        argosRemoveButton.hidden = true;
      } else if (!argosStatus.modelInstalled) {
        argosStatusElement.textContent = `The English → ${selectedLanguageName()} model has not been downloaded.`;
        argosActionButton.textContent = providerSelect.value === "ctranslate2-opus" ? "Download and convert model" : "Download model";
        argosActionButton.hidden = false;
        argosRemoveButton.hidden = true;
      } else {
        argosStatusElement.textContent = `Ready for offline translation · model ${formatBytes(argosStatus.modelBytes)} · engine ${formatBytes(argosStatus.runtimeBytes)}`;
        argosActionButton.hidden = true;
        argosRemoveButton.hidden = false;
      }
      return argosStatus;
    } catch (error) {
      argosStatus = null;
      argosStatusElement.textContent = error && error.message ? error.message : `Could not check ${engine.name}`;
      argosActionButton.hidden = true;
      argosRemoveButton.hidden = true;
      return null;
    }
  }
  function updateProviderHint() {
    const selectedProvider = PROVIDERS[providerSelect.value];
    privacyBox.hidden = true;
    if (providerUsesManagedOffline(providerSelect.value)) {
      if (managedOfflineProvider !== providerSelect.value) {
        managedOfflineProvider = providerSelect.value;
        argosSupportedLanguages = null;
        populateLanguageOptions(providerSelect.value, languageSelect.value || settings.language);
      }
      geminiBox.hidden = true;
      lmStudioBox.hidden = true;
      openAICompatibleBox.hidden = true;
      providerHint.textContent = selectedProvider.hint(languageSelect.options.length);
      refreshArgosStatus();
    } else if (providerUsesGemini(providerSelect.value)) {
      populateLanguageOptions(providerSelect.value, languageSelect.value || settings.language);
      argosBox.hidden = true;
      lmStudioBox.hidden = true;
      openAICompatibleBox.hidden = true;
      providerHint.textContent = selectedProvider.hint(languageSelect.options.length);
      refreshGeminiStatus();
    } else if (providerUsesLMStudio(providerSelect.value)) {
      populateLanguageOptions(providerSelect.value, languageSelect.value || settings.language);
      argosBox.hidden = true;
      geminiBox.hidden = true;
      openAICompatibleBox.hidden = true;
      providerHint.textContent = selectedProvider.hint(languageSelect.options.length);
      refreshLMStudioStatus();
    } else if (providerUsesOpenAICompatible(providerSelect.value)) {
      populateLanguageOptions(providerSelect.value, languageSelect.value || settings.language);
      argosBox.hidden = true;
      geminiBox.hidden = true;
      lmStudioBox.hidden = true;
      providerHint.textContent = selectedProvider.hint(languageSelect.options.length);
      refreshOpenAICompatibleStatus();
    } else {
      populateLanguageOptions(providerSelect.value, languageSelect.value || settings.language);
      argosBox.hidden = true;
      geminiBox.hidden = true;
      lmStudioBox.hidden = true;
      openAICompatibleBox.hidden = true;
      providerHint.textContent = selectedProvider ? selectedProvider.hint(languageSelect.options.length) : "";
    }
  }

  updateModeButton();
  updateProviderHint();
  refreshCacheStats();
  checkForUpdates();

  projectSiteLink.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openExternalUrl(SITE_URL);
  });
  openCodeGoReferralLink.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openExternalUrl(OPENCODE_GO_REFERRAL_URL);
  });
  modeButton.addEventListener("click", toggleMode);
  retryButton.addEventListener("click", retryFailed);
  let suppressCollapseClick = false;
  collapseButton.addEventListener("click", (event) => {
    if (suppressCollapseClick) {
      suppressCollapseClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    settings.collapsed = !settings.collapsed;
    updateCollapsedState();
  });
  const onProviderChange = () => {
    updateProviderHint();
    persistControlSettings();
  };
  providerSelect.addEventListener("change", onProviderChange);

  const onLanguageChange = () => {
    persistControlSettings();
    refreshCacheStats();
    if (providerUsesManagedOffline(providerSelect.value)) refreshArgosStatus();
    setStatus(`Language: ${selectedLanguageName()} (restart recommended)`);
  };
  languageSelect.addEventListener("change", onLanguageChange);
  resetButton.addEventListener("click", async () => {
    if (!confirm("This will delete all cached translations and reset settings to default. Continue?")) return;
    setResetButtonWorking();
    try {
      await new Promise((resolve) => {
        let settled = false;
        const finish = () => { if (!settled) { settled = true; resolve(); } };
        requestAnimationFrame(finish);
        setTimeout(finish, 100);
      });
      await deleteAllTranslatorData();
    } catch (error) {
      setStatus(error && error.message ? error.message : "Could not reset translator data");
    } finally {
      setResetButtonIdle();
    }
  });
  exportButton.addEventListener("click", exportCache);
  importButton.addEventListener("click", () => cacheFileInput.click());
  bulkButton.addEventListener("click", bulkTranslateAll);
  superBulkButton.addEventListener("click", superBulkTranslateAll);
  testPhraseButton.addEventListener("click", translateTestPhraseAllLanguages);
  translationLogViewButton.addEventListener("click", viewSavedTranslationLog);
  translationLogSaveButton.addEventListener("click", saveTranslationLog);
  translationLogClearButton.addEventListener("click", clearTranslationLog);
  cacheFileInput.addEventListener("change", () => {
    if (cacheFileInput.files && cacheFileInput.files[0]) {
      importCache(cacheFileInput.files[0]);
      cacheFileInput.value = "";
    }
  });
  geminiSaveButton.addEventListener("click", async () => {
    const apiKey = geminiKeyInput.value.trim();
    if (!apiKey) {
      geminiStatusElement.textContent = "Enter a Gemini API key first.";
      return;
    }
    setGeminiBusy(true);
    try {
      await requestLocalHelper("/v1/gemini/key", { body: { apiKey } });
      geminiKeyInput.value = "";
      await refreshGeminiStatus();
      setStatus("Gemini API key saved securely");
    } catch (error) {
      geminiKeyInput.value = "";
      geminiStatusElement.textContent = error && error.message ? error.message : "Could not save the Gemini API key";
      setStatus("Gemini setup failed");
    } finally {
      setGeminiBusy(false);
    }
  });
  geminiRemoveButton.addEventListener("click", async () => {
    if (!confirm("Remove the saved Gemini API key?")) return;
    setGeminiBusy(true);
    try {
      await requestLocalHelper("/v1/gemini/key/remove", { body: { accepted: true } });
      await refreshGeminiStatus();
      setStatus("Gemini API key removed");
    } catch (error) {
      setStatus(error && error.message ? error.message : "Could not remove the Gemini API key");
    } finally {
      setGeminiBusy(false);
    }
  });
  lmStudioModelSelect.addEventListener("change", () => {
    applyLMStudioModel(lmStudioModelSelect.value, true);
    if (lmStudioStatus && lmStudioStatus.available) {
      lmStudioStatusElement.textContent = `Ready · ${lmStudioModelSelect.value} · ${lmStudioStatus.baseURL || "127.0.0.1:1234"}`;
    }
  });
  lmStudioRefreshButton.addEventListener("click", async () => {
    await refreshLMStudioStatus();
    if (lmStudioStatus && lmStudioStatus.available && lmStudioStatus.models.length) {
      setStatus("LM Studio models refreshed");
    } else {
      setStatus("LM Studio is not ready");
    }
  });
  openAICompatiblePresetSelect.addEventListener("change", async () => {
    const preset = openAICompatiblePresetSelect.value;
    applyOpenAICompatibleSettings({
      preset,
      baseURL: OPENAI_COMPATIBLE_PRESETS[preset] ? OPENAI_COMPATIBLE_PRESETS[preset].baseURL : "",
      model: ""
    }, true);
    await refreshOpenAICompatibleStatus();
  });
  openAICompatibleBaseURLInput.addEventListener("change", async () => {
    applyOpenAICompatibleSettings({
      preset: "custom", baseURL: openAICompatibleBaseURLInput.value, model: ""
    }, true);
    await refreshOpenAICompatibleStatus();
  });
  openAICompatibleModelInput.addEventListener("change", () => {
    const connection = openAICompatibleConnection();
    applyOpenAICompatibleSettings({
      preset: connection.preset, baseURL: connection.baseURL, model: openAICompatibleModelInput.value
    }, true);
  });
  openAICompatibleRefreshButton.addEventListener("click", async () => {
    const connection = openAICompatibleConnection();
    applyOpenAICompatibleSettings({
      preset: openAICompatiblePresetSelect.value,
      baseURL: openAICompatibleBaseURLInput.value,
      model: openAICompatibleModelInput.value || connection.model
    }, false);
    const status = await refreshOpenAICompatibleStatus();
    setStatus(status && status.available ? "OpenAI-compatible models refreshed" : "Connection could not be verified");
  });
  openAICompatibleSaveButton.addEventListener("click", async () => {
    const apiKey = openAICompatibleKeyInput.value.trim();
    if (!apiKey) {
      openAICompatibleStatusElement.textContent = "Enter an API key first.";
      return;
    }
    const connection = openAICompatibleConnection();
    setOpenAICompatibleBusy(true);
    try {
      await requestLocalHelper("/v1/openai-compatible/key", {
        body: { preset: connection.preset, baseURL: connection.baseURL, apiKey }
      });
      openAICompatibleKeyInput.value = "";
      await refreshOpenAICompatibleStatus();
      setStatus(`${OPENAI_COMPATIBLE_PRESETS[connection.preset].name} API key saved securely`);
    } catch (error) {
      openAICompatibleKeyInput.value = "";
      openAICompatibleStatusElement.textContent = error && error.message ? error.message : "Could not save the API key";
      setStatus("OpenAI-compatible setup failed");
    } finally {
      setOpenAICompatibleBusy(false);
    }
  });
  openAICompatibleRemoveButton.addEventListener("click", async () => {
    const connection = openAICompatibleConnection();
    if (!confirm(`Remove the saved API key for ${OPENAI_COMPATIBLE_PRESETS[connection.preset].name}?`)) return;
    setOpenAICompatibleBusy(true);
    try {
      await requestLocalHelper("/v1/openai-compatible/key/remove", {
        body: { preset: connection.preset, baseURL: connection.baseURL, accepted: true }
      });
      await refreshOpenAICompatibleStatus();
      setStatus("OpenAI-compatible API key removed");
    } catch (error) {
      setStatus(error && error.message ? error.message : "Could not remove the API key");
    } finally {
      setOpenAICompatibleBusy(false);
    }
  });
  argosActionButton.addEventListener("click", async () => {
    if (argosBusy || !LOCAL_BRIDGE) return;
    const engine = managedOfflineEngine(providerSelect.value);
    if (!engine) return;
    setArgosBusy(true);
    try {
      const status = await refreshArgosStatus();
      if (!status || !status.supported) return;
      if (!status.runtimeInstalled || !status.sentenceModelInstalled) {
        if (!engine.runtimeInstallPath) throw new Error(`The bundled ${engine.name} engine is unavailable`);
        argosStatusElement.textContent = `Installing the ${engine.name} engine… This may take several minutes.`;
        await requestLocalHelper(engine.runtimeInstallPath, { body: { accepted: true } });
      }
      argosStatusElement.textContent = providerSelect.value === "ctranslate2-opus"
        ? `Downloading and converting the English → ${selectedLanguageName()} OPUS-MT model…`
        : `Downloading the English → ${selectedLanguageName()} model…`;
      await requestLocalHelper(engine.modelInstallPath, { body: { target: languageSelect.value } });
      await refreshArgosStatus();
      if (providerSelect.value === "bergamot") await ensureBergamotRuntime();
      setStatus(`${engine.name} is ready for offline translation`);
    } catch (error) {
      argosStatusElement.textContent = error && error.message ? error.message : `Could not install ${engine.name}`;
      setStatus(`${engine.name} installation failed`);
    } finally {
      setArgosBusy(false);
    }
  });
  argosRemoveButton.addEventListener("click", async () => {
    if (argosBusy || !confirm(`Remove the offline model for ${selectedLanguageName()}?`)) return;
    const engine = managedOfflineEngine(providerSelect.value);
    if (!engine) return;
    setArgosBusy(true);
    try {
      await requestLocalHelper(engine.modelUninstallPath, { body: { target: languageSelect.value } });
      if (providerSelect.value === "bergamot") resetBergamotRuntime();
      invalidateAppliedTranslations();
      await refreshArgosStatus();
      setStatus(`${engine.name} model removed`);
    } catch (error) {
      setStatus(error && error.message ? error.message : "Could not remove model");
    } finally {
      setArgosBusy(false);
    }
  });
  shadow.querySelector(".allowBulk").addEventListener("click", () => {
    settings.privacyAccepted = true;
    privacyBox.hidden = true;
    saveSettings();
    setStatus("Bulk upload allowed · press the translation button again");
  });
  shadow.querySelector(".cancelBulk").addEventListener("click", () => {
    privacyBox.hidden = true;
    setStatus("Bulk translation cancelled");
  });
  let drag = null;
  const bar = shadow.querySelector(".bar");
  bar.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const startedOnCollapse = event.target === collapseButton;
    // In the expanded panel the minus button must remain a normal button.
    // Preventing its pointerdown default can suppress the subsequent click in NW.js.
    if (startedOnCollapse && !settings.collapsed) {
      suppressCollapseClick = false;
      return;
    }
    const rect = panel.getBoundingClientRect();
    suppressCollapseClick = false;
    drag = {
      pointerId: event.pointerId,
      dx: event.clientX - rect.left,
      dy: event.clientY - rect.top,
      baseLeft: rect.left,
      baseTop: rect.top,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      startedOnCollapse
    };
    if (typeof bar.setPointerCapture === "function") {
      try { bar.setPointerCapture(event.pointerId); } catch (_) {}
    }
    // The collapsed plus is both the expand button and its drag handle. Keep
    // its default click unless an actual move is detected in pointermove.
    if (!startedOnCollapse) event.preventDefault();
  });
  window.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return;
    drag.moved = true;
    const x = Math.max(0, Math.min(innerWidth - host.offsetWidth, event.clientX - drag.dx));
    const y = Math.max(0, Math.min(innerHeight - 36, event.clientY - drag.dy));
    panel.style.setProperty("transform", `translate3d(${x - drag.baseLeft}px, ${y - drag.baseTop}px, 0)`, "important");
    event.preventDefault();
  });
  const finishDrag = (event) => {
    if (!drag || (event.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
    const completedDrag = drag;
    drag = null;
    const activateCollapsedButton = event.type !== "pointercancel"
      && completedDrag.startedOnCollapse && !completedDrag.moved && settings.collapsed;
    // NW.js may suppress the click after pointer capture. Expand explicitly on
    // pointerup, then swallow a click if this Chromium build still emits one.
    suppressCollapseClick = event.type !== "pointercancel" && completedDrag.startedOnCollapse;
    const rect = panel.getBoundingClientRect();
    settings.x = Math.round(rect.left);
    settings.y = Math.round(rect.top);
    positionHost(
      Math.max(0, Math.min(innerWidth - 30, settings.x)) + "px",
      Math.max(0, Math.min(innerHeight - 30, settings.y)) + "px",
      "auto"
    );
    if (activateCollapsedButton) {
      settings.collapsed = false;
      updateCollapsedState();
    }
    saveSettings();
  };
  window.addEventListener("pointerup", finishDrag);
  window.addEventListener("pointercancel", finishDrag);
  bar.addEventListener("mousedown", (event) => {
    if (event.button !== 0 || drag) return;
    const startedOnCollapse = event.target === collapseButton;
    if (startedOnCollapse && !settings.collapsed) {
      suppressCollapseClick = false;
      return;
    }
    const rect = panel.getBoundingClientRect();
    suppressCollapseClick = false;
    drag = {
      pointerId: null,
      dx: event.clientX - rect.left,
      dy: event.clientY - rect.top,
      baseLeft: rect.left,
      baseTop: rect.top,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      startedOnCollapse
    };
    if (!startedOnCollapse) event.preventDefault();
  });
  window.addEventListener("mousemove", (event) => {
    if (!drag || drag.pointerId !== null) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return;
    drag.moved = true;
    const x = Math.max(0, Math.min(innerWidth - host.offsetWidth, event.clientX - drag.dx));
    const y = Math.max(0, Math.min(innerHeight - 36, event.clientY - drag.dy));
    panel.style.setProperty("transform", `translate3d(${x - drag.baseLeft}px, ${y - drag.baseTop}px, 0)`, "important");
  });
  window.addEventListener("mouseup", (event) => {
    if (!drag || drag.pointerId !== null) return;
    finishDrag(event);
  });

  window.addEventListener("resize", () => {
    const left = host.style.getPropertyValue("--vr-left");
    if (left && left !== "auto") {
      const curLeft = parseInt(left, 10);
      if (curLeft > window.innerWidth - 310) {
        host.style.setProperty("--vr-left", Math.max(0, window.innerWidth - 310) + "px");
      }
    }
  });

  if (typeof IntersectionObserver === "function") {
    translationVisibilityObserver = new IntersectionObserver((entries) => {
      let added = false;
      for (const entry of entries) {
        if (entry.isIntersecting && entry.target.isConnected) {
          visibleTranslationContainers.add(entry.target);
          queueTranslationContainer(entry.target);
          added = true;
        } else {
          visibleTranslationContainers.delete(entry.target);
        }
      }
      if (added) scheduleAutoTranslation(120);
    }, { root: null, rootMargin: "120px 0px", threshold: 0 });
  }

  const observer = new MutationObserver((records) => {
    if (selfMutation) return;
    let changed = false;
    for (const record of records) {
      if (record.type === "characterData" && record.target.parentElement) {
        registerTranslationContainers(record.target.parentElement);
        const container = presentationContainerForNode(record.target) || record.target.parentElement;
        if (isElementOnScreen(container)) queueTranslationContainer(container);
        changed = true;
      }
      for (const node of record.addedNodes || []) {
        registerTranslationContainers(node);
        changed = true;
      }
    }
    if (changed && pendingTranslationRoots.size) scheduleAutoTranslation(220);
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true
  });
  document.addEventListener("pointerover", (event) => {
    if (event.target instanceof Element) {
      registerTranslationContainers(event.target);
    }
    scheduleAutoTranslation(180);
  }, true);
  if (!translationVisibilityObserver) {
    addEventListener("scroll", () => {
      registerTranslationContainers(document.body);
      scheduleAutoTranslation(180);
    }, { capture: true, passive: true });
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearTimeout(scanTimer);
      scanTimer = 0;
      if (activeOperation !== "bulk" && activeOperation !== "super-bulk" && activeOperation !== "test-phrase") {
        abortActiveOperation("game window was hidden");
      }
      return;
    }
    for (const element of visibleTranslationContainers) queueTranslationContainer(element);
    scheduleAutoTranslation(80);
  });

  registerTranslationContainers(document.body);

  let startupChecks = 0;
  const startupGuard = setInterval(() => {
    startupChecks += 1;
    if (startupChecks > 180) {
      clearInterval(startupGuard);
      return;
    }
    const loading = document.getElementById("loading");
    if (loading && isElementOnScreen(loading)) return;
    const roots = takeAutoTranslationRoots();
    if (roots.length) {
      for (const root of roots) pendingTranslationRoots.add(root);
      clearInterval(startupGuard);
      translateScreen(false);
    }
  }, 1000);

  setTimeout(() => {
    const gameVersion = typeof adapter.getGameVersion === "function" ? String(adapter.getGameVersion(window) || "") : "";
    if (gameVersion && SUPPORTED_GAME_VERSIONS.length && !SUPPORTED_GAME_VERSIONS.includes(gameVersion)) {
      compatibilityBox.hidden = false;
      compatibilityBox.textContent = `${GAME_SHORT_TITLE} ${gameVersion} has not been tested with mod ${VERSION}. Translation will continue, but errors are possible.`;
    }
    scheduleAutoTranslation(50);
  }, 500);

  window.__vnRevivalTranslator = {
    version: VERSION,
    gameId: game.id,
    translateScreen: () => translateScreen(true),
    translateAdapterText,
    registerAdapterText: (text) => {
      if (settings.mode === "translated" && hasSourceText(text)) {
        if (!pendingAdapterTexts.has(text)) {
          pendingAdapterTexts.add(text);
          scheduleAutoTranslation(150);
        }
      }
    },
    getMode: () => settings.mode,
    getLanguage: () => settings.language,
    getProvider: () => settings.provider,
    isSourceText: (text) => hasSourceText(text),
    queryMemoryCache: (text) => {
      if (!core.normalizeText(text)) return null;
      const key = makeTranslationCacheKey(text, settings.language, settings.provider);
      let hit = memoryCache.get(key);
      if (!hit) {
        const fuzzySource = core.stripOmoriPrefixes(text);
        if (fuzzySource) {
          const fuzzyKey = `${game.id}\n${providerCacheScope(settings.provider)}\n${settings.language}\n${fuzzySource}`;
          hit = fuzzyMemoryCache.get(fuzzyKey);
        }
      }
      return hit && core.protectedMarkupLayoutMatches(text, hit) ? hit : null;
    },
    collectVisibleTextNodes,
    showOriginal,
    showTranslations,
    cacheStats,
    settings: () => Object.assign({}, settings)
  };
  if (legacyCompatibility.coreGlobal) window[legacyCompatibility.coreGlobal] = core;
  if (legacyCompatibility.languagesGlobal) window[legacyCompatibility.languagesGlobal] = LANGUAGES;
  if (legacyCompatibility.translatorGlobal) {
    window[legacyCompatibility.translatorGlobal] = window.__vnRevivalTranslator;
  }
  console.info(`[${PRODUCT_NAME} ${VERSION}] loaded for ${GAME_TITLE}`);
  preloadMemoryCache();
})();
