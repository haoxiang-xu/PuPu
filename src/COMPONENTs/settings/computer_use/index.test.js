import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ConfigContext, LocaleContext } from "../../../CONTAINERs/config/context";
import {
  ComputerUseSettings,
  PermissionBadge,
  permissionBadgePalette,
} from "./index";
import { runtimeBridge } from "../../../SERVICEs/bridges/unchain_bridge";
import {
  isComputerUseLocalBetaPersisted,
  writeComputerUseLocalBeta,
} from "../../../SERVICEs/computer_use_local_beta_store";

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

jest.mock("../../../BUILTIN_COMPONENTs/input/switch", () => ({
  SemiSwitch: ({ on, set_on }) => (
    <button
      data-testid="computer-use-test-switch"
      data-on={on ? "1" : "0"}
      onClick={() => set_on(!on)}
    >
      switch
    </button>
  ),
}));

jest.mock("../../../SERVICEs/computer_use_local_beta_store", () => ({
  isComputerUseLocalBetaPersisted: jest.fn(() => false),
  writeComputerUseLocalBeta: jest.fn(),
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

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
};

beforeEach(() => {
  jest.clearAllMocks();
  delete runtimeBridge.isComputerUseLocalBetaAvailable;
  delete runtimeBridge.setComputerUseLocalBetaEnabled;
  delete runtimeBridge.probeComputerUseModel;
  runtimeBridge.isComputerUseStatusAvailable.mockReturnValue(true);
  runtimeBridge.isComputerUsePrivacySettingsAvailable.mockReturnValue(true);
  isComputerUseLocalBetaPersisted.mockReturnValue(false);
  writeComputerUseLocalBeta.mockImplementation((enabled) => {
    const record = { enabled: enabled === true };
    Object.defineProperty(record, "persistence", {
      value: Promise.resolve(),
      enumerable: false,
    });
    return record;
  });
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

  test("shows a non-interactive release-gate state when the feature is unavailable", async () => {
    runtimeBridge.isComputerUseEnableAvailable.mockReturnValue(true);
    runtimeBridge.getComputerUseStatus.mockResolvedValue({
      featureAvailable: false,
      enabled: false,
      reason: "feature_flag_disabled",
      capabilities: null,
    });

    withProviders(<ComputerUseSettings />);

    expect(
      await screen.findByText("Not included in this build"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("computer-use-enable-toggle")).toBeNull();
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

  test("shows the provider-native mode and protocol selected for the active model", async () => {
    runtimeBridge.getComputerUseStatus.mockResolvedValue({
      ...macCapabilities(),
      active: {
        provider: "openai",
        model: "gpt-5.6",
        computer_use: {
          supported: true,
          mode: "provider_native",
          protocol: "openai.responses.computer.v1",
        },
      },
    });

    withProviders(<ComputerUseSettings />);

    await waitFor(() =>
      expect(screen.getByText("openai · gpt-5.6")).toBeInTheDocument(),
    );
    expect(screen.getByText("provider_native")).toBeInTheDocument();
    expect(
      screen.getByText("openai.responses.computer.v1"),
    ).toBeInTheDocument();
  });

  test("runs an explicit Ollama probe from the local beta surface", async () => {
    runtimeBridge.isComputerUseLocalBetaAvailable = jest.fn(() => true);
    runtimeBridge.setComputerUseLocalBetaEnabled = jest.fn();
    runtimeBridge.probeComputerUseModel = jest.fn(async () => ({
      supported: true,
      model: "qwen3.5:4b",
    }));
    runtimeBridge.getComputerUseStatus.mockResolvedValue({
      ...macCapabilities(),
      localBetaEnabled: true,
      active: {
        provider: "ollama",
        model: "qwen3.5:4b",
        computer_use: {
          supported: false,
          mode: "unsupported",
          protocol: "",
        },
      },
    });

    withProviders(<ComputerUseSettings />);
    const runButton = await screen.findByText("Run probe");
    fireEvent.click(runButton);

    await waitFor(() =>
      expect(runtimeBridge.probeComputerUseModel).toHaveBeenCalledWith(
        "qwen3.5:4b",
        true,
      ),
    );
    expect(await screen.findByText(/Probe passed/)).toBeInTheDocument();
  });

  test("persists a local-beta OFF choice before awaiting the runtime", async () => {
    const persistence = deferred();
    const runtimeResult = deferred();
    runtimeBridge.isComputerUseLocalBetaAvailable = jest.fn(() => true);
    runtimeBridge.setComputerUseLocalBetaEnabled = jest.fn(
      () => runtimeResult.promise,
    );
    runtimeBridge.getComputerUseStatus.mockResolvedValue({
      ...macCapabilities(),
      localBetaEnabled: true,
      active: {},
    });
    isComputerUseLocalBetaPersisted.mockReturnValue(true);
    writeComputerUseLocalBeta.mockReturnValue({
      enabled: false,
      persistence: persistence.promise,
    });

    withProviders(<ComputerUseSettings />);
    const switches = await screen.findAllByTestId(
      "computer-use-test-switch",
    );
    const localBetaSwitch = switches[switches.length - 1];
    await waitFor(() =>
      expect(localBetaSwitch).toHaveAttribute("data-on", "1"),
    );
    fireEvent.click(localBetaSwitch);

    expect(writeComputerUseLocalBeta).toHaveBeenCalledWith(false);
    expect(
      runtimeBridge.setComputerUseLocalBetaEnabled,
    ).not.toHaveBeenCalled();

    persistence.resolve();
    await waitFor(() =>
      expect(
        runtimeBridge.setComputerUseLocalBetaEnabled,
      ).toHaveBeenCalledWith(false),
    );
    await act(async () => {
      runtimeResult.resolve({ enabled: false });
      await runtimeResult.promise;
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(runtimeBridge.getComputerUseStatus).toHaveBeenCalledTimes(2),
    );
  });
});
