import api from "./api";
import { readWorkspaceRoot } from "../COMPONENTs/settings/runtime";
import { setDefaultToolkitEnabled } from "./default_toolkit_store";
import { emitToolkitCatalogRefresh } from "./toolkit_catalog_refresh";
import {
  setCustomMcpIcon,
  removeCustomMcpIcon,
} from "./custom_mcp_icon_store";

const hasOAuthRecipe = (entry) => Boolean(entry?.auth?.oauth);
const requiresWorkspace = (entry) =>
  Boolean(entry?.workspace?.required || entry?.requiresWorkspace);

const toSlug = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "custom";

export function setupKindForEntry(entry) {
  if (!entry) return "unsupported";
  if (entry.id === "custom") return "custom";
  if (requiresWorkspace(entry)) return "workspace";
  if (hasOAuthRecipe(entry) && !(entry.secrets || []).length) return "oauth";
  if (entry.mcp?.transport === "http") {
    return (entry.secrets || []).length > 0 ? "http_secret" : "oauth";
  }
  if ((entry.secrets || []).length > 0) return "secrets";
  return "direct";
}

/* installable = registry marks it installable and setup is not OAuth-only. */
export function isEntryInstallable(entry) {
  if (!entry) return false;
  if (entry.status === "needs_review") return false;
  if (entry.id === "custom") return true;
  if (!entry.installable) return false;
  return setupKindForEntry(entry) !== "oauth";
}

export function isEntryOAuthConnectable(entry) {
  return Boolean(entry) && (hasOAuthRecipe(entry) || setupKindForEntry(entry) === "oauth");
}

/* installed | installable | needs_review | oauth | coming_soon */
export function entryInstallState(entry, installedIds) {
  if (!entry) return "coming_soon";
  if (installedIds && installedIds.has(entry.toolkitId)) return "installed";
  if (entry.status === "needs_review") return "needs_review";
  if (setupKindForEntry(entry) === "oauth") return "oauth";
  if (isEntryInstallable(entry)) return "installable";
  return "coming_soon";
}

/* Workspace-scoped MCP entries must receive the agent workspace root. */
export function resolveInstallWorkspace(entry, workspaceRoot) {
  if (requiresWorkspace(entry)) {
    const wr = (workspaceRoot || "").trim();
    if (!wr) return { ok: false, code: "mcp_workspace_required" };
    return { ok: true, workspaceRoot: wr };
  }
  return { ok: true, workspaceRoot: (workspaceRoot || "").trim() };
}

export function parseCustomMcpArgs(argsText = "") {
  const args = [];
  let current = "";
  let quote = "";
  let escaping = false;
  for (const char of String(argsText || "")) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = "";
      } else {
        current += char;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) args.push(current);
  return args;
}

const CUSTOM_SECRET_KEY_RE = /^[A-Z_][A-Z0-9_]*$/;

export function parseCustomMcpEnvSecrets(envSecretsText = "") {
  const specs = [];
  const values = {};
  const seen = new Set();
  for (const rawLine of String(envSecretsText || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim();
    if (!CUSTOM_SECRET_KEY_RE.test(key) || !value || seen.has(key)) continue;
    seen.add(key);
    specs.push({ key, label: key });
    values[key] = value;
  }
  return { specs, values };
}

export function normalizeCustomMcpRecipe({
  name = "",
  description = "",
  transport = "stdio",
  command = "",
  argsText = "",
  url = "",
  envSecretsText = "",
} = {}) {
  const cleanName = String(name || "").trim() || "Custom MCP";
  const cleanTransport = transport === "http" ? "http" : "stdio";
  const envSecrets = parseCustomMcpEnvSecrets(envSecretsText);
  const recipe = {
    toolkit_id: `mcp.custom.${toSlug(cleanName)}`,
    toolkit_name: cleanName,
    toolkit_description: String(description || "").trim(),
    mcp:
      cleanTransport === "http"
        ? {
            transport: "http",
            url: String(url || "").trim(),
          }
        : {
            transport: "stdio",
            command: String(command || "").trim(),
            args: parseCustomMcpArgs(argsText),
          },
  };
  if (cleanTransport === "stdio" && envSecrets.specs.length) {
    recipe.secrets = envSecrets.specs;
  }
  return recipe;
}

/* 当前已安装 MCP 的 toolkitId 集合（用于卡片 installed 状态） */
export async function getInstalledMcpIds() {
  const payload = await api.unchain.listMcpToolkits();
  const list = Array.isArray(payload?.toolkits) ? payload.toolkits : [];
  return new Set(list.map((tk) => tk.toolkitId).filter(Boolean));
}

/* 执行安装：校验 workspace → installMcpToolkit → auto-enable。
   返回 { ok, toolkitId } 或抛带 .code 的错误。 */
export async function installMcpEntry(
  entry,
  { workspaceRoot, secrets, customRecipe, customIcon } = {},
) {
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
  const payload = {
    entryId: entry.id,
    workspaceRoot: resolved.workspaceRoot,
  };
  if (secrets && typeof secrets === "object") {
    payload.secrets = secrets;
  }
  if (customRecipe && typeof customRecipe === "object") {
    payload.customRecipe = customRecipe;
  }
  const response = await api.unchain.installMcpToolkit(payload);
  const toolkitId = response?.toolkit?.toolkitId || entry.toolkitId;
  setDefaultToolkitEnabled("global", toolkitId, true);
  /* Custom MCP icons live in frontend-local storage, keyed by toolkitId, so the
     uploaded image renders across Installed / selector / agent builder. */
  if (customIcon !== undefined) {
    setCustomMcpIcon(toolkitId, customIcon);
  }
  emitToolkitCatalogRefresh();
  return { ok: true, toolkitId };
}

const delay = (ms) =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

export async function connectMcpOAuthEntry(
  entry,
  { maxAttempts = 300, pollDelayMs = 2000 } = {},
) {
  if (!isEntryOAuthConnectable(entry)) {
    const err = new Error("Entry does not support OAuth");
    err.code = "unsupported_mcp_entry";
    throw err;
  }

  await api.unchain.startMcpOAuth(entry.id);
  let lastStatus = null;
  const attempts = Math.max(1, Number(maxAttempts) || 1);
  for (let i = 0; i < attempts; i += 1) {
    lastStatus = await api.unchain.getMcpOAuthStatus(entry.id);
    if (lastStatus?.authStatus === "connected") {
      const toolkitId = lastStatus.toolkitId || entry.toolkitId;
      setDefaultToolkitEnabled("global", toolkitId, true);
      emitToolkitCatalogRefresh();
      return { ok: true, toolkitId };
    }
    if (["expired", "error"].includes(lastStatus?.authStatus)) {
      const err = new Error(lastStatus?.lastError || "OAuth connection failed");
      err.code =
        lastStatus?.authStatus === "expired"
          ? "mcp_oauth_expired"
          : "mcp_oauth_start_failed";
      throw err;
    }
    if (i < attempts - 1) {
      await delay(pollDelayMs);
    }
  }

  const err = new Error("OAuth connection is still pending");
  err.code = "mcp_oauth_pending";
  err.status = lastStatus;
  throw err;
}

export async function deleteMcpEntry(toolkitId) {
  await api.unchain.deleteMcpToolkit(toolkitId);
  removeCustomMcpIcon(toolkitId);
  emitToolkitCatalogRefresh();
  return { ok: true, toolkitId };
}
