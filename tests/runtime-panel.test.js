"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const panel = require("../src/runtime-panel.js");

test("runtime panel exposes a stable rendering contract", () => {
  assert.equal(panel.contractVersion, 1);
  assert.equal(typeof panel.render, "function");
});

test("runtime panel renders product-owned labels and links", () => {
  const html = panel.render({
    productName: "OMORI Translator",
    version: "0.9.44",
    interruptTranslationLabel: "Interrupt translation (progress will be saved)",
    openCodeGoReferralUrl: "https://example.test/referral",
    siteUrl: "https://example.test/",
    siteName: "VN Revival"
  });
  assert.match(html, /OMORI Translator 0\.9\.44/);
  assert.match(html, /Interrupt translation \(progress will be saved\)/);
  assert.match(html, /href="https:\/\/example\.test\/referral"/);
  assert.match(html, /<option value="opencode-zen">OpenCode Zen<\/option>/);
  assert.match(html, /\$5 in Zen credits\. OpenCode Go requires a separate \$10\/month subscription/);
  assert.match(html, /href="https:\/\/example\.test\/"/);
  assert.match(html, />VN Revival<\/a>/);
  assert.match(html, /class="panel"/);
  assert.match(html, /class="secondary translationLogHold"[^>]+aria-pressed="false"[^>]*>Stop scroll<\/button>/);
  assert.match(html, /class="packModal" role="dialog"/);
  assert.match(html, /class="screenAuto" type="checkbox"/);
  assert.match(html, /Automatically translate completed dialogue/);
  assert.match(html, /class="languageControl"/);
  assert.match(html, /class="officialLocalizationNotice" role="status" hidden/);
  assert.match(html, /class="openAICompatibleUsage">Exact usage: no provider responses recorded\.<\/div>/);
  assert.match(html, /\.openAICompatibleUsage\{margin-top:5px/);
  assert.match(html, /\.bulkCancel\.finished\{border-color:#69b77f!important;background:#2f7d4a!important/);
  assert.match(html, /\.panel\.officialLocalization>\.settings>\*:not\(\.languageControl\)/);
  assert.doesNotMatch(html, /Allow online translation|allowBulk|cancelBulk|class="privacy"/);
});
