"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const core = require("../../../translation-core.js");

require(path.join(__dirname, "..", "adapter.js"));
const adapter = globalThis.VNRevivalGameAdapter;

test("CoC2 prototype exposes realtime DOM categories", () => {
  assert.equal(adapter.contractVersion, 2);
  assert.match(adapter.categorySelectors.story, /scene|story/i);
  assert.match(adapter.categorySelectors.control, /button/i);
  assert.ok(adapter.contextSelectors.includes("[role='tooltip']"));
  assert.ok(adapter.privateSelectors.includes("[data-coc2-private]"));
  assert.ok(adapter.privateSelectors.includes("input"));
  assert.equal(adapter.hasSourceText("Continue adventure", core), true);
  assert.equal(adapter.hasSourceText("12345", core), false);
});

test("CoC2 prototype contains no asset extraction or game-provider requests", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "adapter.js"), "utf8");
  assert.doesNotMatch(source, /\.HERO|\.KEL|PreloadAllFiles|game\/strings|fetch\(|translateText\(/i);
});
