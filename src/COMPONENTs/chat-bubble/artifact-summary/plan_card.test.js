import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import PlanCard from "./plan_card";

const planArtifact = (overrides = {}) => ({
  artifact_id: "plan:p1",
  kind: "plan",
  title: "Demo plan",
  revision: 1,
  snapshot: {
    plan_id: "p1",
    status: "draft",
    revision: 1,
    title: "Demo plan",
    markdown: "# Demo plan\n\n- Step one",
    truncated: false,
    total_lines: 3,
    displayed_lines: 3,
  },
  source: { path: "/workspace/plans/p1.md", relative_path: "plans/p1.md" },
  ...overrides,
});

describe("PlanCard collapsed", () => {
  test("shows title and status chip", () => {
    render(<PlanCard artifact={planArtifact()} isDark={false} />);
    expect(screen.getByText(/Demo plan/)).toBeInTheDocument();
    expect(screen.getByText(/draft/i)).toBeInTheDocument();
  });

  test("does not render markdown body when collapsed", () => {
    render(<PlanCard artifact={planArtifact()} isDark={false} />);
    expect(screen.queryByText(/Step one/)).toBeNull();
  });
});

describe("PlanCard expanded", () => {
  test("clicking the header renders the markdown body", () => {
    render(<PlanCard artifact={planArtifact()} isDark={false} />);
    fireEvent.click(screen.getByTestId("plan-card-header"));
    // "Demo plan" appears in both the header span and the rendered <h1>
    expect(screen.getAllByText(/Demo plan/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Step one/)).toBeInTheDocument();
  });

  test("shows truncation footer with N/M lines and relative source path", () => {
    render(
      <PlanCard
        artifact={planArtifact({
          snapshot: {
            plan_id: "p1",
            status: "draft",
            revision: 1,
            title: "Demo plan",
            markdown: "# Demo",
            truncated: true,
            total_lines: 960,
            displayed_lines: 400,
          },
        })}
        isDark={false}
      />,
    );
    fireEvent.click(screen.getByTestId("plan-card-header"));
    expect(screen.getByText("Truncated · 400 / 960 lines")).toBeInTheDocument();
    expect(screen.getByText(/plans\/p1\.md/)).toBeInTheDocument();
  });

  test("uses finalized chip when snapshot.status is 'finalized'", () => {
    render(
      <PlanCard
        artifact={planArtifact({ snapshot: { ...planArtifact().snapshot, status: "finalized" } })}
        isDark={false}
      />,
    );
    expect(screen.getByText(/finalized/i)).toBeInTheDocument();
  });
});

describe("PlanCard 0-line truncation", () => {
  test("footer shows '0 / 960 lines' when displayed_lines is 0", () => {
    const artifact = {
      artifact_id: "plan:p1",
      kind: "plan",
      title: "Big plan",
      snapshot: {
        plan_id: "p1",
        status: "draft",
        revision: 1,
        title: "Big plan",
        markdown: "",
        truncated: true,
        total_lines: 960,
        displayed_lines: 0,
      },
    };
    render(<PlanCard artifact={artifact} isDark={false} />);
    fireEvent.click(screen.getByTestId("plan-card-header"));
    expect(screen.getByText("Truncated · 0 / 960 lines")).toBeInTheDocument();
  });
});
