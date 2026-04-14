import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import CodeDiffInteract from "./code_diff_interact";

// Mock the project-custom Button to a plain HTML button so RTL can
// query it by role/name without pulling in ConfigContext and friends.
jest.mock("../../../BUILTIN_COMPONENTs/input/button", () => ({
  __esModule: true,
  default: ({ label, onClick }) => (
    <button type="button" onClick={onClick}>
      {label}
    </button>
  ),
}));

const baseConfig = {
  title: "Edit /abs/foo.py",
  operation: "edit",
  path: "/abs/foo.py",
  unified_diff:
    "--- a/foo.py\n+++ b/foo.py\n@@ -1,2 +1,2 @@\n-old\n+new\n",
  truncated: false,
  total_lines: 4,
  displayed_lines: 4,
  fallback_description: "edit /abs/foo.py (+1 -1)",
};

const baseUiState = {
  status: "pending",
  error: null,
  resolved: false,
  decision: null,
};

describe("CodeDiffInteract", () => {
  test("pending state shows Approve/Reject buttons but no Always allow", () => {
    const onSubmit = jest.fn();
    render(
      <CodeDiffInteract
        config={baseConfig}
        onSubmit={onSubmit}
        uiState={baseUiState}
        isDark={false}
      />,
    );
    expect(screen.getByText("Edit /abs/foo.py")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reject/i })).toBeInTheDocument();
    expect(screen.queryByText(/always allow/i)).not.toBeInTheDocument();
  });

  test("diff lines are classified by prefix", () => {
    render(
      <CodeDiffInteract
        config={baseConfig}
        onSubmit={jest.fn()}
        uiState={baseUiState}
        isDark={false}
      />,
    );
    expect(screen.getByText("-old").closest("[data-diff-kind]")).toHaveAttribute(
      "data-diff-kind",
      "removed",
    );
    expect(screen.getByText("+new").closest("[data-diff-kind]")).toHaveAttribute(
      "data-diff-kind",
      "added",
    );
  });

  test("approved uiState hides buttons and shows approved badge", () => {
    render(
      <CodeDiffInteract
        config={baseConfig}
        onSubmit={jest.fn()}
        uiState={{
          status: "resolved",
          error: null,
          resolved: true,
          decision: "approved",
        }}
        isDark={false}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /approve/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/approved/i)).toBeInTheDocument();
  });

  test("rejected uiState hides buttons and shows rejected badge", () => {
    render(
      <CodeDiffInteract
        config={baseConfig}
        onSubmit={jest.fn()}
        uiState={{
          status: "resolved",
          error: null,
          resolved: true,
          decision: "rejected",
        }}
        isDark={false}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /reject/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/rejected/i)).toBeInTheDocument();
  });

  test("truncated notice shows hidden line count", () => {
    const cfg = {
      ...baseConfig,
      truncated: true,
      total_lines: 500,
      displayed_lines: 200,
    };
    render(
      <CodeDiffInteract
        config={cfg}
        onSubmit={jest.fn()}
        uiState={baseUiState}
        isDark={false}
      />,
    );
    expect(screen.getByText(/300 more lines hidden/i)).toBeInTheDocument();
  });

  test("Approve click emits {approved:true, scope:'once'}", () => {
    const onSubmit = jest.fn();
    render(
      <CodeDiffInteract
        config={baseConfig}
        onSubmit={onSubmit}
        uiState={baseUiState}
        isDark={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /approve/i }));
    expect(onSubmit).toHaveBeenCalledWith({ approved: true, scope: "once" });
  });

  test("Reject click emits {approved:false, scope:'once'}", () => {
    const onSubmit = jest.fn();
    render(
      <CodeDiffInteract
        config={baseConfig}
        onSubmit={onSubmit}
        uiState={baseUiState}
        isDark={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /reject/i }));
    expect(onSubmit).toHaveBeenCalledWith({ approved: false, scope: "once" });
  });

  test("malformed unified_diff renders fallback pre without crashing", () => {
    const cfg = { ...baseConfig, unified_diff: "NOT A VALID DIFF AT ALL" };
    render(
      <CodeDiffInteract
        config={cfg}
        onSubmit={jest.fn()}
        uiState={baseUiState}
        isDark={false}
      />,
    );
    expect(screen.getByText("Edit /abs/foo.py")).toBeInTheDocument();
    expect(screen.getByTestId("code-diff-fallback-pre")).toBeInTheDocument();
  });

  test("disabled prop hides buttons", () => {
    render(
      <CodeDiffInteract
        config={baseConfig}
        onSubmit={jest.fn()}
        uiState={baseUiState}
        isDark={false}
        disabled
      />,
    );
    expect(
      screen.queryByRole("button", { name: /approve/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /reject/i }),
    ).not.toBeInTheDocument();
  });
});
