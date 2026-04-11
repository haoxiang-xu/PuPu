import { render, screen, waitFor } from "@testing-library/react";
import ToolkitDetailPanel from "./toolkit_detail_panel";
import api from "../../../SERVICEs/api";

jest.mock("../../../BUILTIN_COMPONENTs/mini_react/use_translation", () => ({
  __esModule: true,
  useTranslation: () => ({ t: (key) => key, locale: "en", setLocale: () => {} }),
}));

jest.mock("../../../SERVICEs/api", () => ({
  __esModule: true,
  default: {
    unchain: {
      getToolkitDetail: jest.fn(),
    },
  },
}));

jest.mock("../../../BUILTIN_COMPONENTs/input/button", () => ({
  __esModule: true,
  default: ({ onClick }) => <button onClick={onClick}>Back</button>,
}));

jest.mock("./toolkit_icon", () => ({
  __esModule: true,
  default: ({ icon }) => <span data-testid="toolkit-icon">{icon?.type || "fallback"}</span>,
  isBuiltinToolkitIcon: (icon) => icon?.type === "builtin",
  isFileToolkitIcon: (icon) => icon?.type === "file",
}));

jest.mock("./loading_dots", () => ({
  __esModule: true,
  default: () => <div>Loading</div>,
}));

jest.mock("./placeholder_block", () => ({
  __esModule: true,
  default: ({ title }) => <div>{title}</div>,
}));

jest.mock("../../../BUILTIN_COMPONENTs/markdown/markdown", () => ({
  __esModule: true,
  default: ({ content }) => <div>{content}</div>,
}));

describe("ToolkitDetailPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("uses builtin icon background color in the detail header", async () => {
    api.unchain.getToolkitDetail.mockResolvedValue({
      toolkitId: "demo_toolkit",
      toolkitName: "Demo Toolkit",
      toolkitDescription: "Toolkit description",
      toolkitIcon: {
        type: "builtin",
        name: "terminal",
        color: "#0f172a",
        backgroundColor: "#bae6fd",
      },
      readmeMarkdown: "# Demo Toolkit",
      selectedToolName: null,
    });

    render(
      <ToolkitDetailPanel
        toolkitId="demo_toolkit"
        toolName={null}
        isDark={false}
        onBack={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Demo Toolkit")).toBeInTheDocument();
    });

    expect(screen.getByTestId("toolkit-detail-icon-wrap")).toHaveStyle({
      backgroundColor: "#bae6fd",
      width: "48px",
      height: "48px",
      borderRadius: "12px",
    });
  });
});
