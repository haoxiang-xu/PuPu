import { render, screen } from "@testing-library/react";
import ArtifactKindIcon from "./artifact_kind_icon";

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
  LogoSVGs: {},
  UISVGs: { bar_chart: {}, information: {}, file_edit: {} },
}));

describe("ArtifactKindIcon", () => {
  test("renders known builtin icon ids", () => {
    render(
      <ArtifactKindIcon
        icon={{ type: "builtin", name: "bar_chart", color: "#0f172a" }}
        color="#111827"
      />,
    );

    expect(screen.getByTestId("shared-icon")).toHaveAttribute("data-src", "bar_chart");
    expect(screen.getByTestId("shared-icon")).toHaveAttribute("data-color", "#0f172a");
  });

  test("falls back safely for unknown builtin icon ids", () => {
    render(
      <ArtifactKindIcon
        icon={{ type: "builtin", name: "missing_icon" }}
        color="#111827"
      />,
    );

    expect(screen.getByTestId("shared-icon")).toHaveAttribute("data-src", "information");
  });
});
