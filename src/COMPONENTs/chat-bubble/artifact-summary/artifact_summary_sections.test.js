import React from "react";
import { render, screen } from "@testing-library/react";
import ArtifactSummarySections from "./artifact_summary_sections";
import { buildArtifactKindRegistry } from "./artifact_kind_registry";

jest.mock("../../../BUILTIN_COMPONENTs/icon/icon", () => ({
  __esModule: true,
  default: ({ src }) => <span data-testid={`icon-${src}`} />,
}));

describe("ArtifactSummarySections", () => {
  const defaultRegistry = buildArtifactKindRegistry();

  test("suppresses turn-level file diffs and plan revisions covered by run summary", () => {
    render(
      <ArtifactSummarySections
        isDark={false}
        artifactKindRegistry={defaultRegistry}
        runArtifactSummary={{
          order: 0,
          status: "completed",
          artifacts: [
            {
              artifact_id: "workspace_change_set:run-1",
              kind: "workspace_change_set",
              title: "Workspace changes",
              snapshot: {
                files: [
                  {
                    path: "src/App.js",
                    unified_diff: "@@ -0,0 +1 @@\n+hello\n",
                    additions: 1,
                    deletions: 0,
                  },
                ],
              },
            },
            {
              artifact_id: "plan:p1",
              kind: "plan",
              revision: 2,
              title: "Updated plan",
              snapshot: { markdown: "# Updated", status: "draft" },
            },
          ],
        }}
        artifactSummariesByTurnId={{
          "run-1:turn-1": {
            order: 1,
            status: "completed",
            artifacts: [
              {
                artifact_id: "file_diff:call-1",
                kind: "file_diff",
                snapshot: {
                  path: "src/App.js",
                  unified_diff: "@@ -0,0 +1 @@\n+hello\n",
                },
              },
              {
                artifact_id: "plan:p1",
                kind: "plan",
                revision: 1,
                title: "Initial plan",
                snapshot: { markdown: "# Initial", status: "draft" },
              },
            ],
          },
        }}
      />,
    );

    expect(screen.getByText("Workspace changes")).toBeInTheDocument();
    expect(screen.getByText("Updated plan")).toBeInTheDocument();
    expect(screen.queryByText("Files changed")).not.toBeInTheDocument();
    expect(screen.queryByText("Initial plan")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("artifact-summary")).toHaveLength(1);
  });

  test("folds file diffs from multiple turn buckets into one files changed card", () => {
    render(
      <ArtifactSummarySections
        isDark={false}
        artifactKindRegistry={defaultRegistry}
        artifactSummariesByTurnId={{
          "run-1:turn-1": {
            order: 1,
            status: "completed",
            artifacts: [
              {
                artifact_id: "file_diff:call-1",
                kind: "file_diff",
                snapshot: {
                  path: "src/App.js",
                  unified_diff: "@@ -1 +1 @@\n-old\n+new\n",
                },
              },
            ],
          },
          "run-1:turn-2": {
            order: 2,
            status: "completed",
            artifacts: [
              {
                artifact_id: "file_diff:call-2",
                kind: "file_diff",
                snapshot: {
                  path: "src/utils.js",
                  unified_diff: "@@ -0,0 +1,2 @@\n+one\n+two\n",
                },
              },
            ],
          },
        }}
      />,
    );

    expect(screen.getAllByTestId("files-changed-card")).toHaveLength(1);
    expect(screen.getByText("2 files")).toBeInTheDocument();
    expect(screen.getByText("+3")).toBeInTheDocument();
    expect(screen.getByText("−1")).toBeInTheDocument();
  });
});
