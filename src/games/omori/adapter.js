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

  function currentTranslationScope() {
    if (typeof window === "undefined") return "story";
    const translator = window.__vnRevivalTranslator;
    if (translator && typeof translator.getTranslationScope === "function") {
      return translator.getTranslationScope() === "full" ? "full" : "story";
    }
    return window.__vnRevival_translationScope === "full" ? "full" : "story";
  }

  function isDialogueWindow(windowObject) {
    if (typeof window === "undefined" || !windowObject) return false;
    return !!(
      (window.Window_Message && windowObject instanceof window.Window_Message)
      || (window.Window_ChoiceList && windowObject instanceof window.Window_ChoiceList)
      || (window.Window_NameBox && windowObject instanceof window.Window_NameBox)
    );
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
      if (isDialogueWindow(windowObject) || typeof windowObject.refresh !== "function") return;
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
    onModeChanged(newMode) {
      if (typeof window === "undefined") return;
      window.__vnRevival_isTranslatedMode = (newMode === "translated");
      if (currentTranslationScope() === "full") refreshNonDialogueWindows();
      if (window.SceneManager && window.SceneManager._scene) {
        const sc = window.SceneManager._scene;
        const messageWindow = sc._messageWindow;
        const gameMessage = window.$gameMessage;
        const raw = rawGameMessageText(gameMessage)
          || (messageWindow && typeof messageWindow._vnRevivalCurrentText === "string"
            ? messageWindow._vnRevivalCurrentText
            : "");
        if (messageWindow && messageWindow.isOpen && messageWindow.isOpen() && gameMessage && raw) {
          const completedPage = !messageWindow._textState && messageWindow.pause;
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
      adapter.onTranslationsChanged();
    },
    onTranslationScopeChanged(scope) {
      if (typeof window === "undefined") return;
      window.__vnRevival_translationScope = scope === "full" ? "full" : "story";
      refreshNonDialogueWindows();
    },
    onTranslationsChanged() {
      if (typeof window === "undefined" || !window.SceneManager || !window.SceneManager._scene) return;
      const sc = window.SceneManager._scene;
      // Window_Message watches its own cached translation reactively. Only
      // dialogue choices need an explicit refresh when their cache entry arrives.
      if (sc._choiceListWindow && sc._choiceListWindow.visible && typeof sc._choiceListWindow.refresh === "function") {
        try { sc._choiceListWindow.refresh(); } catch (_) {}
      }
      if (currentTranslationScope() === "full") refreshNonDialogueWindows();
    }
  });

  root.VNRevivalGameAdapter = adapter;

  if (typeof window !== "undefined") {
    function installOmoriHooks() {
      if (window.__omoriAdapterHooksInstalled) return;
      window.__omoriAdapterHooksInstalled = true;

      const inFlightRequests = new Set();
      const skipCache = new Set();
      const FONT_FALLBACK_STACK = 'GameFont, OMORI_GAME, OMORI_GAME2, NotoSans_Regular, "Noto Sans", Arial, sans-serif, -apple-system';
      const RTL_SCRIPT_PATTERN = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
      const isTranslateActive = () => !!window.__vnRevival_isTranslatedMode;
      const isFullTranslationActive = () => isTranslateActive() && currentTranslationScope() === "full";

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

      const translateString = (str) => {
        if (!window.__vnRevival_isTranslatedMode || typeof str !== "string" || str.length < 2) return str;
        if (skipCache.has(str)) return str;
        if (/[\u0410-\u044F\u0401\u0451]/.test(str)) return str;
        if (!/[a-zA-Z]/.test(str) || str.includes("this.") || /[\+\*\/]/.test(str)) {
          if (skipCache.size < 1000) skipCache.add(str);
          return str;
        }

        const translator = window.__vnRevivalTranslator;
        if (!translator || !translator.isSourceText || !translator.isSourceText(str)) return str;

        const cached = translator.queryMemoryCache(str);
        if (cached && !cached.toLowerCase().includes("undefined")) return cached;

        requestTranslation(translator, str);
        return str;
      };

      const redrawCompletedMessage = (rawText, mode) => {
        const scene = window.SceneManager && window.SceneManager._scene;
        const messageWindow = scene && scene._messageWindow;
        if (!messageWindow || !messageWindow.contents || typeof messageWindow.drawTextEx !== "function") return false;
        // RTL pages need the animated message hook because it draws each shaped
        // logical line as one canvas operation.
        if (mode === "translated" && isRtlActive()) return false;
        const translator = window.__vnRevivalTranslator;
        const cached = mode === "translated" && translator && typeof translator.queryMemoryCache === "function"
          ? translator.queryMemoryCache(rawText)
          : null;
        const visibleText = mode === "translated" && cached
          ? translatedMessageText(rawText, cached)
          : rawText;
        if (!visibleText) return false;
        const drawX = typeof messageWindow.newLineX === "function" ? messageWindow.newLineX() : 0;
        const drawWidth = Math.max(40, Number(messageWindow.contents.width || 0) - drawX);
        messageWindow.contents.clear();
        if (typeof messageWindow.resetFontSettings === "function") messageWindow.resetFontSettings();
        messageWindow.drawTextEx(visibleText, drawX, 0, drawWidth);
        messageWindow._vnRevivalCurrentText = rawText;
        messageWindow.__lastTranslatedText = cached || null;
        // Keep RPG Maker's completed-page input state intact. The next OK press
        // must still advance the conversation normally.
        messageWindow._textState = null;
        messageWindow.pause = true;
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
            const shouldTranslate = owner && isFullTranslationActive() && !isDialogueWindow(owner)
              && !owner.__vnRevivalDrawingTextEx;
            const args = Array.prototype.slice.call(arguments);
            if (shouldTranslate && typeof text === "string") args[0] = translateString(text);
            return _bitmapDrawText.apply(this, args);
          };
        }

        if (window.Window_Base && typeof window.Window_Base.prototype.drawTextEx === "function"
          && !window.Window_Base.prototype.__vnRevivalFullDrawTextExHooked) {
          window.Window_Base.prototype.__vnRevivalFullDrawTextExHooked = true;
          const _drawTextEx = window.Window_Base.prototype.drawTextEx;
          window.Window_Base.prototype.drawTextEx = function(text) {
            if (!isFullTranslationActive() || isDialogueWindow(this) || typeof text !== "string") {
              return _drawTextEx.apply(this, arguments);
            }
            const args = Array.prototype.slice.call(arguments);
            args[0] = translateString(text);
            this.__vnRevivalDrawingTextEx = true;
            try {
              return _drawTextEx.apply(this, args);
            } finally {
              this.__vnRevivalDrawingTextEx = false;
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
            if (isTranslateActive() && raw) {
              this._vnRevivalCurrentText = raw;
              this.__lastTranslatedText = null;
            }
            _start.call(this);
            if (isTranslateActive() && raw && this._textState) {
              const translator = window.__vnRevivalTranslator;
              const cached = translator ? translator.queryMemoryCache(raw) : null;
              if (typeof cached === "string" && cached.length > 0 && !cached.toLowerCase().includes("undefined")) {
                this.__lastTranslatedText = cached;
                this._textState.text = this.convertEscapeCharacters(translatedMessageText(raw, cached));
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
              const translator = window.__vnRevivalTranslator;
              const cached = translator ? translator.queryMemoryCache(raw) : null;

              if (typeof cached === 'string' && cached.length > 0 && !cached.toLowerCase().includes("undefined") && this.__lastTranslatedText !== cached) {
                this.__lastTranslatedText = cached;

                const translatedText = this.convertEscapeCharacters(translatedMessageText(raw, cached));
                this.newPage(this._textState);
                this._textState.text = translatedText;
                this._textState.index = 0;
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
          const _choiceDrawItem = window.Window_ChoiceList.prototype.drawItem;
          window.Window_ChoiceList.prototype.drawItem = function(index) {
            const source = typeof this.commandName === "function" ? String(this.commandName(index) || "") : "";
            const translated = source && isTranslateActive() ? translateString(source) : source;
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
              const translated = text && isTranslateActive() ? translateString(text) : text;
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
