import React from "react";
import { render, screen } from "@testing-library/react";
import ArtifactSummary from "./artifact_summary";

describe("ArtifactSummary", () => {
  test("renders nothing when bucket is undefined", () => {
    const { container } = render(<ArtifactSummary bucket={undefined} isDark={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("renders nothing when bucket has status pending", () => {
    const { container } = render(
      <ArtifactSummary
        bucket={{ order: 1, status: "pending", artifacts: [] }}
        isDark={false}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test("renders nothing when artifacts array is empty even if completed", () => {
    const { container } = render(
      <ArtifactSummary
        bucket={{ order: 1, status: "completed", artifacts: [] }}
        isDark={false}
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
      />,
    );
    expect(screen.getByText(/Files changed/)).toBeInTheDocument();
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
      />,
    );
    expect(screen.getByText(/Demo plan/)).toBeInTheDocument();
  });
});
