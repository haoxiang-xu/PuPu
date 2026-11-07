/* Python str.strip() whitespace, including U+0085 and U+001C–U+001F,
 * but excluding U+FEFF. Validation never trims or normalizes accepted text. */
const NON_PYTHON_WHITESPACE = /[^\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/u;

export function is_valid_node_label(value) {
  return typeof value === "string" && NON_PYTHON_WHITESPACE.test(value);
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
