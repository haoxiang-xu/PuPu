import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import UITestingModal from "./ui_testing_modal";
import { toast } from "../../SERVICEs/toast";

jest.mock("../../BUILTIN_COMPONENTs/modal/modal", () => ({
  __esModule: true,
  default: ({ open, children }) => (open ? <div>{children}</div> : null),
}));

jest.mock("../../BUILTIN_COMPONENTs/mini_react/use_modal_lifecycle", () => ({
  __esModule: true,
  useModalLifecycle: jest.fn(),
}));

jest.mock("../../BUILTIN_COMPONENTs/input/button", () => ({
  __esModule: true,
  default: ({ label, children, onClick, ariaLabel, prefix_icon }) => (
    <button onClick={onClick} aria-label={ariaLabel || label || prefix_icon}>
      {label || children || prefix_icon}
    </button>
  ),
}));

// interject's mock portals a marker INTO the real ControlDock (via the real
// TestControls), so tests can prove the dock hosts a runner's controls and
// auto-hides when a content-only runner (Toast) declares none.
jest.mock("./runners/interject_runner", () => {
  const React = require("react");
  const TestControls = require("./test_controls").default;
  return {
    __esModule: true,
    default: () =>
      React.createElement(
        TestControls,
        null,
        React.createElement(
          "span",
          { "data-testid": "interject-dock-control" },
          "Interject runner",
        ),
      ),
  };
});

jest.mock("./runners/trace_chain_runner", () => ({
  __esModule: true,
  default: () => <div>Trace runner</div>,
}));

jest.mock("./runners/code_diff_runner", () => ({
  __esModule: true,
  default: () => <div>Code diff runner</div>,
}));

jest.mock("./runners/artifact_summary_runner", () => ({
  __esModule: true,
  default: () => <div>Artifact summary runner</div>,
}));

jest.mock("../side-menu/side_menu_utils", () => ({
  getRuntimePlatform: () => "darwin",
}));

jest.mock("../../SERVICEs/bridges/window_state_bridge", () => ({
  windowStateBridge: {
    isListenerAvailable: () => false,
    onWindowStateChange: () => () => {},
  },
}));

describe("UITestingModal toast runner", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const openToastPage = () => {
    const reportSpy = jest
      .spyOn(toast, "reportError")
      .mockImplementation(() => "toast-id");

    render(
      <ConfigContext.Provider value={{ onThemeMode: "light_mode", theme: {} }}>
        <UITestingModal open onClose={() => {}} />
      </ConfigContext.Provider>,
    );

    fireEvent.click(screen.getByText("Toast"));
    return reportSpy;
  };

  test("fires the real attachment cleanup scenario verbatim", () => {
    const reportSpy = openToastPage();

    fireEvent.click(
      screen.getByRole("button", { name: "Attachment cleanup failed" }),
    );

    expect(reportSpy).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        title: "Attachment storage cleanup failed",
        dedupeKey: "attachment_delete_failed",
      }),
    );
  });

  test("routes toolkit scenarios through the real useAsyncAction fallback", async () => {
    const reportSpy = openToastPage();

    fireEvent.click(
      screen.getByRole("button", { name: "Toolkit catalog load failed" }),
    );

    await waitFor(() =>
      expect(reportSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "unchain_tool_modal_catalog_failed",
        }),
        expect.objectContaining({ title: "toolkit_catalog_load" }),
      ),
    );
  });

  test("aborted action scenario stays silent through the real hook", async () => {
    const reportSpy = openToastPage();

    fireEvent.click(
      screen.getByRole("button", { name: "Aborted action stays silent" }),
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(reportSpy).not.toHaveBeenCalled();
  });
});

describe("UITestingModal chrome", () => {
  const renderModal = () =>
    render(
      <ConfigContext.Provider value={{ onThemeMode: "light_mode", theme: {} }}>
        <UITestingModal open onClose={() => {}} />
      </ConfigContext.Provider>,
    );

  test("toggles fullscreen icon", () => {
    renderModal();
    const btn = screen.getByRole("button", { name: "fullscreen" });
    fireEvent.click(btn);
    expect(
      screen.getByRole("button", { name: "fullscreen_exit" }),
    ).toBeInTheDocument();
  });

  test("collapsing the nav reveals the expand button", () => {
    renderModal();
    expect(
      screen.queryByRole("button", { name: "Expand components" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Collapse components" }),
    );
    expect(
      screen.getByRole("button", { name: "Expand components" }),
    ).toBeInTheDocument();
  });

  test("still switches runners from the nav", () => {
    renderModal();
    fireEvent.click(screen.getByText("CodeDiffInteract"));
    expect(screen.getByText("Code diff runner")).toBeInTheDocument();
  });

  test("dock hosts a runner's controls, then auto-hides for content-only Toast", () => {
    renderModal();
    // Interject (default) portals a control into the shared ControlDock.
    expect(screen.getByTestId("interject-dock-control")).toBeInTheDocument();
    // Toast declares no dock controls → the dock's hosted content is gone.
    fireEvent.click(screen.getByText("Toast"));
    expect(screen.queryByTestId("interject-dock-control")).toBeNull();
  });
});
