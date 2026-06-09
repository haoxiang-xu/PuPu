import { render, screen } from "@testing-library/react";
import ToolkitIcon, { ToolkitIconFrame } from "./toolkit_icon";

jest.mock("../../../BUILTIN_COMPONENTs/icon/icon", () => ({
  __esModule: true,
  default: ({ src, color, style }) => (
    <span
      data-testid="shared-icon"
      data-src={src}
      data-color={color}
      style={style}
    />
  ),
}));

jest.mock("../../../BUILTIN_COMPONENTs/icon/icon_manifest", () => ({
  __esModule: true,
  LogoSVGs: { logo_icon: {} },
  UISVGs: { github: {}, mcp: {}, terminal: {}, tool: {} },
}));

describe("ToolkitIcon", () => {
  test("renders file payload as inline image", () => {
    const { container } = render(
      <ToolkitIcon
        icon={{
          type: "file",
          mimeType: "image/svg+xml",
          content: "<svg xmlns='http://www.w3.org/2000/svg'></svg>",
        }}
        size={24}
      />,
    );

    const image = container.querySelector("img");
    expect(image).toBeInTheDocument();
    expect(image?.getAttribute("src")).toContain("data:image/svg+xml");
    expect(image).toHaveAttribute("width", "24");
    expect(image).toHaveAttribute("height", "24");
  });

  test("renders scaled file icons centered inside the original layout box", () => {
    const { container } = render(
      <ToolkitIcon
        icon={{
          type: "file",
          mimeType: "image/svg+xml",
          content: "<svg xmlns='http://www.w3.org/2000/svg'></svg>",
          displayScale: 0.82,
        }}
        size={36}
        style={{ borderRadius: 10, flexShrink: 0 }}
      />,
    );

    const frame = screen.getByTestId("toolkit-file-icon-frame");
    expect(frame).toHaveStyle({
      width: "36px",
      height: "36px",
      borderRadius: "10px",
      flexShrink: "0",
    });
    const image = container.querySelector("img");
    expect(image).toHaveAttribute("width", "30");
    expect(image).toHaveAttribute("height", "30");
  });

  test("renders builtin payload with shared icon component", () => {
    render(
      <ToolkitIcon
        icon={{
          type: "builtin",
          name: "terminal",
          color: "#0f172a",
          backgroundColor: "#bae6fd",
        }}
        size={24}
      />,
    );

    expect(screen.getByTestId("shared-icon")).toHaveAttribute(
      "data-src",
      "terminal",
    );
    expect(screen.getByTestId("shared-icon")).toHaveAttribute(
      "data-color",
      "#0f172a",
    );
  });

  test("falls back to tool when builtin icon name is unknown", () => {
    render(
      <ToolkitIcon
        icon={{
          type: "builtin",
          name: "missing_icon",
          color: "#0f172a",
          backgroundColor: "#bae6fd",
        }}
      />,
    );

    expect(screen.getByTestId("shared-icon")).toHaveAttribute(
      "data-src",
      "tool",
    );
  });

  test("ToolkitIconFrame preserves builtin icon background and uses compact inner size", () => {
    render(
      <ToolkitIconFrame
        icon={{
          type: "builtin",
          name: "github",
          color: "#ffffff",
          backgroundColor: "#1f2328",
        }}
        size={24}
        iconSize={13}
        borderRadius={7}
        fallbackColor="#4a5bd8"
      />,
    );

    expect(screen.getByTestId("toolkit-icon-frame")).toHaveStyle({
      width: "24px",
      height: "24px",
      backgroundColor: "#1f2328",
      borderRadius: "7px",
    });
    expect(screen.getByTestId("shared-icon")).toHaveAttribute(
      "data-src",
      "github",
    );
    expect(screen.getByTestId("shared-icon")).toHaveAttribute(
      "data-color",
      "#ffffff",
    );
    expect(screen.getByTestId("shared-icon")).toHaveStyle({
      width: "13px",
      height: "13px",
    });
  });

  test("ToolkitIconFrame keeps transparent mcp icon unbacked and slightly larger", () => {
    render(
      <ToolkitIconFrame
        icon={{
          type: "builtin",
          name: "mcp",
          color: "#9aa0a6",
          backgroundColor: "transparent",
        }}
        size={24}
        iconSize={13}
        transparentIconSize={16}
        fallbackColor="#4a5bd8"
      />,
    );

    expect(screen.getByTestId("toolkit-icon-frame")).toHaveStyle({
      backgroundColor: "transparent",
    });
    expect(screen.getByTestId("shared-icon")).toHaveAttribute(
      "data-src",
      "mcp",
    );
    expect(screen.getByTestId("shared-icon")).toHaveStyle({
      width: "16px",
      height: "16px",
    });
  });
});
