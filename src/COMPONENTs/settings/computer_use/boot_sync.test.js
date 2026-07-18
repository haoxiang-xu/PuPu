import { render } from "@testing-library/react";
import ComputerUseBootSync from "./boot_sync";
import { resyncComputerUseEnabledOnBoot } from "./enable_controller";

jest.mock("./enable_controller", () => ({
  __esModule: true,
  resyncComputerUseEnabledOnBoot: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  // CRA's jest runs with resetMocks:true, so (re)establish the impl each test.
  resyncComputerUseEnabledOnBoot.mockResolvedValue({ pushed: false });
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
});
