/* ── MCP Mock Data for UI Development ──
   Replaced by real API calls once Pupu logic workstream delivers endpoints. */

const MOCK_CATALOG = [
  {
    id: "cat-filesystem",
    slug: "filesystem",
    name: "Filesystem",
    publisher: "Anthropic",
    description:
      "Read, write, and manage files and directories on the local filesystem with fine-grained access control.",
    icon_url: null,
    verification: "verified",
    source_url: "https://github.com/modelcontextprotocol/servers",
    tags: ["file", "io", "core"],
    install_profiles: [
      {
        id: "prof-fs-local",
        label: "Local (stdio)",
        runtime: "local",
        transport: "stdio",
        platforms: ["darwin", "linux", "win32"],
        fields: [
          { name: "command", label: "Command", type: "string", required: true },
          {
            name: "args",
            label: "Arguments",
            type: "string_array",
            required: false,
          },
          {
            name: "cwd",
            label: "Working Directory",
            type: "path",
            required: false,
          },
        ],
        default_values: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
        },
        requires_secrets: [],
      },
    ],
    tool_preview: [
      { name: "read_file", description: "Read contents of a file" },
      { name: "write_file", description: "Write content to a file" },
      { name: "list_directory", description: "List directory contents" },
      { name: "create_directory", description: "Create a new directory" },
      { name: "move_file", description: "Move or rename a file" },
    ],
    revoked: false,
  },
  {
    id: "cat-brave-search",
    slug: "brave-search",
    name: "Brave Search",
    publisher: "Brave",
    description:
      "Web and local search powered by Brave Search API. Provides real-time web results without tracking.",
    icon_url: null,
    verification: "verified",
    source_url: "https://github.com/modelcontextprotocol/servers",
    tags: ["search", "web"],
    install_profiles: [
      {
        id: "prof-brave-local",
        label: "Local (stdio)",
        runtime: "local",
        transport: "stdio",
        platforms: ["darwin", "linux", "win32"],
        fields: [
          { name: "command", label: "Command", type: "string", required: true },
          {
            name: "args",
            label: "Arguments",
            type: "string_array",
            required: false,
          },
        ],
        default_values: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-brave-search"],
        },
        requires_secrets: ["BRAVE_API_KEY"],
      },
    ],
    tool_preview: [
      { name: "brave_web_search", description: "Search the web" },
      { name: "brave_local_search", description: "Search local businesses" },
    ],
    revoked: false,
  },
  {
    id: "cat-github",
    slug: "github-mcp",
    name: "GitHub",
    publisher: "GitHub",
    description:
      "Interact with GitHub repositories, issues, pull requests, and more via the GitHub API.",
    icon_url: null,
    verification: "verified",
    source_url: "https://github.com/modelcontextprotocol/servers",
    tags: ["git", "dev", "api"],
    install_profiles: [
      {
        id: "prof-gh-local",
        label: "Local (stdio)",
        runtime: "local",
        transport: "stdio",
        platforms: ["darwin", "linux", "win32"],
        fields: [
          { name: "command", label: "Command", type: "string", required: true },
          {
            name: "args",
            label: "Arguments",
            type: "string_array",
            required: false,
          },
        ],
        default_values: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
        },
        requires_secrets: ["GITHUB_PERSONAL_ACCESS_TOKEN"],
      },
    ],
    tool_preview: [
      {
        name: "search_repositories",
        description: "Search GitHub repositories",
      },
      { name: "create_issue", description: "Create a new issue" },
      { name: "list_pull_requests", description: "List pull requests" },
    ],
    revoked: false,
  },
  {
    id: "cat-postgres",
    slug: "postgres",
    name: "PostgreSQL",
    publisher: "Anthropic",
    description:
      "Execute read-only SQL queries against a PostgreSQL database for data analysis and inspection.",
    icon_url: null,
    verification: "verified",
    source_url: "https://github.com/modelcontextprotocol/servers",
    tags: ["database", "sql"],
    install_profiles: [
      {
        id: "prof-pg-local",
        label: "Local (stdio)",
        runtime: "local",
        transport: "stdio",
        platforms: ["darwin", "linux", "win32"],
        fields: [
          { name: "command", label: "Command", type: "string", required: true },
          {
            name: "args",
            label: "Arguments",
            type: "string_array",
            required: false,
          },
        ],
        default_values: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-postgres"],
        },
        requires_secrets: ["POSTGRES_CONNECTION_STRING"],
      },
    ],
    tool_preview: [{ name: "query", description: "Run a read-only SQL query" }],
    revoked: false,
  },
  {
    id: "cat-puppeteer",
    slug: "puppeteer",
    name: "Puppeteer",
    publisher: "Anthropic",
    description:
      "Browser automation via Puppeteer. Navigate pages, take screenshots, and interact with web elements.",
    icon_url: null,
    verification: "community",
    source_url: "https://github.com/modelcontextprotocol/servers",
    tags: ["browser", "automation", "web"],
    install_profiles: [
      {
        id: "prof-pup-local",
        label: "Local (stdio)",
        runtime: "local",
        transport: "stdio",
        platforms: ["darwin", "linux", "win32"],
        fields: [
          { name: "command", label: "Command", type: "string", required: true },
          {
            name: "args",
            label: "Arguments",
            type: "string_array",
            required: false,
          },
        ],
        default_values: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-puppeteer"],
        },
        requires_secrets: [],
      },
    ],
    tool_preview: [
      { name: "puppeteer_navigate", description: "Navigate to a URL" },
      { name: "puppeteer_screenshot", description: "Take a screenshot" },
      { name: "puppeteer_click", description: "Click an element" },
    ],
    revoked: false,
  },
  {
    id: "cat-memory",
    slug: "memory",
    name: "Memory",
    publisher: "Anthropic",
    description:
      "Persistent memory using a knowledge graph. Store and retrieve entities, relations, and observations.",
    icon_url: null,
    verification: "verified",
    source_url: "https://github.com/modelcontextprotocol/servers",
    tags: ["memory", "knowledge", "graph"],
    install_profiles: [
      {
        id: "prof-mem-local",
        label: "Local (stdio)",
        runtime: "local",
        transport: "stdio",
        platforms: ["darwin", "linux", "win32"],
        fields: [
          { name: "command", label: "Command", type: "string", required: true },
          {
            name: "args",
            label: "Arguments",
            type: "string_array",
            required: false,
          },
        ],
        default_values: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-memory"],
        },
        requires_secrets: [],
      },
    ],
    tool_preview: [
      {
        name: "create_entities",
        description: "Create new entities in the knowledge graph",
      },
      {
        name: "search_nodes",
        description: "Search for nodes in the knowledge graph",
      },
      { name: "open_nodes", description: "Retrieve specific entities" },
    ],
    revoked: false,
  },
];

const MOCK_INSTALLED = [
  {
    instance_id: "inst-fs-1",
    display_name: "Filesystem",
    catalog_entry_id: "cat-filesystem",
    source_kind: "official",
    runtime: "local",
    transport: "stdio",
    status: "enabled",
    enabled: true,
    needs_secret: false,
    last_test_result: {
      status: "success",
      phase: "list_tools",
      summary: "All 5 tools discovered",
      tool_count: 5,
      tools: [
        { name: "read_file", description: "Read contents of a file" },
        { name: "write_file", description: "Write content to a file" },
        { name: "list_directory", description: "List directory contents" },
        { name: "create_directory", description: "Create a new directory" },
        { name: "move_file", description: "Move or rename a file" },
      ],
      warnings: [],
      errors: [],
    },
    cached_tools: [
      { name: "read_file", description: "Read contents of a file" },
      { name: "write_file", description: "Write content to a file" },
      { name: "list_directory", description: "List directory contents" },
      { name: "create_directory", description: "Create a new directory" },
      { name: "move_file", description: "Move or rename a file" },
    ],
    updated_at: "2025-12-20T10:30:00Z",
  },
  {
    instance_id: "inst-brave-1",
    display_name: "Brave Search",
    catalog_entry_id: "cat-brave-search",
    source_kind: "official",
    runtime: "local",
    transport: "stdio",
    status: "needs_secret",
    enabled: false,
    needs_secret: true,
    last_test_result: null,
    cached_tools: [],
    updated_at: "2025-12-19T15:00:00Z",
  },
  {
    instance_id: "inst-custom-1",
    display_name: "My Custom Server",
    catalog_entry_id: null,
    source_kind: "manual",
    runtime: "remote",
    transport: "sse",
    status: "test_failed",
    enabled: false,
    needs_secret: false,
    last_test_result: {
      status: "failed",
      phase: "connect",
      summary: "Connection timed out after 30s",
      tool_count: 0,
      tools: [],
      warnings: [],
      errors: [
        {
          code: "CONNECT_TIMEOUT",
          detail: "Failed to reach http://localhost:8080/sse within 30 seconds",
        },
      ],
    },
    cached_tools: [],
    updated_at: "2025-12-18T08:45:00Z",
  },
];

/* ── Simulated delay ── */
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── Mock API ── */
export const mcpMockApi = {
  async listCatalog(filters) {
    await delay(400);
    let results = [...MOCK_CATALOG];
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      results = results.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          e.tags.some((t) => t.includes(q)),
      );
    }
    return results;
  },

  async importClaudeConfig(payload) {
    await delay(600);
    try {
      const parsed =
        typeof payload === "string" ? JSON.parse(payload) : payload;
      const servers = parsed.mcpServers || parsed.mcp_servers || parsed;
      const entries = Object.entries(servers).map(([key, val], i) => ({
        entry_id: `draft-claude-${Date.now()}-${i}`,
        display_name: key,
        profile_candidates: [
          {
            id: `prof-claude-${i}`,
            label: val.url ? "Remote" : "Local (stdio)",
            runtime: val.url ? "remote" : "local",
            transport: val.url ? "sse" : "stdio",
          },
        ],
        prefilled_config: val,
        required_fields: val.command ? ["command"] : ["url"],
        required_secrets: val.env
          ? Object.keys(val.env).filter(
              (k) =>
                k.toUpperCase().includes("KEY") ||
                k.toUpperCase().includes("TOKEN") ||
                k.toUpperCase().includes("SECRET"),
            )
          : [],
        warnings: [],
      }));
      return {
        draft_id: `draft-${Date.now()}`,
        source_kind: "claude",
        source_label: "Claude JSON import",
        entries,
        warnings:
          entries.length === 0
            ? ["No MCP servers found in the provided configuration"]
            : [],
      };
    } catch {
      return {
        draft_id: `draft-${Date.now()}`,
        source_kind: "claude",
        source_label: "Claude JSON import",
        entries: [],
        warnings: ["Invalid JSON format. Please check your configuration."],
      };
    }
  },

  async importGitHubRepo({ url }) {
    await delay(800);
    const repoName = url.split("/").filter(Boolean).pop() || "unknown-repo";
    // Simulate: sometimes finds config, sometimes not
    const hasConfig = Math.random() > 0.3;
    if (hasConfig) {
      return {
        draft_id: `draft-gh-${Date.now()}`,
        source_kind: "github",
        source_label: url,
        entries: [
          {
            entry_id: `draft-gh-entry-${Date.now()}`,
            display_name: repoName,
            profile_candidates: [
              {
                id: `prof-gh-${Date.now()}`,
                label: "Local (stdio)",
                runtime: "local",
                transport: "stdio",
              },
            ],
            prefilled_config: {
              command: "npx",
              args: ["-y", `@${repoName}/mcp-server`],
            },
            required_fields: ["command"],
            required_secrets: [],
            warnings: [],
          },
        ],
        warnings: [],
      };
    }
    return {
      draft_id: `draft-gh-${Date.now()}`,
      source_kind: "github",
      source_label: url,
      entries: [
        {
          entry_id: `draft-gh-entry-${Date.now()}`,
          display_name: repoName,
          profile_candidates: [],
          prefilled_config: {},
          required_fields: [],
          required_secrets: [],
          warnings: [
            "No structured MCP configuration found. Please configure manually.",
          ],
        },
      ],
      warnings: [
        "Could not find server.json, mcp.json, .mcp.json, or claude_desktop_config.json in the repository.",
      ],
    };
  },

  async createManualDraft(payload) {
    await delay(200);
    return {
      draft_id: `draft-manual-${Date.now()}`,
      source_kind: "manual",
      source_label: "Manual configuration",
      entries: [
        {
          entry_id: `draft-manual-entry-${Date.now()}`,
          display_name: payload.name || "My MCP Server",
          profile_candidates: [
            {
              id: `prof-manual-${Date.now()}`,
              label:
                payload.runtime === "local"
                  ? "Local (stdio)"
                  : `Remote (${payload.transport || "sse"})`,
              runtime: payload.runtime || "local",
              transport: payload.transport || "stdio",
            },
          ],
          prefilled_config: payload.config || {},
          required_fields: [],
          required_secrets: [],
          warnings: [],
        },
      ],
      warnings: [],
    };
  },

  async listInstalledServers() {
    await delay(300);
    return [...MOCK_INSTALLED];
  },

  async testInstalledServer({ instance_id }) {
    await delay(2000);
    const success = Math.random() > 0.3;
    if (success) {
      return {
        status: "success",
        phase: "list_tools",
        summary: "Connection established, 3 tools discovered",
        tool_count: 3,
        tools: [
          { name: "tool_a", description: "Does thing A" },
          { name: "tool_b", description: "Does thing B" },
          { name: "tool_c", description: "Does thing C" },
        ],
        warnings: [],
        errors: [],
      };
    }
    return {
      status: "failed",
      phase: "connect",
      summary: "Failed to connect to MCP server",
      tool_count: 0,
      tools: [],
      warnings: [],
      errors: [
        {
          code: "CONNECT_TIMEOUT",
          detail: "Connection timed out after 30 seconds",
        },
      ],
    };
  },

  async enableInstalledServer({ instance_id }) {
    await delay(300);
    const server = MOCK_INSTALLED.find((s) => s.instance_id === instance_id);
    if (server) {
      server.status = "enabled";
      server.enabled = true;
    }
    return { instance_id, status: "enabled", enabled: true };
  },

  async disableInstalledServer({ instance_id }) {
    await delay(300);
    const server = MOCK_INSTALLED.find((s) => s.instance_id === instance_id);
    if (server) {
      server.status = "disabled";
      server.enabled = false;
    }
    return { instance_id, status: "disabled", enabled: false };
  },

  async saveInstalledServer({ draft_entry_id, profile_id, config, secrets }) {
    await delay(500);
    return {
      instance_id: `inst-${Date.now()}`,
      display_name: config?.name || "New MCP Server",
      catalog_entry_id: null,
      source_kind: "manual",
      runtime: config?.runtime || "local",
      transport: config?.transport || "stdio",
      status: "ready_for_review",
      enabled: false,
      needs_secret: false,
      last_test_result: null,
      cached_tools: [],
      updated_at: new Date().toISOString(),
    };
  },
};
