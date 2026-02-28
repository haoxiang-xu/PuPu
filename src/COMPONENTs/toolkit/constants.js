export const SECTIONS = [
  { key: "toolkits", icon: "tool", label: "Toolkits" },
  { key: "skills", icon: "education", label: "Skills" },
  { key: "mcp", icon: "mcp", label: "MCP" },
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
