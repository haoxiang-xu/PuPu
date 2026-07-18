import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConfigContext, LocaleContext } from "../../../CONTAINERs/config/context";
import {
  ComputerUseSettings,
  PermissionBadge,
  permissionBadgePalette,
} from "./index";
import { runtimeBridge } from "../../../SERVICEs/bridges/unchain_bridge";

jest.mock("../../../BUILTIN_COMPONENTs/icon/icon", () => () => null);

jest.mock("../../../BUILTIN_COMPONENTs/input/button", () => ({
  __esModule: true,
  default: ({ label, onClick }) => (
    <button onClick={onClick}>{label}</button>
  ),
}));

jest.mock("../../../SERVICEs/bridges/unchain_bridge", () => ({
  __esModule: true,
  runtimeBridge: {
    isComputerUseStatusAvailable: jest.fn(() => true),
    isComputerUsePrivacySettingsAvailable: jest.fn(() => true),
    isComputerUseEnableAvailable: jest.fn(() => false),
    getComputerUseStatus: jest.fn(),
    openComputerUsePrivacySettings: jest.fn(() =>
      Promise.resolve({ ok: true }),
    ),
  },
}));

const withProviders = (ui, themeMode = "light_mode") =>
  render(
    <LocaleContext.Provider value={{ locale: "en", setLocale: jest.fn() }}>
      <ConfigContext.Provider
        value={{ onThemeMode: themeMode, theme: { font: {} } }}
      >
        {ui}
      </ConfigContext.Provider>
    </LocaleContext.Provider>,
  );

const macCapabilities = (overrides = {}) => ({
  enabled: true,
  reason: "",
  capabilities: {
    platform: "macos",
    display_server: "quartz",
    screenshot: true,
    injection: true,
    multi_display: false,
    degradation_reason: null,
    permissions: {
      screen_recording: "granted",
      accessibility: "denied",
    },
    caveats: [],
    action_set: ["computer_20251124"],
    ...overrides,
  },
});

beforeEach(() => {
  jest.clearAllMocks();
  runtimeBridge.isComputerUseStatusAvailable.mockReturnValue(true);
  runtimeBridge.isComputerUsePrivacySettingsAvailable.mockReturnValue(true);
});

describe("PermissionBadge", () => {
  test("renders the three known states plus not_applicable", () => {
    const { rerender } = withProviders(
      <PermissionBadge state="granted" isDark={false} />,
    );
    expect(screen.getByTestId("perm-badge-granted")).toHaveTextContent(
      "Granted",
    );

    const wrap = (state) => (
      <LocaleContext.Provider value={{ locale: "en", setLocale: jest.fn() }}>
        <PermissionBadge state={state} isDark={false} />
      </LocaleContext.Provider>
    );

    rerender(wrap("denied"));
    expect(screen.getByTestId("perm-badge-denied")).toHaveTextContent("Denied");

    rerender(wrap("not_applicable"));
    expect(screen.getByTestId("perm-badge-not_applicable")).toHaveTextContent(
      "Not required",
    );

    rerender(wrap(undefined));
    expect(screen.getByTestId("perm-badge-unknown")).toHaveTextContent(
      "Unknown",
    );
  });

  test("palette distinguishes granted from denied", () => {
    const granted = permissionBadgePalette("granted", false);
    const denied = permissionBadgePalette("denied", false);
    expect(granted.color).not.toBe(denied.color);
  });
});

describe("ComputerUseSettings", () => {
  test("shows unavailable message outside the desktop app", async () => {
    runtimeBridge.isComputerUseStatusAvailable.mockReturnValue(false);

    withProviders(<ComputerUseSettings />);

    await waitFor(() =>
      expect(
        screen.getByText(
          "Computer use status is only available in the desktop app.",
        ),
      ).toBeInTheDocument(),
    );
    expect(runtimeBridge.getComputerUseStatus).not.toHaveBeenCalled();
  });

  test("renders macOS permission badges and opens the right deep link", async () => {
    runtimeBridge.getComputerUseStatus.mockResolvedValue(macCapabilities());

    withProviders(<ComputerUseSettings />);

    await waitFor(() =>
      expect(screen.getByTestId("perm-badge-granted")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("perm-badge-denied")).toBeInTheDocument();

    const openButtons = screen.getAllByText("Open System Settings");
    expect(openButtons).toHaveLength(2);

    // Second row is Accessibility.
    fireEvent.click(openButtons[1]);
    await waitFor(() =>
      expect(
        runtimeBridge.openComputerUsePrivacySettings,
      ).toHaveBeenCalledWith("accessibility"),
    );
  });

  test("shows the Wayland note and no permission section on Linux/Wayland", async () => {
    runtimeBridge.getComputerUseStatus.mockResolvedValue({
      enabled: true,
      reason: "",
      capabilities: {
        platform: "linux",
        display_server: "wayland",
        screenshot: false,
        injection: false,
        multi_display: false,
        degradation_reason: "Wayland session detected",
        permissions: {
          screen_recording: "not_applicable",
          accessibility: "not_applicable",
        },
        caveats: [],
        action_set: [],
      },
    });

    withProviders(<ComputerUseSettings />);

    await waitFor(() =>
      expect(
        screen.getByText(/Wayland session detected\./),
      ).toBeInTheDocument(),
    );
    // Permission section is macOS-only.
    expect(screen.queryByText("macOS Permissions")).toBeNull();
  });
});
