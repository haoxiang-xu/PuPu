/* Characterization tests for the init-setup workspace step's settings
   touchpoints (prefill + persist), locked across the settings-repository
   conversion (Phase 1B T3). */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import WorkspaceStep from "./workspace";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { runtimeBridge } from "../../../SERVICEs/bridges/unchain_bridge";

/* Availability checks are plain functions (not jest.fn) so CRA's resetMocks
   cannot wipe them; the async mocks get implementations in beforeEach. */
jest.mock("../../../SERVICEs/bridges/unchain_bridge", () => ({
  __esModule: true,
  runtimeBridge: {
    isWorkspaceValidationAvailable: () => true,
    validateWorkspaceRoot: jest.fn(),
    isWorkspacePickerAvailable: () => true,
    pickWorkspaceRoot: jest.fn(),
  },
}));

jest.mock("../../../CONTAINERs/config/theme_highlight", () => ({
  __esModule: true,
  themeHighlightColor: () => "#7c8cf8",
}));

jest.mock("../../../BUILTIN_COMPONENTs/icon/icon", () => ({
  __esModule: true,
  default: () => <span data-testid="icon" />,
}));

jest.mock("../../../BUILTIN_COMPONENTs/spinner/arc_spinner", () => ({
  __esModule: true,
  default: () => <span data-testid="spinner" />,
}));

jest.mock("../../../BUILTIN_COMPONENTs/tooltip/tooltip", () => ({
  __esModule: true,
  default: ({ children }) => children,
}));

jest.mock("../../../BUILTIN_COMPONENTs/input/input", () => ({
  __esModule: true,
  Input: ({ value, set_value, placeholder }) => (
    <input
      data-testid="path-input"
      value={value}
      placeholder={placeholder}
      onChange={(e) => set_value(e.target.value)}
    />
  ),
}));

jest.mock("../../../BUILTIN_COMPONENTs/input/button", () => ({
  __esModule: true,
  default: ({ label, onClick, disabled }) => (
    <button data-testid={`btn-${label}`} onClick={onClick} disabled={disabled}>
      {label}
    </button>
  ),
}));

const readRoot = () =>
  JSON.parse(window.localStorage.getItem("settings") || "{}");

const renderStep = (onNext = jest.fn()) => {
  render(
    <ConfigContext.Provider value={{ onThemeMode: "light_mode", theme: {} }}>
      <WorkspaceStep onNext={onNext} />
    </ConfigContext.Provider>,
  );
  return onNext;
};

beforeEach(() => {
  window.localStorage.clear();
  runtimeBridge.validateWorkspaceRoot.mockResolvedValue({ valid: true });
  runtimeBridge.pickWorkspaceRoot.mockResolvedValue({
    path: "/picked/folder",
  });
});

describe("WorkspaceStep settings touchpoints", () => {
  test("prefills the input from settings.runtime.workspace_root", () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({ runtime: { workspace_root: "/saved/root" } }),
    );
    renderStep();
    expect(screen.getByTestId("path-input")).toHaveValue("/saved/root");
  });

  test("prefills empty when settings are absent or corrupt", () => {
    window.localStorage.setItem("settings", "{not json");
    renderStep();
    expect(screen.getByTestId("path-input")).toHaveValue("");
  });

  test("browse persists the picked path and preserves sibling sections", async () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({
        runtime: { other_flag: true },
        appearance: { theme_mode: "dark_mode" },
      }),
    );
    renderStep();
    fireEvent.click(screen.getByTestId("btn-Browse"));
    await waitFor(() => {
      expect(readRoot().runtime.workspace_root).toBe("/picked/folder");
    });
    const root = readRoot();
    expect(root.runtime.other_flag).toBe(true);
    expect(root.appearance).toEqual({ theme_mode: "dark_mode" });
    expect(screen.getByTestId("path-input")).toHaveValue("/picked/folder");
  });

  test("continue persists the validated path and advances", async () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({ runtime: { workspace_root: "/valid/path" } }),
    );
    const onNext = renderStep();
    await waitFor(
      () => {
        expect(screen.getByTestId("btn-Continue")).not.toBeDisabled();
      },
      { timeout: 2000 },
    );
    fireEvent.click(screen.getByTestId("btn-Continue"));
    expect(readRoot().runtime.workspace_root).toBe("/valid/path");
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(runtimeBridge.validateWorkspaceRoot).toHaveBeenCalledWith(
      "/valid/path",
    );
  });

  test("skip advances without writing settings", () => {
    const onNext = renderStep();
    fireEvent.click(screen.getByTestId("btn-Skip for now"));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem("settings")).toBeNull();
  });
});
