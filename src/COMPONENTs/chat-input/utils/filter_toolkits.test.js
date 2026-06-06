import { filter_toolkits } from "./filter_toolkits";

describe("filter_toolkits", () => {
  test("matches toolkit modal visibility for v2 catalog entries", () => {
    const result = filter_toolkits(
      [
        { toolkitId: "builtin_toolkit", source: "builtin", hidden: false },
        { toolkitId: "core", source: "core", hidden: false },
        { toolkitId: "workspace_toolkit", source: "builtin", hidden: false },
        { toolkitId: "custom_toolkit", source: "local", hidden: false },
        { toolkitId: "plugin_toolkit", source: "plugin", hidden: false },
        { toolkitId: "hidden_tools", source: "local", hidden: true },
      ],
      new Set(["base", "base_toolkit", "builtin_toolkit", "toolkit"]),
    );

    expect(result).toEqual([
      { toolkitId: "core", source: "core", hidden: false },
      { toolkitId: "workspace_toolkit", source: "builtin", hidden: false },
      { toolkitId: "custom_toolkit", source: "local", hidden: false },
    ]);
  });

  test("keeps non-base builtin/core entries from the legacy catalog shape", () => {
    const result = filter_toolkits(
      [
        { kind: "builtin", class_name: "search_tools", name: "SearchTools" },
        { kind: "core", class_name: "io_tools", name: "IOTools" },
      ],
      new Set(["base", "base_toolkit", "builtin_toolkit", "toolkit"]),
    );

    expect(result).toHaveLength(2);
    expect(result.map((item) => item.class_name)).toEqual([
      "search_tools",
      "io_tools",
    ]);
  });

  test("keeps installed mcp toolkits visible", () => {
    const ids = filter_toolkits(
      [
        { toolkitId: "mcp.memory.memory", source: "mcp", hidden: false },
        { toolkitId: "plugin_toolkit", source: "plugin", hidden: false },
      ],
      new Set(["base", "base_toolkit", "builtin_toolkit", "toolkit"]),
    ).map((t) => t.toolkitId);

    expect(ids).toContain("mcp.memory.memory");
    expect(ids).not.toContain("plugin_toolkit");
  });
});
