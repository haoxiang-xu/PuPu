import { filter_explorer_data } from "./filter_explorer_data";

describe("filter_explorer_data", () => {
  test("matches only file nodes", () => {
    const result = filter_explorer_data(
      {
        "1": { type: "file", label: "Hello Chat" },
        "2": { type: "folder", label: "Hello Folder" },
      },
      "hello",
    );

    expect(result.filteredRoot).toEqual(["1"]);
    expect(result.filteredData).toEqual({
      "1": { type: "file", label: "Hello Chat", postfix: undefined },
    });
  });

  test("returns null results when query is empty", () => {
    const result = filter_explorer_data(
      {
        "1": { type: "file", label: "Hello Chat" },
      },
      "   ",
    );

    expect(result.filteredData).toBeNull();
    expect(result.filteredRoot).toBeNull();
  });
});
