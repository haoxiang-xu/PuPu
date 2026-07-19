import { act, render, screen, waitFor } from "@testing-library/react";
import ComputerStatusPill from "./computer_status_pill";
import { runtimeBridge } from "../../../SERVICEs/bridges/unchain_bridge";

jest.mock("../../../BUILTIN_COMPONENTs/mini_react/use_translation", () => ({
  __esModule: true,
  useTranslation: () => ({ t: (key) => key, locale: "en", setLocale: () => {} }),
}));

jest.mock("../../../SERVICEs/bridges/unchain_bridge", () => ({
  __esModule: true,
  runtimeBridge: { getComputerUseStatus: jest.fn() },
}));

describe("ComputerStatusPill", () => {
  beforeEach(() => {
    runtimeBridge.getComputerUseStatus.mockReset();
  });

  const renderPill = async () => {
    await act(async () => {
      render(<ComputerStatusPill isDark={false} />);
    });
  };

  test("shows the Enabled status when the runtime reports enabled", async () => {
    runtimeBridge.getComputerUseStatus.mockResolvedValue({ enabled: true });
    await renderPill();
    await waitFor(() =>
      expect(screen.getByTestId("computer-status-pill")).toHaveTextContent(
        "computer_use.status_enabled",
      ),
    );
  });

  test("shows the Disabled status when the runtime reports disabled", async () => {
    runtimeBridge.getComputerUseStatus.mockResolvedValue({ enabled: false });
    await renderPill();
    await waitFor(() =>
      expect(screen.getByTestId("computer-status-pill")).toHaveTextContent(
        "computer_use.status_disabled",
      ),
    );
  });

  /* Fail-closed: an unreachable / erroring status read is not an error state —
     it collapses to Disabled. */
  test("collapses to Disabled when the status read fails", async () => {
    runtimeBridge.getComputerUseStatus.mockRejectedValue(
      new Error("bridge_unavailable"),
    );
    await renderPill();
    await waitFor(() =>
      expect(screen.getByTestId("computer-status-pill")).toHaveTextContent(
        "computer_use.status_disabled",
      ),
    );
  });

  test("defaults to Disabled before the status resolves", async () => {
    let resolve;
    runtimeBridge.getComputerUseStatus.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    await renderPill();
    expect(screen.getByTestId("computer-status-pill")).toHaveTextContent(
      "computer_use.status_disabled",
    );
    await act(async () => {
      resolve({ enabled: true });
    });
  });
});
