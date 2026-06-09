export const SECTIONS = [
  { key: "toolkits", icon: "tool", labelKey: "toolkit.toolkits" },
  { key: "skills", icon: "education", labelKey: "toolkit.skills" },
];

export const BASE_TOOLKIT_IDENTIFIERS = new Set([
  "base",
  "toolkit",
  "builtin_toolkit",
  "base_toolkit",
]);

export const KIND_CONFIG = {
  core: {
    labelKey: "toolkit.kind_core",
    color: "#a78bfa",
    bg: "rgba(167,139,250,0.13)",
    border: "rgba(167,139,250,0.22)",
  },
  builtin: {
    labelKey: "toolkit.kind_builtin",
    color: "#34d399",
    bg: "rgba(52,211,153,0.12)",
    border: "rgba(52,211,153,0.20)",
  },
  integration: {
    labelKey: "toolkit.kind_integration",
    color: "#fb923c",
    bg: "rgba(251,146,60,0.12)",
    border: "rgba(251,146,60,0.20)",
  },
};

export const SOURCE_CONFIG = {
  builtin: {
    labelKey: "toolkit.source_builtin",
    color: "#34d399",
    bg: "rgba(52,211,153,0.12)",
  },
  local: {
    labelKey: "toolkit.source_local",
    color: "#60a5fa",
    bg: "rgba(96,165,250,0.12)",
  },
  plugin: {
    labelKey: "toolkit.source_plugin",
    color: "#fb923c",
    bg: "rgba(251,146,60,0.12)",
  },
  mcp: {
    labelKey: "toolkit.source_mcp",
    color: "#8b5cf6",
    bg: "rgba(139,92,246,0.12)",
  },
  mcp_registry: {
    labelKey: "toolkit.source_mcp_registry",
    color: "#f59e0b",
    bg: "rgba(251,146,60,0.12)",
  },
};

export const STORE_CATEGORY_CONFIG = [
  { key: "all", icon: "search", labelKey: "toolkit.store_category_all" },
  { key: "browser", icon: "globe", labelKey: "toolkit.store_category_browser" },
  { key: "dev", icon: "code", labelKey: "toolkit.store_category_dev" },
  { key: "devops", icon: "server", labelKey: "toolkit.store_category_devops" },
  {
    key: "productivity",
    icon: "tool",
    labelKey: "toolkit.store_category_productivity",
  },
  {
    key: "workspace",
    icon: "folder",
    labelKey: "toolkit.store_category_workspace",
  },
  { key: "memory", icon: "server", labelKey: "toolkit.store_category_memory" },
];

export const TRUST_CONFIG = {
  verified: {
    labelKey: "toolkit.trust_verified",
    color: "#10b981",
    bg: "rgba(52,211,153,0.13)",
  },
  community: {
    labelKey: "toolkit.trust_community",
    color: "#60a5fa",
    bg: "rgba(96,165,250,0.13)",
  },
  needs_review: {
    labelKey: "toolkit.trust_needs_review",
    color: "#f59e0b",
    bg: "rgba(251,146,60,0.13)",
  },
  external_review: {
    labelKey: "toolkit.trust_external_review",
    color: "#f59e0b",
    bg: "rgba(251,146,60,0.13)",
  },
  external_approved: {
    labelKey: "toolkit.trust_external_approved",
    color: "#10b981",
    bg: "rgba(52,211,153,0.13)",
  },
};
