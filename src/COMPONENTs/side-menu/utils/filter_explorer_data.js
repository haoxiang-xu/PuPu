/**
 * Filters explorer nodes by file label query.
 * Returns null results when query is empty to preserve default explorer rendering.
 *
 * @param {Record<string, object>} explorer_data
 * @param {string} query
 * @returns {{ filteredData: Record<string, object> | null, filteredRoot: string[] | null }}
 */
export const filter_explorer_data = (explorer_data, query) => {
  const q = typeof query === "string" ? query.trim().toLowerCase() : "";
  if (!q) {
    return {
      filteredData: null,
      filteredRoot: null,
    };
  }

  const source = explorer_data && typeof explorer_data === "object"
    ? explorer_data
    : {};

  const matchingData = {};
  const matchingRoot = [];

  for (const [id, node] of Object.entries(source)) {
    if (node.type === "file" && node.label?.toLowerCase().includes(q)) {
      matchingData[id] = { ...node, postfix: node.postfix };
      matchingRoot.push(id);
    }
  }

  return {
    filteredData: matchingData,
    filteredRoot: matchingRoot,
  };
};

export default filter_explorer_data;
