import {
  MCP_STORE_CATEGORIES,
  MCP_STORE_ENTRIES,
  listMcpStoreEntries,
  getMcpStoreEntry,
  searchMcpStoreEntries,
} from "./mcp_toolkit_store";

describe("mcp_toolkit_store", () => {
  test("categories start with all and include the known set", () => {
    expect(MCP_STORE_CATEGORIES[0]).toBe("all");
    expect(MCP_STORE_CATEGORIES).toEqual(
      expect.arrayContaining([
        "browser",
        "dev",
        "productivity",
        "workspace",
        "memory",
      ]),
    );
  });

  test("every entry carries the Installed-compatible fields", () => {
    for (const entry of listMcpStoreEntries()) {
      expect(typeof entry.id).toBe("string");
      expect(entry.toolkitId).toMatch(/^mcp\./);
      expect(typeof entry.toolkitName).toBe("string");
      expect(typeof entry.toolkitDescription).toBe("string");
      expect(entry.source).toBe("mcp");
      expect(MCP_STORE_CATEGORIES).toContain(entry.category);
      expect(["stdio", "http"]).toContain(entry.mcp.transport);
      expect(Array.isArray(entry.tools)).toBe(true);
      expect(entry.toolkitIcon.type).toBe("builtin");
    }
  });

  test("getMcpStoreEntry returns the entry or null", () => {
    expect(getMcpStoreEntry("browser.playwright").toolkitName).toBe(
      "Playwright Browser",
    );
    expect(getMcpStoreEntry("does.not.exist")).toBeNull();
  });

  test("searchMcpStoreEntries filters by category", () => {
    const browser = searchMcpStoreEntries(
      listMcpStoreEntries(),
      "",
      "browser",
    );
    expect(browser.length).toBeGreaterThan(0);
    expect(browser.every((entry) => entry.category === "browser")).toBe(true);
  });

  test("searchMcpStoreEntries all category returns everything", () => {
    const all = searchMcpStoreEntries(listMcpStoreEntries(), "", "all");
    expect(all.length).toBe(listMcpStoreEntries().length);
  });

  test("searchMcpStoreEntries matches name, description and tool names", () => {
    expect(
      searchMcpStoreEntries(listMcpStoreEntries(), "github", "all").some(
        (entry) => entry.id === "dev.github-remote",
      ),
    ).toBe(true);
    expect(
      searchMcpStoreEntries(listMcpStoreEntries(), "notion", "all").some(
        (entry) => entry.id === "productivity.notion-remote",
      ),
    ).toBe(true);
    expect(
      searchMcpStoreEntries(listMcpStoreEntries(), "filesystem", "all").some(
        (entry) => entry.id === "workspace.filesystem",
      ),
    ).toBe(true);
  });

  test("registry includes stdio and http MCP shapes", () => {
    expect(MCP_STORE_ENTRIES.some((entry) => entry.mcp.transport === "stdio"))
      .toBe(true);
    expect(MCP_STORE_ENTRIES.some((entry) => entry.mcp.transport === "http"))
      .toBe(true);
  });

  test("github remote uses GITHUB_MCP_PAT, not GITHUB_TOKEN", () => {
    const github = getMcpStoreEntry("dev.github-remote");
    expect(github.secrets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "GITHUB_MCP_PAT" }),
      ]),
    );
    expect(github.secrets.some((secret) => secret.key === "GITHUB_TOKEN"))
      .toBe(false);
  });

  test("slack entry is flagged needs_review", () => {
    expect(getMcpStoreEntry("productivity.slack").status).toBe("needs_review");
  });
});
