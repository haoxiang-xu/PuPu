import {
  getDefaultToolkitSelection,
  removeInvalidToolkitIds,
  setDefaultToolkitEnabled,
} from "./default_toolkit_store";

describe("default_toolkit_store", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("seeds core for users without an explicit global selection", () => {
    expect(getDefaultToolkitSelection("global")).toEqual(["core"]);

    const stored = JSON.parse(
      window.localStorage.getItem("default_toolkits") || "null",
    );
    expect(stored).toEqual({
      version: 2,
      scopes: {
        global: ["core"],
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

  test("normalizes legacy builtin toolkit ids to core", () => {
    window.localStorage.setItem(
      "default_toolkits",
      JSON.stringify({
        version: 1,
        scopes: {
          global: [
            "WorkspaceToolkit",
            "CodeToolkit",
            "ask_user_toolkit",
            "GitToolkit",
            "git_toolkit",
          ],
        },
      }),
    );

    expect(getDefaultToolkitSelection("global")).toEqual(["core"]);
  });

  test("updates and prunes canonical toolkit ids", () => {
    setDefaultToolkitEnabled("global", "WorkspaceToolkit", true);
    setDefaultToolkitEnabled("global", "code", true);

    expect(getDefaultToolkitSelection("global")).toEqual(["core"]);

    expect(removeInvalidToolkitIds("global", ["workspace_toolkit"])).toEqual([
      "core",
    ]);
  });
});
