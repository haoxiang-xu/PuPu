// Static, heuristic extraction of i18n key usage from JS source. Not a full parser.

const STATIC_T_CALL = /\bt\(\s*(["'])((?:\\.|(?!\1).)*?)\1/g; // t("key") / t('key')
const DYNAMIC_T_CALL = /\bt\(\s*[^"'\s)]/g; // t(<non-string-literal first arg>)
const DOTTED_LITERAL = /(["'])([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+)\1/g; // "a.b.c" anywhere

/** Scan one source string for translation key usage. */
export function scanSource(source) {
  const staticKeys = new Set();
  for (const m of source.matchAll(STATIC_T_CALL)) staticKeys.add(m[2]);
  const dynamicCount = (source.match(DYNAMIC_T_CALL) || []).length;
  const literalKeys = new Set();
  for (const m of source.matchAll(DOTTED_LITERAL)) literalKeys.add(m[2]);
  return { staticKeys, dynamicCount, literalKeys };
}

/** Union several scan results into one. */
export function mergeScans(scans) {
  const staticKeys = new Set();
  const literalKeys = new Set();
  let dynamicCount = 0;
  for (const s of scans) {
    for (const k of s.staticKeys) staticKeys.add(k);
    for (const k of s.literalKeys) literalKeys.add(k);
    dynamicCount += s.dynamicCount;
  }
  return { staticKeys, dynamicCount, literalKeys };
}
