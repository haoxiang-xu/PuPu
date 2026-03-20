const SYSTEM_PROMPT_SECTION_LIMIT = 2000;
const SYSTEM_PROMPT_SECTION_KEYS = [
  "personality",
  "rules",
  "style",
  "output_format",
  "context",
  "constraints",
];

const isObject = (value) =>
  value != null && typeof value === "object" && !Array.isArray(value);

export const normalizeSystemPromptSectionKey = (rawKey) => {
  if (typeof rawKey !== "string") {
    return "";
  }

  const normalized = rawKey.trim().toLowerCase();
  const aliased = normalized === "personally" ? "personality" : normalized;
  return SYSTEM_PROMPT_SECTION_KEYS.includes(aliased) ? aliased : "";
};

export const normalizeSystemPromptSectionValue = (
  rawValue,
  limit = SYSTEM_PROMPT_SECTION_LIMIT,
) => {
  if (typeof rawValue !== "string") {
    return "";
  }

  return rawValue.trim().slice(0, limit);
};

export const sanitizeSystemPromptSections = (
  rawSections,
  { allowNull = false, keepEmptyStrings = false } = {},
) => {
  if (!isObject(rawSections)) {
    return {};
  }

  const sanitized = {};
  Object.entries(rawSections).forEach(([rawKey, rawValue]) => {
    const key = normalizeSystemPromptSectionKey(rawKey);
    if (!key) {
      return;
    }

    if (rawValue == null) {
      if (allowNull) {
        sanitized[key] = null;
      }
      return;
    }

    if (typeof rawValue !== "string") {
      return;
    }

    const value = normalizeSystemPromptSectionValue(rawValue);
    if (value || keepEmptyStrings) {
      sanitized[key] = value;
    }
  });

  return sanitized;
};

export const systemPromptSectionConstants = {
  limit: SYSTEM_PROMPT_SECTION_LIMIT,
  keys: SYSTEM_PROMPT_SECTION_KEYS,
};
