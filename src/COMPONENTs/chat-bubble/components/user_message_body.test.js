import { render, screen } from "@testing-library/react";

import UserMessageBody from "./user_message_body";

jest.mock("../../../BUILTIN_COMPONENTs/icon/icon", () => ({
  __esModule: true,
  default: () => null,
}));

const baseProps = {
  theme: { color: "#222", font: {} },
  isDark: false,
  isEditing: false,
  userAttachments: [],
};

describe("UserMessageBody — composer routing", () => {
  test("baseline: message without composer renders a plain content span, no chip/disclosure", () => {
    const { container } = render(
      <UserMessageBody
        {...baseProps}
        message={{ id: "m", role: "user", content: "hello world" }}
      />,
    );
    expect(screen.getByText("hello world")).toBeInTheDocument();
    // No expansion surface leaks into the baseline path.
    expect(screen.queryByRole("button")).toBeNull();
    // Exactly the baseline span (plus the empty attachment flex wrapper).
    expect(container.textContent).toBe("hello world");
  });

  test("empty content without composer renders nothing (baseline unchanged)", () => {
    const { container } = render(
      <UserMessageBody
        {...baseProps}
        message={{ id: "m", role: "user", content: "" }}
      />,
    );
    expect(container.textContent).toBe("");
  });

  test("malformed composer falls back to baseline span (atomic fail-open)", () => {
    const { container } = render(
      <UserMessageBody
        {...baseProps}
        message={{
          id: "m",
          role: "user",
          content: "hello world",
          composer: { v: 2, rawText: "x", commands: [], templateLength: 0 },
        }}
      />,
    );
    expect(screen.getByText("hello world")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.textContent).toBe("hello world");
  });

  test("valid composer routes to the command-expansion render path (chip appears)", () => {
    const template = "# Plan\nl2\nl3\nl4\nl5";
    const content = template + "\n\n" + "do the thing";
    render(
      <UserMessageBody
        {...baseProps}
        message={{
          id: "m",
          role: "user",
          content,
          composer: {
            v: 1,
            rawText: "/plan do the thing",
            commands: [{ name: "/plan", sourceToolkitId: "" }],
            templateLength: template.length,
          },
        }}
      />,
    );
    expect(screen.getByText("/plan")).toBeInTheDocument();
    expect(screen.getByText("do the thing")).toBeInTheDocument();
  });
});
