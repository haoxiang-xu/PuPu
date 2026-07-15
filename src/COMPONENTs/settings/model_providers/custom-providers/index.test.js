import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConfigContext, LocaleContext } from "../../../../CONTAINERs/config/context";
import CustomProvidersSection from "./index";
import { readCustomProviders } from "../../../../SERVICEs/custom_provider_store";
import { exportCustomProvider } from "./export_provider";
import { toast } from "../../../../SERVICEs/toast";

jest.mock("../../../../SERVICEs/custom_provider_store", () => ({
  __esModule: true,
  readCustomProviders: jest.fn(() => []),
}));

jest.mock("../../../../SERVICEs/model_catalog_refresh", () => ({
  __esModule: true,
  subscribeModelCatalogRefresh: jest.fn(() => () => {}),
}));

jest.mock("../../../../SERVICEs/toast", () => ({
  __esModule: true,
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock("./export_provider", () => ({
  __esModule: true,
  exportCustomProvider: jest.fn(),
}));

// Keep children as light stubs so this test focuses on the shell wiring.
jest.mock("./custom_provider_list", () => ({
  __esModule: true,
  default: ({ providers, onExport }) => (
    <div data-testid="list">
      {`rows:${providers.length}`}
      <button onClick={() => onExport?.("prov")}>stub-export</button>
    </div>
  ),
}));

jest.mock("./custom_provider_editor", () => ({
  __esModule: true,
  default: ({ open, slug }) =>
    open ? <div data-testid="editor">{`editor:${slug || "new"}`}</div> : null,
}));

jest.mock("./custom_provider_import_modal", () => ({
  __esModule: true,
  default: ({ open, presetSeed, onImported }) =>
    open ? (
      <div data-testid="import">
        {`import:${presetSeed ? "preset" : "manual"}`}
        <button
          onClick={() => onImported?.({ slug: "prov", requiresKey: true })}
        >
          stub-imported
        </button>
      </div>
    ) : null,
}));

jest.mock("./preset_picker", () => ({
  __esModule: true,
  default: ({ open, onSelect }) =>
    open ? (
      <div data-testid="preset">
        <button onClick={() => onSelect?.({ provider: { id: "sap" } })}>
          stub-pick
        </button>
      </div>
    ) : null,
}));

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

const renderSection = () =>
  render(
    <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
      <LocaleContext.Provider value={{ locale: "en", setLocale: jest.fn() }}>
        <CustomProvidersSection />
      </LocaleContext.Provider>
    </ConfigContext.Provider>,
  );

describe("CustomProvidersSection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    readCustomProviders.mockReturnValue([]);
    exportCustomProvider.mockResolvedValue({ ok: true, via: "dialog" });
  });

  test("renders the section title and reads providers from the store", () => {
    readCustomProviders.mockReturnValue([{ id: "a" }, { id: "b" }]);
    renderSection();
    expect(screen.getByText("Custom Providers")).toBeTruthy();
    expect(screen.getByTestId("list").textContent).toContain("rows:2");
  });

  test("Import and From-preset entry points are enabled (S5)", () => {
    renderSection();
    expect(screen.getByRole("button", { name: "Import" }).disabled).toBe(false);
    expect(
      screen.getByRole("button", { name: "From preset" }).disabled,
    ).toBe(false);
  });

  test("clicking Add opens the editor in create mode", () => {
    renderSection();
    expect(screen.queryByTestId("editor")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByTestId("editor").textContent).toBe("editor:new");
  });

  test("clicking Import opens the import modal in manual mode", () => {
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    expect(screen.getByTestId("import").textContent).toContain("import:manual");
  });

  test("preset selection routes through the import modal seeded as preset", () => {
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "From preset" }));
    expect(screen.getByTestId("preset")).toBeTruthy();
    fireEvent.click(screen.getByText("stub-pick"));
    // preset picker closes, import modal opens seeded as preset
    expect(screen.getByTestId("import").textContent).toContain("import:preset");
  });

  test("an imported key-requiring provider opens the editor to enter the key", () => {
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    fireEvent.click(screen.getByText("stub-imported"));
    expect(screen.getByTestId("editor").textContent).toBe("editor:prov");
  });

  test("export button routes to exportCustomProvider and toasts on success", async () => {
    renderSection();
    fireEvent.click(screen.getByText("stub-export"));
    expect(exportCustomProvider).toHaveBeenCalledWith("prov");
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });
});
