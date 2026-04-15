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
};
