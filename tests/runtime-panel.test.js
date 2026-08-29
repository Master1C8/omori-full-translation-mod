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
  assert.match(html, /href="https:\/\/example\.test\/"/);
  assert.match(html, />VN Revival<\/a>/);
  assert.match(html, /class="panel"/);
  assert.match(html, /class="packModal" role="dialog"/);
});
