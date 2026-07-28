import { render } from "@testing-library/react";
import ComputerUseBootSync from "./boot_sync";
import { resyncComputerUseEnabledOnBoot } from "./enable_controller";
import { runtimeBridge } from "../../../SERVICEs/bridges/unchain_bridge";
import { isComputerUseLocalBetaPersisted } from "../../../SERVICEs/computer_use_local_beta_store";

jest.mock("./enable_controller", () => ({
  __esModule: true,
  resyncComputerUseEnabledOnBoot: jest.fn(),
}));

jest.mock("../../../SERVICEs/bridges/unchain_bridge", () => ({
  runtimeBridge: {
    isComputerUseLocalBetaAvailable: jest.fn(() => true),
    setComputerUseLocalBetaEnabled: jest.fn(() => Promise.resolve({ ok: true })),
  },
}));

jest.mock("../../../SERVICEs/computer_use_local_beta_store", () => ({
  isComputerUseLocalBetaPersisted: jest.fn(() => false),
}));

beforeEach(() => {
  jest.clearAllMocks();
  // CRA's jest runs with resetMocks:true, so (re)establish the impl each test.
  resyncComputerUseEnabledOnBoot.mockResolvedValue({ pushed: false });
  runtimeBridge.isComputerUseLocalBetaAvailable.mockReturnValue(true);
  runtimeBridge.setComputerUseLocalBetaEnabled.mockResolvedValue({ ok: true });
  isComputerUseLocalBetaPersisted.mockReturnValue(false);
});

describe("ComputerUseBootSync", () => {
  test("renders nothing and re-syncs desired state once on mount", () => {
    const { container } = render(<ComputerUseBootSync />);
    expect(container.firstChild).toBeNull();
    expect(resyncComputerUseEnabledOnBoot).toHaveBeenCalledTimes(1);
  });

  test("a rejected resync never throws out of the effect", () => {
    resyncComputerUseEnabledOnBoot.mockReturnValue(
      Promise.reject(new Error("boom")),
    );
    expect(() => render(<ComputerUseBootSync />)).not.toThrow();
  });

  test("re-syncs local beta ON or OFF and fails closed when no record exists", () => {
    render(<ComputerUseBootSync />);
    expect(runtimeBridge.setComputerUseLocalBetaEnabled).toHaveBeenCalledWith(false);

    jest.clearAllMocks();
    isComputerUseLocalBetaPersisted.mockReturnValue(true);
    render(<ComputerUseBootSync />);
    expect(runtimeBridge.setComputerUseLocalBetaEnabled).toHaveBeenCalledWith(true);
  });
});
