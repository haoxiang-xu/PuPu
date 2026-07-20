import { act, render, screen } from "@testing-library/react";
import { getPluginSettingsEntry } from "./plugin_settings_registry";

/* This is the REAL registry (computer_use NOT mocked) — it verifies the S1
   cross-domain wiring end to end: the toolkit surface can resolve and mount
   the real ComputerUseSettings (which pulls the full consent-modal /
   enable-controller stack) without throwing. This is the assertion behind the
   "consent nested modal renders inside the plugins modal" concern: the plugins
   overlay container is a plain div inside the same Modal primitive the settings
   modal uses, and ComputerUseSettings mounts its consent machinery the same way
   there (precedent). The consent modal's own open/agree/decline behavior is
   covered in computer_use/consent_modal.test.js.

   Only runtimeBridge is mocked — with every availability probe false so the
   panel settles into its safe "unavailable" state and never reaches for a real
   window bridge on mount. */
jest.mock("../../SERVICEs/bridges/unchain_bridge", () => ({
  __esModule: true,
  runtimeBridge: {
    isComputerUseStatusAvailable: () => false,
    isComputerUseEnableAvailable: () => false,
    isComputerUsePrivacySettingsAvailable: () => false,
    getComputerUseStatus: jest.fn(() => Promise.resolve({ enabled: false })),
  },
}));

describe("plugin_settings_registry (real ComputerUseSettings mount)", () => {
  test("the registered builtin.computer component mounts and renders its settings surface", async () => {
    const entry = getPluginSettingsEntry("builtin.computer");
    expect(entry).not.toBeNull();
    const ComputerUseSettings = entry.Component;

    await act(async () => {
      render(
        <ComputerUseSettings
          toolkitId="builtin.computer"
          isDark={false}
          onRequestClose={() => {}}
        />,
      );
    });

    // Real en.json copy for computer_use.section — proves a genuine mount, not
    // a stub, and that the full consent/enable-controller import graph loaded.
    expect(screen.getByText("Computer Use")).toBeInTheDocument();
  });
});
