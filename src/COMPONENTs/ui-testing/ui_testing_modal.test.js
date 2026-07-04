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
