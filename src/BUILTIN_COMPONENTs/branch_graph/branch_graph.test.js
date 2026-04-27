import { render, screen } from "@testing-library/react";
import BranchGraph from "./branch_graph";

describe("BranchGraph", () => {
  test("wraps long secondary spans instead of forcing horizontal overflow", () => {
    const longSpan = `Subagent response ${"x".repeat(220)}`;

    render(
      <div style={{ width: 240 }}>
        <BranchGraph
          expanded
          branches={[
            {
              key: "worker-1",
              title: "worker",
              span: longSpan,
              status: "done",
            },
          ]}
        />
      </div>,
    );

    const span = screen.getByText(longSpan);
    expect(span.style.flexShrink).toBe("1");
    expect(span.style.minWidth).toBe("0");
    expect(span).toHaveStyle({
      whiteSpace: "normal",
      overflowWrap: "anywhere",
      wordBreak: "break-word",
    });
  });
});
