export const MCP_STORE_CATEGORIES = [
  "all",
  "browser",
  "dev",
  "productivity",
  "workspace",
  "memory",
];

export const MCP_STORE_ENTRIES = [
  {
    id: "browser.playwright",
    toolkitId: "mcp.browser.playwright",
    toolkitName: "Playwright Browser",
    toolkitDescription:
      "Browser automation through the official Playwright MCP server.",
    category: "browser",
    source: "mcp",
    trustLevel: "verified",
    status: "available",
    license: "Apache-2.0",
    sourceRepo: "https://github.com/microsoft/playwright-mcp",
    docsUrl: "https://github.com/microsoft/playwright-mcp",
    toolkitIcon: {
      type: "builtin",
      name: "globe",
      color: "#2563eb",
      backgroundColor: "#dbeafe",
    },
    mcp: {
      transport: "stdio",
      command: "npx",
      args: ["-y", "@playwright/mcp@latest"],
    },
    setupPreview: "npx -y @playwright/mcp@latest",
    prerequisites: ["Node.js >= 18"],
    secrets: [],
    tools: [
      {
        name: "browser_navigate",
        title: "Navigate",
        requiresConfirmation: false,
      },
      {
        name: "browser_snapshot",
        title: "Snapshot",
        requiresConfirmation: false,
      },
      { name: "browser_click", title: "Click", requiresConfirmation: true },
      { name: "browser_type", title: "Type", requiresConfirmation: true },
    ],
    policySummary: {
      reviewed: true,
      defaultEnabledTools: 0,
      confirmationRequiredTools: 2,
    },
    readmeMarkdown:
      "## Playwright Browser\n\nDrives a real browser over stdio: navigation, clicks, form fill and accessibility snapshots. Maintained by Microsoft.",
  },
  {
    id: "browser.browser-use-local",
    toolkitId: "mcp.browser.browser-use-local",
    toolkitName: "Browser Use",
    toolkitDescription:
      "Local agentic browser control via the browser-use CLI MCP server.",
    category: "browser",
    source: "mcp",
    trustLevel: "community",
    status: "available",
    license: "MIT",
    sourceRepo: "https://github.com/browser-use/browser-use",
    docsUrl: "https://github.com/browser-use/browser-use",
    toolkitIcon: {
      type: "builtin",
      name: "globe",
      color: "#7c3aed",
      backgroundColor: "#ede9fe",
    },
    mcp: {
      transport: "stdio",
      command: "uvx",
      args: ["--from", "browser-use[cli]", "browser-use", "--mcp"],
    },
    setupPreview: "uvx --from browser-use[cli] browser-use --mcp",
    prerequisites: ["uv / uvx", "Python >= 3.11"],
    secrets: [{ key: "OPENAI_API_KEY", label: "OpenAI API key" }],
    tools: [
      { name: "open_tab", title: "Open tab", requiresConfirmation: false },
      { name: "go_to_url", title: "Go to URL", requiresConfirmation: false },
      {
        name: "click_element",
        title: "Click element",
        requiresConfirmation: true,
      },
      { name: "input_text", title: "Input text", requiresConfirmation: true },
    ],
    policySummary: {
      reviewed: true,
      defaultEnabledTools: 0,
      confirmationRequiredTools: 2,
    },
    readmeMarkdown:
      "## Browser Use\n\nRuns the browser-use CLI as an MCP server for LLM-driven browsing. Requires `uv`/`uvx` and an `OPENAI_API_KEY`.",
  },
  {
    id: "dev.github-remote",
    toolkitId: "mcp.dev.github-remote",
    toolkitName: "GitHub",
    toolkitDescription:
      "Remote GitHub MCP server for repositories, issues and pull requests.",
    category: "dev",
    source: "mcp",
    trustLevel: "verified",
    status: "available",
    license: "MIT",
    sourceRepo: "https://github.com/github/github-mcp-server",
    docsUrl: "https://github.com/github/github-mcp-server",
    toolkitIcon: {
      type: "builtin",
      name: "github",
      color: "#475569",
      backgroundColor: "#e8e8ee",
    },
    mcp: {
      transport: "http",
      url: "https://api.githubcopilot.com/mcp/",
      headers: [],
    },
    setupPreview: "https://api.githubcopilot.com/mcp/",
    prerequisites: ["GitHub account"],
    secrets: [
      {
        key: "GITHUB_MCP_PAT",
        label: "GitHub Personal Access Token",
        optional: true,
      },
    ],
    tools: [
      {
        name: "search_repositories",
        title: "Search repositories",
        requiresConfirmation: false,
      },
      {
        name: "get_file_contents",
        title: "Get file contents",
        requiresConfirmation: false,
      },
      { name: "create_issue", title: "Create issue", requiresConfirmation: true },
      {
        name: "create_pull_request",
        title: "Create pull request",
        requiresConfirmation: true,
      },
    ],
    policySummary: {
      reviewed: true,
      defaultEnabledTools: 0,
      confirmationRequiredTools: 2,
    },
    readmeMarkdown:
      "## GitHub (remote)\n\nThe official remote GitHub MCP server. Supports OAuth or a Personal Access Token header. Phase 1 shows the connection details only.",
  },
  {
    id: "productivity.notion-remote",
    toolkitId: "mcp.productivity.notion-remote",
    toolkitName: "Notion",
    toolkitDescription:
      "Hosted remote MCP for Notion pages, databases and search.",
    category: "productivity",
    source: "mcp",
    trustLevel: "verified",
    status: "available",
    license: "hosted",
    sourceRepo: "https://developers.notion.com/docs/get-started-with-mcp",
    docsUrl: "https://developers.notion.com/docs/get-started-with-mcp",
    toolkitIcon: {
      type: "builtin",
      name: "server",
      color: "#334155",
      backgroundColor: "#e2e8f0",
    },
    mcp: {
      transport: "http",
      url: "https://mcp.notion.com/mcp",
      headers: [],
    },
    setupPreview: "https://mcp.notion.com/mcp",
    prerequisites: ["Notion account"],
    secrets: [],
    tools: [
      { name: "search", title: "Search", requiresConfirmation: false },
      {
        name: "fetch_page",
        title: "Fetch page",
        requiresConfirmation: false,
      },
      { name: "create_page", title: "Create page", requiresConfirmation: true },
    ],
    policySummary: {
      reviewed: true,
      defaultEnabledTools: 0,
      confirmationRequiredTools: 1,
    },
    readmeMarkdown:
      "## Notion (hosted)\n\nNotion's hosted MCP endpoint. Connection is via OAuth in the Phase 2 setup flow; Phase 1 only previews the endpoint.",
  },
  {
    id: "workspace.filesystem",
    toolkitId: "mcp.workspace.filesystem",
    toolkitName: "Filesystem",
    toolkitDescription:
      "Read and write files within an allowed workspace directory.",
    category: "workspace",
    source: "mcp",
    trustLevel: "verified",
    status: "available",
    license: "Apache-2.0 / MIT",
    sourceRepo: "https://github.com/modelcontextprotocol/servers",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
    toolkitIcon: {
      type: "builtin",
      name: "folder",
      color: "#d97706",
      backgroundColor: "#fef3c7",
    },
    mcp: {
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "${WORKSPACE}"],
    },
    setupPreview: "npx -y @modelcontextprotocol/server-filesystem ${WORKSPACE}",
    prerequisites: ["Node.js >= 18"],
    secrets: [],
    tools: [
      { name: "read_file", title: "Read file", requiresConfirmation: false },
      {
        name: "list_directory",
        title: "List directory",
        requiresConfirmation: false,
      },
      { name: "write_file", title: "Write file", requiresConfirmation: true },
      { name: "move_file", title: "Move file", requiresConfirmation: true },
    ],
    policySummary: {
      reviewed: true,
      defaultEnabledTools: 0,
      confirmationRequiredTools: 2,
    },
    readmeMarkdown:
      "## Filesystem\n\nReference MCP server for scoped file access. The `${WORKSPACE}` placeholder is filled with the chosen directory during Phase 2 setup.",
  },
  {
    id: "memory.memory",
    toolkitId: "mcp.memory.memory",
    toolkitName: "Memory",
    toolkitDescription:
      "Persistent knowledge-graph memory via the reference MCP server.",
    category: "memory",
    source: "mcp",
    trustLevel: "verified",
    status: "available",
    license: "Apache-2.0 / MIT",
    sourceRepo: "https://github.com/modelcontextprotocol/servers",
    docsUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/memory",
    toolkitIcon: {
      type: "builtin",
      name: "server",
      color: "#0d9488",
      backgroundColor: "#ccfbf1",
    },
    mcp: {
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-memory"],
    },
    setupPreview: "npx -y @modelcontextprotocol/server-memory",
    prerequisites: ["Node.js >= 18"],
    secrets: [],
    tools: [
      {
        name: "search_nodes",
        title: "Search nodes",
        requiresConfirmation: false,
      },
      { name: "read_graph", title: "Read graph", requiresConfirmation: false },
      {
        name: "create_entities",
        title: "Create entities",
        requiresConfirmation: true,
      },
    ],
    policySummary: {
      reviewed: true,
      defaultEnabledTools: 0,
      confirmationRequiredTools: 1,
    },
    readmeMarkdown:
      "## Memory\n\nReference knowledge-graph memory server. Stores entities and relations the agent can recall across sessions.",
  },
  {
    id: "productivity.slack",
    toolkitId: "mcp.productivity.slack",
    toolkitName: "Slack",
    toolkitDescription:
      "Send messages and read channels via the Slack MCP server.",
    category: "productivity",
    source: "mcp",
    trustLevel: "needs_review",
    status: "needs_review",
    license: "Unverified",
    sourceRepo: "https://github.com/modelcontextprotocol/servers",
    docsUrl: "https://github.com/modelcontextprotocol/servers",
    toolkitIcon: {
      type: "builtin",
      name: "link",
      color: "#475569",
      backgroundColor: "#e8e8ee",
    },
    mcp: {
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-slack"],
    },
    setupPreview: "npx -y @modelcontextprotocol/server-slack",
    prerequisites: ["Node.js >= 18"],
    secrets: [{ key: "SLACK_BOT_TOKEN", label: "Slack bot token" }],
    tools: [
      {
        name: "list_channels",
        title: "List channels",
        requiresConfirmation: false,
      },
      {
        name: "post_message",
        title: "Post message",
        requiresConfirmation: true,
      },
    ],
    policySummary: {
      reviewed: false,
      defaultEnabledTools: 0,
      confirmationRequiredTools: 1,
    },
    readmeMarkdown:
      "## Slack\n\nCandidate entry - recipe and license are not yet verified. Shown for review only.",
  },
];

export function listMcpStoreEntries() {
  return MCP_STORE_ENTRIES;
}

export function getMcpStoreEntry(id) {
  return MCP_STORE_ENTRIES.find((entry) => entry.id === id) || null;
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
