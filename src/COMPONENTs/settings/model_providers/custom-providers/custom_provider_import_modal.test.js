import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConfigContext, LocaleContext } from "../../../../CONTAINERs/config/context";
import CustomProviderImportModal from "./custom_provider_import_modal";
import {
  parseImportText,
  validateImport,
  classifyConflict,
  commitImport,
} from "./import_pipeline";
import { toast } from "../../../../SERVICEs/toast";

jest.mock("./import_pipeline", () => ({
  __esModule: true,
  parseImportText: jest.fn(),
  validateImport: jest.fn(),
  classifyConflict: jest.fn(),
  commitImport: jest.fn(),
}));

jest.mock("../../../../SERVICEs/custom_provider_store", () => ({
  __esModule: true,
  findCustomProvider: jest.fn(() => null),
}));

jest.mock("../../../../SERVICEs/toast", () => ({
  __esModule: true,
  toast: { success: jest.fn(), error: jest.fn() },
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

const providerDef = (overrides = {}) => ({
  id: "prov",
  display_name: "My Provider",
  protocol: "anthropic",
  base_url: "http://localhost:6655/anthropic",
  auth: { mode: "x-api-key" },
  models: [{ id: "m1", display_name: "Model One" }],
  ...overrides,
});

const renderModal = (props = {}) =>
  render(
    <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
      <LocaleContext.Provider value={{ locale: "en", setLocale: jest.fn() }}>
        <CustomProviderImportModal
          open
          presetSeed={props.presetSeed ?? null}
          onClose={props.onClose || jest.fn()}
          onImported={props.onImported || jest.fn()}
        />
      </LocaleContext.Provider>
    </ConfigContext.Provider>,
  );

const typeAndValidate = (text) => {
  fireEvent.change(
    screen.getByPlaceholderText("Paste provider JSON here…"),
    { target: { value: text } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Validate" }));
};

describe("CustomProviderImportModal — validate step", () => {
  beforeEach(() => jest.clearAllMocks());

  test("invalid JSON shows a diagnostic and no review card", () => {
    parseImportText.mockReturnValue({
      ok: false,
      diagnostics: [
        { code: "invalid_json", path: "", message: "The file is not valid JSON.", severity: "error" },
      ],
    });
    renderModal();
    typeAndValidate("{bad");
    expect(screen.getByText(/not valid JSON/i)).toBeTruthy();
    expect(screen.getByText(/invalid_json/)).toBeTruthy();
    expect(screen.queryByText("My Provider")).toBeNull();
  });

  test("normalize failure shows the returned diagnostics", () => {
    parseImportText.mockReturnValue({ ok: true, data: {} });
    validateImport.mockReturnValue({
      ok: false,
      diagnostics: [
        { code: "invalid_protocol", path: "provider.protocol", message: "protocol invalid", severity: "error" },
      ],
    });
    renderModal();
    typeAndValidate('{"x":1}');
    expect(screen.getByText(/protocol invalid/)).toBeTruthy();
    expect(screen.getByText(/invalid_protocol/)).toBeTruthy();
  });
});

describe("CustomProviderImportModal — review card + trust notice", () => {
  beforeEach(() => jest.clearAllMocks());

  test("renders review card with base_url and models, plus the trust notice", () => {
    parseImportText.mockReturnValue({ ok: true, data: {} });
    validateImport.mockReturnValue({ ok: true, provider: providerDef(), diagnostics: [] });
    classifyConflict.mockReturnValue({ kind: "new" });
    renderModal();
    typeAndValidate('{"x":1}');

    expect(screen.getByText("My Provider")).toBeTruthy();
    expect(screen.getByText("http://localhost:6655/anthropic")).toBeTruthy();
    expect(screen.getByText("Model One")).toBeTruthy();
    // fixed trust notice
    expect(screen.getByText(/third-party configuration/i)).toBeTruthy();
    // "new" -> single Import button
    expect(screen.getByRole("button", { name: "Import" })).toBeTruthy();
  });
});

describe("CustomProviderImportModal — conflict resolution", () => {
  beforeEach(() => jest.clearAllMocks());

  test("changed-endpoint conflict shows old→new diff and overwrite/rename options", () => {
    parseImportText.mockReturnValue({ ok: true, data: {} });
    validateImport.mockReturnValue({
      ok: true,
      provider: providerDef({ base_url: "https://new.example/api" }),
      diagnostics: [],
    });
    classifyConflict.mockReturnValue({
      kind: "conflict",
      changed: true,
      existing: providerDef({ base_url: "http://localhost:6655/anthropic" }),
    });
    renderModal();
    typeAndValidate('{"x":1}');

    expect(screen.getByText(/endpoint or auth differs/i)).toBeTruthy();
    expect(screen.getByText(/- http:\/\/localhost:6655\/anthropic/)).toBeTruthy();
    expect(screen.getByText(/\+ https:\/\/new.example\/api/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Overwrite" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Import as copy" })).toBeTruthy();
  });

  test("overwrite calls commitImport('overwrite') and reports imported", async () => {
    parseImportText.mockReturnValue({ ok: true, data: {} });
    validateImport.mockReturnValue({ ok: true, provider: providerDef(), diagnostics: [] });
    classifyConflict.mockReturnValue({
      kind: "conflict",
      changed: false,
      existing: providerDef(),
    });
    commitImport.mockReturnValue({
      ok: true,
      slug: "prov",
      requiresKey: true,
      endpointChanged: false,
    });
    const onImported = jest.fn();
    renderModal({ onImported });
    typeAndValidate('{"x":1}');
    fireEvent.click(screen.getByRole("button", { name: "Overwrite" }));

    expect(commitImport).toHaveBeenCalledWith(
      expect.objectContaining({ id: "prov" }),
      "overwrite",
      { source: "import" },
    );
    await waitFor(() =>
      expect(onImported).toHaveBeenCalledWith(
        expect.objectContaining({ slug: "prov", requiresKey: true }),
      ),
    );
    expect(toast.success).toHaveBeenCalled();
  });

  test("rename calls commitImport('rename')", () => {
    parseImportText.mockReturnValue({ ok: true, data: {} });
    validateImport.mockReturnValue({ ok: true, provider: providerDef(), diagnostics: [] });
    classifyConflict.mockReturnValue({
      kind: "conflict",
      changed: true,
      existing: providerDef(),
    });
    commitImport.mockReturnValue({
      ok: true,
      slug: "prov-2",
      requiresKey: false,
      endpointChanged: false,
    });
    renderModal();
    typeAndValidate('{"x":1}');
    fireEvent.click(screen.getByRole("button", { name: "Import as copy" }));
    expect(commitImport).toHaveBeenCalledWith(
      expect.objectContaining({ id: "prov" }),
      "rename",
      { source: "import" },
    );
  });
});

describe("CustomProviderImportModal — preset seed", () => {
  beforeEach(() => jest.clearAllMocks());

  test("a preset seed validates immediately with source:preset on commit", () => {
    validateImport.mockReturnValue({ ok: true, provider: providerDef(), diagnostics: [] });
    classifyConflict.mockReturnValue({ kind: "new" });
    commitImport.mockReturnValue({
      ok: true,
      slug: "prov",
      requiresKey: true,
      endpointChanged: false,
    });
    renderModal({ presetSeed: { provider: providerDef(), __presetId: "sap" } });

    // jumped straight to the review card (no paste box)
    expect(screen.getByText("My Provider")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Paste provider JSON here…")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    expect(commitImport).toHaveBeenCalledWith(
      expect.objectContaining({ id: "prov" }),
      "new",
      { source: "preset" },
    );
  });
});
