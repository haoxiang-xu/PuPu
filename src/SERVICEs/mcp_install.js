import api from "./api";
import { readWorkspaceRoot } from "../COMPONENTs/settings/runtime";
import { setDefaultToolkitEnabled } from "./default_toolkit_store";
import { emitToolkitCatalogRefresh } from "./toolkit_catalog_refresh";

export const INSTALLABLE_ENTRY_IDS = new Set([
  "browser.playwright",
  "memory.memory",
  "workspace.filesystem",
]);

const FILESYSTEM_ENTRY_ID = "workspace.filesystem";

/* installable = 在白名单且 status 非 needs_review */
export function isEntryInstallable(entry) {
  if (!entry) return false;
  if (entry.status === "needs_review") return false;
  return INSTALLABLE_ENTRY_IDS.has(entry.id);
}

/* installed | installable | needs_review | coming_soon */
export function entryInstallState(entry, installedIds) {
  if (!entry) return "coming_soon";
  if (installedIds && installedIds.has(entry.toolkitId)) return "installed";
  if (entry.status === "needs_review") return "needs_review";
  if (INSTALLABLE_ENTRY_IDS.has(entry.id)) return "installable";
  return "coming_soon";
}

/* filesystem 必须有 workspace root；其它不需要。绝不 fallback 到任何兜底目录。 */
export function resolveInstallWorkspace(entry, workspaceRoot) {
  if (entry?.id === FILESYSTEM_ENTRY_ID) {
    const wr = (workspaceRoot || "").trim();
    if (!wr) return { ok: false, code: "mcp_workspace_required" };
    return { ok: true, workspaceRoot: wr };
  }
  return { ok: true, workspaceRoot: (workspaceRoot || "").trim() };
}

/* 当前已安装 MCP 的 toolkitId 集合（用于卡片 installed 状态） */
export async function getInstalledMcpIds() {
  const payload = await api.unchain.listMcpToolkits();
  const list = Array.isArray(payload?.toolkits) ? payload.toolkits : [];
  return new Set(list.map((tk) => tk.toolkitId).filter(Boolean));
}

/* 执行安装：校验 workspace → installMcpToolkit → auto-enable。
   返回 { ok, toolkitId } 或抛带 .code 的错误。 */
export async function installMcpEntry(entry, { workspaceRoot } = {}) {
  if (!isEntryInstallable(entry)) {
    const err = new Error("Entry not installable");
    err.code = "unsupported_mcp_entry";
    throw err;
  }
  const wr = workspaceRoot !== undefined ? workspaceRoot : readWorkspaceRoot();
  const resolved = resolveInstallWorkspace(entry, wr);
  if (!resolved.ok) {
    const err = new Error("Workspace required");
    err.code = resolved.code;
    throw err;
  }
  await api.unchain.installMcpToolkit({
    entryId: entry.id,
    workspaceRoot: resolved.workspaceRoot,
  });
  setDefaultToolkitEnabled("global", entry.toolkitId, true);
  emitToolkitCatalogRefresh();
  return { ok: true, toolkitId: entry.toolkitId };
}

export async function deleteMcpEntry(toolkitId) {
  await api.unchain.deleteMcpToolkit(toolkitId);
  emitToolkitCatalogRefresh();
  return { ok: true, toolkitId };
}
