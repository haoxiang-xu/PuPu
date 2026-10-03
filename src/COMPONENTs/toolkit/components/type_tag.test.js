import { render, screen } from "@testing-library/react";
import TypeTag from "./type_tag";

describe("TypeTag", () => {
  test("renders one type as an uppercase caption", () => {
    render(<TypeTag types={["mcp"]} />);

    expect(screen.getByText("MCP")).toBeInTheDocument();
  });

  test("renders both tags when a plugin qualifies as two types", () => {
    // A builtin toolkit that also ships a /command is legitimately both.
    render(<TypeTag types={["toolkit", "skill"]} />);

    expect(screen.getByText(/TOOLKIT/)).toBeInTheDocument();
    expect(screen.getByText(/SKILL/)).toBeInTheDocument();
  });

  test("renders nothing when there is no type to show", () => {
    const { container } = render(<TypeTag types={[]} />);
    expect(container).toBeEmptyDOMElement();

    const { container: missing } = render(<TypeTag />);
    expect(missing).toBeEmptyDOMElement();
  });

  test("drops values that are not known types rather than printing them raw", () => {
    render(<TypeTag types={["mcp", "nonsense", ""]} />);

    expect(screen.getByText("MCP")).toBeInTheDocument();
    expect(screen.queryByText(/NONSENSE/)).not.toBeInTheDocument();
  });

  test("carries no background fill or border, in either theme", () => {
    const { container, rerender } = render(<TypeTag types={["mcp"]} isDark />);
    const dark = container.firstChild;
    expect(dark.style.background).toBe("");
    expect(dark.style.border).toBe("");

    rerender(<TypeTag types={["mcp"]} isDark={false} />);
    const light = container.firstChild;
    expect(light.style.background).toBe("");
    expect(light.style.border).toBe("");
  });
});
