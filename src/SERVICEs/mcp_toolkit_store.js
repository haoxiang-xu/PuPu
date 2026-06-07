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

let metadataByEntryId = new Map();
let metadataByToolkitId = new Map();

const isFileIcon = (icon) =>
  Boolean(
    icon &&
      icon.type === "file" &&
      typeof icon.content === "string" &&
      icon.content &&
      typeof icon.mimeType === "string" &&
      icon.mimeType,
  );

const normalizeMetadataRecord = (record = {}) => {
  if (!record || typeof record !== "object") return null;
  const entryId = String(record.entryId || record.entry_id || "").trim();
  const toolkitId = String(record.toolkitId || record.toolkit_id || "").trim();
  if (!entryId && !toolkitId) return null;
  const metadata =
    record.metadata && typeof record.metadata === "object"
      ? { ...record.metadata }
      : {};
  const icon = isFileIcon(record.icon) ? { ...record.icon } : null;
  return {
    ...record,
    entryId,
    toolkitId,
    metadata,
    ...(icon ? { icon } : {}),
    iconPolicy:
      record.iconPolicy === "replace" || record.icon_policy === "replace"
        ? "replace"
        : "fallback",
  };
};

const metadataRecordFor = (toolkit) => {
  if (!toolkit) return null;
  const entryId = String(toolkit.id || toolkit.entryId || "").trim();
  const toolkitId = String(toolkit.toolkitId || toolkit.toolkit_id || "").trim();
  return (
    (entryId && metadataByEntryId.get(entryId)) ||
    (toolkitId && metadataByToolkitId.get(toolkitId)) ||
    null
  );
};

const overlayEntryMetadata = (entry) => {
  const record = metadataRecordFor(entry);
  if (!record) return entry;
  const repoMetadata = record.metadata || {};
  return {
    ...entry,
    ...(repoMetadata.description
      ? { toolkitDescription: String(repoMetadata.description) }
      : {}),
    ...(repoMetadata.license ? { license: String(repoMetadata.license) } : {}),
    ...(repoMetadata.stars != null ? { repoStars: repoMetadata.stars } : {}),
    ...(repoMetadata.fullName
      ? { repoFullName: String(repoMetadata.fullName) }
      : {}),
    ...(repoMetadata.ownerLogin
      ? { repoOwnerLogin: String(repoMetadata.ownerLogin) }
      : {}),
    ...(repoMetadata.ownerAvatarUrl
      ? { repoOwnerAvatarUrl: String(repoMetadata.ownerAvatarUrl) }
      : {}),
    repoMetadata,
    metadataIcon: record.icon || null,
    metadataIconPolicy: record.iconPolicy || "fallback",
    metadataLastFetchedAt: record.lastFetchedAt || 0,
    metadataLastError: record.lastError || "",
  };
};

export function setMcpStoreMetadataCache(payload = {}) {
  const entries = Array.isArray(payload.entries)
    ? payload.entries
    : Object.values(payload.byEntryId || {});
  const nextByEntryId = new Map();
  const nextByToolkitId = new Map();
  for (const rawRecord of entries) {
    const record = normalizeMetadataRecord(rawRecord);
    if (!record) continue;
    if (record.entryId) nextByEntryId.set(record.entryId, record);
    if (record.toolkitId) nextByToolkitId.set(record.toolkitId, record);
  }
  metadataByEntryId = nextByEntryId;
  metadataByToolkitId = nextByToolkitId;
}

export function clearMcpStoreMetadataCache() {
  metadataByEntryId = new Map();
  metadataByToolkitId = new Map();
}

export function listMcpStoreEntries() {
  return MCP_STORE_ENTRIES.map(overlayEntryMetadata);
}

export function getMcpStoreEntry(id) {
  const entry = MCP_STORE_ENTRIES.find((item) => item.id === id);
  return entry ? overlayEntryMetadata(entry) : null;
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
  const record = metadataRecordFor(toolkit) || metadataRecordFor(entry);
  const metadataIcon = isFileIcon(record?.icon) ? record.icon : null;
  if (metadataIcon && record?.iconPolicy === "replace") {
    return metadataIcon;
  }
  if (entry?.toolkitIcon) {
    return entry.toolkitIcon;
  }
  if (metadataIcon) {
    return metadataIcon;
  }
  return (
    getCustomMcpIcon(toolkit?.toolkitId) ||
    toolkit?.toolkitIcon ||
    DEFAULT_MCP_ICON
  );
}

/* Look up the icon by installed toolkitId (mcp.*): curated registry icon, then
   a user-uploaded custom icon, else null (caller falls back to its own icon). */
export function mcpStoreIconFor(toolkitId) {
  const entry = MCP_STORE_ENTRIES.find((e) => e.toolkitId === toolkitId);
  const record = metadataRecordFor({ toolkitId }) || metadataRecordFor(entry);
  const metadataIcon = isFileIcon(record?.icon) ? record.icon : null;
  if (metadataIcon && record?.iconPolicy === "replace") return metadataIcon;
  if (entry?.toolkitIcon) return entry.toolkitIcon;
  if (metadataIcon) return metadataIcon;
  if (entry) return DEFAULT_MCP_ICON;
  return getCustomMcpIcon(toolkitId);
}

/* Applies the resolved icon to any mcp toolkit (Installed / selector / agent
   builder): curated registry icon -> user-uploaded custom icon -> generic mcp. */
export function withMcpStoreIcon(toolkit) {
  if (!toolkit || toolkit.source !== "mcp") return toolkit;
  const entry = MCP_STORE_ENTRIES.find(
    (e) => e.toolkitId === toolkit.toolkitId,
  );
  const icon = resolveMcpIcon({ ...toolkit, id: entry?.id });
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
