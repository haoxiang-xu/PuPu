/**
 * Filters toolkit catalog entries to built-in/core toolkits and removes base identifiers.
 *
 * @param {Array<object>} toolkits
 * @param {Set<string>} base_ids
 * @returns {Array<object>}
 */
export const filter_toolkits = (toolkits, base_ids) => {
  const source = Array.isArray(toolkits) ? toolkits : [];
  const excluded = base_ids instanceof Set ? base_ids : new Set();

  return source.filter((tk) => {
    const kind = typeof tk?.kind === "string" ? tk.kind : "";
    if (kind !== "builtin" && kind !== "core") {
      return false;
    }

    const className =
      typeof tk?.class_name === "string" ? tk.class_name.toLowerCase() : "";
    const name = typeof tk?.name === "string" ? tk.name.toLowerCase() : "";

    return !excluded.has(className) && !excluded.has(name);
  });
};

export default filter_toolkits;
