import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import ArtifactSummary from "./artifact_summary";
import { buildArtifactKindRegistry } from "./artifact_kind_registry";

jest.mock("../../../BUILTIN_COMPONENTs/icon/icon", () => ({
  __esModule: true,
  default: ({ src }) => <span data-testid={`icon-${src}`} />,
}));

describe("ArtifactSummary", () => {
  const defaultRegistry = buildArtifactKindRegistry();

  test("renders nothing when bucket is undefined", () => {
    const { container } = render(
      <ArtifactSummary
        bucket={undefined}
        isDark={false}
        artifactKindRegistry={defaultRegistry}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test("renders nothing when bucket has status pending", () => {
    const { container } = render(
      <ArtifactSummary
        bucket={{ order: 1, status: "pending", artifacts: [] }}
        isDark={false}
        artifactKindRegistry={defaultRegistry}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test("renders nothing when artifacts array is empty even if completed", () => {
    const { container } = render(
      <ArtifactSummary
        bucket={{ order: 1, status: "completed", artifacts: [] }}
        isDark={false}
        artifactKindRegistry={defaultRegistry}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test("renders a FilesChangedCard when at least one file_diff artifact is present", () => {
    render(
      <ArtifactSummary
        bucket={{
          order: 1,
          status: "completed",
          artifacts: [
            {
              artifact_id: "file_diff:c1",
              kind: "file_diff",
              snapshot: { unified_diff: "@@ -1 +1 @@\n-a\n+b\n", path: "src/x.js" },
            },
          ],
        }}
        isDark={false}
        artifactKindRegistry={defaultRegistry}
      />,
    );
    expect(screen.getByText(/Files changed/)).toBeInTheDocument();
  });

  test("uses registry metadata for specialized card labels", () => {
    render(
      <ArtifactSummary
        artifactKindRegistry={{
          file_diff: {
            kind: "file_diff",
            displayName: "Changed Files",
            fallbackRenderer: "json",
            icon: { type: "builtin", name: "file_edit" },
          },
        }}
        bucket={{
          order: 1,
          status: "completed",
          artifacts: [
            {
              artifact_id: "file_diff:c1",
              kind: "file_diff",
              snapshot: { unified_diff: "@@ -1 +1 @@\n-a\n+b\n", path: "src/x.js" },
            },
          ],
        }}
        isDark={false}
      />,
    );
    expect(screen.getByText(/Changed Files/)).toBeInTheDocument();
  });

  test("renders a PlanCard when a plan artifact is present", () => {
    render(
      <ArtifactSummary
        bucket={{
          order: 1,
          status: "completed",
          artifacts: [
            {
              artifact_id: "plan:p1",
              kind: "plan",
              title: "Demo plan",
              snapshot: { markdown: "# Hi", status: "draft" },
            },
          ],
        }}
        isDark={false}
        artifactKindRegistry={defaultRegistry}
      />,
    );
    expect(screen.getByText(/Demo plan/)).toBeInTheDocument();
  });

  test("renders only the latest revision when stable artifact ids are duplicated", () => {
    render(
      <ArtifactSummary
        bucket={{
          order: 1,
          status: "completed",
          artifacts: [
            {
              artifact_id: "plan:p1",
              kind: "plan",
              revision: 1,
              title: "Initial plan",
              snapshot: { markdown: "# v1", status: "draft" },
            },
            {
              artifact_id: "plan:p1",
              kind: "plan",
              revision: 2,
              title: "Updated plan",
              snapshot: { markdown: "# v2", status: "draft" },
            },
          ],
        }}
        isDark={false}
        artifactKindRegistry={defaultRegistry}
      />,
    );

    expect(screen.getAllByTestId("plan-card")).toHaveLength(1);
    expect(screen.queryByText("Initial plan")).not.toBeInTheDocument();
    expect(screen.getByText("Updated plan")).toBeInTheDocument();
  });

  test("renders unknown valid artifacts with generic metadata fallback", () => {
    render(
      <ArtifactSummary
        artifactKindRegistry={{
          benchmark_report: {
            kind: "benchmark_report",
            displayName: "Benchmark",
            fallbackRenderer: "markdown",
            icon: { type: "builtin", name: "bar_chart" },
          },
        }}
        bucket={{
          order: 1,
          status: "completed",
          artifacts: [
            {
              artifact_id: "benchmark:1",
              kind: "benchmark_report",
              title: "Latency report",
              snapshot: { markdown: "p95: **18ms**" },
            },
          ],
        }}
        isDark={false}
      />,
    );

    expect(screen.getByText("Benchmark")).toBeInTheDocument();
    expect(screen.getByText("Latency report")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("generic-artifact-card-header"));
    expect(screen.getByText(/18ms/)).toBeInTheDocument();
  });
});
