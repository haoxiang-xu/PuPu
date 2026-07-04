const fs = require("fs");
const path = require("path");

const SERVICE_ROOT = __dirname;
const SRC_ROOT = path.resolve(SERVICE_ROOT, "..");

const readSource = (relativePath) =>
  fs.readFileSync(path.join(SRC_ROOT, relativePath), "utf8");

describe("toolkit_id_aliases", () => {
  test("normalizes removed builtin toolkit aliases through one helper", () => {
    let aliases;

    expect(() => {
      aliases = require("./toolkit_id_aliases");
    }).not.toThrow();

    expect(aliases.normalizeToolkitIdAlias("WorkspaceToolkit")).toBe("core");
    expect(aliases.normalizeToolkitIdAlias("web_toolkit")).toBe("core");
    expect(aliases.normalizeToolkitIdAlias("external_api")).toBe("core");
    expect(aliases.normalizeToolkitIdAlias("GitToolkit")).toBe("core");
    expect(aliases.normalizeToolkitIdAlias("mcp.dev.github-remote")).toBe(
      "mcp.dev.github-remote",
    );
    expect(
      aliases.normalizeToolkitIdAlias("mcp", { removedIds: ["mcp"] }),
    ).toBe("");
  });

  test("toolkit consumers do not keep duplicate alias tables", () => {
    const consumerFiles = [
      "SERVICEs/default_toolkit_store.js",
      "SERVICEs/toolkit_auto_approve_store.js",
      "SERVICEs/chat_storage/chat_storage_sanitize.js",
      "COMPONENTs/agents/pages/recipes_page/recipe_toolkit_ids.js",
    ];

    for (const relativePath of consumerFiles) {
      expect(readSource(relativePath)).not.toContain("TOOLKIT_ID_ALIASES");
    }
  });
});
