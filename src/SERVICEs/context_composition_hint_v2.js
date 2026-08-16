const PUBLIC_HINT_SCHEMA = "pupu.context_composition_hint.v2";
const MAX_HINT_BYTES = 1024;

const isUnicodeScalarSequence = (value) => {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      if (index + 1 >= value.length) return false;
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
      continue;
    }
    if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
};

const utf8Length = (value) => {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value).length;
  }
  return unescape(encodeURIComponent(value)).length;
};

export const buildContextCompositionHintV2 = ({ message, composer }) => {
  if (typeof message !== "string" || !composer || typeof composer !== "object") {
    return null;
  }
  const prefixUnits = composer.templateLength;
  if (
    typeof prefixUnits !== "number" ||
    !Number.isSafeInteger(prefixUnits) ||
    prefixUnits <= 0 ||
    prefixUnits > message.length
  ) {
    return null;
  }
  const prefix = message.slice(0, prefixUnits);
  if (!prefix || !isUnicodeScalarSequence(prefix)) return null;
  const bytes = utf8Length(prefix);
  if (!Number.isSafeInteger(bytes) || bytes <= 0) return null;
  const hint = {
    schema: PUBLIC_HINT_SCHEMA,
    contributions: [
      {
        category: "skills",
        subtype: "expanded_invocation",
        surface: "messages",
        prefix_utf16_units: prefixUnits,
        utf8_bytes: bytes,
        source_count: 1,
      },
    ],
  };
  if (utf8Length(JSON.stringify(hint)) > MAX_HINT_BYTES) return null;
  return hint;
};

