import { render, screen } from "@testing-library/react";
import ToolkitCard from "./toolkit_card";

jest.mock("./toolkit_icon", () => ({
  __esModule: true,
  default: ({ icon }) => <span data-testid="toolkit-icon">{icon?.type || "fallback"}</span>,
  isBuiltinToolkitIcon: (icon) => icon?.type === "builtin",
  isFileToolkitIcon: (icon) =>
    Boolean(icon && icon.type === "file" && icon.content && icon.mimeType),
}));

jest.mock("../../../BUILTIN_COMPONENTs/input/switch", () => ({
  __esModule: true,
  SemiSwitch: () => <span data-testid="switch" />,
}));

jest.mock("../../../BUILTIN_COMPONENTs/tooltip/tooltip", () => ({
  __esModule: true,
  default: ({ children }) => children,
}));

describe("ToolkitCard", () => {
  test("uses builtin icon background color on the card icon wrapper", () => {
    render(
      <ToolkitCard
        isDark={false}
        toolkit={{
          toolkitId: "demo_toolkit",
          toolkitName: "Demo Toolkit",
          toolkitDescription: "Toolkit description",
          toolkitIcon: {
            type: "builtin",
            name: "terminal",
            color: "#0f172a",
            backgroundColor: "#bae6fd",
          },
          source: "builtin",
          tools: [],
        }}
      />,
    );

    expect(screen.getByTestId("toolkit-card-icon-wrap")).toHaveStyle({
      backgroundColor: "#bae6fd",
      width: "36px",
      height: "36px",
      borderRadius: "10px",
    });
  });
});
