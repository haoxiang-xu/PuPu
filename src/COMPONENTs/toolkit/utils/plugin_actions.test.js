import { deletePluginToolkit, isBaseToolkitId } from "./plugin_actions";
import api from "../../../SERVICEs/api";
import { deleteMcpEntry } from "../../../SERVICEs/mcp_install";
import { removeInvalidToolkitIds } from "../../../SERVICEs/default_toolkit_store";
import { emitToolkitCatalogRefresh } from "../../../SERVICEs/toolkit_catalog_refresh";

jest.mock("../../../SERVICEs/api", () => ({
  __esModule: true,
  default: {
    unchain: {
      listToolModalCatalog: jest.fn(),
      deleteSkillPack: jest.fn(() => Promise.resolve({ ok: true })),
    },
  },
}));

jest.mock("../../../SERVICEs/mcp_install", () => ({
  __esModule: true,
  deleteMcpEntry: jest.fn(() => Promise.resolve({ ok: true })),
}));

jest.mock("../../../SERVICEs/default_toolkit_store", () => ({
  __esModule: true,
  removeInvalidToolkitIds: jest.fn(),
}));

jest.mock("../../../SERVICEs/toolkit_catalog_refresh", () => ({
  __esModule: true,
  emitToolkitCatalogRefresh: jest.fn(),
}));

const CATALOG = [
  { toolkitId: "plan", toolkitName: "Plan", source: "builtin" },
  { toolkitId: "mcp.productivity.notion-remote", toolkitName: "Notion", source: "mcp" },
  { toolkitId: "hidden.entry", toolkitName: "Hidden", source: "mcp", hidden: true },
  { toolkitId: "plugin.entry", toolkitName: "Plugin", source: "plugin" },
];

beforeEach(() => {
  api.unchain.listToolModalCatalog.mockReset();
  api.unchain.listToolModalCatalog.mockResolvedValue({ toolkits: CATALOG });
  deleteMcpEntry.mockClear();
  deleteMcpEntry.mockResolvedValue({ ok: true });
  removeInvalidToolkitIds.mockClear();
  api.unchain.deleteSkillPack.mockClear();
  api.unchain.deleteSkillPack.mockResolvedValue({ ok: true });
  emitToolkitCatalogRefresh.mockClear();
});

describe("isBaseToolkitId", () => {
  test("matches known base identifiers and suffixes, case-insensitively", () => {
    expect(isBaseToolkitId("BASE")).toBe(true);
    expect(isBaseToolkitId("something.toolkit")).toBe(true);
    expect(isBaseToolkitId("something.builtin_toolkit")).toBe(true);
    expect(isBaseToolkitId("something.base_toolkit")).toBe(true);
    expect(isBaseToolkitId("mcp.productivity.notion-remote")).toBe(false);
  });

  test("tolerates empty/missing input", () => {
    expect(isBaseToolkitId("")).toBe(false);
    expect(isBaseToolkitId(undefined)).toBe(false);
  });
});

describe("deletePluginToolkit", () => {
  test("deletes an mcp-sourced entry and prunes the default selection to the ids that remain", async () => {
    const result = await deletePluginToolkit("mcp.productivity.notion-remote");

    expect(result).toEqual({ ok: true, toolkitId: "mcp.productivity.notion-remote" });
    expect(deleteMcpEntry).toHaveBeenCalledWith("mcp.productivity.notion-remote");
    /* remaining visible ids = CATALOG minus hidden/plugin-source/deleted */
    expect(removeInvalidToolkitIds).toHaveBeenCalledWith("global", ["plan"]);
  });

  test("is a no-op for a non-mcp (builtin/local) toolkitId — never deletable", async () => {
    const result = await deletePluginToolkit("plan");

    expect(result).toEqual({ ok: false });
    expect(deleteMcpEntry).not.toHaveBeenCalled();
    expect(removeInvalidToolkitIds).not.toHaveBeenCalled();
  });

  test("is a no-op for an id that isn't in the visible catalog at all", async () => {
    const result = await deletePluginToolkit("does-not-exist");

    expect(result).toEqual({ ok: false });
    expect(deleteMcpEntry).not.toHaveBeenCalled();
  });

  test("re-fetches the catalog fresh — doesn't need any prior mounted-page state", async () => {
    await deletePluginToolkit("mcp.productivity.notion-remote");
    expect(api.unchain.listToolModalCatalog).toHaveBeenCalledTimes(1);
  });

  test("deletes a skillpack-sourced entry through its own store and refreshes the catalog", async () => {
    api.unchain.listToolModalCatalog.mockResolvedValue({
      toolkits: [
        { toolkitId: "plan", toolkitName: "Plan", source: "builtin" },
        { toolkitId: "skillpack.superpowers", toolkitName: "Superpowers", source: "skillpack" },
        { toolkitId: "mcp.productivity.notion-remote", toolkitName: "Notion", source: "mcp" },
      ],
    });

    const result = await deletePluginToolkit("skillpack.superpowers");

    expect(result).toEqual({ ok: true, toolkitId: "skillpack.superpowers" });
    // routes through the skillpack store, NOT the MCP teardown path
    expect(api.unchain.deleteSkillPack).toHaveBeenCalledWith("skillpack.superpowers");
    expect(deleteMcpEntry).not.toHaveBeenCalled();
    // must nudge the catalog bus so plugin_skill_sync drops the /commands
    expect(emitToolkitCatalogRefresh).toHaveBeenCalledTimes(1);
    // prunes the default selection down to the remaining visible ids
    expect(removeInvalidToolkitIds).toHaveBeenCalledWith("global", [
      "plan",
      "mcp.productivity.notion-remote",
    ]);
  });
});
