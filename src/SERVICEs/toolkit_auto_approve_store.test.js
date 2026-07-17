import {
  getAutoApproveToolkits,
  isToolAutoApproved,
  isToolkitAutoApprove,
  setToolkitAutoApprove,
} from "./toolkit_auto_approve_store";

describe("toolkit_auto_approve_store", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("migrates legacy v1 tool names into toolkit-scoped tool keys", () => {
    window.localStorage.setItem(
      "toolkit_auto_approve",
      JSON.stringify({
        version: 1,
        toolkits: ["WorkspaceToolkit", "TerminalToolkit", "GitToolkit"],
        tools: ["write_file", "terminal_exec", "unknown_tool"],
      }),
    );

    expect(getAutoApproveToolkits()).toEqual(["core"]);
    expect(isToolkitAutoApprove("WorkspaceToolkit")).toBe(true);
    expect(isToolkitAutoApprove("git_toolkit")).toBe(true);
    expect(isToolAutoApproved("workspace_toolkit", "write_file")).toBe(true);
    expect(isToolAutoApproved("terminal_toolkit", "terminal_exec")).toBe(true);
    expect(isToolAutoApproved("core", "write_file")).toBe(true);
    expect(isToolAutoApproved("core", "terminal_exec")).toBe(true);
  });

  test("stores and removes toolkitId:toolName keys", () => {
    expect(
      setToolkitAutoApprove("CodeToolkit", true, ["write", "edit"]),
    ).toEqual({
      toolkits: ["core"],
      tools: ["core:write", "core:edit"],
    });

    expect(isToolkitAutoApprove("code")).toBe(true);
    expect(isToolAutoApproved("core", "write")).toBe(true);
    expect(isToolAutoApproved("workspace_toolkit", "write")).toBe(true);

    expect(setToolkitAutoApprove("core", false)).toEqual({
      toolkits: [],
      tools: [],
    });
    expect(isToolkitAutoApprove("core")).toBe(false);
    expect(isToolAutoApproved("core", "write")).toBe(false);
  });

  test("ignores a persisted computer auto-approval without changing ordinary tools", () => {
    window.localStorage.setItem(
      "toolkit_auto_approve",
      JSON.stringify({
        version: 2,
        toolkits: ["builtin.computer", "core"],
        tools: ["builtin.computer:computer", "core:write"],
      }),
    );

    expect(isToolAutoApproved("builtin.computer", "computer")).toBe(false);
    expect(isToolkitAutoApprove("builtin.computer")).toBe(false);
    expect(getAutoApproveToolkits()).toEqual(["core"]);
    expect(isToolAutoApproved("core", "write")).toBe(true);

    expect(
      setToolkitAutoApprove("builtin.computer", true, ["computer"]),
    ).toEqual({ toolkits: ["core"], tools: ["core:write"] });
  });
});
