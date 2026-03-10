/**
 * Converts toolkit catalog entries into Select-compatible options.
 *
 * Each toolkit becomes a flat option with:
 *   - value: class_name (unique ID used for selection)
 *   - label: class_name (display name)
 *   - description: comma-separated tool names (first 5) + "+N" overflow
 *   - search: class_name (used by filter)
 *
 * @param {Array<object>} toolkits — filtered toolkit list
 * @returns {Array<object>}
 */
export const build_toolkit_options = (toolkits) => {
  if (!Array.isArray(toolkits)) return [];

  return toolkits.map((tk) => {
    const tools = Array.isArray(tk.tools) ? tk.tools : [];
    const shown = tools.slice(0, 5).map((t) => t.name);
    const overflow = tools.length > 5 ? ` +${tools.length - 5}` : "";
    const description =
      shown.length > 0 ? shown.join(", ") + overflow : undefined;

    return {
      value: tk.class_name,
      label: tk.class_name,
      description,
      search: tk.class_name,
    };
  });
};

export default build_toolkit_options;
