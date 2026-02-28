import { filter_toolkits } from "./filter_toolkits";

describe("filter_toolkits", () => {
  test("filters out base toolkit identifiers", () => {
    const result = filter_toolkits(
      [
        { kind: "builtin", class_name: "Base_Toolkit", name: "Base" },
        { kind: "core", class_name: "math_tools", name: "MathTools" },
      ],
      new Set(["base", "base_toolkit", "builtin_toolkit", "toolkit"]),
    );

    expect(result).toEqual([
      { kind: "core", class_name: "math_tools", name: "MathTools" },
    ]);
  });

  test("keeps non-base builtin/core entries", () => {
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
});
