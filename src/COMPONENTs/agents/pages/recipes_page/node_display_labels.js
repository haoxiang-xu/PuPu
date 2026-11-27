/* Python str.strip() whitespace, including U+0085 and U+001C–U+001F,
 * but excluding U+FEFF. Validation never trims or normalizes accepted text. */
const PYTHON_WHITESPACE = new Set([
  0x0009, 0x000a, 0x000b, 0x000c, 0x000d,
  0x001c, 0x001d, 0x001e, 0x001f, 0x0020,
  0x0085, 0x00a0, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005,
  0x2006, 0x2007, 0x2008, 0x2009, 0x200a,
  0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
]);

export function is_valid_node_label(value) {
  if (typeof value !== "string") return false;
  for (const character of value) {
    if (!PYTHON_WHITESPACE.has(character.codePointAt(0))) return true;
  }
  return false;
}

/* Callers supply their existing type-specific title. Unknown values must not
 * acquire a plausible title through object/string coercion. */
export function node_display_title(node, fallback) {
  if (node !== null && typeof node === "object" && !Array.isArray(node) &&
      Object.prototype.hasOwnProperty.call(node, "label") && is_valid_node_label(node.label)) {
    return node.label;
  }
  return typeof fallback === "string" ? fallback : "";
}
