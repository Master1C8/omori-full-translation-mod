(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VNRevivalTranslationCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const GOOGLE_MAX_CHARS = 3500;
  const RTL_LANGUAGES = new Set([
    "ar", "bal", "bm-Nkoo", "ckb", "dv", "fa", "fa-AF", "iw", "he",
    "ms-Arab", "pa-Arab", "ps", "sd", "ug", "ur", "yi"
  ]);
  const TALL_SCRIPT_LANGUAGES = new Set([
    "am", "ar", "as", "bn", "bo", "dz", "fa", "fa-AF", "gu", "hi",
    "km", "kn", "lo", "ml", "mr", "my", "ne", "or", "pa", "pa-Arab",
    "ps", "si", "ta", "te", "th", "ti", "ur"
  ]);
  const CJK_LANGUAGES = new Set(["ja", "ko", "yue", "zh-CN", "zh-TW"]);
  const CONTEXT_MARKER_PREFIX = "VRCTXSEP";
  const CONTEXT_MARKER_SUFFIX = "X";
  const PROTECTED_MARKUP_VERSION = "omori-markup-v3";
  const OMORI_BARE_COMMANDS = [
    "itemget", "leclear", "sxbf", "spxh", "shaw", "oooo", "art", "ber",
    "red-glasses lady", "old hobo", "kel-mom",
    "omori", "ren", "kel", "aub", "her", "bas", "mar", "smm", "cap", "ms", "plu", "kim", "van", "po"
  ].sort((left, right) => right.length - left.length);
  let graphemeSegmenter;

  function isRtlLanguage(language) {
    return RTL_LANGUAGES.has(String(language || ""));
  }

  function isTallScriptLanguage(language) {
    return TALL_SCRIPT_LANGUAGES.has(String(language || ""));
  }

  function isCjkLanguage(language) {
    return CJK_LANGUAGES.has(String(language || ""));
  }

  function fontFallbacks(language) {
    const code = String(language || "");
    const languagePart = code.split("-")[0];
    const scriptFonts = {
      am: ["Noto Sans Ethiopic", "Kefa"],
      ar: ["Noto Sans Arabic", "Geeza Pro"],
      as: ["Noto Sans Bengali", "Bangla Sangam MN"],
      bn: ["Noto Sans Bengali", "Bangla Sangam MN"],
      bo: ["Noto Sans Tibetan", "Kailasa"],
      dz: ["Noto Sans Tibetan", "Kailasa"],
      dv: ["Noto Sans Thaana"],
      fa: ["Noto Sans Arabic", "Geeza Pro"],
      gu: ["Noto Sans Gujarati", "Gujarati Sangam MN"],
      he: ["Noto Sans Hebrew", "Arial Hebrew"],
      hi: ["Noto Sans Devanagari", "Devanagari Sangam MN"],
      iw: ["Noto Sans Hebrew", "Arial Hebrew"],
      ja: ["Noto Sans CJK JP", "Hiragino Sans", "Yu Gothic"],
      km: ["Noto Sans Khmer", "Khmer Sangam MN"],
      kn: ["Noto Sans Kannada", "Kannada Sangam MN"],
      ko: ["Noto Sans CJK KR", "Apple SD Gothic Neo", "Malgun Gothic"],
      lo: ["Noto Sans Lao", "Lao Sangam MN"],
      ml: ["Noto Sans Malayalam", "Malayalam Sangam MN"],
      mr: ["Noto Sans Devanagari", "Devanagari Sangam MN"],
      my: ["Noto Sans Myanmar", "Myanmar Sangam MN"],
      ne: ["Noto Sans Devanagari", "Devanagari Sangam MN"],
      or: ["Noto Sans Oriya", "Oriya Sangam MN"],
      pa: ["Noto Sans Gurmukhi", "Gurmukhi MN"],
      ps: ["Noto Sans Arabic", "Geeza Pro"],
      sd: ["Noto Sans Arabic", "Geeza Pro"],
      si: ["Noto Sans Sinhala", "Sinhala Sangam MN"],
      ta: ["Noto Sans Tamil", "Tamil Sangam MN"],
      te: ["Noto Sans Telugu", "Telugu Sangam MN"],
      th: ["Noto Sans Thai", "Thonburi", "Leelawadee UI"],
      ti: ["Noto Sans Ethiopic", "Kefa"],
      ug: ["Noto Sans Arabic", "Geeza Pro"],
      ur: ["Noto Nastaliq Urdu", "Noto Sans Arabic", "Geeza Pro"],
      yi: ["Noto Sans Hebrew", "Arial Hebrew"],
      yue: ["Noto Sans CJK HK", "PingFang HK", "Microsoft JhengHei"],
      zh: code === "zh-TW"
        ? ["Noto Sans CJK TC", "PingFang TC", "Songti TC", "STHeiti", "Microsoft JhengHei"]
        : ["Noto Sans CJK SC", "PingFang SC", "Songti SC", "Hiragino Sans GB", "STHeiti", "Microsoft YaHei"]
    };
    if (code === "bm-Nkoo") return ["Noto Sans NKo", "Ebrima", "Noto Sans", "Segoe UI", "Arial", "sans-serif"];
    if (code === "ms-Arab" || code === "pa-Arab") return ["Noto Sans Arabic", "Geeza Pro", "Noto Sans", "Segoe UI", "Arial", "sans-serif"];
    return (scriptFonts[languagePart] || []).concat(["Noto Sans", "Noto Sans Symbols 2", "Segoe UI", "Arial", "sans-serif"]);
  }

  function htmlLanguageCode(language) {
    const code = String(language || "");
    const aliases = {
      iw: "he",
      jw: "jv",
      tl: "fil",
      "zh-CN": "zh-Hans",
      "zh-TW": "zh-Hant",
      ber: "zgh-Tfng",
      "ber-Latn": "zgh-Latn"
    };
    return aliases[code] || code;
  }

  function providerLanguageCode(provider, language) {
    const code = String(language || "");
    return code;
  }

  function providerSupportsLanguage(provider, language, argosLanguages) {
    const selected = String(provider || "google");
    const code = providerLanguageCode(selected, language);
    if (!code) return false;
    if (selected === "argos") return Array.isArray(argosLanguages) && argosLanguages.includes(code);
    return selected === "google";
  }

  function normalizeText(value) {
    return String(value == null ? "" : value)
      .replace(/\r/g, "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n")
      .trim();
  }

  function stripOmoriPrefixes(value) {
    return normalizeText(String(value == null ? "" : value)
      .replace(/^\s*(?:<wordwrap(?:\s*:[^>]*)?>\s*)+/i, "")
      .replace(/<br\s*\/?\s*>/gi, "\n"))
      .replace(/^\\n<[^>]+>/i, "")
      .replace(/^\\(ren|kel|aub|her|bas|mar|omori|smm|cap|ms|plu|kim|van|art|ber|kel-mom|red-glasses lady|old hobo|po)/i, "")
      .trim();
  }

  function hasEnglishText(value) {
    const text = normalizeText(value);
    if (text.length < 2 || !/[A-Za-z]/.test(text)) return false;
    if (/^(https?:|file:|www\.|[A-Z]:\\)/i.test(text)) return false;
    // Protect asset paths but allow RPG Maker escape codes (which use backslashes)
    if (/^(img|audio|effects|fonts|js|data|movies|icon)\//i.test(text)) return false;
    if (text.includes("_") && !text.includes(" ")) return false; // Ignore identifiers (e.g. Maincharacter_Mari)
    if (/^[A-Za-z0-9_.-]+\.(png|jpe?g|gif|webp|svg|js|css|json|ogg|m4a|mp3|rpgmvp|rpgmvo)$/i.test(text)) return false;
    if (/^[A-F0-9]{8,}$/i.test(text)) return false;
    return true;
  }

  function plainProtectedText(value) {
    return tokenizeProtectedMarkup(value)
      .filter((segment) => segment.type === "text")
      .map((segment) => segment.value)
      .join(" ");
  }

  function isOpaqueEncodedText(value) {
    const source = String(value == null ? "" : value);
    if (!/\\n<ROBOHEART>/i.test(source)) return false;
    const encoded = source
      .replace(/<br\s*\/?\s*>/gi, "")
      .replace(/\\n<ROBOHEART>[\s\S]*$/i, "")
      .replace(/\s+/g, "");
    return encoded.length >= 16 && /^[A-Za-z0-9+/]+={0,2}$/.test(encoded);
  }

  function isFontCoverageText(value) {
    const text = plainProtectedText(value).replace(/\s+/g, " ");
    return /ABCDEFGHIJKLMNOPQRSTUVWXYZ/.test(text) && /abcdefghijklmnopqrstuvwxyz/.test(text);
  }

  function hasTranslatableText(value) {
    if (isOpaqueEncodedText(value) || isFontCoverageText(value)) return false;
    return tokenizeProtectedMarkup(value).some((segment) =>
      segment.type === "text" && (hasEnglishText(segment.value) || /^[AIai]$/.test(segment.value.trim()))
    );
  }

  function protectedTokenAt(text, offset) {
    const rest = text.slice(offset);
    let match = rest.match(/^VRCTXSEP\d+X/);
    if (match) return match[0];

    if (rest[0] === "\\") {
      for (const command of OMORI_BARE_COMMANDS) {
        if (rest.slice(1, command.length + 1).toLowerCase() === command) {
          return rest.slice(0, command.length + 1);
        }
      }
      match = rest.match(/^\\[A-Za-z][A-Za-z0-9_-]*(?:\[[^\]\r\n]*\]|<[^<>\r\n]*>)/);
      if (match) return match[0];
      match = rest.match(/^\\(?:[A-Za-z]{1,3}|[^A-Za-z0-9\r\n])/);
      if (match) return match[0];
    }

    match = rest.match(/^<[^<>\r\n]{1,240}>/);
    if (match) return match[0];
    match = rest.match(/^\[[^\]\r\n]{1,240}\]/);
    if (match) return match[0];
    match = rest.match(/^[☐□■◆◇★☆♥♡♠♣♦]+/u);
    if (match) return match[0];
    return "";
  }

  function tokenizeProtectedMarkup(value) {
    const text = String(value == null ? "" : value);
    const segments = [];
    let textStart = 0;
    let offset = 0;
    while (offset < text.length) {
      let token = protectedTokenAt(text, offset);
      const previous = segments.length ? segments[segments.length - 1] : null;
      if (!token && previous && previous.type === "token" && isWhitespaceRigidToken(previous.value)) {
        const boundary = text.slice(offset).match(/^[!?…]+(?=\s)/u);
        if (boundary) token = boundary[0];
      }
      if (!token) {
        offset += 1;
        continue;
      }
      if (offset > textStart) segments.push({ type: "text", value: text.slice(textStart, offset) });
      segments.push({ type: "token", value: token });
      offset += token.length;
      textStart = offset;
    }
    if (textStart < text.length) segments.push({ type: "text", value: text.slice(textStart) });
    return segments;
  }

  function protectedMarkupTokens(value) {
    return tokenizeProtectedMarkup(value)
      .filter((segment) => segment.type === "token")
      .map((segment) => segment.value);
  }

  function protectedMarkupMatches(source, translation) {
    const sourceTokens = protectedMarkupTokens(source);
    const translatedTokens = protectedMarkupTokens(translation);
    return sourceTokens.length === translatedTokens.length
      && sourceTokens.every((token, index) => token === translatedTokens[index]);
  }

  function protectedMarkupParts(value) {
    const tokens = [];
    const textParts = [""];
    for (const segment of tokenizeProtectedMarkup(value)) {
      if (segment.type === "token") {
        tokens.push(segment.value);
        textParts.push("");
      } else {
        textParts[textParts.length - 1] += segment.value;
      }
    }
    return { tokens, textParts };
  }

  function isWhitespaceRigidToken(token) {
    return /^<br\s*\/?\s*>$/i.test(token)
      || /^\\[.!|^{}$\\]$/.test(token);
  }

  function leadingWhitespace(value) {
    return (String(value || "").match(/^\s*/) || [""])[0];
  }

  function trailingWhitespace(value) {
    return (String(value || "").match(/\s*$/) || [""])[0];
  }

  function protectedMarkupLayoutMatches(source, translation) {
    if (!protectedMarkupMatches(source, translation)) return false;
    const sourceParts = protectedMarkupParts(source);
    const targetParts = protectedMarkupParts(translation);
    for (let index = 0; index < sourceParts.tokens.length; index += 1) {
      const token = sourceParts.tokens[index];
      const sourceHasTextBefore = sourceParts.textParts.slice(0, index + 1).some((part) => part.trim());
      const targetHasTextBefore = targetParts.textParts.slice(0, index + 1).some((part) => part.trim());
      const sourceHasTextAfter = sourceParts.textParts.slice(index + 1).some((part) => part.trim());
      const targetHasTextAfter = targetParts.textParts.slice(index + 1).some((part) => part.trim());
      if (!sourceHasTextBefore && targetHasTextBefore) return false;
      if (!sourceHasTextAfter && targetHasTextAfter) return false;
      if (isWhitespaceRigidToken(token) || !sourceHasTextBefore || !sourceHasTextAfter) {
        if (trailingWhitespace(sourceParts.textParts[index]) !== trailingWhitespace(targetParts.textParts[index])) return false;
      }
      if (isWhitespaceRigidToken(token) || !sourceHasTextBefore || !sourceHasTextAfter) {
        if (leadingWhitespace(sourceParts.textParts[index + 1]) !== leadingWhitespace(targetParts.textParts[index + 1])) return false;
      }
    }
    return true;
  }

  function protectedMarkupError() {
    const error = new Error("Translation changed protected OMORI markup");
    error.code = "markup_format_invalid";
    return error;
  }

  function translationQualityError() {
    const error = new Error("Translation lost or duplicated visible source text");
    error.code = "translation_quality_invalid";
    return error;
  }

  function visibleLetterCount(value) {
    return (plainProtectedText(value).match(/\p{L}/gu) || []).length;
  }

  function visibleWordCount(value) {
    return (plainProtectedText(value).match(/\p{L}+(?:['’\-]\p{L}+)*/gu) || []).length;
  }

  function visibleSentenceCount(value) {
    const text = plainProtectedText(value).replace(/\.{2,}/g, "…");
    return (text.match(/[!?！？]+|[.。]+(?=\s|$)/g) || []).length;
  }

  function translationQualityMatches(source, translation) {
    if (!protectedMarkupLayoutMatches(source, translation)) return false;
    const sourceLetters = visibleLetterCount(source);
    const targetLetters = visibleLetterCount(translation);
    if (!sourceLetters || !targetLetters) return sourceLetters === targetLetters;
    const ratio = targetLetters / sourceLetters;
    const compactTarget = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(plainProtectedText(translation));
    const sourceNumbers = String(source).match(/\d+/g) || [];
    const targetNumbers = String(translation).match(/\d+/g) || [];
    if (sourceNumbers.length !== targetNumbers.length
      || sourceNumbers.some((number, index) => number !== targetNumbers[index])) return false;
    const sourceCurrency = String(source).match(/[$€£¥₽]/gu) || [];
    const targetCurrency = String(translation).match(/[$€£¥₽]/gu) || [];
    if (sourceCurrency.join("") !== targetCurrency.join("")) return false;
    const repeatedTarget = /(\p{L})(?:[^\p{L}]*\1){7,}/iu.test(plainProtectedText(translation));
    const repeatedSource = /(\p{L})(?:[^\p{L}]*\1){7,}/iu.test(plainProtectedText(source));
    if (repeatedTarget && !repeatedSource) return false;
    if (sourceLetters >= 15 && ratio > 2.5) return false;
    if (visibleWordCount(source) >= 8 && ratio < (compactTarget ? 0.15 : 0.32)) return false;
    const sourceSentences = visibleSentenceCount(source);
    const targetSentences = visibleSentenceCount(translation);
    if (sourceSentences >= 2 && targetSentences < sourceSentences && ratio < (compactTarget ? 0.35 : 0.62)) return false;
    return true;
  }

  function prepareProviderText(value) {
    const source = String(value == null ? "" : value);
    const letters = source.match(/[A-Za-z]/g) || [];
    const allCaps = letters.length >= 2 && letters.every((letter) => letter === letter.toUpperCase());
    const text = source.replace(/[A-Z][A-Z'’-]*/g, (word) => {
      const wordLetters = word.replace(/[^A-Z]/g, "");
      if (!allCaps && wordLetters.length < 3) return word;
      return word.charAt(0) + word.slice(1).toLowerCase();
    });
    return {
      text,
      restore(translated) {
        const result = String(translated == null ? "" : translated);
        return allCaps ? result.toLocaleUpperCase() : result;
      }
    };
  }

  function splitAdjacentLiterals(value, previousToken, nextToken) {
    let text = String(value == null ? "" : value);
    let prefix = (text.match(/^\s*/) || [""])[0];
    let suffix = (text.match(/\s*$/) || [""])[0];
    text = text.slice(prefix.length, Math.max(prefix.length, text.length - suffix.length));
    if (previousToken) {
      const numericPrefix = text.match(/^[.,]\d+\s*/);
      if (numericPrefix) {
        prefix += numericPrefix[0];
        text = text.slice(numericPrefix[0].length);
      }
    }
    if (nextToken) {
      const currencySuffix = text.match(/\s*[$€£¥₽]$/u);
      if (currencySuffix) {
        suffix = currencySuffix[0] + suffix;
        text = text.slice(0, text.length - currencySuffix[0].length);
      }
    }
    return { prefix, body: text, suffix };
  }

  async function translateProtectedText(value, translatePlain) {
    if (typeof translatePlain !== "function") throw new TypeError("translatePlain must be a function");
    const source = String(value == null ? "" : value);
    if (!hasTranslatableText(source)) return { text: source, segmented: true, skipped: true };
    const segments = tokenizeProtectedMarkup(source);
    const hasProtectedTokens = segments.some((segment) => segment.type === "token");
    if (!hasProtectedTokens) {
      const prepared = prepareProviderText(source);
      const translated = prepared.restore(String(await translatePlain(prepared.text) || "").trim());
      if (!translated || !protectedMarkupLayoutMatches(source, translated)) throw protectedMarkupError();
      if (!translationQualityMatches(source, translated)) throw translationQualityError();
      return { text: translated, segmented: false };
    }

    const parts = [];
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      if (segment.type === "token") {
        parts.push(segment.value);
        continue;
      }
      const adjacent = splitAdjacentLiterals(
        segment.value,
        index > 0 && segments[index - 1].type === "token" ? segments[index - 1].value : "",
        index + 1 < segments.length && segments[index + 1].type === "token" ? segments[index + 1].value : ""
      );
      const body = adjacent.body;
      if (!hasEnglishText(body) && !/^[AIai]$/.test(body)) {
        parts.push(segment.value);
        continue;
      }
      const prepared = prepareProviderText(body);
      const translated = prepared.restore(String(await translatePlain(prepared.text) || "").trim());
      if (!translated) throw protectedMarkupError();
      parts.push(adjacent.prefix + translated + adjacent.suffix);
    }
    const translated = parts.join("");
    if (!protectedMarkupLayoutMatches(source, translated)) throw protectedMarkupError();
    if (!translationQualityMatches(source, translated)) throw translationQualityError();
    return { text: translated, segmented: true };
  }

  function fingerprint(value) {
    let hash = 0x811c9dc5;
    const text = String(value || "");
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function fallbackGraphemes(value) {
    const text = String(value || "");
    const result = [];
    let current = "";
    let previous = "";
    let regionalCount = 0;
    let markPattern;
    try { markPattern = new RegExp("\\p{Mark}", "u"); } catch (_) { markPattern = null; }
    const isMark = (character) => markPattern
      ? markPattern.test(character)
      : /[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]/.test(character);
    const isVariation = (point) => (point >= 0xfe00 && point <= 0xfe0f) || (point >= 0xe0100 && point <= 0xe01ef);
    const isModifier = (point) => point >= 0x1f3fb && point <= 0x1f3ff;
    const isRegional = (point) => point >= 0x1f1e6 && point <= 0x1f1ff;
    for (const character of Array.from(text)) {
      const point = character.codePointAt(0);
      const regional = isRegional(point);
      const join = !!current && (
        isMark(character) || isVariation(point) || isModifier(point)
        || previous === "\u200d" || character === "\u200d"
        || (regional && regionalCount % 2 === 1)
      );
      if (join) current += character;
      else {
        if (current) result.push(current);
        current = character;
      }
      regionalCount = regional ? (join ? regionalCount + 1 : 1) : 0;
      previous = character;
    }
    if (current) result.push(current);
    return result;
  }

  function splitGraphemes(value) {
    const text = String(value || "");
    if (!text) return [];
    try {
      if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
        graphemeSegmenter = graphemeSegmenter || new Intl.Segmenter("en", { granularity: "grapheme" });
        return Array.from(graphemeSegmenter.segment(text), (part) => part.segment);
      }
    } catch (_) {}
    return fallbackGraphemes(text);
  }

  function safeCut(text, proposed) {
    const limit = Math.max(1, Math.min(String(text || "").length, Number(proposed) || 1));
    let offset = 0;
    for (const grapheme of splitGraphemes(text)) {
      const next = offset + grapheme.length;
      if (next > limit) return Math.max(1, offset || next);
      offset = next;
      if (offset === limit) return offset;
    }
    return Math.max(1, offset);
  }

  function preferredCut(text, limit) {
    const window = text.slice(0, limit + 1);
    const floor = Math.floor(limit * 0.45);
    const sentence = Math.max(window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "), window.lastIndexOf("\n"));
    if (sentence >= floor) return safeCut(text, sentence + 1);
    const space = window.lastIndexOf(" ");
    return safeCut(text, space >= floor ? space : limit);
  }

  function splitLongText(value, limit) {
    const text = String(value || "");
    const max = Math.max(64, Number(limit) || GOOGLE_MAX_CHARS);
    if (text.length <= max) return [text];
    const chunks = [];
    let rest = text;
    while (rest.length > max) {
      const cut = preferredCut(rest, max);
      chunks.push(rest.slice(0, cut).trimEnd());
      rest = rest.slice(cut).trimStart();
    }
    if (rest) chunks.push(rest);
    return chunks;
  }

  function utf8Length(value) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(String(value || "")).length;
    return unescape(encodeURIComponent(String(value || ""))).length;
  }

  function buildGoogleUrl(text, targetLanguage, sourceLanguage) {
    const params = new URLSearchParams({ client: "gtx", sl: sourceLanguage || "en", tl: targetLanguage, dt: "t", q: text });
    return "https://translate.googleapis.com/translate_a/single?" + params.toString();
  }

  function parseGoogleResponse(payload) {
    if (!Array.isArray(payload) || !Array.isArray(payload[0])) throw new Error("Unexpected Google response");
    return payload[0].map((part) => Array.isArray(part) ? String(part[0] || "") : "").join("");
  }

  function normalizeRateLimitDelay(value, initialDelay, maximumDelay) {
    const initial = Math.max(1, Number(initialDelay) || 1);
    const maximum = Math.max(initial, Number(maximumDelay) || initial);
    const delay = Number(value);
    return Number.isFinite(delay) ? Math.min(maximum, Math.max(initial, delay)) : initial;
  }

  function parseRateLimitState(value, legacyDeadline, now, initialDelay, maximumDelay) {
    const currentTime = Number(now) || Date.now();
    const initial = normalizeRateLimitDelay(initialDelay, initialDelay, maximumDelay);
    const maximum = Math.max(initial, Number(maximumDelay) || initial);
    try {
      const parsed = typeof value === "string" ? JSON.parse(value) : value;
      if (parsed && typeof parsed === "object") {
        const until = Number(parsed.until);
        if (Number.isFinite(until) && until > 0) {
          return {
            until,
            nextDelay: normalizeRateLimitDelay(parsed.nextDelay, initial, maximum)
          };
        }
      }
    } catch (_) {}
    const legacyUntil = Number(legacyDeadline);
    if (Number.isFinite(legacyUntil) && legacyUntil > currentTime) {
      return { until: legacyUntil, nextDelay: Math.min(initial * 2, maximum) };
    }
    return { until: 0, nextDelay: initial };
  }

  function createRateLimitState(delay, now, initialDelay, maximumDelay) {
    const currentTime = Number(now) || Date.now();
    const currentDelay = normalizeRateLimitDelay(delay, initialDelay, maximumDelay);
    const maximum = Math.max(currentDelay, Number(maximumDelay) || currentDelay);
    return {
      until: currentTime + currentDelay,
      nextDelay: Math.min(currentDelay * 2, maximum)
    };
  }

  function buildContextSource(parts) {
    const values = Array.isArray(parts) ? parts.map((part) => normalizeText(part)) : [];
    return values.map((part, index) => index
      ? `${CONTEXT_MARKER_PREFIX}${index}${CONTEXT_MARKER_SUFFIX} ${part}`
      : part).join(" ");
  }

  function parseContextTranslation(value, count) {
    const expected = Number(count) || 0;
    if (expected < 2) return null;
    const text = String(value || "").trim();
    const pattern = new RegExp(`\\b${CONTEXT_MARKER_PREFIX}\\s*(\\d+)\\s*${CONTEXT_MARKER_SUFFIX}\\b`, "gi");
    const markers = [];
    let match;
    while ((match = pattern.exec(text))) markers.push({ index: Number(match[1]), start: match.index, end: pattern.lastIndex });
    if (markers.length !== expected - 1) return null;
    for (let index = 0; index < markers.length; index += 1) {
      if (markers[index].index !== index + 1) return null;
    }
    const parts = [];
    parts.push(text.slice(0, markers[0].start).trim());
    for (let index = 0; index < markers.length; index += 1) {
      const end = index + 1 < markers.length ? markers[index + 1].start : text.length;
      parts.push(text.slice(markers[index].end, end).trim());
    }
    return parts.length === expected && parts.every(Boolean) ? parts : null;
  }

  function makeCacheKey(source, language, provider, gameId, providerVariant) {
    const normalized = normalizeText(source);
    const selected = provider || "google";
    if (gameId && providerVariant) {
      return ["v4", gameId, selected, language, fingerprint(providerVariant), normalized].join("\n");
    }
    if (gameId) return ["v3", gameId, selected, language, normalized].join("\n");
    if (selected === "google") return ["v1", language, fingerprint(""), normalized].join("\n");
    return ["v2", selected, language, normalized].join("\n");
  }

  function cacheKeyLanguage(key) {
    const parts = String(key || "").split("\n");
    if (parts[0] === "v1") return parts[1] || "";
    if (parts[0] === "v2") return parts[2] || "";
    if (parts[0] === "v3") return parts[3] || "";
    if (parts[0] === "v4") return parts[3] || "";
    return "";
  }

  function cacheKeyProvider(key) {
    const parts = String(key || "").split("\n");
    if (parts[0] === "v1") return "google";
    if (parts[0] === "v2") return parts[1] || "";
    if (parts[0] === "v3") return parts[2] || "";
    if (parts[0] === "v4") return parts[2] || "";
    return "";
  }

  function cacheKeyGame(key) {
    const parts = String(key || "").split("\n");
    return parts[0] === "v3" || parts[0] === "v4" ? (parts[1] || "") : "";
  }

  function cacheKeyVariant(key) {
    const parts = String(key || "").split("\n");
    return parts[0] === "v4" ? (parts[4] || "") : "";
  }

  function cacheKeySource(key) {
    const parts = String(key || "").split("\n");
    if (parts[0] === "v1") return parts.slice(3).join("\n");
    if (parts[0] === "v2") return parts.slice(3).join("\n");
    if (parts[0] === "v3") return parts.slice(4).join("\n");
    if (parts[0] === "v4") return parts.slice(5).join("\n");
    return "";
  }

  return {
    GOOGLE_MAX_CHARS,
    isRtlLanguage,
    isTallScriptLanguage,
    isCjkLanguage,
    fontFallbacks,
    htmlLanguageCode,
    providerLanguageCode,
    providerSupportsLanguage,
    PROTECTED_MARKUP_VERSION,
    normalizeText,
    hasEnglishText,
    hasTranslatableText,
    isOpaqueEncodedText,
    isFontCoverageText,
    tokenizeProtectedMarkup,
    protectedMarkupTokens,
    protectedMarkupMatches,
    protectedMarkupLayoutMatches,
    translationQualityMatches,
    prepareProviderText,
    translateProtectedText,
    fingerprint,
    splitGraphemes,
    splitLongText,
    utf8Length,
    buildGoogleUrl,
    parseGoogleResponse,
    parseRateLimitState,
    createRateLimitState,
    buildContextSource,
    parseContextTranslation,
    makeCacheKey,
    cacheKeyLanguage,
    cacheKeyProvider,
    cacheKeyGame,
    cacheKeyVariant,
    cacheKeySource,
    stripOmoriPrefixes
  };
});
