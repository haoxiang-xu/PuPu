jest.mock("./api", () => ({
  __esModule: true,
  default: { unchain: {} },
}));
jest.mock("../COMPONENTs/settings/runtime", () => ({
  __esModule: true,
  readWorkspaceRoot: () => "",
}));
jest.mock("./default_toolkit_store", () => ({
  __esModule: true,
  setDefaultToolkitEnabled: () => [],
}));

import {
  INSTALLABLE_ENTRY_IDS,
  isEntryInstallable,
  entryInstallState,
  resolveInstallWorkspace,
} from "./mcp_install";

describe("mcp_install helpers", () => {
  test("only the three Phase 2A entries are installable", () => {
    expect(INSTALLABLE_ENTRY_IDS).toEqual(
      new Set(["browser.playwright", "memory.memory", "workspace.filesystem"]),
    );
    expect(
      isEntryInstallable({ id: "browser.playwright", status: "available" }),
    ).toBe(true);
    expect(
      isEntryInstallable({ id: "dev.github-remote", status: "available" }),
    ).toBe(false);
    expect(
      isEntryInstallable({ id: "productivity.slack", status: "needs_review" }),
    ).toBe(false);
  });

  test("entryInstallState reflects installed set", () => {
    const installed = new Set(["mcp.browser.playwright"]);
    expect(
      entryInstallState(
        {
          id: "browser.playwright",
          toolkitId: "mcp.browser.playwright",
          status: "available",
        },
        installed,
      ),
    ).toBe("installed");
    expect(
      entryInstallState(
        {
          id: "memory.memory",
          toolkitId: "mcp.memory.memory",
          status: "available",
        },
        installed,
      ),
    ).toBe("installable");
    expect(
      entryInstallState(
        {
          id: "dev.github-remote",
          toolkitId: "mcp.dev.github-remote",
          status: "available",
        },
        installed,
      ),
    ).toBe("coming_soon");
    expect(
      entryInstallState(
        {
          id: "productivity.slack",
          toolkitId: "mcp.productivity.slack",
          status: "needs_review",
        },
        installed,
      ),
    ).toBe("needs_review");
  });

  test("filesystem requires workspace root, others do not", () => {
    expect(resolveInstallWorkspace({ id: "workspace.filesystem" }, "")).toEqual({
      ok: false,
      code: "mcp_workspace_required",
    });
    expect(
      resolveInstallWorkspace({ id: "workspace.filesystem" }, "/ws"),
    ).toEqual({ ok: true, workspaceRoot: "/ws" });
    expect(resolveInstallWorkspace({ id: "browser.playwright" }, "")).toEqual({
      ok: true,
      workspaceRoot: "",
    });
  });
});
