"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../src/translation-core.js");
const progress = require("../src/runtime-progress.js");

test("word progress excludes protected OMORI markup", () => {
  assert.equal(progress.countTranslationWords("\\marHello there!\\!<br>Two words.", core.tokenizeProtectedMarkup), 4);
});

test("progress text distinguishes calculation, ETA, and rate-limit cooldown", () => {
  assert.equal(progress.formatRetryCountdown(65), "1m 5s");
  assert.equal(
    progress.progressText({ completedWords: 0, totalWords: 100, remainingMs: null }),
    "Words: 0/100 · Time left: calculating…"
  );
  assert.equal(
    progress.progressText({ completedWords: 10, totalWords: 100, remainingMs: 120000 }),
    "Words: 10/100 · Time left: about 2 min"
  );
  assert.equal(
    progress.progressText({ completedWords: 10, totalWords: 100, waitSeconds: 65, providerLabel: "Google Translate" }),
    "Words: 10/100 · Rate limited by Google Translate · retrying in 1m 5s"
  );
});

test("ETA tracks active work and excludes paused time", () => {
  let currentTime = 0;
  const tracker = progress.createEtaTracker(() => currentTime);
  tracker.update(0, 100);
  currentTime = 2000;
  assert.equal(tracker.update(10, 100), null);
  currentTime = 4000;
  assert.equal(tracker.update(20, 100), 16000);
  tracker.pause();
  currentTime = 14000;
  assert.equal(tracker.update(30, 100), 12850);
  currentTime = 16000;
  assert.equal(tracker.update(100, 100), 0);
});

test("ETA does not count cache-only preparation before the first fresh result", () => {
  let currentTime = 0;
  const tracker = progress.createEtaTracker(() => currentTime);
  tracker.update(0, 100);
  currentTime = 60000;
  tracker.update(0, 100);
  currentTime = 62000;
  assert.equal(tracker.update(10, 100), null);
  currentTime = 64000;
  assert.equal(tracker.update(20, 100), 16000);
});
