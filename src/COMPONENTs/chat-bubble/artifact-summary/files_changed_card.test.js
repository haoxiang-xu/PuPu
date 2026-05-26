import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import FilesChangedCard from "./files_changed_card";

jest.mock("../../../BUILTIN_COMPONENTs/icon/icon", () => ({
  __esModule: true,
  default: ({ src }) => <span data-testid={`icon-${src}`} />,
}));

const fileDiff = ({ id, path, op = "edit", additions, deletions, unifiedDiff }) => ({
  artifact_id: `file_diff:${id}`,
  kind: "file_diff",
  snapshot: {
    files: [
      {
        path,
        operation: op,
        unified_diff:
          unifiedDiff ||
          `--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n-old\n+new\n`,
        ...(additions !== undefined ? { additions } : {}),
        ...(deletions !== undefined ? { deletions } : {}),
      },
    ],
  },
});

describe("FilesChangedCard collapsed", () => {
  test("renders file count and total +/− stats from artifact-provided numbers", () => {
    render(
      <FilesChangedCard
        artifacts={[
          fileDiff({ id: "c1", path: "a.js", additions: 10, deletions: 2 }),
          fileDiff({ id: "c2", path: "b.js", additions: 5, deletions: 3 }),
        ]}
        isDark={false}
      />,
    );
    expect(screen.getByText("Files changed")).toBeInTheDocument();
    expect(screen.getByText("2 files")).toBeInTheDocument();
    expect(screen.getByText(/\+15 −5/)).toBeInTheDocument();
  });

  test("falls back to computing +/− from unified diff when stats are missing", () => {
    render(
      <FilesChangedCard
        artifacts={[fileDiff({ id: "c1", path: "a.js" })]}
        isDark={false}
      />,
    );
    expect(screen.getByText("Files changed")).toBeInTheDocument();
    expect(screen.getByText("1 file")).toBeInTheDocument();
    expect(screen.getByText(/\+1 −1/)).toBeInTheDocument();
  });

  test("accepts camelCase unifiedDiff field as well as snake_case", () => {
    const camelArtifact = {
      artifact_id: "file_diff:c1",
      kind: "file_diff",
      snapshot: {
        files: [
          {
            path: "a.js",
            operation: "edit",
            unifiedDiff: "@@ -1 +1 @@\n-a\n+b\n",
          },
        ],
      },
    };
    render(<FilesChangedCard artifacts={[camelArtifact]} isDark={false} />);
    expect(screen.getByText(/\+1 −1/)).toBeInTheDocument();
  });

  test("accepts single-file snapshot shape (no snapshot.files array)", () => {
    // Protocol allows the snapshot itself to be a single-file payload.
    const singleFile = {
      artifact_id: "file_diff:c1",
      kind: "file_diff",
      snapshot: {
        path: "src/x.js",
        operation: "edit",
        unified_diff: "@@ -1 +1 @@\n-a\n+b\n",
      },
    };
    render(<FilesChangedCard artifacts={[singleFile]} isDark={false} />);
    expect(screen.getByText("Files changed")).toBeInTheDocument();
    expect(screen.getByText("1 file")).toBeInTheDocument();
    expect(screen.getByText(/\+1 −1/)).toBeInTheDocument();
  });
});

describe("FilesChangedCard expanded", () => {
  test("expanding the header reveals per-file rows", () => {
    render(
      <FilesChangedCard
        artifacts={[fileDiff({ id: "c1", path: "src/x.js", additions: 3, deletions: 1 })]}
        isDark={false}
      />,
    );
    fireEvent.click(screen.getByTestId("files-changed-card-header"));
    expect(screen.getByText("src/x.js")).toBeInTheDocument();
  });

  test("does not show per-file rows when collapsed", () => {
    render(
      <FilesChangedCard
        artifacts={[fileDiff({ id: "c1", path: "src/x.js" })]}
        isDark={false}
      />,
    );
    expect(screen.queryByText("src/x.js")).toBeNull();
  });

  test("multiple files in one artifact each render their own row", () => {
    const multi = {
      artifact_id: "file_diff:c1",
      kind: "file_diff",
      snapshot: {
        files: [
          {
            path: "a.js",
            operation: "edit",
            unified_diff: "@@ -1 +1 @@\n-a\n+b\n",
          },
          {
            path: "b.js",
            operation: "create",
            unified_diff: "@@ -0,0 +1 @@\n+new\n",
          },
        ],
      },
    };
    render(<FilesChangedCard artifacts={[multi]} isDark={false} />);
    fireEvent.click(screen.getByTestId("files-changed-card-header"));
    expect(screen.getByText("a.js")).toBeInTheDocument();
    expect(screen.getByText("b.js")).toBeInTheDocument();
  });
});

describe("FilesChangedCard per-row diff expansion", () => {
  test("clicking a file row mounts the DiffBody for that file", () => {
    render(
      <FilesChangedCard
        artifacts={[
          fileDiff({
            id: "c1",
            path: "src/x.js",
            unifiedDiff: "--- a/src/x.js\n+++ b/src/x.js\n@@ -1 +1 @@\n-old\n+new\n",
          }),
        ]}
        isDark={false}
      />,
    );
    fireEvent.click(screen.getByTestId("files-changed-card-header"));
    fireEvent.click(screen.getByText("src/x.js"));
    const diffRows = screen.getAllByText((_, node) =>
      node?.getAttribute("data-diff-kind") !== null,
    );
    expect(diffRows.length).toBeGreaterThan(0);
  });

  test("shows 'Binary file' fallback when file.binary is true", () => {
    const binaryArtifact = {
      artifact_id: "file_diff:c1",
      kind: "file_diff",
      snapshot: {
        files: [
          {
            path: "logo.png",
            operation: "edit",
            unified_diff: "",
            binary: true,
          },
        ],
      },
    };
    render(<FilesChangedCard artifacts={[binaryArtifact]} isDark={false} />);
    fireEvent.click(screen.getByTestId("files-changed-card-header"));
    expect(screen.getByText("Binary file")).toBeInTheDocument();
  });

  test("shows 'Truncated · N/M lines' chip when truncated is true", () => {
    const truncatedArtifact = {
      artifact_id: "file_diff:c1",
      kind: "file_diff",
      snapshot: {
        files: [
          {
            path: "big.js",
            operation: "edit",
            unified_diff: "@@ -1 +1 @@\n-a\n+b\n",
            truncated: true,
            total_lines: 1000,
            displayed_lines: 400,
          },
        ],
      },
    };
    render(<FilesChangedCard artifacts={[truncatedArtifact]} isDark={false} />);
    fireEvent.click(screen.getByTestId("files-changed-card-header"));
    expect(screen.getByText("Truncated · 400/1000 lines")).toBeInTheDocument();
  });
});

describe("FilesChangedCard 0-line truncation", () => {
  test("shows truncation chip in header when displayed_lines is 0", () => {
    const artifact = {
      artifact_id: "file_diff:c1",
      kind: "file_diff",
      snapshot: {
        files: [
          {
            path: "big.js",
            operation: "edit",
            unified_diff: "",
            truncated: true,
            total_lines: 1000,
            displayed_lines: 0,
          },
        ],
      },
    };
    render(<FilesChangedCard artifacts={[artifact]} isDark={false} />);
    fireEvent.click(screen.getByTestId("files-changed-card-header"));
    expect(screen.getByText("Truncated · 0/1000 lines")).toBeInTheDocument();
  });

  test("expansion shows truncation placeholder instead of '(no changes)' when diff is empty and truncated", () => {
    const artifact = {
      artifact_id: "file_diff:c1",
      kind: "file_diff",
      snapshot: {
        files: [
          {
            path: "big.js",
            operation: "edit",
            unified_diff: "",
            truncated: true,
            total_lines: 1000,
            displayed_lines: 0,
          },
        ],
      },
    };
    render(<FilesChangedCard artifacts={[artifact]} isDark={false} />);
    fireEvent.click(screen.getByTestId("files-changed-card-header"));
    // Open the file row (the header inside FileRow). Find by file path text.
    fireEvent.click(screen.getByText("big.js"));
    expect(screen.getByText("Diff truncated · 0/1000 lines displayed")).toBeInTheDocument();
    expect(screen.queryByText("(no changes)")).toBeNull();
  });

  test("labels stats as 'shown' when truncated and backend stats missing", () => {
    const artifact = {
      artifact_id: "file_diff:c1",
      kind: "file_diff",
      snapshot: {
        files: [
          {
            path: "big.js",
            operation: "edit",
            unified_diff: "@@ -1 +1 @@\n-a\n+b\n",
            truncated: true,
            total_lines: 1000,
            displayed_lines: 1,
          },
        ],
      },
    };
    render(<FilesChangedCard artifacts={[artifact]} isDark={false} />);
    expect(screen.getByText(/\+1 −1 shown/)).toBeInTheDocument();
  });

  test("does NOT label stats as 'shown' when backend supplied additions/deletions", () => {
    const artifact = {
      artifact_id: "file_diff:c1",
      kind: "file_diff",
      snapshot: {
        files: [
          {
            path: "big.js",
            operation: "edit",
            unified_diff: "@@ -1 +1 @@\n-a\n+b\n",
            truncated: true,
            total_lines: 1000,
            displayed_lines: 1,
            additions: 50,
            deletions: 20,
          },
        ],
      },
    };
    render(<FilesChangedCard artifacts={[artifact]} isDark={false} />);
    expect(screen.queryByText(/shown/)).toBeNull();
    expect(screen.getByText(/\+50 −20/)).toBeInTheDocument();
  });
});
