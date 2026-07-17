import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConfigContext, LocaleContext } from "../../../../CONTAINERs/config/context";
import PresetPicker, { readPresetEnvelopes } from "./preset_picker";

jest.mock("../../../../BUILTIN_COMPONENTs/icon/icon", () => ({
  __esModule: true,
  default: ({ src = "icon" }) => <span data-testid={`icon-${src}`} />,
}));

jest.mock("../../../../BUILTIN_COMPONENTs/input/button", () => ({
  __esModule: true,
  default: ({ label, ariaLabel, onClick, disabled }) => (
    <button aria-label={ariaLabel} disabled={disabled} onClick={onClick}>
      {label || ariaLabel}
    </button>
  ),
}));

const renderPicker = (props = {}) =>
  render(
    <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
      <LocaleContext.Provider value={{ locale: "en", setLocale: jest.fn() }}>
        <PresetPicker
          open
          onClose={props.onClose || jest.fn()}
          onSelect={props.onSelect || jest.fn()}
        />
      </LocaleContext.Provider>
    </ConfigContext.Provider>,
  );

describe("readPresetEnvelopes", () => {
  test("returns the built-in SAP Hyperspace preset as an envelope array", () => {
    const envelopes = readPresetEnvelopes();
    expect(Array.isArray(envelopes)).toBe(true);
    expect(envelopes.length).toBeGreaterThanOrEqual(1);
    const sap = envelopes.find((e) => e.provider?.id === "sap-hyperspace");
    expect(sap).toBeTruthy();
    expect(sap.provider.protocol).toBe("anthropic");
  });
});

describe("PresetPicker", () => {
  test("renders a card with the Official badge and description", () => {
    renderPicker();
    expect(screen.getByText("SAP Hyperspace (local proxy)")).toBeTruthy();
    expect(screen.getByText("Official")).toBeTruthy();
  });

  test("selecting a card hands the full envelope up (same pipeline as import)", () => {
    const onSelect = jest.fn();
    renderPicker({ onSelect });
    fireEvent.click(screen.getByText("SAP Hyperspace (local proxy)"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    const envelope = onSelect.mock.calls[0][0];
    expect(envelope.provider.id).toBe("sap-hyperspace");
    // it is the envelope (has format), so the import pipeline can validate it
    expect(envelope.format).toBe("pupu-model-provider");
  });
});
