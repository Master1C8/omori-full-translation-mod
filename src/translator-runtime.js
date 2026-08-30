(function () {
  "use strict";
  if (window.__vnRevivalTranslator && window.__vnRevivalTranslator.version) return;

  const core = window.VNRevivalTranslationCore;
  const game = window.VNRevivalGameConfig;
  const adapter = window.VNRevivalGameAdapter;
  const providerRegistry = window.VNRevivalTranslationProviders;
  const runtimeUI = window.VNRevivalRuntimeUI;
  const runtimeProgress = window.VNRevivalRuntimeProgress;
  const runtimePanel = window.VNRevivalRuntimePanel;
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
  if (!runtimeUI || runtimeUI.contractVersion !== 1) {
    throw new Error("VN Revival runtime UI helpers are missing or incompatible");
  }
  if (!runtimeProgress || runtimeProgress.contractVersion !== 1) {
    throw new Error("VN Revival runtime progress helpers are missing or incompatible");
  }
  if (!runtimePanel || runtimePanel.contractVersion !== 1) {
    throw new Error("VN Revival runtime panel is missing or incompatible");
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
  const GOOGLE_CONTEXT_VERSION = "google-context-v1";
  const OPENAI_COMPATIBLE_PRESETS = Object.freeze({
    "opencode-go": Object.freeze({ name: "OpenCode Go", baseURL: "https://opencode.ai/zen/go/v1", requiresKey: true }),
    openrouter: Object.freeze({ name: "OpenRouter", baseURL: "https://openrouter.ai/api/v1", requiresKey: true }),
    deepseek: Object.freeze({ name: "DeepSeek", baseURL: "https://api.deepseek.com", requiresKey: true }),
    lmstudio: Object.freeze({ name: "LM Studio", baseURL: "http://127.0.0.1:1234/v1", requiresKey: false }),
    custom: Object.freeze({ name: "Custom", baseURL: "", requiresKey: false })
  });
  const LANGUAGE_TEST_PHRASE_SOURCE = "<WordWrap>\\marHi, OMORI! Cliff-faced as usual, I see.\\!<br>You should totally smile more! I've always liked your smile.";
  const AUTO_APPLY_TRANSLATIONS = true;
  const SETTINGS_KEY = `${game.storageNamespace}.settings.v2`;
  const LEGACY_SETTINGS_KEY = `${game.storageNamespace}.settings.v1`;
  const CACHE_META_KEY = `${game.storageNamespace}.cache-meta.v3`;
  const CACHE_DIRTY_KEY = `${game.storageNamespace}.cache-meta-dirty.v3`;
  const TRANSLATION_PACK_META_KEY = `${game.storageNamespace}.translation-packs.v1`;
  const LEGACY_CACHE_META_KEYS = Object.freeze([
    `${game.storageNamespace}.cache-meta.v1`, `${game.storageNamespace}.cache-meta.v2`
  ]);
  const LEGACY_CACHE_DIRTY_KEYS = Object.freeze([
    `${game.storageNamespace}.cache-meta-dirty.v1`, `${game.storageNamespace}.cache-meta-dirty.v2`
  ]);
  const DB_NAME = game.cacheDatabase || `${game.storageNamespace}-cache`;
  const STORE_NAME = "translations";
  const TRANSLATION_PACK_STORE_NAME = "translationPackEntries";
  const CACHE_FORMAT = "vnrevival-translator-cache";
  const TRANSLATION_PACK_FORMAT = "vnrevival-translation-pack";
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
  const TEST_PHRASE_GOOGLE_DELAY = 1000;
  const TEST_PHRASE_RATE_LIMIT_DELAY = 15000;
  const TEST_PHRASE_RATE_LIMIT_MAX_DELAY = 120000;
  const TEST_PHRASE_GOOGLE_RATE_LIMIT_DELAY = 15 * 60 * 1000;
  const TEST_PHRASE_GOOGLE_RATE_LIMIT_MAX_DELAY = 60 * 60 * 1000;
  const INTERRUPT_TRANSLATION_LABEL = "Interrupt translation (progress will be saved)";
  const SCREEN_TRANSLATION_LABEL = "Translate current screen (Ctrl+Shift+T)";
  const SCREEN_TRANSLATION_CANCEL_LABEL = "Cancel current screen (Ctrl+Shift+T)";
  const GOOGLE_RATE_LIMIT_STATE_KEY = `${game.storageNamespace}.google-rate-limit-state.v2`;
  const LEGACY_GOOGLE_RATE_LIMIT_UNTIL_KEY = `${game.storageNamespace}.google-rate-limit-until.v1`;
  const LANGUAGES = window.VNRevivalTranslatorLanguages;
  const PROVIDER_LIST = providerRegistry.list;
  const PROVIDERS = providerRegistry.byId;
  const injectedLocalBridge = window.__vnRevivalLocalBridge;
  const LOCAL_BRIDGE = injectedLocalBridge
    && /^http:\/\/127\.0\.0\.1:\d+$/.test(String(injectedLocalBridge.baseURL || ""))
    && /^[A-Za-z0-9-]{16,}$/.test(String(injectedLocalBridge.token || ""))
    ? Object.freeze({ baseURL: injectedLocalBridge.baseURL, token: injectedLocalBridge.token })
    : null;
  const defaults = {
    language: "ru",
    provider: "google",
    autoTranslate: AUTO_APPLY_TRANSLATIONS,
    mode: "translated",
    translationScope: "story",
    autoScreenTranslation: false,
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
  let autoScreenTimer = 0;
  let autoScreenPreparing = false;
  let translationVisibilityObserver = null;
  let lastFailedJobs = [];
  let lastFailedJobsAllowNetwork = false;
  let dbPromise = null;
  let cacheMetadata = loadCacheMetadata();
  let cacheMetadataPromise = null;
  let cacheMetadataVerified = false;
  let cacheMetadataSaveTimer = 0;
  let translationPackMetadata = loadTranslationPackMetadata();
  let importedPackLanguage = "";
  let geminiStatus = null;
  let geminiBusy = false;
  let lmStudioStatus = null;
  let lmStudioBusy = false;
  let openAICompatibleStatus = null;
  let openAICompatibleBusy = false;
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
  const importedPackCache = new Map();
  const importedPackFuzzyCache = new Map();
  const observedTranslationContainers = new WeakSet();
  const visibleTranslationContainers = new Set();
  const pendingTranslationRoots = new Set();
  const pendingAdapterTexts = new Set();
  const pendingCompletedScreenTexts = new Set();

  function emptyCacheMetadata() {
    return { version: 1, records: 0, bytes: 0, languages: {} };
  }

  function emptyTranslationPackMetadata() {
    return { version: 1, languages: {} };
  }

  function loadTranslationPackMetadata() {
    try {
      const value = JSON.parse(localStorage.getItem(TRANSLATION_PACK_META_KEY) || "null");
      if (!value || value.version !== 1 || !value.languages || typeof value.languages !== "object") {
        return emptyTranslationPackMetadata();
      }
      const languages = {};
      for (const [language, record] of Object.entries(value.languages)) {
        if (!LANGUAGES.some(([code]) => code === language) || !record || typeof record !== "object") continue;
        if (typeof record.packId !== "string" || !/^[A-Za-z0-9-]{16,80}$/.test(record.packId)) continue;
        languages[language] = {
          packId: record.packId,
          records: Math.max(0, Number(record.records) || 0),
          fileName: typeof record.fileName === "string" ? record.fileName.slice(0, 255) : "",
          provider: typeof record.provider === "string" ? record.provider.slice(0, 120) : "shared",
          importedAt: typeof record.importedAt === "string" ? record.importedAt : ""
        };
      }
      return { version: 1, languages };
    } catch (_) { return emptyTranslationPackMetadata(); }
  }

  function saveTranslationPackMetadata() {
    localStorage.setItem(TRANSLATION_PACK_META_KEY, JSON.stringify(translationPackMetadata));
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
    try { parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null"); } catch (_) {}
    if (!parsed) {
      try {
        parsed = JSON.parse(localStorage.getItem(LEGACY_SETTINGS_KEY) || "null");
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
      mode: source.mode === "source" ? "source" : defaults.mode,
      translationScope: ["story", "full", "screen"].includes(source.translationScope)
        ? source.translationScope : defaults.translationScope,
      autoScreenTranslation: source.autoScreenTranslation === true,
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
    if (provider === "google") providerVariant = GOOGLE_CONTEXT_VERSION;
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
      const request = indexedDB.open(DB_NAME, 5);
      request.onupgradeneeded = (event) => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME);
        } else if (event.oldVersion < 5) {
          request.transaction.objectStore(STORE_NAME).clear();
        }
        if (!request.result.objectStoreNames.contains(TRANSLATION_PACK_STORE_NAME)) {
          const packStore = request.result.createObjectStore(TRANSLATION_PACK_STORE_NAME, { keyPath: "key" });
          packStore.createIndex("packId", "packId", { unique: false });
          packStore.createIndex("packFuzzy", ["packId", "fuzzy"], { unique: false });
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

  function activeTranslationPack(language) {
    return translationPackMetadata.languages[String(language || "")] || null;
  }

  function translationPackEntryKey(packId, source) {
    return `${packId}\n${core.normalizeText(source)}`;
  }

  function importedPackMemorySet(record) {
    if (!record || typeof record.source !== "string" || typeof record.translation !== "string") return;
    if (importedPackCache.has(record.source)) importedPackCache.delete(record.source);
    importedPackCache.set(record.source, record.translation);
    if (record.fuzzy) importedPackFuzzyCache.set(record.fuzzy, record.translation);
    while (importedPackCache.size > MEMORY_CACHE_LIMIT) {
      importedPackCache.delete(importedPackCache.keys().next().value);
    }
  }

  async function preloadImportedPackCache(language = settings.language) {
    importedPackCache.clear();
    importedPackFuzzyCache.clear();
    importedPackLanguage = language;
    const pack = activeTranslationPack(language);
    if (!pack) return 0;
    let loaded = 0;
    try {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const store = db.transaction(TRANSLATION_PACK_STORE_NAME, "readonly").objectStore(TRANSLATION_PACK_STORE_NAME);
        const request = store.index("packId").openCursor(IDBKeyRange.only(pack.packId));
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) { resolve(); return; }
          importedPackMemorySet(cursor.value);
          loaded += 1;
          cursor.continue();
        };
      });
    } catch (_) {}
    return loaded;
  }

  async function importedPackGet(source, language) {
    const pack = activeTranslationPack(language);
    if (!pack) return null;
    if (importedPackLanguage !== language) await preloadImportedPackCache(language);
    const normalized = core.normalizeText(source);
    const fuzzy = core.stripOmoriPrefixes(source);
    let translation = importedPackCache.get(normalized)
      || (fuzzy ? importedPackFuzzyCache.get(fuzzy) : null);
    if (!translation) {
      try {
        const db = await openDb();
        const store = db.transaction(TRANSLATION_PACK_STORE_NAME, "readonly").objectStore(TRANSLATION_PACK_STORE_NAME);
        let record = await new Promise((resolve, reject) => {
          const request = store.get(translationPackEntryKey(pack.packId, normalized));
          request.onsuccess = () => resolve(request.result || null);
          request.onerror = () => reject(request.error);
        });
        if (!record && fuzzy) {
          record = await new Promise((resolve, reject) => {
            const request = store.index("packFuzzy").get([pack.packId, fuzzy]);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
          });
        }
        if (record) {
          importedPackMemorySet(record);
          translation = record.translation;
        }
      } catch (_) { return null; }
    }
    return translation && core.protectedMarkupLayoutMatches(source, translation) ? translation : null;
  }

  function importedPackMemoryGet(source, language) {
    if (!activeTranslationPack(language) || importedPackLanguage !== language) return null;
    const normalized = core.normalizeText(source);
    const fuzzy = core.stripOmoriPrefixes(source);
    const translation = importedPackCache.get(normalized)
      || (fuzzy ? importedPackFuzzyCache.get(fuzzy) : null);
    return translation && core.protectedMarkupLayoutMatches(source, translation) ? translation : null;
  }

  async function cachePut(key, value) {
    if (!key || !value) return false;
    const metadata = await getCacheMetadata();
    const db = await openDb();
    markCacheMetadataDirty();
    const previous = await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      let oldValue = null;
      transaction.oncomplete = () => resolve(oldValue);
      transaction.onerror = () => reject(transaction.error || new Error("Cache transaction failed"));
      transaction.onabort = () => reject(transaction.error || new Error("Cache transaction aborted"));
      const getRequest = store.get(key);
      getRequest.onerror = () => reject(getRequest.error || new Error("Could not read the existing cache entry"));
      getRequest.onsuccess = () => {
        oldValue = typeof getRequest.result === "string" ? getRequest.result : null;
        store.put(value, key);
      };
    });
    memoryCacheSet(key, value);
    if (previous !== null) adjustCacheMetadata(metadata, key, previous, -1);
    adjustCacheMetadata(metadata, key, value, 1);
    scheduleCacheMetadataSave();
    return true;
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

  async function clearLegacyGoogleSegmentCache(language) {
    const db = await openDb();
    const legacyVariant = core.fingerprint(core.PROTECTED_MARKUP_VERSION);
    let removed = 0;
    markCacheMetadataDirty();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const request = transaction.objectStore(STORE_NAME).openCursor();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (core.cacheKeyGame(cursor.key) === game.id
          && core.cacheKeyProvider(cursor.key) === "google"
          && core.cacheKeyLanguage(cursor.key) === language
          && core.cacheKeyVariant(cursor.key) === legacyVariant) {
          cursor.delete();
          removed += 1;
        }
        cursor.continue();
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Legacy Google cache deletion failed"));
      transaction.onabort = () => reject(transaction.error || new Error("Legacy Google cache deletion was aborted"));
    });
    memoryCache.clear();
    fuzzyMemoryCache.clear();
    await rebuildCacheMetadata();
    return removed;
  }

  async function migrateLegacyGoogleSegmentCache() {
    const language = settings.language;
    const migrationKey = `${game.storageNamespace}.google-context-cache-cleared.v1.${language}`;
    if (localStorage.getItem(migrationKey) === "1") return 0;
    const removed = await clearLegacyGoogleSegmentCache(language);
    localStorage.setItem(migrationKey, "1");
    return removed;
  }

  async function clearAllCache() {
    const db = await openDb();
    markCacheMetadataDirty();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Cache deletion failed"));
      transaction.onabort = () => reject(transaction.error || new Error("Cache deletion was aborted"));
      transaction.objectStore(STORE_NAME).clear();
    });
    memoryCache.clear();
    fuzzyMemoryCache.clear();
    cacheMetadata = emptyCacheMetadata();
    cacheMetadataVerified = true;
    saveCacheMetadata(cacheMetadata);
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
    if (code === "translation_quality_invalid") return "The provider lost or duplicated visible source text";
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
    return runtimeProgress.formatRetryCountdown(seconds);
  }

  function countTranslationWords(value) {
    return runtimeProgress.countTranslationWords(value, core.tokenizeProtectedMarkup);
  }

  function createTranslationEtaTracker() {
    return runtimeProgress.createEtaTracker(() => performance.now());
  }

  function translationProgressText(completedWords, totalWords, remainingMs, waitSeconds, provider) {
    return runtimeProgress.progressText({
      completedWords, totalWords, remainingMs, waitSeconds,
      providerLabel: PROVIDERS[provider] ? PROVIDERS[provider].label : "Translation provider"
    });
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

  async function translateProviderText(provider, text, language, signal, request, delayOverride) {
    const selectedProvider = PROVIDERS[provider];
    if (!selectedProvider) throw new Error("Unknown translation service");
    const chunks = selectedProvider.splitText(text);
    const parts = [];
    const delay = Number.isFinite(delayOverride)
      ? Math.max(0, delayOverride)
      : selectedProvider.delay;
    for (const chunk of chunks) {
      parts.push(await request(chunk));
      if (delay) await sleep(delay, signal);
    }
    const translated = parts.join(" ").replace(/ +\n/g, "\n").trim();
    if (translated.toLowerCase().includes("undefined") && !text.toLowerCase().includes("undefined")) {
      throw new Error("Translation contains suspicious 'undefined' keyword");
    }
    return translated;
  }

  async function translateWithProtectedMarkup(
    source, language, provider, signal, request, delayOverride, protectedOptions
  ) {
    return core.translateProtectedText(
      source,
      (text) => translateProviderText(
        provider, text, language, signal, (chunk) => request(chunk), delayOverride
      ),
      Object.assign({ language, contextual: true }, protectedOptions || {})
    );
  }

  async function translateText(source, language, provider, signal, allowNetwork, logCachedResult, onRateLimitWait) {
    if (!source || typeof source !== "string" || source.length < 2) return { text: source, cached: true };

    // Source assets are English. Avoid re-translating an already translated value,
    // while leaving path and identifier detection to the shared source-text filter.
    if (/[\u0410-\u044F\u0401\u0451]/.test(source) || !core.hasTranslatableText(source)) {
      return { text: source, cached: true };
    }

    const importedTranslation = await importedPackGet(source, language);
    if (importedTranslation) {
      if (logCachedResult) appendTranslationLog(source, importedTranslation, language, "Imported translation", true);
      return { text: importedTranslation, cached: true, imported: true };
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
    clearCompletedScreenTranslationQueue();
    if (activeOperation === "screen-auto") abortActiveOperation("showing original text");
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

  function queryMemoryTranslation(source, language = settings.language, provider = settings.provider) {
    if (!core.normalizeText(source)) return null;
    const imported = importedPackMemoryGet(source, language);
    if (imported) return imported;
    const key = makeTranslationCacheKey(source, language, provider);
    let hit = memoryCache.get(key);
    if (!hit) {
      const fuzzySource = core.stripOmoriPrefixes(source);
      if (fuzzySource) {
        const fuzzyKey = `${game.id}\n${providerCacheScope(provider)}\n${language}\n${fuzzySource}`;
        hit = fuzzyMemoryCache.get(fuzzyKey);
      }
    }
    return hit && core.protectedMarkupLayoutMatches(source, hit) ? hit : null;
  }

  function buildScreenAdapterJobs(sources) {
    const cachedJobs = [];
    const freshSources = [];
    for (const source of sources) {
      const job = { source, nodes: [], kind: "ui", contextual: false, adapterOnly: true };
      if (queryMemoryTranslation(source)) cachedJobs.push(job);
      else freshSources.push(source);
    }

    const freshJobs = [];
    const contextLimit = Number(PROVIDERS[settings.provider] && PROVIDERS[settings.provider].contextLimit) || 3200;
    let offset = 0;
    while (offset < freshSources.length) {
      let size = Math.min(12, freshSources.length - offset);
      let slice = freshSources.slice(offset, offset + size);
      let contextSource = core.buildContextSource(slice);
      while (size > 1 && (contextSource.length > contextLimit || core.utf8Length(contextSource) > contextLimit)) {
        size -= 1;
        slice = freshSources.slice(offset, offset + size);
        contextSource = core.buildContextSource(slice);
      }
      if (size > 1) {
        freshJobs.push({
          source: contextSource,
          nodes: [],
          parts: slice.map((source) => ({ source, node: null, kind: "ui" })),
          kind: "ui",
          contextual: true,
          adapterOnly: true
        });
      } else {
        freshJobs.push({ source: slice[0], nodes: [], kind: "ui", contextual: false, adapterOnly: true });
      }
      offset += size;
    }
    return cachedJobs.concat(freshJobs);
  }

  async function applyJobTranslation(job, language, provider, signal, generation, allowNetwork, onRateLimitWait) {
    const result = await translateText(
      job.source, language, provider, signal, allowNetwork === true, false, onRateLimitWait
    );
    if (generation !== settingsGeneration) throw new DOMException("Settings changed", "AbortError");
    if (result.skipped) {
      if (job.adapterOnly) {
        if (job.contextual && Array.isArray(job.parts)) {
          for (const part of job.parts) pendingAdapterTexts.delete(part.source);
        } else pendingAdapterTexts.delete(job.source);
      }
      return "missing";
    }
    if (!job.contextual) {
      if (job.adapterOnly) {
        pendingAdapterTexts.delete(job.source);
        return result.cached ? "hit" : "updated";
      }
      for (const node of job.nodes) {
        if (node.isConnected && sourceForNode(node) === job.source) rememberTranslation(node, job.source, result.text, language, provider);
      }
      return result.cached ? "hit" : "updated";
    }
    const contextualParts = core.parseContextTranslation(result.text, job.parts.length);
    if (contextualParts) {
      for (let index = 0; index < job.parts.length; index += 1) {
        const part = job.parts[index];
        if (!result.cached || job.adapterOnly) {
          await cachePut(makeTranslationCacheKey(part.source, language, provider), contextualParts[index]);
        }
        if (part.node && part.node.isConnected && sourceForNode(part.node) === part.source) {
          rememberTranslation(part.node, part.source, contextualParts[index], language, provider);
        }
        if (job.adapterOnly) pendingAdapterTexts.delete(part.source);
      }
      return result.cached ? "hit" : "updated";
    }
    let allCached = true;
    for (const part of job.parts) {
      const fallback = await translateText(
        part.source, language, provider, signal, allowNetwork === true, false, onRateLimitWait
      );
      allCached = allCached && fallback.cached;
      if (part.node && part.node.isConnected && sourceForNode(part.node) === part.source) {
        rememberTranslation(part.node, part.source, fallback.text, language, provider);
      }
      if (job.adapterOnly) pendingAdapterTexts.delete(part.source);
    }
    return allCached ? "hit" : "updated";
  }

  async function runJobs(jobs, options) {
    const manual = !!(options && options.manual);
    const allowNetwork = !!(options && options.allowNetwork);
    const automaticScreen = !!(options && options.automaticScreen);
    const providerReady = !!(options && options.providerReady);
    if (running) {
      if (manual) abortActiveOperation("cancelled by user");
      else pendingAutoRun = true;
      return;
    }
    if (!jobs.length) {
      setStatus(allowNetwork ? "No translatable text is visible on this screen" : "Screen already translated");
      return;
    }
    if (allowNetwork && !providerReady
      && !(await ensureTranslationProviderReady(automaticScreen ? "auto-screen" : "screen"))) return;

    running = true;
    activeOperation = automaticScreen ? "screen-auto" : allowNetwork ? "screen" : "screen-sync";
    activeAbortReason = "";
    abortController = new AbortController();
    if (allowNetwork) setScreenButtonWorking();
    retryButton.hidden = true;
    lastFailedJobs = [];
    lastFailedJobsAllowNetwork = allowNetwork;
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
          const outcome = await applyJobTranslation(
            job, language, provider, abortController.signal, generation, allowNetwork,
            (seconds) => setStatus(`Rate limited · retrying in ${Math.max(1, Number(seconds) || 1)} s`)
          );
          if (outcome === "hit") cacheHits += 1;
          else if (outcome === "missing") cacheMisses += 1;
        } catch (error) {
          if (error && error.name === "AbortError") throw error;
          lastErrorCode = error && error.code ? error.code : lastErrorCode;
          lastFailedJobs.push(job);
        }
        done += 1;
        setStatus(`${automaticScreen
          ? "Translating completed dialogue"
          : allowNetwork ? "Translating current screen" : "Syncing"} ${done}/${jobs.length}`);
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
        setStatus(allowNetwork
          ? `${automaticScreen ? "Dialogue" : "Current screen"} translated: ${jobs.length}`
            + (cacheHits ? ` · from cache: ${cacheHits}` : "")
          : `Synced from cache: ${cacheHits}` + (cacheMisses ? ` · missing: ${cacheMisses}` : ""));
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
      if (allowNetwork) setScreenButtonIdle();
      refreshCacheStats();
      if (pendingAutoRun) {
        pendingAutoRun = false;
        scheduleAutoTranslation(250);
      }
      if (pendingCompletedScreenTexts.size) scheduleCompletedScreenTranslation(250);
    }
  }

  async function ensureTranslationProviderReady(purpose) {
    if (providerUsesGemini(settings.provider)) {
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
    return true;
  }

  async function translateAdapterText(source) {
    if (settings.mode !== "translated" || !hasSourceText(source)) return null;
    const result = await translateText(source, settings.language, settings.provider, null, false);
    pendingAdapterTexts.delete(source);
    if (typeof adapter.onTranslationsChanged === "function") adapter.onTranslationsChanged();
    return result;
  }

  function clearCompletedScreenTranslationQueue() {
    clearTimeout(autoScreenTimer);
    autoScreenTimer = 0;
    pendingCompletedScreenTexts.clear();
  }

  function scheduleCompletedScreenTranslation(delay) {
    if (autoScreenTimer || !pendingCompletedScreenTexts.size) return;
    autoScreenTimer = setTimeout(() => {
      autoScreenTimer = 0;
      void translateCompletedScreenTexts();
    }, Number(delay) || 250);
  }

  function registerCompletedScreenText(source) {
    const text = String(source == null ? "" : source).trim();
    if (!settings.autoScreenTranslation || settings.translationScope !== "screen"
      || settings.mode !== "translated" || !hasSourceText(text)) return false;
    pendingCompletedScreenTexts.add(text);
    scheduleCompletedScreenTranslation(250);
    return true;
  }

  async function translateCompletedScreenTexts() {
    if (autoScreenPreparing || !pendingCompletedScreenTexts.size) return;
    if (!settings.autoScreenTranslation || settings.translationScope !== "screen"
      || settings.mode !== "translated") {
      clearCompletedScreenTranslationQueue();
      return;
    }
    if (running) {
      scheduleCompletedScreenTranslation(250);
      return;
    }
    autoScreenPreparing = true;
    let providerWasReady = false;
    try {
      if (!(await ensureTranslationProviderReady("auto-screen"))) return;
      providerWasReady = true;
      if (running || !settings.autoScreenTranslation || settings.translationScope !== "screen"
        || settings.mode !== "translated") {
        if (running) scheduleCompletedScreenTranslation(250);
        return;
      }
      const sources = Array.from(pendingCompletedScreenTexts);
      pendingCompletedScreenTexts.clear();
      await runJobs(buildScreenAdapterJobs(sources), {
        manual: false,
        allowNetwork: true,
        automaticScreen: true,
        providerReady: true
      });
    } finally {
      autoScreenPreparing = false;
      if (providerWasReady && pendingCompletedScreenTexts.size) {
        scheduleCompletedScreenTranslation(250);
      }
    }
  }

  function translateScreen(manual) {
    const isManual = manual !== false;
    if (running) {
      if (isManual) abortActiveOperation("cancelled by user");
      else pendingAutoRun = true;
      return;
    }
    if (!isManual && settings.translationScope === "screen") {
      takeAutoTranslationRoots();
      pendingAdapterTexts.clear();
      return Promise.resolve();
    }
    const roots = isManual ? null : takeAutoTranslationRoots();
    if (!isManual && !roots.length && !pendingAdapterTexts.size) return Promise.resolve();
    const jobs = buildJobs(collectVisibleTextNodes(roots ? { roots } : null));
    const manualScreen = isManual && settings.translationScope === "screen";
    let adapterTexts = pendingAdapterTexts;
    if (manualScreen && typeof adapter.collectVisibleTexts === "function") {
      const collected = adapter.collectVisibleTexts();
      adapterTexts = new Set(Array.isArray(collected) ? collected : []);
      pendingAdapterTexts.clear();
    }
    if (adapterTexts.size > 0) {
      const existingSources = new Set(jobs.map((job) => job.source));
      const standaloneSources = [];
      for (const source of adapterTexts) {
        if (existingSources.has(source) || !hasSourceText(source)) continue;
        standaloneSources.push(source);
      }
      jobs.push(...(manualScreen
        ? buildScreenAdapterJobs(standaloneSources)
        : standaloneSources.map((source) => ({ source, nodes: [], kind: "ui", contextual: false, adapterOnly: true }))));
      if (adapterTexts === pendingAdapterTexts) pendingAdapterTexts.clear();
    }
    if (!isManual && !jobs.length) return Promise.resolve();
    return runJobs(jobs, { manual: isManual, allowNetwork: manualScreen });
  }

  function retryFailed() {
    const jobs = lastFailedJobs.filter((job) => job.adapterOnly || job.nodes.some((node) => node.isConnected));
    const allowNetwork = lastFailedJobsAllowNetwork;
    lastFailedJobs = [];
    lastFailedJobsAllowNetwork = false;
    return runJobs(jobs.length ? jobs : buildJobs(collectVisibleTextNodes()), {
      manual: true, allowNetwork
    });
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
      if (settings.translationScope === "screen") {
        pendingAdapterTexts.clear();
        return;
      }
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

  function languageName(language) {
    const entry = LANGUAGES.find(([code]) => code === language);
    return entry ? entry[1] : language;
  }

  function providerName(provider, variant) {
    const base = PROVIDERS[provider] ? PROVIDERS[provider].label
      : (provider === "shared" ? "Shared translation" : provider);
    return variant ? `${base} · variant ${variant.slice(0, 8)}` : base;
  }

  async function streamJsonLines(file, consume) {
    const reader = file.stream().getReader();
    const decoder = new TextDecoder();
    let pending = "";
    let lineNumber = 0;
    async function consumeLine(line) {
      if (!line.trim()) return;
      lineNumber += 1;
      if (line.length > 250000) throw new Error("Translation entry is too large");
      await consume(JSON.parse(line), lineNumber);
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
  }

  function isValidTranslationPackPair(pair) {
    if (!(Array.isArray(pair) && typeof pair[0] === "string" && typeof pair[1] === "string")) return false;
    const source = core.normalizeText(pair[0]);
    const translation = String(pair[1] || "").trim();
    return !!(source && translation && source.length < 120000 && translation.length < 120000
      && core.protectedMarkupLayoutMatches(source, translation));
  }

  function translationSelectionKey(language, provider, variant) {
    return `${language}\u0000${provider}\u0000${variant || ""}`;
  }

  function addTranslationFileSelection(inspection, language, provider, variant) {
    if (!LANGUAGES.some(([code]) => code === language)) throw new Error(`Unsupported language: ${language}`);
    const key = translationSelectionKey(language, provider, variant);
    let selection = inspection.selectionMap.get(key);
    if (!selection) {
      selection = { language, provider, variant: variant || "", count: 0 };
      inspection.selectionMap.set(key, selection);
    }
    selection.count += 1;
    inspection.records += 1;
    if (inspection.records > CACHE_IMPORT_ENTRY_LIMIT) throw new Error("Too many translation entries");
  }

  function inspectRawCacheEntry(inspection, entry) {
    if (!isValidCacheEntry(entry)) throw new Error("Invalid cache entry");
    const source = core.cacheKeySource(entry[0]);
    if (!isValidTranslationPackPair([source, entry[1]])) throw new Error("Translation changed protected game markup");
    addTranslationFileSelection(
      inspection,
      core.cacheKeyLanguage(entry[0]),
      core.cacheKeyProvider(entry[0]),
      core.cacheKeyVariant(entry[0])
    );
  }

  async function inspectTranslationFile(file) {
    if (!file || file.size <= 0) throw new Error("The selected file is empty");
    if (file.size > 512 * 1024 * 1024) throw new Error("The selected file is too large");
    const prefix = await file.slice(0, 4096).text();
    const firstLine = prefix.split("\n").find((line) => line.trim());
    let header;
    try { header = JSON.parse(firstLine || ""); } catch (_) {
      const formatMatch = prefix.match(/"format"\s*:\s*"([^"]+)"/);
      if (formatMatch && isAcceptedCacheFormat(formatMatch[1])
        && /"version"\s*:\s*1(?:\D|$)/.test(prefix)) {
        header = { format: formatMatch[1], version: 1 };
      } else {
        throw new Error("Invalid translation file");
      }
    }
    const inspection = {
      file, fileName: String(file.name || "translation.jsonl"), header, kind: "",
      records: 0, selectionMap: new Map(), selections: [], gameId: header && header.gameId ? header.gameId : "",
      createdAt: header && typeof header.exportedAt === "string" ? header.exportedAt
        : (header && typeof header.createdAt === "string" ? header.createdAt : "")
    };
    if (inspection.gameId && inspection.gameId !== game.id) throw new Error(`This file is for ${inspection.gameId}, not ${game.id}`);

    if (header && header.format === TRANSLATION_PACK_FORMAT && header.version === 1) {
      if (header.sourceLanguage && header.sourceLanguage !== SOURCE_LANGUAGE) {
        throw new Error(`This translation starts from ${header.sourceLanguage}, not ${SOURCE_LANGUAGE}`);
      }
      const language = String(header.language || "");
      const provider = typeof header.provider === "string" && header.provider ? header.provider : "shared";
      inspection.kind = "pack-v1";
      await streamJsonLines(file, async (value, lineNumber) => {
        if (lineNumber === 1) return;
        if (!isValidTranslationPackPair(value)) throw new Error("Invalid translation pack entry");
        addTranslationFileSelection(inspection, language, provider, "");
      });
    } else if (header && isAcceptedCacheFormat(header.format) && header.version === 2) {
      inspection.kind = "cache-v2";
      await streamJsonLines(file, async (value, lineNumber) => {
        if (lineNumber === 1) return;
        inspectRawCacheEntry(inspection, value);
      });
    } else if (header && isAcceptedCacheFormat(header.format) && header.version === 1) {
      if (file.size > 25 * 1024 * 1024) throw new Error("Legacy cache file is too large");
      const payload = JSON.parse(await file.text());
      if (!Array.isArray(payload.entries)) throw new Error("Invalid legacy cache file");
      if (payload.gameId && payload.gameId !== game.id) throw new Error(`This file is for ${payload.gameId}, not ${game.id}`);
      inspection.gameId = payload.gameId || inspection.gameId;
      inspection.kind = "cache-v1";
      for (const entry of payload.entries) inspectRawCacheEntry(inspection, entry);
    } else {
      throw new Error("Unsupported translation file format");
    }
    inspection.selections = Array.from(inspection.selectionMap.values())
      .sort((a, b) => languageName(a.language).localeCompare(languageName(b.language))
        || providerName(a.provider, a.variant).localeCompare(providerName(b.provider, b.variant)));
    delete inspection.selectionMap;
    if (!inspection.selections.length) throw new Error("The file contains no translations");
    return inspection;
  }

  async function writeTranslationPackBatch(records) {
    if (!records.length) return;
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(TRANSLATION_PACK_STORE_NAME, "readwrite");
      const store = transaction.objectStore(TRANSLATION_PACK_STORE_NAME);
      for (const record of records) store.put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Could not save the translation pack"));
      transaction.onabort = () => reject(transaction.error || new Error("Translation pack import was aborted"));
    });
  }

  async function deleteTranslationPackEntries(packId) {
    if (!packId) return;
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(TRANSLATION_PACK_STORE_NAME, "readwrite");
      const store = transaction.objectStore(TRANSLATION_PACK_STORE_NAME);
      const request = store.index("packId").openCursor(IDBKeyRange.only(packId));
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Could not remove the translation pack"));
      transaction.onabort = () => reject(transaction.error || new Error("Translation pack removal was aborted"));
    });
  }

  async function clearAllTranslationPacks() {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(TRANSLATION_PACK_STORE_NAME, "readwrite");
      transaction.objectStore(TRANSLATION_PACK_STORE_NAME).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Could not clear imported translations"));
      transaction.onabort = () => reject(transaction.error || new Error("Imported translation reset was aborted"));
    });
    translationPackMetadata = emptyTranslationPackMetadata();
    localStorage.removeItem(TRANSLATION_PACK_META_KEY);
    importedPackCache.clear();
    importedPackFuzzyCache.clear();
    importedPackLanguage = "";
  }

  function translationPairMatchesSelection(key, selection) {
    return core.cacheKeyLanguage(key) === selection.language
      && core.cacheKeyProvider(key) === selection.provider
      && core.cacheKeyVariant(key) === selection.variant;
  }

  async function forEachSelectedTranslationPair(inspection, selection, consume) {
    if (inspection.kind === "pack-v1") {
      await streamJsonLines(inspection.file, async (value, lineNumber) => {
        if (lineNumber === 1) return;
        if (!isValidTranslationPackPair(value)) throw new Error("Invalid translation pack entry");
        await consume(core.normalizeText(value[0]), String(value[1]).trim());
      });
      return;
    }
    if (inspection.kind === "cache-v2") {
      await streamJsonLines(inspection.file, async (value, lineNumber) => {
        if (lineNumber === 1) return;
        if (!isValidCacheEntry(value)) throw new Error("Invalid cache entry");
        if (!translationPairMatchesSelection(value[0], selection)) return;
        const source = core.cacheKeySource(value[0]);
        if (!isValidTranslationPackPair([source, value[1]])) throw new Error("Translation changed protected game markup");
        await consume(source, value[1]);
      });
      return;
    }
    const payload = JSON.parse(await inspection.file.text());
    for (const value of payload.entries || []) {
      if (!isValidCacheEntry(value) || !translationPairMatchesSelection(value[0], selection)) continue;
      const source = core.cacheKeySource(value[0]);
      if (!isValidTranslationPackPair([source, value[1]])) throw new Error("Translation changed protected game markup");
      await consume(source, value[1]);
    }
  }

  async function installTranslationPack(inspection, selection) {
    const packId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    const previous = activeTranslationPack(selection.language);
    let batch = [];
    let written = 0;
    let activated = false;
    try {
      await forEachSelectedTranslationPair(inspection, selection, async (source, translation) => {
        const normalized = core.normalizeText(source);
        batch.push({
          key: translationPackEntryKey(packId, normalized), packId, source: normalized,
          fuzzy: core.stripOmoriPrefixes(normalized), translation: String(translation)
        });
        written += 1;
        if (batch.length >= CACHE_IO_BATCH_SIZE) {
          await writeTranslationPackBatch(batch);
          batch = [];
          setStatus(`Importing ${languageName(selection.language)}: ${written.toLocaleString()}`);
        }
      });
      await writeTranslationPackBatch(batch);
      if (!written) throw new Error("The selected language contains no translations");
      translationPackMetadata.languages[selection.language] = {
        packId, records: written, fileName: inspection.fileName,
        provider: providerName(selection.provider, selection.variant), importedAt: new Date().toISOString()
      };
      saveTranslationPackMetadata();
      activated = true;
      if (previous && previous.packId !== packId) await deleteTranslationPackEntries(previous.packId).catch(() => null);
      populateLanguageOptions(settings.provider, selection.language);
      languageSelect.value = selection.language;
      if (settings.language !== selection.language) {
        abortActiveOperation("target language changed by translation import");
        settingsGeneration += 1;
        settings.language = selection.language;
        saveSettings();
      }
      await reloadSelectedLanguageCache(false);
      invalidateAppliedTranslations();
      scheduleAutoTranslation(50);
      refreshTranslationPackStatus();
      setStatus(`Imported ${written.toLocaleString()} ${languageName(selection.language)} translations`);
      return written;
    } catch (error) {
      if (!activated) await deleteTranslationPackEntries(packId).catch(() => null);
      throw error;
    }
  }

  function buildGoogleBulkBlocks(entries, providerConfig) {
    const maximumItems = Math.max(1, Number(providerConfig.bulkMaxItems) || 1);
    const maximumSize = Math.max(64, Number(providerConfig.contextLimit) || core.GOOGLE_MAX_CHARS);
    const blocks = [];
    let block = [];
    for (const entry of entries) {
      const candidate = block.concat(entry);
      const contextSource = core.buildContextSource(candidate.map((item) => item.source));
      const candidateFits = candidate.length <= maximumItems
        && contextSource.length <= maximumSize
        && core.utf8Length(contextSource) <= maximumSize;
      if (block.length && !candidateFits) {
        blocks.push(block);
        block = [entry];
      } else {
        block = candidate;
      }
    }
    if (block.length) blocks.push(block);
    return blocks;
  }

  function reducedGoogleBulkBlockSize(currentSize, blockLength, error) {
    const current = Math.max(1, Number(currentSize) || 1);
    const length = Math.max(1, Number(blockLength) || 1);
    if (length < 3) return current;
    const acceptedCount = Array.isArray(error && error.acceptedEntries)
      ? error.acceptedEntries.length : 0;
    return acceptedCount > 0
      ? Math.max(3, current - 2)
      : Math.max(3, Math.ceil(Math.min(current, length) / 2));
  }

  function googleBulkFormatError(message, code) {
    const error = new Error(message);
    error.code = code || "markup_format_invalid";
    return error;
  }

  async function saveGoogleBulkTranslations(entries, translations, language, provider) {
    if (!Array.isArray(translations) || translations.length !== entries.length) {
      throw googleBulkFormatError("Google returned an incomplete translation block");
    }
    const acceptedEntries = [];
    const rejectedEntries = [];
    for (let index = 0; index < entries.length; index += 1) {
      if (!core.translationQualityMatches(entries[index].source, translations[index], language)) {
        rejectedEntries.push(entries[index]);
      } else {
        acceptedEntries.push({ entry: entries[index], translation: translations[index] });
      }
    }
    for (const accepted of acceptedEntries) {
      const source = accepted.entry.source;
      const translated = accepted.translation;
      await cachePut(makeTranslationCacheKey(source, language, provider), translated);
      appendTranslationLog(source, translated, language, provider, false);
      logActivityToBridge(provider, source, translated, false);
      await logTranslationToBridge(provider, language, source, translated, false);
    }
    return {
      acceptedEntries: acceptedEntries.map((accepted) => accepted.entry),
      rejectedEntries
    };
  }

  async function translateGoogleBulkBlock(entries, language, provider, signal, request) {
    const blockOptions = { contextFallback: false, contextualQuality: false };
    if (entries.length === 1) {
      const result = await translateWithProtectedMarkup(
        entries[0].source, language, provider, signal, request, 0, blockOptions
      );
      const saved = await saveGoogleBulkTranslations(entries, [result.text], language, provider);
      if (saved.rejectedEntries.length) {
        const error = googleBulkFormatError(
          "Google lost or duplicated text inside a translation block",
          "translation_quality_invalid"
        );
        error.acceptedEntries = saved.acceptedEntries;
        error.rejectedEntries = saved.rejectedEntries;
        throw error;
      }
      return saved;
    }
    const contextSource = core.buildContextSource(entries.map((entry) => entry.source));
    const result = await translateWithProtectedMarkup(
      contextSource, language, provider, signal, request, 0, blockOptions
    );
    const translations = core.parseContextTranslation(result.text, entries.length);
    if (!translations) throw googleBulkFormatError("Google changed the translation block separators");
    const saved = await saveGoogleBulkTranslations(entries, translations, language, provider);
    if (saved.rejectedEntries.length) {
      const error = googleBulkFormatError(
        "Google lost or duplicated text inside a translation block",
        "translation_quality_invalid"
      );
      error.acceptedEntries = saved.acceptedEntries;
      error.rejectedEntries = saved.rejectedEntries;
      throw error;
    }
    return saved;
  }

  async function translateGoogleBulkLanguage(strings, language, provider, signal, onProgress) {
    const providerConfig = PROVIDERS[provider];
    const wordCounts = strings.map(countTranslationWords);
    const totalWords = wordCounts.reduce((sum, count) => sum + count, 0);
    let done = 0;
    let completedWords = 0;
    let newlyTranslated = 0;
    let failed = 0;
    const failureReasons = new Map();
    const freshEntries = [];
    let nextRequestAt = 0;

    function reportProgress(rateLimitSeconds, force) {
      if (onProgress && (force || done % 5 === 0 || done === strings.length)) {
        onProgress({
          done, completedWords, totalWords, newlyTranslated, failed,
          rateLimitSeconds: rateLimitSeconds || 0
        });
      }
    }

    function recordFailure(error, entries) {
      const reason = describeTranslationFailure(error, provider);
      failed += entries.length;
      failureReasons.set(reason, (failureReasons.get(reason) || 0) + entries.length);
    }

    function complete(entries, translatedCount) {
      done += entries.length;
      completedWords += entries.reduce((sum, entry) => sum + entry.wordCount, 0);
      newlyTranslated += translatedCount;
    }

    async function requestPacedChunk(chunk) {
      const remaining = Math.max(0, nextRequestAt - Date.now());
      if (remaining) await sleep(remaining, signal);
      nextRequestAt = Date.now() + Math.max(0, Number(providerConfig.bulkDelay) || 5000);
      return requestRateLimitedChunk(
        provider, chunk, language, signal,
        (seconds) => reportProgress(seconds, true)
      );
    }

    function isSplittableGoogleBulkFailure(error) {
      return error && (error.code === "markup_format_invalid"
        || error.code === "translation_quality_invalid");
    }

    async function finishAdaptiveGoogleBlock(entries, error) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      const acceptedEntries = Array.isArray(error && error.acceptedEntries)
        ? error.acceptedEntries : [];
      const rejectedEntries = Array.isArray(error && error.rejectedEntries)
        ? error.rejectedEntries : entries;
      if (acceptedEntries.length) {
        complete(acceptedEntries, acceptedEntries.length);
        reportProgress(0, true);
      }
      if (!rejectedEntries.length) return;
      if (!isSplittableGoogleBulkFailure(error) || (entries.length === 1 && rejectedEntries.length === 1)) {
        recordFailure(error, rejectedEntries);
        complete(rejectedEntries, 0);
        console.error(`Google Bulk error for ${rejectedEntries.length} strings (${language}):`, error);
        reportProgress(0, true);
        return;
      }
      if (rejectedEntries.length < entries.length) {
        console.warn(`Google Bulk is retrying only ${rejectedEntries.length} rejected strings from a ${entries.length}-string block`);
        try {
          await translateGoogleBulkBlock(rejectedEntries, language, provider, signal, requestPacedChunk);
          complete(rejectedEntries, rejectedEntries.length);
          reportProgress(0, true);
        } catch (retryError) {
          if (retryError && retryError.name === "AbortError") throw retryError;
          await finishAdaptiveGoogleBlock(rejectedEntries, retryError);
        }
        return;
      }
      const middle = Math.ceil(rejectedEntries.length / 2);
      const parts = [rejectedEntries.slice(0, middle), rejectedEntries.slice(middle)];
      console.warn(`Google Bulk is splitting a rejected ${rejectedEntries.length}-string block into smaller blocks`);
      for (const part of parts) {
        try {
          await translateGoogleBulkBlock(part, language, provider, signal, requestPacedChunk);
          complete(part, part.length);
          reportProgress(0, true);
        } catch (partError) {
          if (partError && partError.name === "AbortError") throw partError;
          await finishAdaptiveGoogleBlock(part, partError);
        }
      }
    }

    for (let index = 0; index < strings.length; index += 1) {
      if (signal.aborted) break;
      const entry = { source: strings[index], wordCount: wordCounts[index] };
      try {
        const result = await translateText(entry.source, language, provider, signal, false, true);
        if (result.skipped) {
          freshEntries.push(entry);
          continue;
        }
      } catch (error) {
        if (error && error.name === "AbortError") break;
        recordFailure(error, [entry]);
        console.error(`Bulk cache lookup error for "${entry.source}" (${language}):`, error);
      }
      complete([entry], 0);
      reportProgress(0, false);
    }

    const pendingBlocks = buildGoogleBulkBlocks(freshEntries, providerConfig);
    const maximumAdaptiveBlockSize = Math.max(1, Number(providerConfig.bulkMaxItems) || 1);
    let adaptiveBlockSize = maximumAdaptiveBlockSize;
    let consecutiveCleanBlocks = 0;
    const consecutiveFailureLimit = Math.max(
      1, Number(providerConfig.bulkConsecutiveFailureLimit) || 3
    );
    let consecutiveFullBlockFailures = 0;
    while (pendingBlocks.length) {
      if (signal.aborted) break;
      const pendingBlock = pendingBlocks.shift();
      const block = pendingBlock.length > adaptiveBlockSize
        ? pendingBlock.slice(0, adaptiveBlockSize) : pendingBlock;
      if (pendingBlock.length > block.length) pendingBlocks.unshift(pendingBlock.slice(block.length));
      try {
        await translateGoogleBulkBlock(block, language, provider, signal, requestPacedChunk);
        consecutiveFullBlockFailures = 0;
        consecutiveCleanBlocks += 1;
        if (adaptiveBlockSize < maximumAdaptiveBlockSize && consecutiveCleanBlocks >= 4) {
          const previousSize = adaptiveBlockSize;
          adaptiveBlockSize = Math.min(maximumAdaptiveBlockSize, adaptiveBlockSize + 2);
          consecutiveCleanBlocks = 0;
          console.info(`Google Bulk increased clean block size from ${previousSize} to ${adaptiveBlockSize}`);
        }
        complete(block, block.length);
        reportProgress(0, true);
      } catch (error) {
        if (error && error.name === "AbortError") break;
        consecutiveCleanBlocks = 0;
        const reducedBlockSize = reducedGoogleBulkBlockSize(adaptiveBlockSize, block.length, error);
        if (reducedBlockSize < adaptiveBlockSize) {
          console.warn(`Google Bulk reduced new block size from ${adaptiveBlockSize} to ${reducedBlockSize}`);
          adaptiveBlockSize = reducedBlockSize;
        }
        const translatedBeforeFallback = newlyTranslated;
        const failedBeforeFallback = failed;
        await finishAdaptiveGoogleBlock(block, error);
        const fallbackTranslated = newlyTranslated - translatedBeforeFallback;
        const fallbackFailed = failed - failedBeforeFallback;
        const blockFailedAfterFallback = fallbackTranslated === 0 && fallbackFailed >= block.length;
        consecutiveFullBlockFailures = blockFailedAfterFallback
          ? consecutiveFullBlockFailures + 1 : 0;
        if (consecutiveFullBlockFailures >= consecutiveFailureLimit) {
          const stopError = new Error(
            `Google Bulk stopped after ${consecutiveFailureLimit} consecutive blocks failed after fallback. `
            + "Completed translations were saved; run it again or choose another provider."
          );
          stopError.code = "google_bulk_block_failures";
          throw stopError;
        }
      }
    }
    return { done, completedWords, totalWords, newlyTranslated, failed, failureReasons };
  }

  async function translateBulkLanguage(strings, language, provider, signal, onProgress) {
    if (provider === "google") {
      return translateGoogleBulkLanguage(strings, language, provider, signal, onProgress);
    }
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
        bulkButton.textContent = "Interrupting…";
        bulkButton.disabled = true;
        abortActiveOperation("Interrupt translation was pressed");
      } else {
        abortActiveOperation("cancelled by starting bulk translation");
      }
      return;
    }
    if (bulkPreparing) return;
    bulkPreparing = true;
    let keepWorkspaceOpen = false;
    setBulkButtonWorking("Starting…");
    try {
      await new Promise((resolve) => {
        let settled = false;
        const finish = () => { if (!settled) { settled = true; resolve(); } };
        requestAnimationFrame(finish);
        setTimeout(finish, 100);
      });
      if (!(await ensureTranslationProviderReady("bulk"))) return;

      running = true;
      activeOperation = "bulk";
      activeAbortReason = "";
      abortController = new AbortController();
      setBulkUiBusy(true);
      clearTranslationLog();
      setBulkButtonWorking(INTERRUPT_TRANSLATION_LABEL);
      setStatus("Words: 0/0 · Time left: calculating…");
      const payload = await requestLocalHelper(`/v1/game/strings?gameId=${game.id}`, { signal: abortController.signal });
      if (!payload || !Array.isArray(payload.strings)) throw new Error("Could not extract strings");

      const strings = payload.strings.filter((source) => core.hasTranslatableText(source));
      if (!strings.length) {
        setStatus("No strings found in game assets");
        return;
      }

      const language = settings.language;
      const provider = settings.provider;
      let etaTracker = null;
      const result = await translateBulkLanguage(
        strings, language, provider, abortController.signal,
        ({ done, completedWords, totalWords, newlyTranslated, rateLimitSeconds }) => {
          if (!etaTracker) etaTracker = createTranslationEtaTracker();
          if (rateLimitSeconds > 0) {
            etaTracker.pause();
            setStatus(translationProgressText(
              completedWords, totalWords, etaTracker.current(), rateLimitSeconds, provider
            ));
            return;
          }
          const remainingJobs = Math.max(0, strings.length - done);
          setStatus(translationProgressText(
            completedWords, totalWords,
            etaTracker.update(newlyTranslated, newlyTranslated + remainingJobs), 0, provider
          ));
        }
      );
      const { done, newlyTranslated, failed, failureReasons } = result;

      if (abortController.signal.aborted) {
        keepWorkspaceOpen = true;
        setStatus(`Bulk stopped at ${done}/${strings.length}: ${activeAbortReason || "unknown cancellation reason"}`);
      } else if (failed > 0) {
        keepWorkspaceOpen = true;
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
      keepWorkspaceOpen = panel.classList.contains("bulkBusy");
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
      if (keepWorkspaceOpen && panel.classList.contains("bulkBusy")) setBulkUiStopped();
      else setBulkUiBusy(false);
      setBulkButtonIdle();
      refreshCacheStats();
    }
  }

  async function translateTestPhraseAllLanguages() {
    if (running) {
      if (activeOperation === "test-phrase") {
        testPhraseButton.textContent = "Interrupting…";
        testPhraseButton.disabled = true;
        abortActiveOperation("Interrupt translation was pressed");
      }
      return;
    }
    if (bulkPreparing) return;
    bulkPreparing = true;
    let keepWorkspaceOpen = false;
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
      if (!(await ensureTranslationProviderReady("bulk"))) return;
      const targets = languagesForProvider(provider).filter(([code]) => providerConfig.supportsLanguage(code));
      if (!targets.length) throw new Error("Selected service has no available target languages");
      if (!confirm(
        `Translate the current OMORI test phrase into ${targets.length} languages using ${providerConfig.label}? `
        + "Existing cached languages will be skipped."
        + (provider === "google" ? " Google processes one language every second and may pause after a temporary block." : "")
      )) {
        setStatus("Test phrase translation cancelled before start");
        return;
      }

      running = true;
      activeOperation = "test-phrase";
      activeAbortReason = "";
      abortController = new AbortController();
      setBulkUiBusy(true);
      clearTranslationLog();
      setTestPhraseButtonWorking(INTERRUPT_TRANSLATION_LABEL);
      const signal = abortController.signal;
      const phraseWords = countTranslationWords(LANGUAGE_TEST_PHRASE_SOURCE);
      const totalWords = phraseWords * targets.length;
      const etaTracker = createTranslationEtaTracker();
      let nextIndex = 0;
      let done = 0;
      let cached = 0;
      let created = 0;
      let failed = 0;
      const failureReasons = new Map();

      async function worker() {
        while (!signal.aborted) {
          const index = nextIndex;
          nextIndex += 1;
          if (index >= targets.length) return;
          const [language] = targets[index];
          const key = makeTranslationCacheKey(LANGUAGE_TEST_PHRASE_SOURCE, language, provider);
          try {
            let existing = await importedPackGet(LANGUAGE_TEST_PHRASE_SOURCE, language);
            const existingImported = !!existing;
            if (!existing) existing = await cacheGet(key);
            if (existing && !core.protectedMarkupLayoutMatches(LANGUAGE_TEST_PHRASE_SOURCE, existing)) existing = null;
            if (existing) {
              cached += 1;
              appendTranslationLog(LANGUAGE_TEST_PHRASE_SOURCE, existing, language, existingImported ? "Imported translation" : provider, true);
              if (!existingImported) await logTranslationToBridge(provider, language, LANGUAGE_TEST_PHRASE_SOURCE, existing, true);
            } else {
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
                      done * phraseWords, totalWords, etaTracker.current(), seconds, provider
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
            etaTracker.update(created, created + Math.max(0, targets.length - done)),
            0,
            provider
          ));
        }
      }

      // Reliability matters more than speed here: 249 concurrent probe calls
      // trigger public-service burst limits and turn transient 429s into noise.
      const concurrency = 1;
      await Promise.all(Array.from({ length: concurrency }, () => worker()));
      if (signal.aborted) {
        keepWorkspaceOpen = true;
        setStatus(`Test phrase stopped at ${done}/${targets.length}: ${activeAbortReason || "cancelled by user"}`);
      } else if (failed) {
        keepWorkspaceOpen = true;
        const reasons = Array.from(failureReasons.entries()).map(([reason, count]) => `${reason} (${count})`).join("; ");
        setStatus(`Test phrase incomplete: ${targets.length - failed}/${targets.length} ready · ${reasons}`);
      } else {
        await reloadSelectedLanguageCache(false);
        setStatus(`Test phrase ready in ${targets.length} languages · ${created} new · ${cached} cached`);
      }
    } catch (error) {
      keepWorkspaceOpen = panel.classList.contains("bulkBusy");
      setStatus(error && error.name === "AbortError"
        ? `Test phrase stopped: ${activeAbortReason || "cancelled by user"}`
        : (error.message || "Test phrase translation failed"));
    } finally {
      bulkPreparing = false;
      running = false;
      abortController = null;
      activeOperation = null;
      activeAbortReason = "";
      if (keepWorkspaceOpen && panel.classList.contains("bulkBusy")) setBulkUiStopped();
      else setBulkUiBusy(false);
      setTestPhraseButtonIdle();
      refreshCacheStats();
    }
  }

  async function deleteAllTranslatorData() {
    if (!LOCAL_BRIDGE) {
      throw new Error(`Factory reset requires the local helper. Restart the game through ${PRODUCT_NAME}.`);
    }
    const credentialScopes = Array.from(new Set(
      Object.values(OPENAI_COMPATIBLE_PRESETS).map((preset) => preset.baseURL).filter(Boolean)
        .concat(settings.openAICompatibleBaseURL ? [settings.openAICompatibleBaseURL] : [])
    ));
    await requestLocalHelper("/v1/reset", {
      body: { accepted: true, openAIBaseURLs: credentialScopes }
    });
    invalidateAppliedTranslations();
    await clearAllCache();
    await clearAllTranslationPacks();
    clearTimeout(cacheMetadataSaveTimer);
    cacheMetadataSaveTimer = 0;
    const storagePrefix = `${game.storageNamespace}.`;
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key && key.startsWith(storagePrefix)) localStorage.removeItem(key);
    }
    clearCompletedScreenTranslationQueue();
    pendingAdapterTexts.clear();
    pendingTranslationRoots.clear();
    lastFailedJobs = [];
    lastFailedJobsAllowNetwork = false;
    clearTranslationLog();
    geminiStatus = null;
    lmStudioStatus = null;
    openAICompatibleStatus = null;
    settings = Object.assign({}, defaults);
    settingsGeneration += 1;
    populateLanguageOptions(settings.provider, settings.language);
    languageSelect.value = settings.language;
    providerSelect.value = settings.provider;
    updateProviderHint();
    updateModeButton();
    updateTranslationScopeControls();
    if (typeof adapter.onTranslationScopeChanged === "function") {
      try { adapter.onTranslationScopeChanged(settings.translationScope); } catch (_) {}
    }
    if (typeof adapter.onModeChanged === "function") {
      try { adapter.onModeChanged(settings.mode); } catch (_) {}
    }
    await refreshCacheStats();
    refreshTranslationPackStatus();
    setStatus("Factory reset complete · restart the translator");
  }

  const host = document.createElement("div");
  host.id = `vnrevival-translator-${game.id}`;
  host.style.cssText = "position:fixed!important;z-index:9999999!important;pointer-events:auto!important;";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = runtimePanel.render({
    productName: PRODUCT_NAME,
    version: VERSION,
    interruptTranslationLabel: INTERRUPT_TRANSLATION_LABEL,
    openCodeGoReferralUrl: OPENCODE_GO_REFERRAL_URL,
    siteUrl: SITE_URL,
    siteName: SITE_NAME
  });
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
  const storyTranslationScopeButton = shadow.querySelector(".storyTranslationScope");
  const fullTranslationScopeButton = shadow.querySelector(".fullTranslationScope");
  const screenTranslationScopeButton = shadow.querySelector(".screenTranslationScope");
  const screenActionRow = shadow.querySelector(".screenActionRow");
  const screenTranslateButton = shadow.querySelector(".screenTranslate");
  const screenAutoCheckbox = shadow.querySelector(".screenAuto");
  const translationScopeHint = shadow.querySelector(".scopeHint");
  const retryButton = shadow.querySelector(".retry");
  const statusElement = shadow.querySelector(".status");
  const updateStatusElement = shadow.querySelector(".updateStatus");
  const updateChangesElement = shadow.querySelector(".updateChanges");
  const languageSelect = shadow.querySelector(".language");
  const providerSelect = shadow.querySelector(".provider");
  const providerHint = shadow.querySelector(".providerHint");
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
  const removeTranslationPackButton = shadow.querySelector(".removeTranslationPack");
  const translationPackStatusElement = shadow.querySelector(".translationPackStatus");
  const exportButton = shadow.querySelector(".exportCache");
  const bulkButton = shadow.querySelector(".bulkTranslate");
  const testPhraseButton = shadow.querySelector(".testPhraseTranslate");
  const bulkCancelButton = shadow.querySelector(".bulkCancel");
  const translationLogBox = shadow.querySelector(".translationLogBox");
  const translationLogEntries = shadow.querySelector(".translationLogEntries");
  const translationLogEmpty = shadow.querySelector(".translationLogEmpty");
  const translationLogNote = shadow.querySelector(".translationLogNote");
  const translationLogHoldButton = shadow.querySelector(".translationLogHold");
  const translationLogViewButton = shadow.querySelector(".translationLogView");
  const translationLogSaveButton = shadow.querySelector(".translationLogSave");
  const translationLogClearButton = shadow.querySelector(".translationLogClear");
  const cacheFileInput = shadow.querySelector(".cacheFile");
  const cacheStatsElement = shadow.querySelector(".cacheStats");
  const compatibilityBox = shadow.querySelector(".compat");
  const projectSiteLink = shadow.querySelector(".projectSite");
  const packModal = shadow.querySelector(".packModal");
  const packDialogFile = shadow.querySelector(".packDialogFile");
  const packLanguageSelect = shadow.querySelector(".packLanguage");
  const packProviderRow = shadow.querySelector(".packProviderRow");
  const packProviderSelect = shadow.querySelector(".packProvider");
  const packSummaryElement = shadow.querySelector(".packSummary");
  const packCancelButton = shadow.querySelector(".packCancel");
  const packConfirmButton = shadow.querySelector(".packConfirm");
  const bulkControlState = new Map();
  let pendingPackInspection = null;
  let pendingPackDialogResolve = null;
  let translationLogScrollPaused = false;
  let translationLogPausedViewport = null;
  let bulkWorkspaceAwaitingDismissal = false;

  function setBulkButtonWorking(label) {
    runtimeUI.setButtonState(bulkButton, { working: true, label, disabled: false });
  }

  function setBulkButtonIdle() {
    runtimeUI.setButtonState(bulkButton, {
      working: false, label: "Bulk Translate All Assets", disabled: false
    });
  }

  function setScreenButtonWorking() {
    runtimeUI.setButtonState(screenTranslateButton, {
      working: true, label: SCREEN_TRANSLATION_CANCEL_LABEL, disabled: false
    });
  }

  function setScreenButtonIdle() {
    runtimeUI.setButtonState(screenTranslateButton, {
      working: false, label: SCREEN_TRANSLATION_LABEL, disabled: false
    });
  }

  function setTestPhraseButtonWorking(label) {
    runtimeUI.setButtonState(testPhraseButton, { working: true, label, disabled: false });
  }

  function setTestPhraseButtonIdle() {
    runtimeUI.setButtonState(testPhraseButton, {
      working: false, label: "Test Phrase · All Languages", disabled: false
    });
  }

  function setResetButtonWorking() {
    runtimeUI.setButtonState(resetButton, { working: true, label: "Resetting…", disabled: true });
  }

  function setResetButtonIdle() {
    runtimeUI.setButtonState(resetButton, { working: false, label: "Reset all data", disabled: false });
  }

  function setImportButtonWorking(label) {
    runtimeUI.setButtonState(importButton, { working: true, label, disabled: true });
  }

  function setImportButtonIdle() {
    runtimeUI.setButtonState(importButton, {
      working: false, label: "Load translation file", disabled: false
    });
  }

  function refreshTranslationPackStatus() {
    if (!translationPackStatusElement || !removeTranslationPackButton) return;
    const pack = activeTranslationPack(settings.language);
    if (!pack) {
      translationPackStatusElement.textContent = `No imported translation for ${languageName(settings.language)}.`;
      removeTranslationPackButton.hidden = true;
      return;
    }
    translationPackStatusElement.textContent = `Imported ${languageName(settings.language)} · ${pack.records.toLocaleString()} translations · ${pack.provider}${pack.fileName ? ` · ${pack.fileName}` : ""}`;
    removeTranslationPackButton.hidden = false;
  }

  function currentPackDialogSelection() {
    if (!pendingPackInspection) return null;
    return pendingPackInspection.selections.find((selection) =>
      selection.language === packLanguageSelect.value
      && translationSelectionKey(selection.language, selection.provider, selection.variant) === packProviderSelect.value
    ) || null;
  }

  function refreshPackDialogSelection() {
    if (!pendingPackInspection) return;
    const language = packLanguageSelect.value;
    const selections = pendingPackInspection.selections.filter((selection) => selection.language === language);
    packProviderSelect.replaceChildren();
    for (const selection of selections) {
      const option = document.createElement("option");
      option.value = translationSelectionKey(selection.language, selection.provider, selection.variant);
      option.textContent = providerName(selection.provider, selection.variant);
      packProviderSelect.appendChild(option);
    }
    packProviderRow.hidden = selections.length <= 1;
    const selection = currentPackDialogSelection() || selections[0];
    if (!selection) return;
    packProviderSelect.value = translationSelectionKey(selection.language, selection.provider, selection.variant);
    refreshPackDialogSummary();
  }

  function refreshPackDialogSummary() {
    const selection = currentPackDialogSelection();
    if (!selection || !pendingPackInspection) return;
    const existing = activeTranslationPack(selection.language);
    const dateText = pendingPackInspection.createdAt
      ? ` · created ${new Date(pendingPackInspection.createdAt).toLocaleString()}` : "";
    packSummaryElement.textContent = `${GAME_TITLE} · ${languageName(selection.language)} · ${selection.count.toLocaleString()} translations${dateText}${existing ? ` · replaces the active ${languageName(selection.language)} imported pack` : ""}`;
    packConfirmButton.textContent = `Import ${languageName(selection.language)}`;
  }

  function closePackDialog(selection) {
    packModal.hidden = true;
    pendingPackInspection = null;
    const resolve = pendingPackDialogResolve;
    pendingPackDialogResolve = null;
    if (resolve) resolve(selection || null);
  }

  function showPackImportDialog(inspection) {
    pendingPackInspection = inspection;
    packDialogFile.textContent = inspection.fileName;
    packLanguageSelect.replaceChildren();
    const languages = Array.from(new Set(inspection.selections.map((selection) => selection.language)));
    for (const language of languages) {
      const option = document.createElement("option");
      option.value = language;
      option.textContent = languageName(language);
      packLanguageSelect.appendChild(option);
    }
    packLanguageSelect.value = languages.includes(settings.language) ? settings.language : languages[0];
    refreshPackDialogSelection();
    packModal.hidden = false;
    return new Promise((resolve) => { pendingPackDialogResolve = resolve; });
  }

  async function loadTranslationFile(file) {
    if (!file) return;
    setImportButtonWorking("Checking file…");
    try {
      setStatus("Checking translation file…");
      const inspection = await inspectTranslationFile(file);
      setImportButtonIdle();
      const selection = await showPackImportDialog(inspection);
      if (!selection) {
        setStatus("Translation import cancelled");
        return;
      }
      setImportButtonWorking("Importing…");
      await installTranslationPack(inspection, selection);
    } catch (error) {
      setStatus(error && error.message ? error.message : "Invalid translation file");
    } finally {
      setImportButtonIdle();
    }
  }

  async function removeActiveTranslationPack() {
    const language = settings.language;
    const pack = activeTranslationPack(language);
    if (!pack || !confirm(`Remove the imported ${languageName(language)} translation? Your own provider cache will remain.`)) return;
    removeTranslationPackButton.disabled = true;
    try {
      await deleteTranslationPackEntries(pack.packId);
      delete translationPackMetadata.languages[language];
      saveTranslationPackMetadata();
      await preloadImportedPackCache(language);
      if (populateLanguageOptions(settings.provider, language)) persistControlSettings();
      invalidateAppliedTranslations();
      refreshTranslationPackStatus();
      scheduleAutoTranslation(50);
      setStatus(`Imported ${languageName(language)} translation removed`);
    } catch (error) {
      setStatus(error && error.message ? error.message : "Could not remove imported translation");
    } finally {
      removeTranslationPackButton.disabled = false;
    }
  }

  function setBulkUiBusy(busy) {
    if (busy) bulkWorkspaceAwaitingDismissal = false;
    panel.classList.toggle("bulkBusy", busy);
    host.classList.toggle("bulkBusyHost", busy);
    const cancelButton = activeOperation === "test-phrase" ? testPhraseButton : bulkButton;
    for (const row of shadow.querySelectorAll(".bulkActionRow")) {
      row.classList.toggle("activeBulkAction", busy && row.contains(cancelButton));
    }
    if (busy) translationLogBox.open = true;
    for (const control of shadow.querySelectorAll("button, select, input")) {
      if (busy && (control === cancelButton || control === bulkCancelButton || control === translationLogHoldButton)) continue;
      if (busy) {
        if (!bulkControlState.has(control)) bulkControlState.set(control, control.disabled);
        control.disabled = true;
      } else if (bulkControlState.has(control)) {
        control.disabled = bulkControlState.get(control);
        bulkControlState.delete(control);
      }
    }
    if (busy) {
      cancelButton.disabled = false;
      translationLogHoldButton.disabled = false;
      bulkCancelButton.textContent = INTERRUPT_TRANSLATION_LABEL;
      bulkCancelButton.style.background = cancelButton.style.background;
      bulkCancelButton.classList.add("working");
      bulkCancelButton.disabled = false;
    } else {
      bulkCancelButton.textContent = INTERRUPT_TRANSLATION_LABEL;
      bulkCancelButton.style.removeProperty("background");
      bulkCancelButton.classList.remove("working");
      bulkCancelButton.disabled = false;
    }
  }

  function setBulkUiStopped() {
    bulkWorkspaceAwaitingDismissal = true;
    bulkCancelButton.textContent = "Back to translator";
    bulkCancelButton.style.removeProperty("background");
    bulkCancelButton.classList.remove("working");
    bulkCancelButton.disabled = false;
    translationLogHoldButton.disabled = false;
  }

  for (const provider of PROVIDER_LIST) {
    const option = document.createElement("option");
    option.value = provider.id;
    option.textContent = provider.label;
    providerSelect.appendChild(option);
  }
  providerSelect.value = settings.provider;
  populateLanguageOptions(settings.provider, settings.language);
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

  function setStatus(text) {
    if (bulkWorkspaceAwaitingDismissal) return;
    statusElement.textContent = text;
  }
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
  function setTranslationLogScrollPaused(paused) {
    translationLogScrollPaused = paused === true;
    translationLogPausedViewport = translationLogScrollPaused ? captureTranslationLogViewport() : null;
    translationLogHoldButton.setAttribute("aria-pressed", translationLogScrollPaused ? "true" : "false");
    translationLogHoldButton.textContent = translationLogScrollPaused ? "Resume scroll" : "Stop scroll";
    if (!translationLogScrollPaused) {
      pruneTranslationLogEntries(null);
      translationLogEntries.scrollTop = 0;
    }
  }
  function captureTranslationLogViewport() {
    const viewportRect = translationLogEntries.getBoundingClientRect();
    const anchor = Array.from(translationLogEntries.children).find((child) =>
      child.getBoundingClientRect().bottom > viewportRect.top
    ) || null;
    return {
      anchor,
      offset: anchor ? anchor.getBoundingClientRect().top - viewportRect.top : 0,
      bottomDistance: translationLogEntries.scrollHeight - translationLogEntries.scrollTop
    };
  }
  function restoreTranslationLogViewport(viewport) {
    if (!viewport) {
      translationLogEntries.scrollTop = 0;
      return;
    }
    if (viewport.anchor && viewport.anchor.isConnected) {
      const viewportTop = translationLogEntries.getBoundingClientRect().top;
      const currentOffset = viewport.anchor.getBoundingClientRect().top - viewportTop;
      translationLogEntries.scrollTop += currentOffset - viewport.offset;
      return;
    }
    translationLogEntries.scrollTop = Math.max(0, translationLogEntries.scrollHeight - viewport.bottomDistance);
  }
  function pruneTranslationLogEntries(viewport) {
    const children = Array.from(translationLogEntries.children);
    const anchorIndex = viewport && viewport.anchor && viewport.anchor.isConnected
      ? children.indexOf(viewport.anchor) : -1;
    if (!translationLogScrollPaused || anchorIndex < 0) {
      while (translationLogEntries.children.length > TRANSLATION_LOG_LIMIT) {
        translationLogEntries.lastElementChild.remove();
      }
      return;
    }
    const retained = new Set(children.slice(0, TRANSLATION_LOG_LIMIT).concat(
      children.slice(anchorIndex, anchorIndex + TRANSLATION_LOG_LIMIT)
    ));
    for (const child of children) {
      if (!retained.has(child)) child.remove();
    }
  }
  function appendTranslationLog(source, translation, language, provider, cached) {
    if (!translationLogEntries || !source || !translation) return;
    const viewport = translationLogScrollPaused ? translationLogPausedViewport : null;
    const entry = createTranslationLogEntry(source, translation, language, provider, new Date().toLocaleString(), cached === true);
    translationLogEntries.prepend(entry);
    pruneTranslationLogEntries(viewport);
    translationLogEmpty.hidden = true;
    translationLogNote.textContent = "Live · saved without duplicates · newest first";
    translationLogBox.open = true;
    restoreTranslationLogViewport(viewport);
    if (translationLogScrollPaused && (!viewport || !viewport.anchor || !viewport.anchor.isConnected)) {
      translationLogPausedViewport = captureTranslationLogViewport();
    }
  }
  function clearTranslationLog() {
    setTranslationLogScrollPaused(false);
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
  function updateTranslationScopeControls() {
    const scope = settings.translationScope;
    const story = scope === "story";
    const full = scope === "full";
    const screen = scope === "screen";
    storyTranslationScopeButton.classList.toggle("active", story);
    fullTranslationScopeButton.classList.toggle("active", full);
    screenTranslationScopeButton.classList.toggle("active", screen);
    storyTranslationScopeButton.setAttribute("aria-pressed", String(story));
    fullTranslationScopeButton.setAttribute("aria-pressed", String(full));
    screenTranslationScopeButton.setAttribute("aria-pressed", String(screen));
    screenActionRow.hidden = !screen;
    screenAutoCheckbox.checked = settings.autoScreenTranslation;
    translationScopeHint.textContent = screen
      ? "Manual: the button translates only text visible right now. Game assets are not scanned."
      : full
      ? "Experimental: cached translations are applied to menus and other game windows as well as dialogue."
      : "Stable: only dialogue windows, speaker names, and dialogue choices are translated.";
  }
  function setTranslationScope(scope) {
    const nextScope = ["story", "full", "screen"].includes(scope) ? scope : "story";
    if (settings.translationScope === nextScope) return;
    abortActiveOperation("translation mode changed");
    settingsGeneration += 1;
    settings.translationScope = nextScope;
    if (nextScope !== "screen") clearCompletedScreenTranslationQueue();
    if (nextScope === "screen") invalidateAppliedTranslations();
    saveSettings();
    updateTranslationScopeControls();
    if (typeof adapter.onTranslationScopeChanged === "function") {
      try { adapter.onTranslationScopeChanged(nextScope); } catch (_) {}
    }
    setStatus(nextScope === "screen"
      ? "Screen Translation enabled · press Translate current screen"
      : nextScope === "full"
      ? "Full Translation enabled · experimental menu translation"
      : "Story Translation enabled · dialogue windows only");
    scheduleAutoTranslation(50);
  }
  function updateCollapsedState() {
    panel.classList.toggle("collapsed", settings.collapsed);
    collapseButton.textContent = settings.collapsed ? "+" : "−";
    collapseButton.title = settings.collapsed ? "Expand translator" : "Collapse translator";
    collapseButton.setAttribute("aria-label", collapseButton.title);
    collapseButton.setAttribute("aria-expanded", String(!settings.collapsed));
  }
  function providerUsesGemini(provider) { return !!(PROVIDERS[provider] && PROVIDERS[provider].credentialManager === "gemini"); }
  function languagesForProvider(provider) {
    const selectedProvider = PROVIDERS[provider];
    if (!selectedProvider) return [];
    return LANGUAGES.filter(([code]) => activeTranslationPack(code)
      || selectedProvider.supportsLanguage(code));
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
    languageSelect.disabled = geminiBusy || lmStudioBusy || openAICompatibleBusy || !available.length;
    return languageSelect.value !== previous;
  }
  function selectedLanguageName() {
    return languageSelect.options[languageSelect.selectedIndex]
      ? languageSelect.options[languageSelect.selectedIndex].textContent
      : languageSelect.value;
  }
  async function reloadSelectedLanguageCache(announce) {
    const generation = settingsGeneration;
    const language = settings.language;
    const provider = settings.provider;
    const languageName = selectedLanguageName();
    memoryCache.clear();
    fuzzyMemoryCache.clear();
    if (announce) setStatus(`Loading ${languageName} cache…`);
    const [loaded] = await Promise.all([preloadMemoryCache(), preloadImportedPackCache(language)]);
    if (generation !== settingsGeneration || language !== settings.language || provider !== settings.provider) {
      return false;
    }
    if (typeof adapter.onLanguageChanged === "function") {
      adapter.onLanguageChanged(language, provider);
    }
    refreshTranslationPackStatus();
    scheduleAutoTranslation(50);
    if (announce) setStatus(`Ready: ${languageName} cache loaded (${loaded.toLocaleString()})`);
    return true;
  }
  function persistControlSettings() {
    const languageChanged = settings.language !== languageSelect.value;
    const providerChanged = settings.provider !== providerSelect.value;
    settings.language = languageSelect.value;
    settings.provider = providerSelect.value;
    settings.autoTranslate = AUTO_APPLY_TRANSLATIONS;
    if (languageChanged || providerChanged) {
      settingsGeneration += 1;
      clearCompletedScreenTranslationQueue();
      if (languageChanged && providerChanged) abortActiveOperation("target language and translation service changed");
      else if (languageChanged) abortActiveOperation("target language changed");
      else abortActiveOperation("translation service changed");
      invalidateAppliedTranslations();
      reloadSelectedLanguageCache(true);
    }
    saveSettings();
    scheduleAutoTranslation(50);
  }
  function refreshProviderControlsBusy() {
    const busy = geminiBusy || lmStudioBusy || openAICompatibleBusy;
    languageSelect.disabled = busy || !languageSelect.options.length;
    providerSelect.disabled = busy;
  }
  function setGeminiBusy(busy) {
    geminiBusy = busy;
    runtimeUI.setDisabled([geminiKeyInput, geminiSaveButton, geminiRemoveButton], busy || !LOCAL_BRIDGE);
    refreshProviderControlsBusy();
  }
  function setLMStudioBusy(busy) {
    lmStudioBusy = busy;
    lmStudioModelSelect.disabled = busy || !lmStudioStatus || !lmStudioStatus.available
      || !Array.isArray(lmStudioStatus.models) || !lmStudioStatus.models.length;
    lmStudioRefreshButton.disabled = busy || !LOCAL_BRIDGE;
    refreshProviderControlsBusy();
  }
  function setOpenAICompatibleBusy(busy) {
    openAICompatibleBusy = busy;
    runtimeUI.setDisabled([
      openAICompatiblePresetSelect, openAICompatibleBaseURLInput, openAICompatibleModelInput,
      openAICompatibleKeyInput, openAICompatibleSaveButton, openAICompatibleRefreshButton,
      openAICompatibleRemoveButton
    ], busy || !LOCAL_BRIDGE);
    if (!busy && openAICompatiblePresetSelect.value !== "custom") openAICompatibleBaseURLInput.disabled = true;
    refreshProviderControlsBusy();
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
  function updateProviderHint() {
    const selectedProvider = PROVIDERS[providerSelect.value];
    if (providerUsesGemini(providerSelect.value)) {
      populateLanguageOptions(providerSelect.value, languageSelect.value || settings.language);
      lmStudioBox.hidden = true;
      openAICompatibleBox.hidden = true;
      providerHint.textContent = selectedProvider.hint(languageSelect.options.length);
      refreshGeminiStatus();
    } else if (providerUsesLMStudio(providerSelect.value)) {
      populateLanguageOptions(providerSelect.value, languageSelect.value || settings.language);
      geminiBox.hidden = true;
      openAICompatibleBox.hidden = true;
      providerHint.textContent = selectedProvider.hint(languageSelect.options.length);
      refreshLMStudioStatus();
    } else if (providerUsesOpenAICompatible(providerSelect.value)) {
      populateLanguageOptions(providerSelect.value, languageSelect.value || settings.language);
      geminiBox.hidden = true;
      lmStudioBox.hidden = true;
      providerHint.textContent = selectedProvider.hint(languageSelect.options.length);
      refreshOpenAICompatibleStatus();
    } else {
      populateLanguageOptions(providerSelect.value, languageSelect.value || settings.language);
      geminiBox.hidden = true;
      lmStudioBox.hidden = true;
      openAICompatibleBox.hidden = true;
      providerHint.textContent = selectedProvider ? selectedProvider.hint(languageSelect.options.length) : "";
    }
  }

  updateModeButton();
  updateTranslationScopeControls();
  updateProviderHint();
  refreshCacheStats();
  refreshTranslationPackStatus();
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
  storyTranslationScopeButton.addEventListener("click", () => setTranslationScope("story"));
  fullTranslationScopeButton.addEventListener("click", () => setTranslationScope("full"));
  screenTranslationScopeButton.addEventListener("click", () => setTranslationScope("screen"));
  function triggerScreenTranslation() {
    if (running && activeOperation === "screen") {
      abortActiveOperation("cancelled by user");
      return;
    }
    if (settings.translationScope !== "screen") return;
    if (settings.mode !== "translated") showTranslations();
    void translateScreen(true);
  }
  screenTranslateButton.addEventListener("click", triggerScreenTranslation);
  screenAutoCheckbox.addEventListener("change", () => {
    settings.autoScreenTranslation = screenAutoCheckbox.checked;
    saveSettings();
    if (!settings.autoScreenTranslation) {
      clearCompletedScreenTranslationQueue();
      if (activeOperation === "screen-auto") abortActiveOperation("automatic Screen Translation disabled");
      setStatus("Automatic completed-dialogue translation disabled");
      return;
    }
    if (settings.mode !== "translated") showTranslations();
    setStatus("Automatic completed-dialogue translation enabled");
  });
  window.addEventListener("keydown", (event) => {
    const screenShortcut = event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey
      && (event.code === "KeyT" || String(event.key || "").toLowerCase() === "t");
    if (!screenShortcut || event.repeat || settings.translationScope !== "screen") return;
    const path = typeof event.composedPath === "function" ? event.composedPath() : [event.target];
    const origin = path.find((item) => item instanceof Element);
    if (origin && (origin.isContentEditable || origin.matches("input,textarea,select,[contenteditable='true']"))) return;
    event.preventDefault();
    event.stopPropagation();
    triggerScreenTranslation();
  }, true);
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
    refreshTranslationPackStatus();
    setStatus(`Language: ${selectedLanguageName()} (restart recommended)`);
  };
  languageSelect.addEventListener("change", onLanguageChange);
  resetButton.addEventListener("click", async () => {
    if (!confirm(
      "Factory reset permanently deletes all translator caches, imported packs, saved translation history, "
      + "downloaded offline models/runtime, provider API keys, and settings (including the remembered game path). "
      + "OMORI saves and game files are not affected. Continue?"
    )) return;
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
  removeTranslationPackButton.addEventListener("click", () => { void removeActiveTranslationPack(); });
  packLanguageSelect.addEventListener("change", refreshPackDialogSelection);
  packProviderSelect.addEventListener("change", refreshPackDialogSummary);
  packCancelButton.addEventListener("click", () => closePackDialog(null));
  packConfirmButton.addEventListener("click", () => closePackDialog(currentPackDialogSelection()));
  packModal.addEventListener("click", (event) => {
    if (event.target === packModal) closePackDialog(null);
  });
  bulkButton.addEventListener("click", bulkTranslateAll);
  testPhraseButton.addEventListener("click", translateTestPhraseAllLanguages);
  bulkCancelButton.addEventListener("click", () => {
    if (!running || !activeOperation) {
      if (bulkWorkspaceAwaitingDismissal) {
        bulkWorkspaceAwaitingDismissal = false;
        setBulkUiBusy(false);
      }
      return;
    }
    bulkCancelButton.textContent = "Interrupting…";
    bulkCancelButton.disabled = true;
    if (activeOperation === "test-phrase") void translateTestPhraseAllLanguages();
    else void bulkTranslateAll();
  });
  translationLogViewButton.addEventListener("click", viewSavedTranslationLog);
  translationLogSaveButton.addEventListener("click", saveTranslationLog);
  translationLogClearButton.addEventListener("click", clearTranslationLog);
  translationLogHoldButton.addEventListener("click", () => {
    setTranslationLogScrollPaused(!translationLogScrollPaused);
  });
  function rememberManuallyScrolledLogViewport() {
    requestAnimationFrame(() => {
      if (translationLogScrollPaused) translationLogPausedViewport = captureTranslationLogViewport();
    });
  }
  translationLogEntries.addEventListener("wheel", rememberManuallyScrolledLogViewport, { passive: true });
  translationLogEntries.addEventListener("pointerup", rememberManuallyScrolledLogViewport);
  translationLogEntries.addEventListener("touchend", rememberManuallyScrolledLogViewport, { passive: true });
  translationLogEntries.addEventListener("keyup", rememberManuallyScrolledLogViewport);
  cacheFileInput.addEventListener("change", () => {
    if (cacheFileInput.files && cacheFileInput.files[0]) {
      void loadTranslationFile(cacheFileInput.files[0]);
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
      if (activeOperation !== "bulk" && activeOperation !== "test-phrase") {
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
    registerCompletedScreenText,
    isAutoScreenTranslationEnabled: () => !!(
      settings.autoScreenTranslation && settings.translationScope === "screen" && settings.mode === "translated"
    ),
    registerAdapterText: (text) => {
      if (settings.mode === "translated" && settings.translationScope !== "screen" && hasSourceText(text)) {
        if (!pendingAdapterTexts.has(text)) {
          pendingAdapterTexts.add(text);
          scheduleAutoTranslation(150);
        }
      }
    },
    getMode: () => settings.mode,
    getTranslationScope: () => settings.translationScope,
    getLanguage: () => settings.language,
    getProvider: () => settings.provider,
    isSourceText: (text) => hasSourceText(text),
    queryMemoryCache: (text) => queryMemoryTranslation(text),
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
  if (typeof adapter.onTranslationScopeChanged === "function") {
    try { adapter.onTranslationScopeChanged(settings.translationScope); } catch (_) {}
  }
  console.info(`[${PRODUCT_NAME} ${VERSION}] loaded for ${GAME_TITLE}`);
  migrateLegacyGoogleSegmentCache()
    .catch((error) => console.error("Could not clear the legacy Google segment cache:", error))
    .then(() => reloadSelectedLanguageCache(false));
})();
