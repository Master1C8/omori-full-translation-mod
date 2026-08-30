"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const vm = require("node:vm");
const core = require("../../../translation-core.js");

require(path.join(__dirname, "..", "adapter.js"));
const adapter = globalThis.VNRevivalGameAdapter;

test("omori adapter exposes contract version 2", () => {
  assert.equal(adapter.contractVersion, 2);
  assert.ok(Array.isArray(adapter.privateSelectors));
  assert.equal(typeof adapter.categorySelectors, "object");
  assert.ok(Array.isArray(adapter.contextSelectors));
});

test("omori adapter detects source text correctly", () => {
  assert.equal(adapter.hasSourceText("Welcome to White Space.", core), true);
  assert.equal(adapter.hasSourceText("You have been living here for as long as you can remember.", core), true);
  assert.equal(adapter.hasSourceText("12345", core), false);
  assert.equal(adapter.hasSourceText("", core), false);
});

test("omori adapter extracts game version", () => {
  assert.equal(adapter.getGameVersion({ Utils: { RPGMAKER_VERSION: "1.6.1" } }), "1.6.1");
  assert.equal(adapter.getGameVersion({ version: "1.0.8" }), "1.0.8");
  assert.equal(adapter.getGameVersion(null), "");
});

test("omori adapter uses the guarded runtime API without catalog preloading", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "adapter.js"), "utf8");
  assert.match(source, /__vnRevival_isTranslatedMode/);
  assert.match(source, /translateAdapterText/);
  assert.match(source, /registerAdapterText/);
  assert.match(source, /onTranslationsChanged/);
  assert.doesNotMatch(source, /translateText\(/);
  assert.doesNotMatch(source, /PreloadAllFiles|_data\.en\.text/);
});

test("omori message rendering wraps translated canvas text", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "adapter.js"), "utf8");
  assert.match(source, /this instanceof window\.Window_Message/);
  assert.match(source, /this\.textWidth\(word\[0\]\)/);
  assert.match(source, /this\.processNewLine\(textState\)/);
});

test("omori registers its bundled CJK font and uses it for CJK targets", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "adapter.js"), "utf8");
  assert.match(source, /Graphics\.loadFont\("VNRevivalCJK", "fonts\/mplus-1m-regular\.ttf"\)/);
  assert.match(source, /core\.isCjkLanguage\(activeLanguage\(\)\)/);
  assert.match(source, /\['VNRevivalCJK'\]/);
});

test("omori redraws a completed cached page directly without restarting message input", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "adapter.js"), "utf8");
  assert.match(source, /const completedPage = !messageWindow\._textState/);
  assert.match(source, /__vnRevivalRedrawCompletedMessage\(raw, newMode\)/);
  assert.match(source, /messageWindow\.setWordWrap\(visibleText\)/);
  assert.match(source, /messageWindow\.drawTextEx\(drawableText, drawX, 0, drawWidth\)/);
  assert.match(source, /const wasPaused = !!messageWindow\.pause/);
  assert.match(source, /messageWindow\._textState = null;\s*messageWindow\.pause = wasPaused/);
});

test("completed custom message redraw enables YEP word wrap without inventing a pause", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "adapter.js"), "utf8");
  const draws = [];
  let cacheReady = false;
  function Bitmap() { this.width = 580; }
  Bitmap.prototype.clear = function() {};
  Bitmap.prototype.drawText = function() {};
  function WindowBase() { this.children = []; this.contents = new Bitmap(); }
  WindowBase.prototype.createContents = function() { this.contents = new Bitmap(); };
  WindowBase.prototype.processNormalCharacter = function(textState) { textState.index += 1; };
  WindowBase.prototype.drawTextEx = function(text) {
    draws.push({ text: String(text), wordWrap: this._wordWrap });
  };
  function WindowMessage() {
    WindowBase.call(this);
    this.visible = true;
    this.openness = 255;
    this.pause = false;
    this._textState = null;
  }
  WindowMessage.prototype = Object.create(WindowBase.prototype);
  WindowMessage.prototype.constructor = WindowMessage;
  WindowMessage.prototype.startMessage = function() { this._textState = { text: "original", index: 0 }; };
  WindowMessage.prototype.update = function() {};
  WindowMessage.prototype.convertEscapeCharacters = function(text) { return String(text); };
  WindowMessage.prototype.newPage = function() {};
  WindowMessage.prototype.newLineX = function() { return 10; };
  WindowMessage.prototype.isOpen = function() { return true; };
  WindowMessage.prototype.setWordWrap = function(text) {
    this._wordWrap = /^<WordWrap>/i.test(text);
    return String(text).replace(/^<WordWrap>/i, "");
  };
  function GameMessage() { this._texts = []; }
  GameMessage.prototype.add = function(text) { this._texts.push(text); };
  GameMessage.prototype.allText = function() { return this._texts.join("\n"); };

  const raw = "<WordWrap>\\marCome on, OMORI! Have some fruit!\\!";
  const translated = "<WordWrap>\\marДавай, ОМОРИ! Ешь немного фруктов!\\!";
  const gameMessage = new GameMessage();
  gameMessage._texts = [raw];
  const message = new WindowMessage();
  const scene = { children: [message], _messageWindow: message };
  const windowObject = {
    Bitmap,
    Window_Base: WindowBase,
    Window_Message: WindowMessage,
    Game_Message: GameMessage,
    SceneManager: { _scene: scene },
    $gameMessage: gameMessage,
    VNRevivalTranslationCore: {
      fontFallbacks: () => ["sans-serif"],
      isRtlLanguage: () => false,
      tokenizeProtectedMarkup: core.tokenizeProtectedMarkup
    },
    __vnRevivalTranslator: {
      getMode: () => "translated",
      getTranslationScope: () => "screen",
      getLanguage: () => "ru",
      isSourceText: () => true,
      queryMemoryCache: (text) => cacheReady && text === raw ? translated : null,
      registerAdapterText() {}
    }
  };
  const intervalCallbacks = [];
  const context = {
    window: windowObject,
    document: { readyState: "complete" },
    setInterval(callback) { intervalCallbacks.push(callback); return 1; },
    clearInterval() {},
    console
  };
  vm.runInNewContext(source, context);
  intervalCallbacks.forEach((callback) => callback());
  message.startMessage();
  context.VNRevivalGameAdapter.collectVisibleTexts();
  message._textState = null;
  cacheReady = true;
  context.VNRevivalGameAdapter.onTranslationsChanged();

  assert.equal(draws.at(-1).text, "\\marДавай, ОМОРИ! Ешь немного фруктов!\\!");
  assert.equal(draws.at(-1).wordWrap, true);
  assert.equal(message.pause, false);
});

test("omori keeps Story dialogue-only and gates menu hooks behind wide translation modes", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "adapter.js"), "utf8");
  assert.match(source, /Window_Message/);
  assert.match(source, /Window_NameBox/);
  assert.match(source, /Window_ChoiceList/);
  assert.match(source, /const isWideTranslationActive = \(\) => isTranslateActive\(\) && currentTranslationScope\(\) !== "story"/);
  assert.match(source, /const isScreenTranslationActive = \(\) => isTranslateActive\(\) && currentTranslationScope\(\) === "screen"/);
  assert.match(source, /Bitmap\.prototype\.drawText = function\(text\)/);
  assert.match(source, /Window_Base\.prototype\.drawTextEx = function\(text\)/);
  assert.match(source, /owner && isWideTranslationActive\(\) && !isDialogueWindow\(owner\)/);
  assert.match(source, /refreshNonDialogueWindows\(\)/);
});

test("Screen Translation collects resolved visible canvas strings without scanning assets", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "adapter.js"), "utf8");
  assert.match(source, /collectVisibleTexts\(\)/);
  assert.match(source, /collectVisibleGameTexts = \(\) =>/);
  assert.match(source, /_vnRevivalScreenSourceText = resolvedMessageSourceText\(this, raw\)/);
  assert.match(source, /core\.tokenizeProtectedMarkup\(raw\)/);
  assert.match(source, /rememberVisibleWindowText\(owner, text\)/);
  assert.match(source, /visibleWindowTexts\.delete\(owner\)/);
  assert.match(source, /const approvedScreenTexts = new WeakMap\(\)/);
  assert.match(source, /if \(!isScreenTextApproved\(windowObject, str\)\) return str/);
  assert.match(source, /if \(!approvedScreenRefreshDepth\) approvedScreenTexts\.delete\(owner\)/);
  assert.match(source, /else if \(currentTranslationScope\(\) === "screen"\) refreshApprovedScreenWindows\(\)/);
  assert.doesNotMatch(source, /PreloadAllFiles|_data\.en\.text/);
});

test("Full uses cache automatically while Screen requires approval from the current capture", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "adapter.js"), "utf8");
  const draws = [];
  let scope = "story";
  function Bitmap() {}
  Bitmap.prototype.drawText = function(text) { draws.push(String(text)); };
  Bitmap.prototype.clear = function() {};
  function WindowBase() { this.children = []; this.createContents(); }
  WindowBase.prototype.createContents = function() { this.contents = new Bitmap(); };
  WindowBase.prototype.drawText = function(text) { this.contents.drawText(text, 0, 0, 200, 36, "left"); };
  WindowBase.prototype.drawTextEx = function(text) { this.contents.drawText(text, 0, 0, 200, 36, "left"); };
  WindowBase.prototype.processNormalCharacter = function(textState) { textState.index += 1; };
  function WindowMessage() { WindowBase.call(this); this.visible = true; }
  WindowMessage.prototype = Object.create(WindowBase.prototype);
  WindowMessage.prototype.constructor = WindowMessage;
  WindowMessage.prototype.startMessage = function() {};
  WindowMessage.prototype.update = function() {};
  WindowMessage.prototype.onEndOfText = function() { this._textState = null; this.pause = true; };
  WindowMessage.prototype.convertEscapeCharacters = function(text) {
    return String(text).replace(/\\V\[1\]/g, "3");
  };
  function GameMessage() { this._texts = []; }
  GameMessage.prototype.add = function(text) { this._texts.push(text); };
  GameMessage.prototype.allText = function() { return this._texts.join("\n"); };

  const autoCompleted = [];
  const scene = { children: [] };
  const windowObject = {
    Bitmap,
    Window_Base: WindowBase,
    Window_Message: WindowMessage,
    Game_Message: GameMessage,
    SceneManager: { _scene: scene },
    $gameMessage: new GameMessage(),
    VNRevivalTranslationCore: {
      fontFallbacks: () => ["sans-serif"],
      isRtlLanguage: () => false,
      tokenizeProtectedMarkup: core.tokenizeProtectedMarkup
    },
    __vnRevivalTranslator: {
      getMode: () => "translated",
      getTranslationScope: () => scope,
      getLanguage: () => "ru",
      isSourceText: (text) => /[A-Za-z]/.test(text),
      queryMemoryCache: (text) => ({
        ITEMS: "ПРЕДМЕТЫ",
        "Buy 3 APPLES": "Купить 3 ЯБЛОКА",
        "<WordWrap>\\marYou found 3 APPLES\\!": "<WordWrap>\\marВы нашли 3 ЯБЛОКА\\!"
      })[text] || null,
      registerCompletedScreenText(text) { autoCompleted.push(text); return true; },
      registerAdapterText() {}
    }
  };
  const intervalCallbacks = [];
  const context = {
    window: windowObject,
    document: { readyState: "complete" },
    setInterval(callback) { intervalCallbacks.push(callback); return 1; },
    clearInterval() {},
    console
  };
  vm.runInNewContext(source, context);
  intervalCallbacks.forEach((callback) => callback());

  const menu = new WindowBase();
  menu.refresh = function() { this.drawText("ITEMS"); };
  const message = new WindowMessage();
  const portrait = new WindowBase();
  let portraitRefreshes = 0;
  portrait.refresh = function() { portraitRefreshes += 1; this.contents.clear(); };
  scene.children.push(menu, message, portrait);

  menu.drawText("ITEMS");
  assert.equal(draws.at(-1), "ITEMS");

  scope = "full";
  context.VNRevivalGameAdapter.onTranslationScopeChanged("full");
  menu.drawTextEx("ITEMS");
  assert.equal(draws.at(-1), "ПРЕДМЕТЫ");
  message.drawText("ITEMS");
  assert.equal(draws.at(-1), "ITEMS");

  context.VNRevivalGameAdapter.onModeChanged("source");
  assert.equal(draws.at(-1), "ITEMS");
  context.VNRevivalGameAdapter.onModeChanged("translated");
  assert.equal(draws.at(-1), "ПРЕДМЕТЫ");

  scope = "story";
  context.VNRevivalGameAdapter.onTranslationScopeChanged("story");
  assert.equal(draws.at(-1), "ITEMS");

  scope = "screen";
  menu.refresh = function() {
    this.contents.clear();
    this.drawText("Buy 3 APPLES");
  };
  context.VNRevivalGameAdapter.onTranslationScopeChanged("screen");
  windowObject.$gameMessage._texts = ["<WordWrap>\\marYou found \\V[1] APPLES\\!"];
  message.startMessage();
  message.onEndOfText();
  message.onEndOfText();
  assert.deepEqual(autoCompleted, ["<WordWrap>\\marYou found 3 APPLES\\!"]);
  const visibleTexts = context.VNRevivalGameAdapter.collectVisibleTexts();
  assert.ok(visibleTexts.includes("Buy 3 APPLES"));
  assert.ok(visibleTexts.includes("<WordWrap>\\marYou found 3 APPLES\\!"));
  assert.ok(!visibleTexts.some((text) => text.includes("\u001b")));
  assert.ok(!visibleTexts.includes("ITEMS"));

  const portraitRefreshesBeforeTranslation = portraitRefreshes;
  context.VNRevivalGameAdapter.onTranslationsChanged();
  assert.equal(draws.at(-1), "Купить 3 ЯБЛОКА");
  assert.equal(portraitRefreshes, portraitRefreshesBeforeTranslation);
  menu.refresh();
  assert.equal(draws.at(-1), "Buy 3 APPLES");
});

test("translated system labels reduce Cyrillic fallback size, fit overflow, and restore the window font", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "adapter.js"), "utf8");
  const draws = [];
  function Bitmap() { this.fontSize = 28; this.width = 180; }
  Bitmap.prototype.measureTextWidth = function(text) {
    return String(text).length * this.fontSize;
  };
  Bitmap.prototype.drawText = function(text) {
    draws.push({ text: String(text), fontSize: this.fontSize });
  };
  Bitmap.prototype.clear = function() {};
  function WindowBase() { this.children = []; this.createContents(); }
  WindowBase.prototype.createContents = function() { this.contents = new Bitmap(); };
  WindowBase.prototype.drawText = function(text, width) {
    this.contents.drawText(text, 0, 0, width, 36, "left");
  };
  WindowBase.prototype.drawTextEx = function(text) { this.contents.drawText(text, 0, 0, 180, 36, "left"); };
  WindowBase.prototype.processNormalCharacter = function(textState) { textState.index += 1; };
  function WindowMessage() { WindowBase.call(this); }
  WindowMessage.prototype = Object.create(WindowBase.prototype);
  WindowMessage.prototype.constructor = WindowMessage;
  WindowMessage.prototype.startMessage = function() {};
  WindowMessage.prototype.update = function() {};
  function GameMessage() { this._texts = []; }
  GameMessage.prototype.add = function(text) { this._texts.push(text); };
  GameMessage.prototype.allText = function() { return this._texts.join("\n"); };

  const scene = { children: [] };
  const windowObject = {
    Bitmap,
    Window_Base: WindowBase,
    Window_Message: WindowMessage,
    Game_Message: GameMessage,
    SceneManager: { _scene: scene },
    $gameMessage: new GameMessage(),
    VNRevivalTranslationCore: {
      fontFallbacks: () => ["sans-serif"],
      isRtlLanguage: () => false,
      tokenizeProtectedMarkup: core.tokenizeProtectedMarkup
    },
    __vnRevivalTranslator: {
      getMode: () => "translated",
      getTranslationScope: () => "full",
      getLanguage: () => "ru",
      isSourceText: () => true,
      queryMemoryCache: (text) => ({
        BASIL: "ВАСИЛИЙ",
        INCOMPLETE: "НЕПОЛНЫЙ"
      })[text] || null,
      registerAdapterText() {}
    }
  };
  const intervalCallbacks = [];
  const context = {
    window: windowObject,
    document: { readyState: "complete" },
    setInterval(callback) { intervalCallbacks.push(callback); return 1; },
    clearInterval() {},
    console
  };
  vm.runInNewContext(source, context);
  intervalCallbacks.forEach((callback) => callback());

  const menu = new WindowBase();
  scene.children.push(menu);
  menu.drawText("BASIL", 180);
  assert.equal(draws.at(-1).text, "ВАСИЛИЙ");
  assert.equal(draws.at(-1).fontSize, 20);
  assert.equal(menu.contents.fontSize, 28);

  menu.drawText("INCOMPLETE", 100);
  assert.equal(draws.at(-1).text, "НЕПОЛНЫЙ");
  assert.equal(draws.at(-1).fontSize, 16);
  assert.equal(menu.contents.fontSize, 28);

  menu.drawText("ORIGINAL", 100);
  assert.equal(draws.at(-1).text, "ORIGINAL");
  assert.equal(draws.at(-1).fontSize, 28);
});

test("screen translation resumes a message paused by an OMORI flow command after replacing its text", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "adapter.js"), "utf8");
  assert.match(source, /this\.newPage\(this\._textState\);\s*this\._textState\.text = translatedText;\s*this\._textState\.index = 0;\s*this\.pause = false;\s*this\._waitCount = 0;/);
});

test("omori name boxes reserve Cyrillic width and shrink only at the screen edge", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "adapter.js"), "utf8");
  assert.match(source, /NAME_BOX_SAFETY_PADDING/);
  assert.match(source, /const targetFontSize = measuredWidth > availableWidth/);
  assert.match(source, /const preferredFontSize = Math\.max\(16, standardFontSize - 8\)/);
  assert.match(source, /this\.width = Math\.min\(maxWidth/);
  assert.match(source, /this\.contents\.fontSize = targetFontSize/);
  assert.match(source, /refresh_draw_text_position/);
  assert.match(source, /\[\\u0400-\\u04FF\].*test\(String\(translated\)\)/);
  assert.match(source, /this\.drawTextEx\(this\._text \|\| translated, drawX, drawY/);
});

test("omori name boxes use the same cache-backed translation path as dialogue", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "adapter.js"), "utf8");
  assert.doesNotMatch(source, /RUSSIAN_CHARACTER_NAMES/);
  assert.doesNotMatch(source, /translateCharacterName/);
  assert.match(source, /const translated = text && isTranslateActive\(\) \? translateString\(text, this\) : text/);
});

test("omori RTL messages draw one shaped line while preserving message pacing", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "adapter.js"), "utf8");
  const draws = [];
  let clears = 0;
  function Bitmap() {
    this.width = 300;
    this.fontSize = 28;
    this._context = { direction: "inherit" };
  }
  Bitmap.prototype.drawText = function(text, x, y, maxWidth, lineHeight, align) {
    draws.push({ text, x, y, maxWidth, lineHeight, align, direction: this._context.direction });
  };
  Bitmap.prototype.clear = function() { clears += 1; };
  function WindowBase() { this.contents = new Bitmap(); }
  WindowBase.prototype.processNormalCharacter = function(textState) { textState.index += 1; };
  WindowBase.prototype.textPadding = function() { return 12; };
  WindowBase.prototype.textWidth = function(text) { return String(text).length * 10; };
  WindowBase.prototype.calcTextHeight = function() { return 36; };
  function WindowMessage() { WindowBase.call(this); this.visible = true; }
  WindowMessage.prototype = Object.create(WindowBase.prototype);
  WindowMessage.prototype.constructor = WindowMessage;
  WindowMessage.prototype.startMessage = function() {};
  WindowMessage.prototype.update = function() {};
  WindowMessage.prototype.newPage = function() {};
  WindowMessage.prototype.onEndOfText = function() { this._textState = null; this.pause = true; };
  function WindowChoiceList() { WindowBase.call(this); this._commands = ["YES"]; }
  WindowChoiceList.prototype = Object.create(WindowBase.prototype);
  WindowChoiceList.prototype.constructor = WindowChoiceList;
  WindowChoiceList.prototype.commandName = function(index) { return this._commands[index]; };
  WindowChoiceList.prototype.drawItem = function(index) { this.contents.drawText(this.commandName(index), 0, 0, 120, 36, "left"); };
  WindowChoiceList.prototype.itemRectForText = function() { return { x: 0, y: 0, width: 120, height: 36 }; };
  WindowChoiceList.prototype.resetTextColor = function() {};
  WindowChoiceList.prototype.changePaintOpacity = function() {};
  WindowChoiceList.prototype.isCommandEnabled = function() { return true; };
  WindowChoiceList.prototype.lineHeight = function() { return 36; };
  WindowChoiceList.prototype.drawTextEx = function(text, x, y, width) { this.contents.drawText(text, x, y, width, 36, "left"); };
  function GameMessage() { this._texts = []; }
  GameMessage.prototype.add = function(text) { this._texts.push(text); };
  GameMessage.prototype.allText = function() { return this._texts.join("\n"); };
  GameMessage.prototype.hasText = function() { return this._texts.length > 0; };
  const windowObject = {
    Bitmap,
    Window_Base: WindowBase,
    Window_Message: WindowMessage,
    Window_ChoiceList: WindowChoiceList,
    Game_Message: GameMessage,
    $gameMessage: new GameMessage(),
    VNRevivalTranslationCore: {
      isRtlLanguage: (language) => language === "fa",
      fontFallbacks: () => ["Noto Sans Arabic", "sans-serif"]
    },
    __vnRevivalTranslator: {
      getMode: () => "translated",
      getLanguage: () => "fa",
      isSourceText: () => true,
      queryMemoryCache: (text) => text === "YES" ? "\u0628\u0644\u0647" : null,
      registerAdapterText() {}
    }
  };
  const intervalCallbacks = [];
  vm.runInNewContext(source, {
    window: windowObject,
    document: { readyState: "complete" },
    setInterval(callback) { intervalCallbacks.push(callback); return 1; },
    clearInterval() {},
    console
  });
  intervalCallbacks.forEach((callback) => callback());

  const message = new WindowMessage();
  const state = { text: "\u0633\u0644\u0627\u0645 \u062F\u0646\u06CC\u0627", index: 0, left: 0, x: 0, y: 0, height: 36 };
  message._textState = state;
  const lineLength = state.text.length;
  message.processNormalCharacter(state);
  assert.equal(state.index, 1);
  for (let index = 1; index < lineLength; index += 1) {
    message.processNormalCharacter(state);
  }

  assert.deepEqual(draws.map((draw) => draw.text), ["\u0633\u0644\u0627\u0645 \u062F\u0646\u06CC\u0627"]);
  assert.equal(draws[0].align, "right");
  assert.equal(draws[0].direction, "rtl");
  assert.equal(state.index, lineLength);

  message.onEndOfText();
  assert.equal(clears, 1);
  assert.equal(draws.length, 2);
  assert.equal(draws[1].text, "\u0633\u0644\u0627\u0645 \u062F\u0646\u06CC\u0627");
  assert.equal(draws[1].align, "right");
  assert.equal(message.pause, true);

  const systemBitmap = new Bitmap();
  systemBitmap.drawText("YES", 0, 0, 120, 36, "left");
  assert.equal(draws[2].text, "YES");
  assert.equal(draws[2].align, "left");
  assert.equal(draws[2].direction, "inherit");

  const dialogueChoices = new WindowChoiceList();
  dialogueChoices.drawItem(0);
  assert.equal(draws[3].text, "\u0628\u0644\u0647");
  assert.equal(draws[3].align, "right");
  assert.equal(draws[3].direction, "rtl");
});

test("omori message hook preserves raw text and redraws a cached multiline translation", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "adapter.js"), "utf8");
  function GameMessage() { this._texts = []; }
  GameMessage.prototype.add = function(text) { this._texts.push(text); };
  GameMessage.prototype.allText = function() { return this._texts.join("\n"); };
  GameMessage.prototype.hasText = function() { return this._texts.length > 0; };
  function WindowMessage() { this.visible = true; this._textState = null; }
  WindowMessage.prototype.startMessage = function() { this._textState = { text: "original", index: 0 }; };
  WindowMessage.prototype.update = function() {};
  WindowMessage.prototype.convertEscapeCharacters = function(text) {
    if (!/^<WordWrap>/i.test(text)) return text.replace(/<br>/gi, "");
    return text.replace(/^<WordWrap>/i, "").replace(/<br>/gi, "\n");
  };
  WindowMessage.prototype.newPage = function() {};
  function Bitmap() {}
  Bitmap.prototype.drawText = function() {};

  const raw = "<WordWrap>What's the rush, OMORI?\\!<br>We should say hello first!\\aub";
  const translated = "Что за спешка, ОМОРИ?\\!<br>Сначала поздороваемся!\\aub";
  const gameMessage = new GameMessage();
  gameMessage._texts = [raw];
  const seen = [];
  const windowObject = {
    Game_Message: GameMessage,
    Window_Message: WindowMessage,
    Window_Base: function WindowBase() {},
    Bitmap,
    $gameMessage: gameMessage,
    __vnRevivalTranslator: {
      getMode: () => "translated",
      isSourceText: () => true,
      queryMemoryCache(text) { seen.push(text); return text === raw ? translated : null; },
      registerAdapterText() {}
    }
  };
  const intervalCallbacks = [];
  const context = {
    window: windowObject,
    document: { readyState: "complete" },
    setInterval(callback) { intervalCallbacks.push(callback); return 1; },
    clearInterval() {},
    console
  };
  vm.runInNewContext(source, context);
  intervalCallbacks.forEach((callback) => callback());
  const messageWindow = new WindowMessage();
  messageWindow.startMessage();
  assert.equal(messageWindow._vnRevivalCurrentText, raw);
  assert.equal(messageWindow._textState.text, "Что за спешка, ОМОРИ?\\!\nСначала поздороваемся!\\aub");
  assert.ok(seen.includes(raw));
});
