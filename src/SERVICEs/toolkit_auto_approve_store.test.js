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
        toolkits: ["WorkspaceToolkit", "TerminalToolkit"],
        tools: ["write_file", "terminal_exec", "unknown_tool"],
      }),
    );

    expect(getAutoApproveToolkits()).toEqual([
      "workspace_toolkit",
      "terminal_toolkit",
    ]);
    expect(isToolkitAutoApprove("WorkspaceToolkit")).toBe(true);
    expect(isToolAutoApproved("workspace_toolkit", "write_file")).toBe(true);
    expect(isToolAutoApproved("terminal_toolkit", "terminal_exec")).toBe(true);
    expect(isToolAutoApproved("code_toolkit", "write_file")).toBe(false);
  });

  test("stores and removes toolkitId:toolName keys", () => {
    expect(
      setToolkitAutoApprove("CodeToolkit", true, ["write", "edit"]),
    ).toEqual({
      toolkits: ["code_toolkit"],
      tools: ["code_toolkit:write", "code_toolkit:edit"],
    });

    expect(isToolkitAutoApprove("code")).toBe(true);
    expect(isToolAutoApproved("code_toolkit", "write")).toBe(true);
    expect(isToolAutoApproved("workspace_toolkit", "write")).toBe(false);

    expect(setToolkitAutoApprove("code_toolkit", false)).toEqual({
      toolkits: [],
      tools: [],
    });
    expect(isToolkitAutoApprove("code_toolkit")).toBe(false);
    expect(isToolAutoApproved("code_toolkit", "write")).toBe(false);
  });
});
