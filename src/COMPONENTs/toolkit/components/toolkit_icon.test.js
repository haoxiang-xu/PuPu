import { render, screen } from "@testing-library/react";
import ToolkitIcon from "./toolkit_icon";

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
  UISVGs: { terminal: {}, tool: {} },
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
});
