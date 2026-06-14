import registry from "./mcp_toolkit_registry.json";
import { getCustomMcpIcon } from "./custom_mcp_icon_store";
import {
  LogoSVGs,
  UISVGs,
} from "../BUILTIN_COMPONENTs/icon/icon_manifest";

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

let storeEntries = [...MCP_STORE_ENTRIES];
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

const hasIconPayload = (icon) =>
  Boolean(icon && typeof icon === "object" && Object.keys(icon).length > 0);

const isKnownBuiltinIcon = (name) =>
  typeof name === "string" && (name in UISVGs || name in LogoSVGs);

const isExplicitMcpIcon = (icon) => {
  if (!hasIconPayload(icon)) return false;
  if (isFileIcon(icon)) return true;
  if (icon.type !== "builtin") return false;
  return icon.name !== "tool" && isKnownBuiltinIcon(icon.name);
};

const isMcpToolkit = (toolkit) =>
  Boolean(
    toolkit &&
      (toolkit.source === "mcp" ||
        toolkit.source === "mcp_registry" ||
        String(toolkit.toolkitId || toolkit.toolkit_id || toolkit.id || "")
          .trim()
          .startsWith("mcp.")),
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

const currentStoreEntries = () => storeEntries;

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

export function setMcpStoreEntriesCache(payload = {}) {
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  storeEntries = entries.length ? entries.map(normalizeEntry) : [...MCP_STORE_ENTRIES];
}

export function clearMcpStoreEntriesCache() {
  storeEntries = [...MCP_STORE_ENTRIES];
}

export function listMcpStoreEntries() {
  return currentStoreEntries().map(overlayEntryMetadata);
}

export function getMcpStoreEntry(id) {
  const entry = currentStoreEntries().find((item) => item.id === id);
  return entry ? overlayEntryMetadata(entry) : null;
}

/* Resolves the icon for an mcp toolkit. Metadata icons only replace defaults
   when the registry explicitly opts into iconPolicy: "replace"; otherwise an
   MCP without a curated/custom icon uses the generic mcp glyph. */
export function resolveMcpIcon(toolkit) {
  const entry = toolkit
    ? currentStoreEntries().find(
        (e) => e.id === toolkit.id || e.toolkitId === toolkit.toolkitId,
      )
    : null;
  const record = metadataRecordFor(toolkit) || metadataRecordFor(entry);
  const metadataIcon = isFileIcon(record?.icon) ? record.icon : null;
  if (metadataIcon && record?.iconPolicy === "replace") {
    return metadataIcon;
  }
  if (isExplicitMcpIcon(entry?.toolkitIcon)) {
    return entry.toolkitIcon;
  }
  const customIcon = getCustomMcpIcon(toolkit?.toolkitId);
  if (customIcon) {
    return customIcon;
  }
  if (isExplicitMcpIcon(toolkit?.toolkitIcon)) {
    return toolkit.toolkitIcon;
  }
  if (isMcpToolkit(toolkit) || entry) {
    return DEFAULT_MCP_ICON;
  }
  if (metadataIcon) {
    return metadataIcon;
  }
  return (
    toolkit?.toolkitIcon ||
    DEFAULT_MCP_ICON
  );
}

/* Look up the icon by installed toolkitId (mcp.*): curated registry icon, then
   a user-uploaded custom icon, else null (caller falls back to its own icon). */
export function mcpStoreIconFor(toolkitId) {
  const entry = currentStoreEntries().find((e) => e.toolkitId === toolkitId);
  const record = metadataRecordFor({ toolkitId }) || metadataRecordFor(entry);
  const metadataIcon = isFileIcon(record?.icon) ? record.icon : null;
  if (metadataIcon && record?.iconPolicy === "replace") return metadataIcon;
  if (isExplicitMcpIcon(entry?.toolkitIcon)) return entry.toolkitIcon;
  const customIcon = getCustomMcpIcon(toolkitId);
  if (customIcon) return customIcon;
  if (entry || String(toolkitId || "").trim().startsWith("mcp.")) {
    return DEFAULT_MCP_ICON;
  }
  if (metadataIcon) return metadataIcon;
  return null;
}

/* Applies the resolved icon to any mcp toolkit (Installed / selector / agent
   builder): curated registry icon -> user-uploaded custom icon -> generic mcp. */
export function withMcpStoreIcon(toolkit) {
  if (!isMcpToolkit(toolkit)) return toolkit;
  const entry = currentStoreEntries().find(
    (e) => e.toolkitId === toolkit.toolkitId,
  );
  const icon = resolveMcpIcon({ ...toolkit, id: entry?.id });
  return { ...toolkit, toolkitIcon: icon };
}

export function searchMcpStoreEntries(entries, query, category) {
  const selectedCategory = category || "all";
  const q = (query || "").trim().toLowerCase();

  return entries.filter((entry) => {
    // Store browse excludes deprecated/superseded entries. This is a
    // browse-only guard: installed instances render off the installed-toolkit
    // path (api catalog), not this funnel, so already-installed deprecated
    // toolkits keep working / show as archived and are unaffected here.
    if (entry.status === "deprecated" || entry.deprecated === true) {
      return false;
    }

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
