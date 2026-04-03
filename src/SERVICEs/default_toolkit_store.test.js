import {
  getDefaultToolkitSelection,
  removeInvalidToolkitIds,
  setDefaultToolkitEnabled,
} from "./default_toolkit_store";

describe("default_toolkit_store", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("seeds code_toolkit for users without an explicit global selection", () => {
    expect(getDefaultToolkitSelection("global")).toEqual(["code_toolkit"]);

    const stored = JSON.parse(
      window.localStorage.getItem("default_toolkits") || "null",
    );
    expect(stored).toEqual({
      version: 2,
      scopes: {
        global: ["code_toolkit"],
      },
    });
  });

  test("preserves an explicit empty global selection", () => {
    window.localStorage.setItem(
      "default_toolkits",
      JSON.stringify({
        version: 1,
        scopes: {
          global: [],
        },
      }),
    );

    expect(getDefaultToolkitSelection("global")).toEqual([]);
  });

  test("normalizes legacy toolkit ids to canonical toolkitId values", () => {
    window.localStorage.setItem(
      "default_toolkits",
      JSON.stringify({
        version: 1,
        scopes: {
          global: ["WorkspaceToolkit", "CodeToolkit", "ask_user_toolkit"],
        },
      }),
    );

    expect(getDefaultToolkitSelection("global")).toEqual([
      "workspace_toolkit",
      "code_toolkit",
      "ask-user-toolkit",
    ]);
  });

  test("updates and prunes canonical toolkit ids", () => {
    setDefaultToolkitEnabled("global", "WorkspaceToolkit", true);
    setDefaultToolkitEnabled("global", "code", true);

    expect(getDefaultToolkitSelection("global")).toEqual([
      "code_toolkit",
      "workspace_toolkit",
    ]);

    expect(
      removeInvalidToolkitIds("global", ["workspace_toolkit"]),
    ).toEqual(["workspace_toolkit"]);
  });
});
