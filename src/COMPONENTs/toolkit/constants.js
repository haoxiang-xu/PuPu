export const SECTIONS = [
  { key: "toolkits", icon: "tool", label: "Toolkits" },
  { key: "skills", icon: "education", label: "Skills" },
];

export const BASE_TOOLKIT_IDENTIFIERS = new Set([
  "base",
  "toolkit",
  "builtin_toolkit",
  "base_toolkit",
]);

export const KIND_CONFIG = {
  core: {
    label: "Core",
    color: "#a78bfa",
    bg: "rgba(167,139,250,0.13)",
    border: "rgba(167,139,250,0.22)",
  },
  builtin: {
    label: "Built-in",
    color: "#34d399",
    bg: "rgba(52,211,153,0.12)",
    border: "rgba(52,211,153,0.20)",
  },
  integration: {
    label: "Integration",
    color: "#fb923c",
    bg: "rgba(251,146,60,0.12)",
    border: "rgba(251,146,60,0.20)",
  },
};

export const SOURCE_CONFIG = {
  builtin: {
    label: "Built-in",
    color: "#34d399",
    bg: "rgba(52,211,153,0.12)",
  },
  local: {
    label: "Local",
    color: "#60a5fa",
    bg: "rgba(96,165,250,0.12)",
  },
  plugin: {
    label: "Plugin",
    color: "#fb923c",
    bg: "rgba(251,146,60,0.12)",
  },
};
