const SUPPORTED_LANGUAGE_CODES = new Set(["en", "hi", "gu"]);

function tryParseJsonObjectString(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function normalizeLanguageCode(raw) {
  if (typeof raw !== "string" || !raw.trim()) return "en";
  const base = raw
    .trim()
    .toLowerCase()
    .split(",")[0]
    .split(";")[0]
    .replace("_", "-");
  const primary = base.split("-")[0];
  return SUPPORTED_LANGUAGE_CODES.has(primary) ? primary : "en";
}

function getRequestedLanguage(req) {
  return normalizeLanguageCode(
    req.headers["x-language"] || req.headers["accept-language"] || "en",
  );
}

function normalizeLocalizedName(input) {
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const parsedObject = tryParseJsonObjectString(trimmed);
    if (parsedObject) {
      return normalizeLocalizedName(parsedObject);
    }
    return { en: trimmed };
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const out = {};
  for (const [rawLang, rawValue] of Object.entries(input)) {
    const lang = normalizeLanguageCode(rawLang);
    if (!SUPPORTED_LANGUAGE_CODES.has(lang)) continue;
    const value = typeof rawValue === "string" ? rawValue.trim() : "";
    if (value) out[lang] = value;
  }

  const keys = Object.keys(out);
  if (keys.length === 0) return null;
  if (!out.en) out.en = out[keys[0]];
  return out;
}

function resolveLocalizedName(nameValue, language) {
  function resolveStringValue(raw) {
    if (typeof raw !== "string") return "";
    const trimmed = raw.trim();
    if (!trimmed) return "";
    const parsedObject = tryParseJsonObjectString(trimmed);
    if (parsedObject) {
      return resolveLocalizedName(parsedObject, language);
    }
    return trimmed;
  }

  if (typeof nameValue === "string") {
    return resolveStringValue(nameValue);
  }
  if (!nameValue || typeof nameValue !== "object" || Array.isArray(nameValue)) {
    return "";
  }

  const requestedValue = resolveStringValue(nameValue[language]);
  if (requestedValue) {
    return requestedValue;
  }

  const englishValue = resolveStringValue(nameValue.en);
  if (englishValue) {
    return englishValue;
  }

  for (const value of Object.values(nameValue)) {
    const fallback = resolveStringValue(value);
    if (fallback) return fallback;
  }
  return "";
}

module.exports = {
  SUPPORTED_LANGUAGE_CODES,
  normalizeLanguageCode,
  getRequestedLanguage,
  normalizeLocalizedName,
  resolveLocalizedName,
};
