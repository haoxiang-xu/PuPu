import api from "../../../SERVICEs/api";
import { deleteMcpEntry } from "../../../SERVICEs/mcp_install";
import { removeInvalidToolkitIds } from "../../../SERVICEs/default_toolkit_store";
import { BASE_TOOLKIT_IDENTIFIERS } from "../constants";

/* Same base-id filter plugins_installed_page.js uses to decide which rows
   count as visible plugins (and therefore which ids stay valid in the
   default-toolkit selection after a delete). Shared here so any caller that
   deletes a plugin — the Installed page's own row action, or the shell's
   detail overlay, which can delete a plugin without PluginsInstalledPage
   ever having mounted (review C1) — computes the same set instead of
   drifting. */
export const isBaseToolkitId = (toolkitId) => {
  if (!toolkitId) return false;
  const lower = toolkitId.trim().toLowerCase();
  return (
    BASE_TOOLKIT_IDENTIFIERS.has(lower) ||
    lower.endsWith(".toolkit") ||
    lower.endsWith(".builtin_toolkit") ||
    lower.endsWith(".base_toolkit")
  );
};

/* Deletes an MCP-installed plugin — mirrors plugins_installed_page.js's old
   handleDelete exactly (MCP-only guard, deleteMcpEntry, then prune the
   default-toolkit selection down to the ids that remain) but re-fetches the
   catalog fresh instead of depending on a mounted page's local `toolkits`
   state, so it works identically whether or not PluginsInstalledPage has
   ever been visited this session. */
export async function deletePluginToolkit(toolkitId) {
  const payload = await api.unchain.listToolModalCatalog();
  const list = Array.isArray(payload?.toolkits) ? payload.toolkits : [];
  const visible = list.filter(
    (tk) => tk.source !== "plugin" && !tk.hidden && !isBaseToolkitId(tk.toolkitId),
  );
  const target = visible.find((tk) => tk.toolkitId === toolkitId);
  if (!target || target.source !== "mcp") return { ok: false };

  await deleteMcpEntry(toolkitId);

  const remainingIds = visible
    .filter((tk) => tk.toolkitId !== toolkitId)
    .map((tk) => tk.toolkitId);
  removeInvalidToolkitIds("global", remainingIds);
  return { ok: true, toolkitId };
}
