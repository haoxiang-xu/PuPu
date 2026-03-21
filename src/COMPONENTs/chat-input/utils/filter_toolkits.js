/**
 * Filters toolkit catalog entries for the chat input to match the toolkit modal:
 * visible toolkits only, excluding base identifiers and hidden/plugin entries.
 *
 * @param {Array<object>} toolkits
 * @param {Set<string>} base_ids
 * @returns {Array<object>}
 */
export const filter_toolkits = (toolkits, base_ids) => {
  const source = Array.isArray(toolkits) ? toolkits : [];
  const excluded = base_ids instanceof Set ? base_ids : new Set();
  const isBaseIdentifier = (value) =>
    Boolean(
      value &&
        (excluded.has(value) ||
          value.endsWith(".toolkit") ||
          value.endsWith(".builtin_toolkit") ||
          value.endsWith(".base_toolkit")),
    );

  return source.filter((tk) => {
    const toolkitId =
      typeof tk?.toolkitId === "string" ? tk.toolkitId.trim().toLowerCase() : "";
    const sourceType =
      typeof tk?.source === "string" ? tk.source.trim().toLowerCase() : "";

    if (toolkitId || sourceType) {
      if (sourceType === "core" || sourceType === "plugin") {
        return false;
      }
      if (tk?.hidden) {
        return false;
      }

      return !isBaseIdentifier(toolkitId);
    }

    const kind = typeof tk?.kind === "string" ? tk.kind : "";
    if (kind !== "builtin" && kind !== "core") {
      return false;
    }

    const className =
      typeof tk?.class_name === "string" ? tk.class_name.toLowerCase() : "";
    const name = typeof tk?.name === "string" ? tk.name.toLowerCase() : "";

    return !isBaseIdentifier(className) && !isBaseIdentifier(name);
  });
};

export default filter_toolkits;
