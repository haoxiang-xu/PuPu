import { parseDiffLines, countPlusMinus } from "./diff_body";

describe("parseDiffLines", () => {
  test("returns null when no hunk header is present", () => {
    expect(parseDiffLines("--- a/foo\n+++ b/foo\n")).toBeNull();
  });

  test("parses added, removed, context lines with line numbers", () => {
    const diff = [
      "--- a/foo.js",
      "+++ b/foo.js",
      "@@ -1,3 +1,4 @@",
      " line1",
      "-line2",
      "+line2-new",
      "+line3-added",
      " line4",
    ].join("\n");
    const rows = parseDiffLines(diff);
    expect(rows).not.toBeNull();
    expect(rows.map((r) => r.kind)).toEqual([
      "file-header",
      "file-header",
      "hunk",
      "context",
      "removed",
      "added",
      "added",
      "context",
    ]);
  });

  test("returns empty list for null / empty input", () => {
    expect(parseDiffLines("")).toEqual([]);
    expect(parseDiffLines(null)).toEqual([]);
  });
});

describe("countPlusMinus", () => {
  test("counts only data lines, not file headers", () => {
    const diff = [
      "--- a/foo",
      "+++ b/foo",
      "@@ -1 +1,2 @@",
      "-old",
      "+new",
      "+extra",
    ].join("\n");
    expect(countPlusMinus(diff)).toEqual({ plus: 2, minus: 1 });
  });

  test("returns zeros for empty input", () => {
    expect(countPlusMinus("")).toEqual({ plus: 0, minus: 0 });
    expect(countPlusMinus(null)).toEqual({ plus: 0, minus: 0 });
  });
});
