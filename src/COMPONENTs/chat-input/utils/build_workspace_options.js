/**
 * Converts workspace entries into Select-compatible options.
 *
 * Each workspace becomes a flat option with:
 *   - value: ws.id (unique ID used for selection)
 *   - label: display name (ws.name or ws.path or ws.id)
 *   - description: path (only if name is set and path differs)
 *   - search: "name path" for filtering
 *
 * @param {Array<object>} workspaces — list from readWorkspaces()
 * @returns {Array<object>}
 */
export const build_workspace_options = (workspaces) => {
  if (!Array.isArray(workspaces)) return [];

  return workspaces.map((ws) => {
    const name =
      typeof ws.name === "string" && ws.name.trim() ? ws.name.trim() : "";
    const path =
      typeof ws.path === "string" && ws.path.trim() ? ws.path.trim() : "";
    const displayName = name || path || ws.id;
    const displayPath = name && path ? path : undefined;

    return {
      value: ws.id,
      label: displayName,
      description: displayPath,
      search: `${name} ${path}`.trim(),
    };
  });
};

export default build_workspace_options;
