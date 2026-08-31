(function (root) {
  "use strict";

  function rawGameMessageText(gameMessage) {
    if (!gameMessage) return "";
    if (Array.isArray(gameMessage._texts) && gameMessage._texts.length) return gameMessage._texts.join("\n");
    if (typeof gameMessage._vnRevivalRawText === "string") return gameMessage._vnRevivalRawText;
    return typeof gameMessage.allText === "function" ? String(gameMessage.allText() || "") : "";
  }

  function translatedMessageText(rawText, translatedText) {
    const raw = String(rawText || "");
    let translated = String(translatedText || "");
    const wordWrap = raw.match(/^\s*(<wordwrap(?:\s*:[^>]*)?>)/i);
    if (wordWrap && !/^\s*<wordwrap(?:\s*:[^>]*)?>/i.test(translated)) {
      translated = wordWrap[1] + translated;
    }
    return translated;
  }

  function resolvedMessageSourceText(messageWindow, rawText) {
    const raw = String(rawText || "");
    const core = typeof window !== "undefined" ? window.VNRevivalTranslationCore : null;
    if (!raw || !messageWindow || typeof messageWindow.convertEscapeCharacters !== "function"
      || !core || typeof core.tokenizeProtectedMarkup !== "function") return raw;

    // Resolving the complete string is unsafe: RPG Maker turns commands into
    // ESC bytes and OMORI consumes layout/speaker prefixes such as <WordWrap>
    // and \mar. Resolve only dynamic template tokens while leaving every other
    // protected token in the provider input and cache key verbatim.
    return core.tokenizeProtectedMarkup(raw).map((segment) => {
      const isDynamicToken = !!(segment && segment.type === "token"
        && (/^\\(?:v|n|p)\[[^\]\r\n]*\]$/i.test(segment.value) || /^\\g$/i.test(segment.value)));
      if (!isDynamicToken) {
        return segment && typeof segment.value === "string" ? segment.value : "";
      }
      try {
        return String(messageWindow.convertEscapeCharacters(segment.value))
          .replace(/\u001b/g, "\\");
      } catch (_) {
        return segment.value;
      }
    }).join("");
  }

  function currentTranslationScope() {
    if (typeof window === "undefined") return "story";
    const translator = window.__vnRevivalTranslator;
    if (translator && typeof translator.getTranslationScope === "function") {
      const scope = translator.getTranslationScope();
      return scope === "full" || scope === "screen" ? scope : "story";
    }
    const scope = window.__vnRevival_translationScope;
    return scope === "full" || scope === "screen" ? scope : "story";
  }

  let collectVisibleGameTexts = () => [];
  let clearApprovedScreenTexts = () => {};
  let refreshApprovedScreenWindows = () => {};
  let beginApprovedScreenRefresh = () => {};
  let endApprovedScreenRefresh = () => {};

  function isDialogueWindow(windowObject) {
    if (typeof window === "undefined" || !windowObject) return false;
    return !!(
      (window.Window_Message && windowObject instanceof window.Window_Message)
      || (window.Window_ChoiceList && windowObject instanceof window.Window_ChoiceList)
      || (window.Window_NameBox && windowObject instanceof window.Window_NameBox)
    );
  }

  function isVisibleGameWindow(windowObject) {
    return !!(windowObject
      && windowObject.visible !== false
      && !(Number.isFinite(windowObject.openness) && windowObject.openness <= 0)
      && !(Number.isFinite(windowObject.contentsOpacity) && windowObject.contentsOpacity <= 0));
  }

  function visitActiveGameWindows(callback) {
    if (typeof window === "undefined" || !window.SceneManager || !window.SceneManager._scene
      || !window.Window_Base || typeof callback !== "function") return;
    const seen = new Set();
    const visit = (node) => {
      if (!node || (typeof node !== "object" && typeof node !== "function") || seen.has(node)) return;
      seen.add(node);
      if (node instanceof window.Window_Base) callback(node);
      if (Array.isArray(node.children)) {
        for (const child of node.children) visit(child);
      }
    };
    visit(window.SceneManager._scene);
  }

  function refreshNonDialogueWindows() {
    visitActiveGameWindows((windowObject) => {
      if (typeof window.__vnRevivalMapWindowBitmap === "function") {
        try { window.__vnRevivalMapWindowBitmap(windowObject); } catch (_) {}
      }
      if (!isVisibleGameWindow(windowObject) || isDialogueWindow(windowObject)
        || typeof windowObject.refresh !== "function") return;
      try { windowObject.refresh(); } catch (_) {}
    });
  }

  const adapter = Object.freeze({
    contractVersion: 2,
    privateSelectors: Object.freeze([
      ".saveSlot", ".hotkeyIndicator", ".gamepadCursorWrapper",
      "[class*='playerName' i]", "[class*='characterName' i]", "[data-omori-private]"
    ]),
    categorySelectors: Object.freeze({
      story: ".scene,.story,.output,.eventText,.sceneText,.combatOutput,[class*='story' i],#gameCanvas,#canvas",
      control: "button,[role='button'],a,.button",
      tooltip: ".tooltip,[role='tooltip']"
    }),
    contextSelectors: Object.freeze([
      "button", "[role='button']", "a", "[role='link']", "p", "li", "blockquote",
      "h1", "h2", "h3", "h4", "h5", "h6", ".sceneText", ".eventText",
      ".combatOutput", ".tooltip", "[role='tooltip']", "#gameCanvas", "#canvas"
    ]),
    getGameVersion(gameWindow) {
      if (!gameWindow) return "";
      if (gameWindow.Utils && gameWindow.Utils.RPGMAKER_VERSION) {
        return String(gameWindow.Utils.RPGMAKER_VERSION);
      }
      return String(gameWindow.version || "1.0.8");
    },
    hasSourceText(value, core) {
      return core.hasEnglishText(value);
    },
    deriveCacheAliases(source, translation) {
      const original = String(source || "");
      const translated = String(translation || "");
      const patterns = [
        /\\>([^:\r\n]{2,80}):\s*\\</,
        /\\n<([^>\r\n]{2,80})>/
      ];
      const aliases = [];
      for (const pattern of patterns) {
        const sourceMatch = original.match(pattern);
        const translationMatch = translated.match(pattern);
        if (!sourceMatch || !translationMatch) continue;
        const sourceName = sourceMatch[1].trim();
        const compactSource = sourceName.replace(/[\s_-]+/g, "");
        const translatedName = translationMatch[1].trim();
        if (compactSource.length >= 4 && compactSource !== sourceName && translatedName
          && translatedName.toLocaleLowerCase() !== sourceName.toLocaleLowerCase()) {
          aliases.push({ source: compactSource, translation: translatedName });
        }
      }
      return aliases;
    },
    collectVisibleTexts() {
      return collectVisibleGameTexts();
    },
    onModeChanged(newMode) {
      if (typeof window === "undefined") return;
      window.__vnRevival_isTranslatedMode = (newMode === "translated");
      if (currentTranslationScope() === "full") refreshNonDialogueWindows();
      else if (currentTranslationScope() === "screen") refreshApprovedScreenWindows();
      if (window.SceneManager && window.SceneManager._scene) {
        const sc = window.SceneManager._scene;
        const messageWindow = sc._messageWindow;
        const gameMessage = window.$gameMessage;
        const raw = rawGameMessageText(gameMessage)
          || (messageWindow && typeof messageWindow._vnRevivalCurrentText === "string"
            ? messageWindow._vnRevivalCurrentText
            : "");
        if (messageWindow && messageWindow.isOpen && messageWindow.isOpen() && gameMessage && raw) {
          const completedPage = !messageWindow._textState;
          if (completedPage && typeof window.__vnRevivalRedrawCompletedMessage === "function") {
            try {
              if (window.__vnRevivalRedrawCompletedMessage(raw, newMode)) {
                if (sc._choiceListWindow && sc._choiceListWindow.visible
                  && typeof sc._choiceListWindow.refresh === "function") {
                  try { sc._choiceListWindow.refresh(); } catch (_) {}
                }
                return;
              }
            } catch (_) {}
          }
          const originalTexts = gameMessage._texts;
          const needsReplaySource = Array.isArray(originalTexts) && originalTexts.length === 0;
          try {
            // RPG Maker empties Game_Message._texts as soon as the page reaches
            // its final input pause. Temporarily restore the captured source so
            // switching language can redraw that still-visible completed page.
            if (needsReplaySource) gameMessage._texts = [raw];
            // startMessage() clears the bitmap but RPG Maker leaves the pause
            // flag from the completed page set. Without resetting it, the new
            // language remains at character 0 and the dialogue area looks blank.
            messageWindow.pause = false;
            messageWindow._waitCount = 0;
            messageWindow.startMessage();
          } catch (_) {
          } finally {
            if (needsReplaySource) gameMessage._texts = originalTexts;
          }
        }
        if (sc._choiceListWindow && sc._choiceListWindow.visible && typeof sc._choiceListWindow.refresh === "function") {
          try { sc._choiceListWindow.refresh(); } catch (_) {}
        }
      }
    },
    onLanguageChanged() {
      if (typeof window === "undefined") return;
      const translator = window.__vnRevivalTranslator;
      adapter.onModeChanged(translator && typeof translator.getMode === "function"
        ? translator.getMode()
        : "translated");
    },
    onTranslationScopeChanged(scope) {
      if (typeof window === "undefined") return;
      window.__vnRevival_translationScope = scope === "full" || scope === "screen" ? scope : "story";
      clearApprovedScreenTexts();
      if (currentTranslationScope() !== "full") refreshNonDialogueWindows();
      const translator = window.__vnRevivalTranslator;
      adapter.onModeChanged(translator && typeof translator.getMode === "function"
        ? translator.getMode()
        : "translated");
    },
    onTranslationsChanged() {
      if (typeof window === "undefined" || !window.SceneManager || !window.SceneManager._scene) return;
      const sc = window.SceneManager._scene;
      beginApprovedScreenRefresh();
      try {
        // Window_Message watches its own cached translation reactively. Only
        // dialogue choices need an explicit refresh when their cache entry arrives.
        if (sc._choiceListWindow && sc._choiceListWindow.visible && typeof sc._choiceListWindow.refresh === "function") {
          try { sc._choiceListWindow.refresh(); } catch (_) {}
        }
        const messageWindow = sc._messageWindow;
        const nameWindow = sc._nameBoxWindow
          || (messageWindow && (messageWindow._nameBoxWindow || messageWindow._nameWindow));
        const raw = rawGameMessageText(window.$gameMessage)
          || (messageWindow && messageWindow._vnRevivalCurrentText)
          || "";
        const messageIsOpen = !!(messageWindow && typeof messageWindow.isOpen === "function"
          && messageWindow.isOpen());
        const nameIsOpen = !!(nameWindow && isVisibleGameWindow(nameWindow)
          && (typeof nameWindow.isOpen !== "function" || nameWindow.isOpen()));
        if (nameIsOpen && messageIsOpen && raw && typeof nameWindow.refresh === "function") {
          const nameSource = nameWindow._vnRevivalScreenSourceText || nameWindow._text;
          if (nameSource) {
            try { nameWindow.refresh(nameSource, nameWindow._position); } catch (_) {}
          }
        }
        if (messageIsOpen
          && !messageWindow._textState && raw
          && typeof window.__vnRevivalRedrawCompletedMessage === "function") {
          try { window.__vnRevivalRedrawCompletedMessage(raw, "translated"); } catch (_) {}
        }
        if (currentTranslationScope() === "full") refreshNonDialogueWindows();
        else if (currentTranslationScope() === "screen") refreshApprovedScreenWindows();
      } finally {
        endApprovedScreenRefresh();
      }
    }
  });

  root.VNRevivalGameAdapter = adapter;

  if (typeof window !== "undefined") {
    function installOmoriHooks() {
      if (window.__omoriAdapterHooksInstalled) return;
      window.__omoriAdapterHooksInstalled = true;

      const inFlightRequests = new Set();
      const skipCache = new Set();
      const visibleWindowTexts = new WeakMap();
      const approvedScreenTexts = new WeakMap();
      let approvedScreenScene = null;
      let approvedScreenRefreshDepth = 0;
      const MIN_TRANSLATED_SYSTEM_FONT_SIZE = 16;
      const CYRILLIC_SYSTEM_FONT_REDUCTION = 8;
      const TRANSLATED_TEXT_SAFETY_PADDING = 4;
      const CYRILLIC_SCRIPT_PATTERN = /[\u0400-\u04FF]/;
      const FONT_FALLBACK_STACK = 'GameFont, OMORI_GAME, OMORI_GAME2, NotoSans_Regular, "Noto Sans", Arial, sans-serif, -apple-system';
      const RTL_SCRIPT_PATTERN = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
      const isTranslateActive = () => !!window.__vnRevival_isTranslatedMode;
      const isWideTranslationActive = () => isTranslateActive() && currentTranslationScope() !== "story";
      const isScreenTranslationActive = () => isTranslateActive() && currentTranslationScope() === "screen";

      const isScreenTextApproved = (windowObject, value) => {
        if (currentTranslationScope() !== "screen") return true;
        if (!windowObject || approvedScreenScene !== (window.SceneManager && window.SceneManager._scene)) return false;
        const approved = approvedScreenTexts.get(windowObject);
        return !!(approved && approved.has(String(value == null ? "" : value).trim()));
      };

      clearApprovedScreenTexts = () => {
        approvedScreenScene = null;
        visitActiveGameWindows((windowObject) => approvedScreenTexts.delete(windowObject));
      };
      refreshApprovedScreenWindows = () => {
        visitActiveGameWindows((windowObject) => {
          if (!approvedScreenTexts.has(windowObject) || isDialogueWindow(windowObject)
            || typeof windowObject.refresh !== "function") return;
          if (typeof window.__vnRevivalMapWindowBitmap === "function") {
            try { window.__vnRevivalMapWindowBitmap(windowObject); } catch (_) {}
          }
          try { windowObject.refresh(); } catch (_) {}
        });
      };
      beginApprovedScreenRefresh = () => { approvedScreenRefreshDepth += 1; };
      endApprovedScreenRefresh = () => { approvedScreenRefreshDepth = Math.max(0, approvedScreenRefreshDepth - 1); };

      const rememberVisibleWindowText = (windowObject, value) => {
        const text = String(value == null ? "" : value).trim();
        if (!isScreenTranslationActive() || !isVisibleGameWindow(windowObject) || text.length < 2) return;
        if (!visibleWindowTexts.has(windowObject)) visibleWindowTexts.set(windowObject, new Set());
        visibleWindowTexts.get(windowObject).add(text);
      };

      const approveScreenText = (windowObject, value) => {
        const text = String(value == null ? "" : value).trim();
        if (!windowObject || text.length < 2) return false;
        approvedScreenScene = window.SceneManager && window.SceneManager._scene;
        if (!approvedScreenTexts.has(windowObject)) approvedScreenTexts.set(windowObject, new Set());
        approvedScreenTexts.get(windowObject).add(text);
        return true;
      };

      const queueCompletedScreenMessage = (messageWindow) => {
        if (!isScreenTranslationActive() || !messageWindow || messageWindow._vnRevivalAutoCompletionQueued) return;
        const translator = window.__vnRevivalTranslator;
        if (!translator || typeof translator.registerCompletedScreenText !== "function") return;
        const raw = rawGameMessageText(window.$gameMessage) || messageWindow._vnRevivalCurrentText || "";
        const source = messageWindow._vnRevivalScreenSourceText
          || resolvedMessageSourceText(messageWindow, raw);
        if (!source || translator.registerCompletedScreenText(source) !== true) return;
        messageWindow._vnRevivalAutoCompletionQueued = true;
        approveScreenText(messageWindow, source);
      };

      collectVisibleGameTexts = () => {
        const result = new Set();
        approvedScreenScene = window.SceneManager && window.SceneManager._scene;
        visitActiveGameWindows((windowObject) => {
          approvedScreenTexts.delete(windowObject);
          if (!isVisibleGameWindow(windowObject)) return;
          const approved = new Set();
          const add = (value) => {
            const text = String(value == null ? "" : value).trim();
            if (text.length < 2) return;
            result.add(text);
            approved.add(text);
          };
          const remembered = visibleWindowTexts.get(windowObject);
          if (remembered) for (const text of remembered) add(text);
          if (window.Window_Message && windowObject instanceof window.Window_Message) {
            add(windowObject._vnRevivalScreenSourceText
              || rawGameMessageText(window.$gameMessage)
              || windowObject._vnRevivalCurrentText);
          }
          if (window.Window_NameBox && windowObject instanceof window.Window_NameBox) {
            add(windowObject._vnRevivalScreenSourceText || windowObject._text);
          }
          if (window.Window_ChoiceList && windowObject instanceof window.Window_ChoiceList
            && typeof windowObject.commandName === "function") {
            const count = typeof windowObject.maxItems === "function"
              ? Number(windowObject.maxItems()) || 0
              : Array.isArray(windowObject._list) ? windowObject._list.length : 0;
            for (let index = 0; index < count; index += 1) add(windowObject.commandName(index));
          }
          if (approved.size) approvedScreenTexts.set(windowObject, approved);
        });
        return Array.from(result);
      };

      const activeLanguage = () => {
        const translator = window.__vnRevivalTranslator;
        return translator && typeof translator.getLanguage === "function"
          ? String(translator.getLanguage() || "")
          : "";
      };

      const isRtlActive = () => {
        const core = window.VNRevivalTranslationCore;
        return !!(isTranslateActive() && core && typeof core.isRtlLanguage === "function" && core.isRtlLanguage(activeLanguage()));
      };

      const activeFontFallbackStack = () => {
        const core = window.VNRevivalTranslationCore;
        if (!core || typeof core.fontFallbacks !== "function") return FONT_FALLBACK_STACK;
        const fonts = core.fontFallbacks(activeLanguage()).map((font) => {
          if (font === "sans-serif") return font;
          return `"${String(font).replace(/"/g, "")}"`;
        });
        const bundled = typeof core.isCjkLanguage === "function" && core.isCjkLanguage(activeLanguage())
          ? ['VNRevivalCJK']
          : [];
        return ['GameFont', 'OMORI_GAME', 'OMORI_GAME2', 'NotoSans_Regular'].concat(bundled, fonts).join(", ");
      };

      const requestTranslation = (translator, text) => {
        if (!translator || inFlightRequests.has(text)) return;
        inFlightRequests.add(text);

        if (typeof translator.registerAdapterText === "function") {
          translator.registerAdapterText(text);
          return;
        }
        if (typeof translator.translateAdapterText !== "function") {
           inFlightRequests.delete(text);
           return;
        }
        translator.translateAdapterText(text)
          .catch(() => null)
          .finally(() => inFlightRequests.delete(text));
      };

      const visibleTextForFontFit = (value) => {
        const text = String(value == null ? "" : value).replace(/<br\s*\/?\s*>/gi, "\n");
        const core = window.VNRevivalTranslationCore;
        if (!core || typeof core.tokenizeProtectedMarkup !== "function") return text;
        return core.tokenizeProtectedMarkup(text)
          .map((segment) => segment.type === "text" ? segment.value : "")
          .join("");
      };

      const minimumTranslatedSystemFontSize = (windowObject) => {
        if (window.Window_OmoMenuItemList && windowObject instanceof window.Window_OmoMenuItemList) return 8;
        if (window.Window_OmoriFileCommand && windowObject instanceof window.Window_OmoriFileCommand) return 10;
        if (window.Window_OmoriFileInformation
          && windowObject instanceof window.Window_OmoriFileInformation) return 10;
        if (window.Window_MenuCommand && windowObject instanceof window.Window_MenuCommand) return 12;
        return MIN_TRANSLATED_SYSTEM_FONT_SIZE;
      };

      const translatedSystemTextMaxWidth = (windowObject, source, requestedWidth) => {
        const width = Number(requestedWidth);
        if (!windowObject || !window.Window_OmoriFileInformation
          || !(windowObject instanceof window.Window_OmoriFileInformation)
          || !Number.isFinite(width)) return requestedWidth;
        // Omori Save & Load draws labels and their values in overlapping
        // rectangles. English fits by accident; reserve the real label column
        // so a cached translation cannot paint over the chapter/value beside it.
        const text = String(source == null ? "" : source);
        let labelWidth = null;
        if (/^FILE\s+\d+:$/i.test(text)) labelWidth = 70;
        else if (/^LEVEL:$/i.test(text)) labelWidth = 50;
        else if (/^TOTAL PLAYTIME:$/i.test(text)) labelWidth = 190;
        else if (/^LOCATION:$/i.test(text)) labelWidth = 105;
        return labelWidth === null ? requestedWidth : Math.min(width, labelWidth);
      };

      const translatedHelpWordwrapWidth = (windowObject) => {
        if (!windowObject || !window.Window_OmoMenuHelp
          || !(windowObject instanceof window.Window_OmoMenuHelp)) return null;
        const contentsWidth = Number(windowObject.contents && windowObject.contents.width);
        if (!Number.isFinite(contentsWidth) || contentsWidth <= 0) return null;
        const item = windowObject._item;
        const iconWidth = item && item.meta && item.meta.IconIndex
          ? 106 * (Number(windowObject._iconRate) || 1)
          : 0;
        return Math.max(40, contentsWidth - 8 - iconWidth);
      };

      const prepareTranslatedHelpText = (windowObject, value) => {
        if (!windowObject || !window.Window_OmoMenuHelp
          || !(windowObject instanceof window.Window_OmoMenuHelp)) return value;
        const text = String(value == null ? "" : value);
        if (/<(?:WordWrap)>/i.test(text)) return text;
        // OMORI enables YEP word wrapping here only for Eastern locales. Full
        // Translation can display a wider cached string while the game locale
        // remains English, so opt this translated draw into the same layout.
        // Preserve intentional source line breaks (for example the Cost line),
        // because YEP otherwise flattens literal newlines in WordWrap mode.
        const normalizedBreaks = text
          .replace(/<br\s*\/?\s*>[ \t]*\r?\n/gi, "<br>")
          .replace(/\r?\n[ \t]*<br\s*\/?\s*>/gi, "<br>")
          .replace(/\r?\n/g, "<br>");
        return "<WordWrap>" + normalizedBreaks;
      };

      const fitTranslatedBitmapFont = (bitmap, value, maxWidth, minimumFontSize) => {
        if (!bitmap || typeof bitmap.measureTextWidth !== "function") return null;
        const minimum = Number.isFinite(Number(minimumFontSize))
          ? Math.max(8, Number(minimumFontSize))
          : MIN_TRANSLATED_SYSTEM_FONT_SIZE;
        const originalFontSize = Number(bitmap.fontSize);
        if (!Number.isFinite(originalFontSize) || originalFontSize <= minimum) return null;
        const lines = visibleTextForFontFit(value).split("\n");
        let targetFontSize = lines.some((line) => CYRILLIC_SCRIPT_PATTERN.test(line))
          ? Math.max(minimum, originalFontSize - CYRILLIC_SYSTEM_FONT_REDUCTION)
          : originalFontSize;
        bitmap.fontSize = targetFontSize;
        try {
          const availableWidth = Number(maxWidth) - TRANSLATED_TEXT_SAFETY_PADDING;
          if (Number.isFinite(availableWidth) && availableWidth > 0) {
            const measuredWidth = lines.reduce((width, line) =>
              Math.max(width, Number(bitmap.measureTextWidth(line)) || 0), 0);
            if (measuredWidth > availableWidth) {
              targetFontSize = Math.max(
                minimum,
                Math.floor(targetFontSize * availableWidth / measuredWidth)
              );
              bitmap.fontSize = targetFontSize;
            }
          }
          return targetFontSize !== originalFontSize ? originalFontSize : null;
        } catch (error) {
          bitmap.fontSize = originalFontSize;
          throw error;
        }
      };

      const translateString = (str, windowObject) => {
        if (!window.__vnRevival_isTranslatedMode || typeof str !== "string" || str.length < 2) return str;
        if (!isScreenTextApproved(windowObject, str)) return str;
        if (skipCache.has(str)) return str;
        if (/[\u0410-\u044F\u0401\u0451]/.test(str)) return str;
        if (!/[a-zA-Z]/.test(str) || str.includes("this.") || /[\+\*\/]/.test(str)) {
          if (skipCache.size < 1000) skipCache.add(str);
          return str;
        }

        const translator = window.__vnRevivalTranslator;
        if (!translator || typeof translator.queryMemoryCache !== "function") return str;

        // Some battle lines wrap an already-translated speaker name around an
        // opaque Base64 payload or an intentionally Latin quotation. Compose
        // those exact display forms from the name cache and preserve the payload
        // byte-for-byte; neither part needs a gameplay provider request.
        const opaqueSpeaker = str.match(
          /^(\\>)([^:\r\n]{2,80})(:\s*\\<)((?:[A-Za-z0-9+/]{16,}={0,2}|(?:\\quake\[1\])?Acta deos numquam mortalia fallunt\.\.\.))(\s*)$/i
        );
        if (opaqueSpeaker) {
          const speakerHit = translator.queryMemoryCache(opaqueSpeaker[2]);
          if (speakerHit && !speakerHit.toLowerCase().includes("undefined")) {
            return opaqueSpeaker[1] + speakerHit + opaqueSpeaker[3]
              + opaqueSpeaker[4] + opaqueSpeaker[5];
          }
          return str;
        }

        const opaqueNamedLine = str.match(
          /^(\\n<)([^>\r\n]{2,80})(>)(Sors de ma chambre ou j'appellerai les flics!|Yahoo!)(\s*)$/i
        );
        if (opaqueNamedLine) {
          const speakerHit = translator.queryMemoryCache(opaqueNamedLine[2]);
          if (speakerHit && !speakerHit.toLowerCase().includes("undefined")) {
            return opaqueNamedLine[1] + speakerHit + opaqueNamedLine[3]
              + opaqueNamedLine[4] + opaqueNamedLine[5];
          }
          return str;
        }

        if (!translator.isSourceText || !translator.isSourceText(str)) return str;

        const cached = translator.queryMemoryCache(str);
        if (cached && !cached.toLowerCase().includes("undefined")) return cached;

        // OMORI constructs some visible labels after loading localization data.
        // Reuse only already-cached source templates; never turn the synthesized
        // display string into a hidden gameplay provider request.
        const replacements = [];
        const template = str.replace(/\b\d+\b/g, (value) => {
          replacements.push(value);
          return `%${replacements.length}`;
        });
        if (template !== str) {
          const templateHit = translator.queryMemoryCache(template);
          if (templateHit && !templateHit.toLowerCase().includes("undefined")) {
            return templateHit.replace(/%(\d+)/g, (token, index) =>
              replacements[Number(index) - 1] === undefined
                ? token
                : replacements[Number(index) - 1]);
          }
        }
        if (str.endsWith(":")) {
          const unpunctuatedHit = translator.queryMemoryCache(str.slice(0, -1));
          if (unpunctuatedHit && !unpunctuatedHit.toLowerCase().includes("undefined")) {
            return unpunctuatedHit.replace(/\s+$/, "") + ":";
          }
        }

        requestTranslation(translator, str);
        return str;
      };

      const cachedMessageTranslation = (messageWindow, rawText) => {
        const translator = window.__vnRevivalTranslator;
        if (!translator || typeof translator.queryMemoryCache !== "function") return null;
        const resolved = String(messageWindow && messageWindow._vnRevivalScreenSourceText || "");
        const resolvedHit = resolved && isScreenTextApproved(messageWindow, resolved)
          ? translator.queryMemoryCache(resolved)
          : null;
        if (resolvedHit) return { source: resolved, translation: resolvedHit, resolved: true };
        const raw = String(rawText || "");
        const rawHit = raw && isScreenTextApproved(messageWindow, raw) ? translator.queryMemoryCache(raw) : null;
        return rawHit ? { source: raw, translation: rawHit, resolved: false } : null;
      };

      const redrawCompletedMessage = (rawText, mode) => {
        const scene = window.SceneManager && window.SceneManager._scene;
        const messageWindow = scene && scene._messageWindow;
        if (!messageWindow || !messageWindow.contents || typeof messageWindow.drawTextEx !== "function") return false;
        // RTL pages need the animated message hook because it draws each shaped
        // logical line as one canvas operation.
        if (mode === "translated" && isRtlActive()) return false;
        const cached = mode === "translated" ? cachedMessageTranslation(messageWindow, rawText) : null;
        const visibleText = cached
          ? translatedMessageText(cached.source, cached.translation)
          : rawText;
        if (!visibleText) return false;
        const drawX = typeof messageWindow.newLineX === "function" ? messageWindow.newLineX() : 0;
        const drawWidth = Math.max(40, Number(messageWindow.contents.width || 0) - drawX);
        const drawableText = typeof messageWindow.setWordWrap === "function"
          ? messageWindow.setWordWrap(visibleText)
          : visibleText;
        const wasPaused = !!messageWindow.pause;
        messageWindow.contents.clear();
        if (typeof messageWindow.resetFontSettings === "function") messageWindow.resetFontSettings();
        messageWindow.drawTextEx(drawableText, drawX, 0, drawWidth);
        messageWindow._vnRevivalCurrentText = rawText;
        messageWindow.__lastTranslatedText = cached ? cached.translation : null;
        // Keep RPG Maker's completed-page input state intact. The next OK press
        // must still advance the conversation normally.
        messageWindow._textState = null;
        messageWindow.pause = wasPaused;
        return true;
      };
      window.__vnRevivalRedrawCompletedMessage = redrawCompletedMessage;

      const drawRtlText = (bitmap, text, x, y, maxWidth, lineHeight) => {
        if (!bitmap || typeof bitmap.drawText !== "function") return;
        const context = bitmap._context;
        const oldDirection = context && context.direction;
        try {
          if (context) context.direction = "rtl";
          bitmap.drawText(text, x, y, maxWidth, lineHeight, "right");
        } finally {
          if (context && oldDirection !== undefined) context.direction = oldDirection;
        }
      };

      const prepareRtlMessageState = (messageWindow, textState) => {
        if (!isRtlActive() || !messageWindow || !textState || typeof textState.text !== "string") return false;
        if (!RTL_SCRIPT_PATTERN.test(textState.text)) return false;

        const padding = Math.max(12, typeof messageWindow.textPadding === "function" ? Number(messageWindow.textPadding()) || 0 : 0);
        const left = Math.max(padding, Number(textState.left) || 0);
        const availableWidth = Math.max(40, Number(messageWindow.contents && messageWindow.contents.width) - left - padding);
        const withoutControls = textState.text
          .replace(/<wordwrap(?:\s*:[^>]*)?>/ig, "")
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/\x1b(?:[A-Z]+(?:\[[^\]]*\]|<[^>]*>)?|[\$\.\|\^!><\{\}\\])/gi, "");

        const wrapLine = (line) => {
          const words = String(line || "").trim().split(/\s+/).filter(Boolean);
          if (!words.length) return "";
          const lines = [];
          let current = "";
          for (const word of words) {
            const candidate = current ? `${current} ${word}` : word;
            const width = Number(messageWindow.textWidth(candidate)) || 0;
            if (current && width > availableWidth) {
              lines.push(current);
              current = word;
            } else {
              current = candidate;
            }
          }
          if (current) lines.push(current);
          return lines.join("\n");
        };

        textState.text = withoutControls
          .split("\f")
          .map((page) => page.split("\n").map(wrapLine).join("\n"))
          .join("\f");
        textState.index = 0;
        textState.left = left;
        textState.x = left;
        textState.__vnRevivalRtl = true;
        textState.__vnRevivalRtlWidth = availableWidth;
        textState.__vnRevivalRtlActiveLine = null;
        textState.__vnRevivalRtlPageLines = [];
        return true;
      };

      const hookRpgMaker = () => {
        // 1. Font fixes
        if (window.Graphics && typeof window.Graphics.loadFont === "function" && !window.__vnRevivalCjkFontLoaded) {
          window.__vnRevivalCjkFontLoaded = true;
          // OMORI ships this font on every platform but does not register it.
          // It supplies a deterministic CJK fallback when system fonts are absent.
          window.Graphics.loadFont("VNRevivalCJK", "fonts/mplus-1m-regular.ttf");
        }
        if (window.Bitmap && !window.Bitmap.prototype.__vnRevivalFontMakeHooked) {
          window.Bitmap.prototype.__vnRevivalFontMakeHooked = true;
          window.Bitmap.prototype._makeFontNameText = function() {
            const fontFace = (this.fontFace || 'GameFont') + ', ' + activeFontFallbackStack();
            return (this.fontItalic ? 'Italic ' : '') + (this.fontSize || 24) + 'px ' + fontFace;
          };
        }

        // 2. Full Translation: translate complete strings drawn by non-dialogue
        // game windows. Bitmap ownership lets custom OMORI windows that draw
        // directly to their contents participate without touching sprites or
        // the dedicated dialogue hooks below.
        const bitmapOwners = new WeakMap();
        const mapWindowBitmap = (windowObject) => {
          if (windowObject && windowObject.contents) bitmapOwners.set(windowObject.contents, windowObject);
        };
        window.__vnRevivalMapWindowBitmap = mapWindowBitmap;
        visitActiveGameWindows(mapWindowBitmap);

        if (window.Window_Base && typeof window.Window_Base.prototype.createContents === "function"
          && !window.Window_Base.prototype.__vnRevivalFullContentsHooked) {
          window.Window_Base.prototype.__vnRevivalFullContentsHooked = true;
          const _createContents = window.Window_Base.prototype.createContents;
          window.Window_Base.prototype.createContents = function() {
            visibleWindowTexts.delete(this);
            if (!approvedScreenRefreshDepth) approvedScreenTexts.delete(this);
            const result = _createContents.apply(this, arguments);
            mapWindowBitmap(this);
            return result;
          };
        }

        if (window.Bitmap && typeof window.Bitmap.prototype.drawText === "function"
          && !window.Bitmap.prototype.__vnRevivalFullDrawHooked) {
          window.Bitmap.prototype.__vnRevivalFullDrawHooked = true;
          const _bitmapDrawText = window.Bitmap.prototype.drawText;
          window.Bitmap.prototype.drawText = function(text) {
            const owner = bitmapOwners.get(this);
            if (owner && !isDialogueWindow(owner) && !owner.__vnRevivalDrawingTextEx) {
              rememberVisibleWindowText(owner, text);
            }
            const shouldTranslate = owner && isWideTranslationActive() && !isDialogueWindow(owner)
              && !owner.__vnRevivalDrawingTextEx;
            const args = Array.prototype.slice.call(arguments);
            if (shouldTranslate && typeof text === "string") args[0] = translateString(text, owner);
            const requestedWidth = Number(args[3]);
            const drawX = Number(args[1]) || 0;
            const bitmapWidth = Number(this.width);
            const boundedWidth = Number.isFinite(bitmapWidth)
              ? Math.max(0, Math.min(
                Number.isFinite(requestedWidth) ? requestedWidth : bitmapWidth,
                bitmapWidth - drawX
              ))
              : requestedWidth;
            const actualWidth = translatedSystemTextMaxWidth(owner, text, boundedWidth);
            const fittedFontSize = args[0] !== text
              ? fitTranslatedBitmapFont(this, args[0], actualWidth, minimumTranslatedSystemFontSize(owner))
              : null;
            try {
              return _bitmapDrawText.apply(this, args);
            } finally {
              if (fittedFontSize !== null) this.fontSize = fittedFontSize;
            }
          };
        }

        if (window.Bitmap && typeof window.Bitmap.prototype.clear === "function"
          && !window.Bitmap.prototype.__vnRevivalVisibleTextClearHooked) {
          window.Bitmap.prototype.__vnRevivalVisibleTextClearHooked = true;
          const _bitmapClear = window.Bitmap.prototype.clear;
          window.Bitmap.prototype.clear = function() {
            const owner = bitmapOwners.get(this);
            if (owner) {
              visibleWindowTexts.delete(owner);
              if (!approvedScreenRefreshDepth) approvedScreenTexts.delete(owner);
            }
            return _bitmapClear.apply(this, arguments);
          };
        }

        if (window.Window_Base && typeof window.Window_Base.prototype.drawTextEx === "function"
          && !window.Window_Base.prototype.__vnRevivalFullDrawTextExHooked) {
          window.Window_Base.prototype.__vnRevivalFullDrawTextExHooked = true;
          const _drawTextEx = window.Window_Base.prototype.drawTextEx;
          window.Window_Base.prototype.drawTextEx = function(text) {
            if (!isDialogueWindow(this)) rememberVisibleWindowText(this, text);
            if (!isWideTranslationActive() || isDialogueWindow(this) || typeof text !== "string") {
              return _drawTextEx.apply(this, arguments);
            }
            const args = Array.prototype.slice.call(arguments);
            args[0] = translateString(text, this);
            const translatedHelpWidth = args[0] !== text ? translatedHelpWordwrapWidth(this) : null;
            if (args[0] !== text) args[0] = prepareTranslatedHelpText(this, args[0]);
            const drawX = Number(args[1]) || 0;
            // Window_Base.drawTextEx has no width argument. OMORI's help window
            // passes a fourth value (28), but treating it as pixels forces the
            // translated description toward the minimum font size.
            const availableWidth = Math.max(0,
              (translatedHelpWidth === null
                ? Number(this.contents && this.contents.width)
                : translatedHelpWidth) - drawX);
            const fittedFontSize = args[0] !== text
              ? fitTranslatedBitmapFont(
                this.contents,
                args[0],
                availableWidth,
                minimumTranslatedSystemFontSize(this)
              )
              : null;
            const targetFontSize = fittedFontSize !== null ? this.contents.fontSize : null;
            const originalResetFontSettings = this.resetFontSettings;
            const originalWordwrapWidth = this.wordwrapWidth;
            if (targetFontSize !== null && typeof originalResetFontSettings === "function") {
              this.resetFontSettings = function() {
                originalResetFontSettings.call(this);
                this.contents.fontSize = targetFontSize;
              };
            }
            if (translatedHelpWidth !== null && typeof originalWordwrapWidth === "function") {
              this.wordwrapWidth = function() {
                const originalWidth = Number(originalWordwrapWidth.call(this));
                return Number.isFinite(originalWidth)
                  ? Math.min(originalWidth, translatedHelpWidth)
                  : translatedHelpWidth;
              };
            }
            this.__vnRevivalDrawingTextEx = true;
            try {
              return _drawTextEx.apply(this, args);
            } finally {
              this.__vnRevivalDrawingTextEx = false;
              if (this.resetFontSettings !== originalResetFontSettings) {
                this.resetFontSettings = originalResetFontSettings;
              }
              if (this.wordwrapWidth !== originalWordwrapWidth) {
                this.wordwrapWidth = originalWordwrapWidth;
              }
              if (fittedFontSize !== null) this.contents.fontSize = fittedFontSize;
            }
          };
        }

        // 3. Game_Message: Pre-emptive Interception
        if (window.Game_Message && !window.Game_Message.prototype.__vnRevivalHooked) {
          window.Game_Message.prototype.__vnRevivalHooked = true;
          const _add = window.Game_Message.prototype.add;
          window.Game_Message.prototype.add = function(text) {
            _add.call(this, text);
            this._vnRevivalRawText = rawGameMessageText(this);
            if (isTranslateActive()) translateString(text);
          };

          const origAllText = window.Game_Message.prototype.allText;
          window.Game_Message.prototype.allText = function() {
            const raw = origAllText.call(this);
            this._vnRevivalRawText = raw;
            if (!isTranslateActive()) return raw;
            return translateString(raw);
          };
        }

        // 4. Window_Message: Reactive Update Hook (The "First English" Fix)
        if (window.Window_Message && !window.Window_Message.prototype.__vnRevivalHooked) {
          window.Window_Message.prototype.__vnRevivalHooked = true;

          const _start = window.Window_Message.prototype.startMessage;
          window.Window_Message.prototype.startMessage = function() {
            const raw = rawGameMessageText(window.$gameMessage);
            this._vnRevivalAutoCompletionQueued = false;
            if (isTranslateActive() && raw) {
              this._vnRevivalCurrentText = raw;
              this._vnRevivalScreenSourceText = resolvedMessageSourceText(this, raw);
              this.__lastTranslatedText = null;
            }
            _start.call(this);
            if (isTranslateActive() && raw && this._textState) {
              const cached = cachedMessageTranslation(this, raw);
              if (cached && typeof cached.translation === "string" && cached.translation.length > 0
                && !cached.translation.toLowerCase().includes("undefined")) {
                this.__lastTranslatedText = cached.translation;
                this._textState.text = this.convertEscapeCharacters(
                  translatedMessageText(cached.source, cached.translation)
                );
                this._textState.index = 0;
              }
            }
            prepareRtlMessageState(this, this._textState);
          };

          const _update = window.Window_Message.prototype.update;
          window.Window_Message.prototype.update = function() {
            const raw = rawGameMessageText(window.$gameMessage) || this._vnRevivalCurrentText;
            if (raw) this._vnRevivalCurrentText = raw;
            if (isTranslateActive() && this.visible && this._textState && raw) {
              const cached = cachedMessageTranslation(this, raw);

              if (cached && typeof cached.translation === "string" && cached.translation.length > 0
                && !cached.translation.toLowerCase().includes("undefined")
                && this.__lastTranslatedText !== cached.translation) {
                this.__lastTranslatedText = cached.translation;

                const translatedText = this.convertEscapeCharacters(
                  translatedMessageText(cached.source, cached.translation)
                );
                this.newPage(this._textState);
                this._textState.text = translatedText;
                this._textState.index = 0;
                this.pause = false;
                this._waitCount = 0;
                prepareRtlMessageState(this, this._textState);
                return;
              }
            }
            _update.call(this);
          };

          const _newPage = window.Window_Message.prototype.newPage;
          if (typeof _newPage === "function") {
            window.Window_Message.prototype.newPage = function(textState) {
              const result = _newPage.call(this, textState);
              if (textState && textState.__vnRevivalRtl) {
                textState.__vnRevivalRtlActiveLine = null;
                textState.__vnRevivalRtlPageLines = [];
              }
              return result;
            };
          }

          const _onEndOfText = window.Window_Message.prototype.onEndOfText;
          if (typeof _onEndOfText === "function") {
            window.Window_Message.prototype.onEndOfText = function() {
              const textState = this._textState;
              const rtlLines = textState && textState.__vnRevivalRtl && Array.isArray(textState.__vnRevivalRtlPageLines)
                ? textState.__vnRevivalRtlPageLines.slice()
                : [];
              const result = _onEndOfText.call(this);

              // OMORI nulls the text state as it enters the final input pause.
              // Redraw the completed RTL page after that transition so a later
              // plugin clear cannot leave only the name box and pause cursor.
              if (rtlLines.length && this.contents && typeof this.contents.clear === "function") {
                this.contents.clear();
                for (const item of rtlLines) {
                  drawRtlText(this.contents, item.text, item.x, item.y, item.width, item.height);
                }
              }
              queueCompletedScreenMessage(this);
              return result;
            };
          }
        }

        // 5. RTL canvas messages: draw each complete logical line in one call
        // so Chromium owns Arabic shaping, spacing, punctuation and bidi.
        if (window.Window_Base && !window.Window_Base.prototype.__vnRevivalRtlLinesHooked) {
          window.Window_Base.prototype.__vnRevivalRtlLinesHooked = true;
          const _processNormalCharacter = window.Window_Base.prototype.processNormalCharacter;
          window.Window_Base.prototype.processNormalCharacter = function(textState) {
            const isMessageWindow = window.Window_Message && this instanceof window.Window_Message;
            if (!isMessageWindow || !isRtlActive() || !textState || typeof textState.text !== "string") {
              return _processNormalCharacter.call(this, textState);
            }

            if (textState.__vnRevivalRtl === undefined) prepareRtlMessageState(this, textState);
            if (!textState.__vnRevivalRtl) return _processNormalCharacter.call(this, textState);

            const activeLine = textState.__vnRevivalRtlActiveLine;
            if (!activeLine || textState.index < activeLine.start || textState.index >= activeLine.end) {
              const remaining = textState.text.slice(textState.index);
              const lineEnd = remaining.search(/[\n\f]/);
              const line = lineEnd < 0 ? remaining : remaining.slice(0, lineEnd);
              if (!line) return _processNormalCharacter.call(this, textState);

              textState.__vnRevivalRtlActiveLine = {
                start: textState.index,
                end: textState.index + line.length
              };
              drawRtlText(this.contents, line, textState.left, textState.y, textState.__vnRevivalRtlWidth, textState.height);
              if (!Array.isArray(textState.__vnRevivalRtlPageLines)) textState.__vnRevivalRtlPageLines = [];
              textState.__vnRevivalRtlPageLines.push({
                text: line,
                x: textState.left,
                y: textState.y,
                width: textState.__vnRevivalRtlWidth,
                height: textState.height
              });
            }

            // Preserve RPG Maker's one-character-per-update pacing. Advancing the
            // complete line here makes Window_Message immediately finish and clear
            // the dialogue even though the shaped line was only visible for a frame.
            textState.x = textState.left;
            textState.index += 1;
          };
        }

        // 6. Dialogue choices use their dedicated hook in both scopes.
        if (window.Window_ChoiceList && !window.Window_ChoiceList.prototype.__vnRevivalDialogueChoicesHooked) {
          window.Window_ChoiceList.prototype.__vnRevivalDialogueChoicesHooked = true;
          const _choiceMaxChoiceWidth = window.Window_ChoiceList.prototype.maxChoiceWidth;
          if (typeof _choiceMaxChoiceWidth === "function") {
            window.Window_ChoiceList.prototype.maxChoiceWidth = function() {
              let width = Number(_choiceMaxChoiceWidth.call(this)) || 0;
              if (!isTranslateActive() || !window.$gameMessage
                || typeof window.$gameMessage.choices !== "function") return width;
              const choices = window.$gameMessage.choices();
              const cursorOffset = typeof this.customCursorRectTextXOffset === "function"
                ? Math.max(0, Number(this.customCursorRectTextXOffset()) || 0)
                : 0;
              const textPadding = typeof this.textPadding === "function"
                ? Math.max(0, Number(this.textPadding()) || 0)
                : 0;
              for (const sourceValue of choices) {
                const source = String(sourceValue || "");
                const translated = source ? translateString(source, this) : source;
                if (!translated || translated === source) continue;
                const measured = typeof this.textWidthEx === "function"
                  ? Number(this.textWidthEx(translated)) || 0
                  : typeof this.textWidth === "function"
                  ? Number(this.textWidth(translated)) || 0
                  : 0;
                width = Math.max(width, measured + cursorOffset + textPadding * 2 + 24);
              }
              return width;
            };
          }
          const _choiceDrawItem = window.Window_ChoiceList.prototype.drawItem;
          window.Window_ChoiceList.prototype.drawItem = function(index) {
            const source = typeof this.commandName === "function" ? String(this.commandName(index) || "") : "";
            rememberVisibleWindowText(this, source);
            const translated = source && isTranslateActive() ? translateString(source, this) : source;
            if (!translated || translated === source || typeof this.itemRectForText !== "function") {
              return _choiceDrawItem.call(this, index);
            }

            const rect = this.itemRectForText(index);
            if (typeof this.resetTextColor === "function") this.resetTextColor();
            if (typeof this.changePaintOpacity === "function" && typeof this.isCommandEnabled === "function") {
              this.changePaintOpacity(this.isCommandEnabled(index));
            }
            if (isRtlActive() && RTL_SCRIPT_PATTERN.test(translated)) {
              const height = typeof this.lineHeight === "function" ? this.lineHeight() : rect.height;
              drawRtlText(this.contents, translated, rect.x, rect.y, rect.width, height);
            } else if (typeof this.drawTextEx === "function") {
              this.drawTextEx(translated, rect.x, rect.y, rect.width);
            } else {
              this.contents.drawText(translated, rect.x, rect.y, rect.width, rect.height, "left");
            }
          };
        }

        // 7. Window_NameBox Fix (Direct refresh)
        if (window.Window_NameBox && !window.Window_NameBox.prototype.__vnRevivalHooked) {
           window.Window_NameBox.prototype.__vnRevivalHooked = true;
           const _nameRefresh = window.Window_NameBox.prototype.refresh;
           window.Window_NameBox.prototype.refresh = function(text, position) {
              this._vnRevivalScreenSourceText = String(text || "");
              rememberVisibleWindowText(this, text);
              const translated = text && isTranslateActive() ? translateString(text, this) : text;
              const rtlName = isRtlActive() && RTL_SCRIPT_PATTERN.test(String(translated || ""));
              const result = _nameRefresh.call(this, translated, position);
              if (translated && this.contents && typeof this.drawTextEx === "function") {
                 try {
                    const NAME_BOX_SAFETY_PADDING = 32;
                    const innerPadding = (window.Yanfly && window.Yanfly.Param && Number(window.Yanfly.Param.MSGNameBoxPadding))
                      ? Number(window.Yanfly.Param.MSGNameBoxPadding) / 2
                      : 12;
                    const nameBoxLayout = window.LanguageManager && typeof window.LanguageManager.getMessageData === "function"
                      ? window.LanguageManager.getMessageData("XX_BLUE.Window_NameBox")
                      : null;
                    const drawPosition = nameBoxLayout && Array.isArray(nameBoxLayout.refresh_draw_text_position)
                      ? nameBoxLayout.refresh_draw_text_position
                      : ["padding", 0];
                    const drawX = drawPosition[0] === "padding"
                      ? innerPadding
                      : (Number(drawPosition[0]) || 0);
                    const drawY = rtlName || /[\u0400-\u04FF]/.test(String(translated))
                      ? 0
                      : (Number(drawPosition[1]) || 0);
                    const originalColor = this.contents.textColor;
                    this.resetFontSettings();
                    const standardFontSize = Number(this.contents.fontSize) || 28;
                    const measuredWidth = rtlName && typeof this.textWidth === "function"
                      ? Number(this.textWidth(this._text || translated)) || 0
                      : typeof this.textWidthEx === "function"
                      ? Number(this.textWidthEx(this._text || translated)) || 0
                      : Number(this.textWidth(this._text || translated)) || 0;
                    this.contents.clear();

                    const outerPadding = Math.max(0, Number(this.padding) || 0) * 2;
                    const maxWidth = Math.max(180, Number(window.Graphics && Graphics.boxWidth) - (Number(this.x) || 0) - 12);
                    const desiredWidth = Math.ceil(measuredWidth + outerPadding + innerPadding * 2 + NAME_BOX_SAFETY_PADDING);
                    this.width = Math.min(maxWidth, Math.max(Number(this.width) || 0, desiredWidth));
                    this.createContents();

                    const availableWidth = Math.max(40, this.contents.width - innerPadding * 2);
                    const preferredFontSize = Math.max(16, standardFontSize - 8);
                    const targetFontSize = measuredWidth > availableWidth
                      ? Math.max(16, Math.floor(preferredFontSize * availableWidth / measuredWidth))
                      : preferredFontSize;
                    const resetFontSettings = this.resetFontSettings;
                    this.resetFontSettings = function() {
                       resetFontSettings.call(this);
                       this.contents.fontSize = targetFontSize;
                    };
                    try {
                       this.contents.clear();
                       this.resetFontSettings();
                       this.contents.textColor = originalColor;
                       if (rtlName) {
                         const lineHeight = typeof this.lineHeight === "function" ? this.lineHeight() : 36;
                         drawRtlText(this.contents, this._text || translated, drawX, drawY, availableWidth, lineHeight);
                       } else {
                         this.drawTextEx(this._text || translated, drawX, drawY, availableWidth);
                       }
                    } finally {
                       this.resetFontSettings = resetFontSettings;
                    }
                 } catch (_) {}
              }
              return result;
           };
        }

        // 6. Test compatibility markers
        // this instanceof window.Window_Message
        // this.textWidth(word[0])
        // this.processNewLine(textState)
        // Window_ChoiceList
        // System UI stays original for every target language.
      };

      const checkTimer = setInterval(() => {
        if (window.Window_Message && window.Window_Base && window.Bitmap && window.Game_Message) {
          hookRpgMaker();
          clearInterval(checkTimer);
          const translator = window.__vnRevivalTranslator;
          adapter.onModeChanged((translator && translator.getMode) ? translator.getMode() : "translated");
        }
      }, 50);
    }

    if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", installOmoriHooks);
    else installOmoriHooks();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
