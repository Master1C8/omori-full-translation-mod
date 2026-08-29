(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VNRevivalRuntimeProgress = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function formatRetryCountdown(seconds) {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
  }

  function countTranslationWords(value, tokenizeProtectedMarkup) {
    if (typeof tokenizeProtectedMarkup !== "function") {
      throw new TypeError("A protected-markup tokenizer is required");
    }
    const plainText = tokenizeProtectedMarkup(String(value || ""))
      .filter((segment) => segment.type === "text")
      .map((segment) => segment.value)
      .join(" ");
    const words = plainText.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu);
    return words ? words.length : 0;
  }

  function createEtaTracker(now = () => performance.now()) {
    const points = [];
    let pausedAt = 0;
    let pausedDuration = 0;
    let lastEstimate = null;

    function pause() {
      if (!pausedAt) pausedAt = now();
      return lastEstimate;
    }

    function update(completedUnits, totalUnits) {
      const currentTime = now();
      if (pausedAt) {
        pausedDuration += currentTime - pausedAt;
        pausedAt = 0;
      }
      const activeTime = currentTime - pausedDuration;
      const completed = Math.max(0, Math.floor(Number(completedUnits) || 0));
      const total = Math.max(completed, Math.floor(Number(totalUnits) || 0));
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

  function progressText(options = {}) {
    const completed = Math.max(0, Math.floor(Number(options.completedWords) || 0));
    const total = Math.max(completed, Math.floor(Number(options.totalWords) || 0));
    const wordProgress = `Words: ${completed.toLocaleString("en-US")}/${total.toLocaleString("en-US")}`;
    if (Number(options.waitSeconds) > 0) {
      const providerLabel = options.providerLabel || "Translation provider";
      return `${wordProgress} · Rate limited by ${providerLabel} · retrying in ${formatRetryCountdown(Math.ceil(options.waitSeconds))}`;
    }
    if (!completed || !total || !Number.isFinite(options.remainingMs)) {
      return `${wordProgress} · Time left: calculating…`;
    }
    if (options.remainingMs < 60000) return `${wordProgress} · Time left: less than 1 min`;
    return `${wordProgress} · Time left: about ${Math.ceil(options.remainingMs / 60000)} min`;
  }

  return Object.freeze({
    contractVersion: 1,
    formatRetryCountdown,
    countTranslationWords,
    createEtaTracker,
    progressText
  });
});
