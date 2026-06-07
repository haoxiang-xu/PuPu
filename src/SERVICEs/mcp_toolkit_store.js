import registry from "./mcp_toolkit_registry.json";
import { getCustomMcpIcon } from "./custom_mcp_icon_store";

/* Default icon for any MCP toolkit that has no curated brand logo: the generic
   "mcp" glyph, grey, no background. Entries simply omit icon to get it. */
export const DEFAULT_MCP_ICON = {
  type: "builtin",
  name: "mcp",
  color: "#9aa0a6",
  backgroundColor: "transparent",
};

const normalizeHeader = (header = {}) => {
  const normalized = { ...header };
  if (header.valueFromSecret && !header.value_from_secret) {
    normalized.value_from_secret = header.valueFromSecret;
  }
  return normalized;
};

const normalizeMcp = (mcp = {}) => {
  const normalized = {
    ...mcp,
    headers: Array.isArray(mcp.headers)
      ? mcp.headers.map(normalizeHeader)
      : mcp.headers || [],
  };
  if (mcp.runtimeTransport && !normalized.runtime_transport) {
    normalized.runtime_transport = mcp.runtimeTransport;
  }
  return normalized;
};

const normalizeEntry = (entry = {}) => {
  const toolkitIcon = entry.toolkitIcon || entry.icon;
  const workspace = entry.workspace && typeof entry.workspace === "object"
    ? { ...entry.workspace }
    : {};
  return {
    ...entry,
    toolkitName: entry.toolkitName || entry.name || "",
    toolkitDescription: entry.toolkitDescription || entry.description || "",
    ...(toolkitIcon ? { toolkitIcon } : {}),
    source: entry.source || "mcp",
    installable: Boolean(entry.installable),
    mcp: normalizeMcp(entry.mcp || {}),
    secrets: Array.isArray(entry.secrets) ? entry.secrets : [],
    tools: Array.isArray(entry.tools) ? entry.tools : [],
    prerequisites: Array.isArray(entry.prerequisites) ? entry.prerequisites : [],
    policySummary: entry.policySummary || {
      reviewed: false,
      defaultEnabledTools: 0,
      confirmationRequiredTools: 0,
    },
    workspace,
    requiresWorkspace: Boolean(workspace.required),
    workspaceBinding: workspace.binding || "",
    workspacePlaceholder: workspace.placeholder || "",
  };
};

export const MCP_STORE_CATEGORIES = Object.freeze(
  Array.isArray(registry.categories) ? [...registry.categories] : ["all"],
);

export const MCP_STORE_ENTRIES = Object.freeze(
  (Array.isArray(registry.entries) ? registry.entries : []).map(normalizeEntry),
);

export function listMcpStoreEntries() {
  return MCP_STORE_ENTRIES;
}

export function getMcpStoreEntry(id) {
  return MCP_STORE_ENTRIES.find((entry) => entry.id === id) || null;
}

/* Resolves the icon for an mcp toolkit. Priority: the registry entry's curated
   icon -> a user-uploaded custom icon (custom MCP) -> the toolkit's own icon ->
   the default mcp glyph. */
export function resolveMcpIcon(toolkit) {
  const entry = toolkit
    ? MCP_STORE_ENTRIES.find(
        (e) => e.id === toolkit.id || e.toolkitId === toolkit.toolkitId,
      )
    : null;
  return (
    (entry && entry.toolkitIcon) ||
    getCustomMcpIcon(toolkit?.toolkitId) ||
    toolkit?.toolkitIcon ||
    DEFAULT_MCP_ICON
  );
}

/* Look up the icon by installed toolkitId (mcp.*): curated registry icon, then
   a user-uploaded custom icon, else null (caller falls back to its own icon). */
export function mcpStoreIconFor(toolkitId) {
  const entry = MCP_STORE_ENTRIES.find((e) => e.toolkitId === toolkitId);
  if (entry) return entry.toolkitIcon || DEFAULT_MCP_ICON;
  return getCustomMcpIcon(toolkitId);
}

/* Applies the resolved icon to any mcp toolkit (Installed / selector / agent
   builder): curated registry icon -> user-uploaded custom icon -> generic mcp. */
export function withMcpStoreIcon(toolkit) {
  if (!toolkit || toolkit.source !== "mcp") return toolkit;
  const entry = MCP_STORE_ENTRIES.find(
    (e) => e.toolkitId === toolkit.toolkitId,
  );
  const icon =
    (entry && entry.toolkitIcon) ||
    getCustomMcpIcon(toolkit.toolkitId) ||
    DEFAULT_MCP_ICON;
  return { ...toolkit, toolkitIcon: icon };
}

export function searchMcpStoreEntries(entries, query, category) {
  const selectedCategory = category || "all";
  const q = (query || "").trim().toLowerCase();

  return entries.filter((entry) => {
    if (selectedCategory !== "all" && entry.category !== selectedCategory) {
      return false;
    }

    if (!q) return true;

    const name = (entry.toolkitName || "").toLowerCase();
    const description = (entry.toolkitDescription || "").toLowerCase();
    const id = (entry.id || "").toLowerCase();
    const toolNames = (entry.tools || [])
      .map((tool) => `${tool.title || ""} ${tool.name || ""}`.toLowerCase())
      .join(" ");

    return (
      name.includes(q) ||
      description.includes(q) ||
      id.includes(q) ||
      toolNames.includes(q)
    );
  });
}
