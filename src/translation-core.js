(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VNRevivalTranslationCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const GOOGLE_MAX_CHARS = 3500;
  const MYMEMORY_MAX_BYTES = 480;
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
    const selected = String(provider || "google");
    const code = String(language || "");
    if (!code) return "";
    if (selected === "mymemory") {
      const aliases = { iw: "he", jw: "jv", tl: "fil" };
      return aliases[code] || code;
    }
    return code;
  }

  function providerSupportsLanguage(provider, language, argosLanguages) {
    const selected = String(provider || "google");
    const code = providerLanguageCode(selected, language);
    if (!code) return false;
    if (selected === "argos") return Array.isArray(argosLanguages) && argosLanguages.includes(code);
    return selected === "google" || selected === "mymemory";
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
      .replace(/^\\(ren|kel|aub|her|bas|mar|omori|smm|cap|ms|plu|kim|van|kel-mom|red-glasses lady|old hobo|po)/i, "")
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

  function splitUtf8Text(value, maxBytes) {
    const text = String(value || "");
    const limit = Math.max(64, Number(maxBytes) || MYMEMORY_MAX_BYTES);
    if (utf8Length(text) <= limit) return [text];
    const chunks = [];
    let rest = text;
    while (rest && utf8Length(rest) > limit) {
      let low = 1;
      let high = Math.min(rest.length, limit);
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (utf8Length(rest.slice(0, safeCut(rest, mid))) <= limit) low = mid;
        else high = mid - 1;
      }
      const cut = preferredCut(rest, Math.max(1, low));
      chunks.push(rest.slice(0, cut).trimEnd());
      rest = rest.slice(cut).trimStart();
    }
    if (rest) chunks.push(rest);
    return chunks;
  }

  function buildGoogleUrl(text, targetLanguage, sourceLanguage) {
    const params = new URLSearchParams({ client: "gtx", sl: sourceLanguage || "en", tl: targetLanguage, dt: "t", q: text });
    return "https://translate.googleapis.com/translate_a/single?" + params.toString();
  }

  function parseGoogleResponse(payload) {
    if (!Array.isArray(payload) || !Array.isArray(payload[0])) throw new Error("Unexpected Google response");
    return payload[0].map((part) => Array.isArray(part) ? String(part[0] || "") : "").join("");
  }

  function buildMyMemoryUrl(text, targetLanguage, sourceLanguage) {
    const params = new URLSearchParams({ q: text, langpair: (sourceLanguage || "en") + "|" + targetLanguage, mt: "1" });
    return "https://api.mymemory.translated.net/get?" + params.toString();
  }

  function parseMyMemoryResponse(payload) {
    const translated = payload && payload.responseData && payload.responseData.translatedText;
    if (typeof translated !== "string" || !translated.trim()) throw new Error("Unexpected MyMemory response");
    if (Number(payload.responseStatus || 200) >= 400) throw new Error(String(payload.responseDetails || "MyMemory error"));
    return translated;
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

  return {
    GOOGLE_MAX_CHARS,
    MYMEMORY_MAX_BYTES,
    isRtlLanguage,
    isTallScriptLanguage,
    isCjkLanguage,
    fontFallbacks,
    htmlLanguageCode,
    providerLanguageCode,
    providerSupportsLanguage,
    normalizeText,
    hasEnglishText,
    fingerprint,
    splitGraphemes,
    splitLongText,
    utf8Length,
    splitUtf8Text,
    buildGoogleUrl,
    parseGoogleResponse,
    buildMyMemoryUrl,
    parseMyMemoryResponse,
    buildContextSource,
    parseContextTranslation,
    makeCacheKey,
    cacheKeyLanguage,
    cacheKeyProvider,
    cacheKeyGame,
    cacheKeyVariant,
    stripOmoriPrefixes
  };
});
