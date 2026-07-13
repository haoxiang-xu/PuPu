import { normalizeToolkitIdAlias } from "../../../../SERVICEs/toolkit_id_aliases";

export function normalize_recipe_toolkit_id(value) {
  return normalizeToolkitIdAlias(value);
}

export function normalize_recipe_toolkit_entries(entries, { includeConfig = false } = {}) {
  if (!Array.isArray(entries)) return [];
  const seen = new Set();
  const out = [];
  for (const tk of entries) {
    const id = normalize_recipe_toolkit_id(tk?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const next = { id };
    if (includeConfig) {
      next.config =
        tk?.config && typeof tk.config === "object" && !Array.isArray(tk.config)
          ? { ...tk.config }
          : {};
    }
    if (Array.isArray(tk?.enabled_tools)) {
      next.enabled_tools = [...tk.enabled_tools];
    }
    out.push(next);
  }
  return out;
}

export function recipe_toolkit_entries_equal(left, right) {
  return JSON.stringify(left || []) === JSON.stringify(right || []);
}
