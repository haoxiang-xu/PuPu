/* ── MCP UI Constants ── */

export const MCP_SUB_PAGES = [
  { key: "catalog", icon: "search", label: "Official" },
  { key: "installed", icon: "server", label: "Installed" },
  { key: "claude_import", icon: "Anthropic", label: "Claude" },
  { key: "github_import", icon: "github", label: "GitHub" },
  { key: "manual", icon: "add", label: "Manual" },
];

/* ── Instance status → visual config ── */
export const STATUS_CONFIG = {
  draft: {
    label: "Draft",
    color: "#94a3b8",
    bg: "rgba(148,163,184,0.12)",
  },
  ready_for_review: {
    label: "Review",
    color: "#60a5fa",
    bg: "rgba(96,165,250,0.12)",
  },
  testing: {
    label: "Testing",
    color: "#fbbf24",
    bg: "rgba(251,191,36,0.12)",
  },
  test_passed: {
    label: "Passed",
    color: "#34d399",
    bg: "rgba(52,211,153,0.12)",
  },
  test_failed: {
    label: "Failed",
    color: "#f87171",
    bg: "rgba(248,113,113,0.12)",
  },
  enabled: {
    label: "Enabled",
    color: "#34d399",
    bg: "rgba(52,211,153,0.12)",
  },
  disabled: {
    label: "Disabled",
    color: "#94a3b8",
    bg: "rgba(148,163,184,0.12)",
  },
  needs_secret: {
    label: "Needs Secret",
    color: "#fb923c",
    bg: "rgba(251,146,60,0.12)",
  },
  revoked: {
    label: "Revoked",
    color: "#ef4444",
    bg: "rgba(239,68,68,0.12)",
  },
};

/* ── Source kind → visual config ── */
export const SOURCE_KIND_CONFIG = {
  official: {
    label: "Official",
    color: "#a78bfa",
    bg: "rgba(167,139,250,0.13)",
  },
  claude: {
    label: "Claude",
    color: "#fb923c",
    bg: "rgba(251,146,60,0.12)",
  },
  github: {
    label: "GitHub",
    color: "#60a5fa",
    bg: "rgba(96,165,250,0.12)",
  },
  manual: {
    label: "Manual",
    color: "#94a3b8",
    bg: "rgba(148,163,184,0.12)",
  },
};

/* ── Runtime → visual config ── */
export const RUNTIME_CONFIG = {
  local: {
    label: "Local",
    color: "#60a5fa",
    bg: "rgba(96,165,250,0.12)",
  },
  remote: {
    label: "Remote",
    color: "#a78bfa",
    bg: "rgba(167,139,250,0.13)",
  },
};

/* ── Verification → visual config ── */
export const VERIFICATION_CONFIG = {
  verified: {
    label: "Verified",
    color: "#34d399",
    icon: "verified",
  },
  community: {
    label: "Community",
    color: "#94a3b8",
    icon: "user",
  },
};

/* ── Test phase labels ── */
export const TEST_PHASES = [
  { key: "validate", label: "Validate" },
  { key: "prepare", label: "Prepare" },
  { key: "connect", label: "Connect" },
  { key: "list_tools", label: "Discover Tools" },
];

/* ── Error code → human label ── */
export const ERROR_LABELS = {
  INVALID_CONFIG: "Invalid configuration",
  MISSING_SECRET: "Missing secret value",
  BINARY_NOT_FOUND: "Binary not found",
  BAD_WORKING_DIR: "Working directory not found",
  UNSUPPORTED_PLATFORM: "Unsupported platform",
  AUTH_FAILED: "Authentication failed",
  CONNECT_TIMEOUT: "Connection timeout",
  HANDSHAKE_FAILED: "Handshake failed",
  LIST_TOOLS_FAILED: "Tool discovery failed",
  REVOKED_ENTRY: "Server has been revoked",
};
