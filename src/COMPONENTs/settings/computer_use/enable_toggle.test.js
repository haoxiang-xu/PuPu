import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConfigContext, LocaleContext } from "../../../CONTAINERs/config/context";
import { ComputerUseSettings } from "./index";
import { runtimeBridge } from "../../../SERVICEs/bridges/unchain_bridge";
import { useComputerUseConsent } from "./consent_modal";
import {
  disableComputerUse,
  enableComputerUse,
} from "./enable_controller";
import { isComputerUseEnabledPersisted } from "../../../SERVICEs/computer_use_enabled_store";

jest.mock("../../../BUILTIN_COMPONENTs/icon/icon", () => () => null);

jest.mock("../../../BUILTIN_COMPONENTs/input/button", () => ({
  __esModule: true,
  default: ({ label, onClick }) => <button onClick={onClick}>{label}</button>,
}));

// Deterministic switch: a button that flips its bound value on click.
jest.mock("../../../BUILTIN_COMPONENTs/input/switch", () => ({
  __esModule: true,
  SemiSwitch: ({ on, set_on }) => (
    <button
      data-testid="cu-switch"
      data-on={on ? "1" : "0"}
      onClick={() => set_on(!on)}
    >
      switch
    </button>
  ),
}));

jest.mock("../../../SERVICEs/bridges/unchain_bridge", () => ({
  __esModule: true,
  runtimeBridge: {
    isComputerUseStatusAvailable: jest.fn(() => true),
    isComputerUsePrivacySettingsAvailable: jest.fn(() => false),
    isComputerUseEnableAvailable: jest.fn(() => true),
    getComputerUseStatus: jest.fn(),
    openComputerUsePrivacySettings: jest.fn(),
  },
}));

jest.mock("./consent_modal", () => ({
  __esModule: true,
  useComputerUseConsent: jest.fn(),
}));

jest.mock("./enable_controller", () => ({
  __esModule: true,
  enableComputerUse: jest.fn(),
  disableComputerUse: jest.fn(),
}));

jest.mock("../../../SERVICEs/computer_use_enabled_store", () => ({
  __esModule: true,
  isComputerUseEnabledPersisted: jest.fn(() => false),
}));

const withProviders = (ui) =>
  render(
    <LocaleContext.Provider value={{ locale: "en", setLocale: jest.fn() }}>
      <ConfigContext.Provider
        value={{ onThemeMode: "light_mode", theme: { font: {} } }}
      >
        {ui}
      </ConfigContext.Provider>
    </LocaleContext.Provider>,
  );

let requireComputerUseConsent;

beforeEach(() => {
  jest.clearAllMocks();
  requireComputerUseConsent = jest.fn(() => Promise.resolve(true));
  useComputerUseConsent.mockReturnValue({
    requireComputerUseConsent,
    resetConsent: jest.fn(),
    consentRecord: null,
    consentModal: null,
  });
  runtimeBridge.isComputerUseStatusAvailable.mockReturnValue(true);
  runtimeBridge.isComputerUseEnableAvailable.mockReturnValue(true);
  runtimeBridge.getComputerUseStatus.mockResolvedValue({
    enabled: false,
    reason: "",
    capabilities: null,
  });
  enableComputerUse.mockResolvedValue({ pushed: true, ok: true });
  disableComputerUse.mockResolvedValue({ pushed: true, ok: true });
  isComputerUseEnabledPersisted.mockReturnValue(false);
});

const renderReady = async () => {
  withProviders(<ComputerUseSettings />);
  // The effect-state line only renders once loadStatus() has settled
  // (!loading), so waiting on it guarantees the switch reflects server truth.
  await waitFor(() =>
    expect(screen.getByTestId("computer-use-effect-state")).toBeInTheDocument(),
  );
};

describe("enable toggle — consent gate", () => {
  test("decline ⇒ ZERO write, ZERO push (enableComputerUse never called)", async () => {
    requireComputerUseConsent.mockResolvedValue(false);
    await renderReady();

    fireEvent.click(screen.getByTestId("cu-switch"));

    await waitFor(() =>
      expect(requireComputerUseConsent).toHaveBeenCalledTimes(1),
    );
    expect(enableComputerUse).not.toHaveBeenCalled();
  });

  test("accept ⇒ consent resolves BEFORE enable, then status is re-read", async () => {
    requireComputerUseConsent.mockResolvedValue(true);
    await renderReady();

    // one status read on mount
    expect(runtimeBridge.getComputerUseStatus).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("cu-switch"));

    await waitFor(() => expect(enableComputerUse).toHaveBeenCalledTimes(1));

    // Ordering: consent settled before the enable push.
    expect(
      requireComputerUseConsent.mock.invocationCallOrder[0],
    ).toBeLessThan(enableComputerUse.mock.invocationCallOrder[0]);

    // Server-truth re-read after enabling (mount + post-toggle).
    await waitFor(() =>
      expect(runtimeBridge.getComputerUseStatus).toHaveBeenCalledTimes(2),
    );
  });

  test("turning OFF needs no consent and calls disableComputerUse", async () => {
    runtimeBridge.getComputerUseStatus.mockResolvedValue({
      enabled: true,
      reason: "",
      capabilities: null,
    });
    isComputerUseEnabledPersisted.mockReturnValue(true);
    await renderReady();

    // Switch reflects server truth (on).
    expect(screen.getByTestId("cu-switch").getAttribute("data-on")).toBe("1");

    fireEvent.click(screen.getByTestId("cu-switch"));

    await waitFor(() => expect(disableComputerUse).toHaveBeenCalledTimes(1));
    expect(requireComputerUseConsent).not.toHaveBeenCalled();
  });
});
