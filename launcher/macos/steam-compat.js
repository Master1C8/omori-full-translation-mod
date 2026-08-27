(() => {
  "use strict";

  const steamArgument = process.env.VNREVIVAL_STEAM_ARGUMENT || "";
  const match = /^--([A-Za-z0-9]{32})$/.exec(steamArgument);
  delete process.env.VNREVIVAL_STEAM_ARGUMENT;
  if (!match) return;

  const steamKey = Buffer.from(match[1], "utf8");
  const crypto = require("crypto");
  const createDecipheriv = crypto.createDecipheriv;
  const Module = require("module");
  const loadModule = Module._load;

  crypto.createDecipheriv = function(algorithm, key, iv, options) {
    const invalidOmoriKey = algorithm === "aes-256-ctr"
      && typeof key === "string"
      && Buffer.byteLength(key, "utf8") !== 32;
    return createDecipheriv.call(this, algorithm, invalidOmoriKey ? steamKey : key, iv, options);
  };

  // OMORI's bundled Greenworks addon is Intel-only and cannot be loaded by
  // the native ARM64 runtime. Keep the game's startup check satisfied while
  // making unsupported Steam features harmless in this compatibility mode.
  // Saves remain local; achievements, cloud helpers, and the overlay are off.
  const invokeSuccess = (args, value) => {
    const callbacks = args.filter((argument) => typeof argument === "function");
    if (callbacks.length > 0) queueMicrotask(() => callbacks[0](value));
    return true;
  };
  const greenworksMethods = {
    initAPI: () => true,
    init: () => true,
    isSteamRunning: () => true,
    getAppId: () => 1150690,
    getAchievementNames: () => [],
    getNumberOfAchievements: () => 0,
    getAchievement: (...args) => invokeSuccess(args, false),
    activateAchievement: (...args) => invokeSuccess(args),
    clearAchievement: (...args) => invokeSuccess(args),
    on: () => greenworksStub,
    once: () => greenworksStub,
    removeListener: () => greenworksStub,
    removeAllListeners: () => greenworksStub,
    emit: () => false
  };
  const greenworksStub = new Proxy(greenworksMethods, {
    get(target, property) {
      if (property in target) return target[property];
      if (property === "_steam_events") return { on: () => {} };
      return (...args) => invokeSuccess(args);
    }
  });
  Module._load = function(request, parent, isMain) {
    if (/^(?:\.\/)?(?:js\/)?libs\/greenworks$/.test(request)) {
      return greenworksStub;
    }
    return loadModule.call(this, request, parent, isMain);
  };

  // A child NW.js process started by the translator can initially be marked
  // hidden by macOS. PIXI pauses its ticker in that state, leaving frame zero
  // on screen. Activate the game once after the document finishes loading.
  let activationAttempts = 0;
  const activateGameWindow = () => {
    activationAttempts += 1;
    try {
      const gameWindow = require("nw.gui").Window.get();
      gameWindow.show();
      gameWindow.restore();
      gameWindow.focus();
    } catch (_) {
      // The NW window may not exist during the first preload tick.
    }
    if (document.hidden && activationAttempts < 10) {
      setTimeout(activateGameWindow, 250);
    }
  };
  setTimeout(activateGameWindow, 250);
})();
