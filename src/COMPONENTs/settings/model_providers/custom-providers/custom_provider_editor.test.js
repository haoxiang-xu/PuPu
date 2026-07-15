import React from "react";
import { fireEvent, render, screen, act } from "@testing-library/react";
import { ConfigContext, LocaleContext } from "../../../../CONTAINERs/config/context";
import CustomProviderEditor from "./custom_provider_editor";
import {
  addCustomProvider,
  updateCustomProvider,
  findCustomProvider,
  normalizeCustomProvider,
  setCustomProviderSecret,
  getCustomProviderSecret,
  setCustomProviderEnabled,
} from "../../../../SERVICEs/custom_provider_store";
import { api } from "../../../../SERVICEs/api";
import { toast } from "../../../../SERVICEs/toast";

jest.mock("../../../../SERVICEs/custom_provider_store", () => ({
  __esModule: true,
  addCustomProvider: jest.fn(),
  updateCustomProvider: jest.fn(),
  findCustomProvider: jest.fn(() => null),
  normalizeCustomProvider: jest.fn(),
  setCustomProviderSecret: jest.fn(),
  getCustomProviderSecret: jest.fn(() => ""),
  setCustomProviderEnabled: jest.fn(),
}));

jest.mock("../../../../SERVICEs/api", () => ({
  __esModule: true,
  api: { unchain: {} },
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

// Render the real Modal (portal) but with a trivial Input so we can drive values.
jest.mock("../../../../BUILTIN_COMPONENTs/input/input", () => ({
  __esModule: true,
  Input: ({ value, set_value = () => {}, placeholder, disabled }) => (
    <input
      disabled={disabled}
      placeholder={placeholder}
      value={value || ""}
      onChange={(e) => set_value(e.target.value)}
    />
  ),
}));

const renderEditor = (props = {}) =>
  render(
    <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
      <LocaleContext.Provider value={{ locale: "en", setLocale: jest.fn() }}>
        <CustomProviderEditor
          open
          slug={props.slug ?? null}
          onClose={props.onClose || jest.fn()}
          onSaved={props.onSaved || jest.fn()}
        />
      </LocaleContext.Provider>
    </ConfigContext.Provider>,
  );

/** Fill the minimal required fields (id, display name, base url, one model id). */
const fillRequired = () => {
  fireEvent.change(screen.getByPlaceholderText("e.g. sap-hyperspace"), {
    target: { value: "myprov" },
  });
  fireEvent.change(
    screen.getByPlaceholderText("e.g. SAP Hyperspace (local proxy)"),
    { target: { value: "My Provider" } },
  );
  fireEvent.change(
    screen.getByPlaceholderText("http://localhost:6655/anthropic"),
    { target: { value: "http://localhost:6655/anthropic" } },
  );
  fireEvent.change(
    screen.getByPlaceholderText("Model ID (e.g. claude-4.5-haiku)"),
    { target: { value: "model-a" } },
  );
};

describe("CustomProviderEditor gating", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findCustomProvider.mockReturnValue(null);
    getCustomProviderSecret.mockReturnValue("");
  });

  test("Save is disabled until required fields are present", () => {
    renderEditor();
    const save = screen.getByRole("button", { name: "Save" });
    expect(save.disabled).toBe(true);
    fillRequired();
    expect(screen.getByRole("button", { name: "Save" }).disabled).toBe(false);
  });

  test("Test connection is disabled when the facade is unavailable", () => {
    renderEditor();
    fillRequired();
    const test = screen.getByRole("button", { name: "Test connection" });
    expect(test.disabled).toBe(true);
  });
});

describe("CustomProviderEditor diagnostics", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findCustomProvider.mockReturnValue(null);
    getCustomProviderSecret.mockReturnValue("");
  });

  test("failed normalize renders diagnostics and does not persist", () => {
    normalizeCustomProvider.mockReturnValue({
      ok: false,
      diagnostics: [
        {
          code: "invalid_base_url",
          path: "provider.base_url",
          message: "base_url must start with http(s)://",
          severity: "error",
        },
      ],
    });
    renderEditor();
    fillRequired();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(addCustomProvider).not.toHaveBeenCalled();
    expect(
      screen.getByText(/base_url must start with http/i),
    ).toBeTruthy();
    expect(screen.getByText(/invalid_base_url/)).toBeTruthy();
  });
});

describe("CustomProviderEditor save + auto-enable", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findCustomProvider.mockReturnValue(null);
    getCustomProviderSecret.mockReturnValue("");
  });

  test("saving with a required key stores secret and auto-enables (§8.3)", () => {
    normalizeCustomProvider.mockReturnValue({
      ok: true,
      diagnostics: [],
      provider: {
        id: "myprov",
        display_name: "My Provider",
        protocol: "anthropic",
        base_url: "http://localhost:6655/anthropic",
        auth: { mode: "x-api-key" },
        models: [{ id: "model-a" }],
      },
    });
    const onSaved = jest.fn();
    const onClose = jest.fn();
    renderEditor({ onSaved, onClose });
    fillRequired();
    // Enter a key (default protocol anthropic -> auth x-api-key -> requiresKey)
    fireEvent.change(
      screen.getByPlaceholderText("Enter your API key"),
      { target: { value: "hs-secret" } },
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(addCustomProvider).toHaveBeenCalledTimes(1);
    expect(setCustomProviderSecret).toHaveBeenCalledWith("myprov", "hs-secret");
    expect(setCustomProviderEnabled).toHaveBeenCalledWith("myprov", true);
    expect(toast.success).toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledWith("myprov");
    expect(onClose).toHaveBeenCalled();
  });

  test("saving without a key does NOT auto-enable a key-requiring provider", () => {
    normalizeCustomProvider.mockReturnValue({
      ok: true,
      diagnostics: [],
      provider: {
        id: "myprov",
        display_name: "My Provider",
        protocol: "anthropic",
        base_url: "http://localhost:6655/anthropic",
        auth: { mode: "x-api-key" },
        models: [{ id: "model-a" }],
      },
    });
    renderEditor();
    fillRequired();
    // no key entered
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(addCustomProvider).toHaveBeenCalledTimes(1);
    // empty secret is written through (clears any stale value) but NOT enabled
    expect(setCustomProviderSecret).toHaveBeenCalledWith("myprov", "");
    expect(setCustomProviderEnabled).not.toHaveBeenCalled();
  });

  test("edit mode calls updateCustomProvider against the addressed slug", () => {
    findCustomProvider.mockReturnValue({
      id: "existing",
      display_name: "Existing",
      protocol: "ollama",
      base_url: "http://localhost:11434",
      auth: { mode: "none" },
      models: [{ id: "m1" }],
    });
    normalizeCustomProvider.mockReturnValue({
      ok: true,
      diagnostics: [],
      provider: {
        id: "existing",
        display_name: "Existing",
        protocol: "ollama",
        base_url: "http://localhost:11434",
        auth: { mode: "none" },
        models: [{ id: "m1" }],
      },
    });
    renderEditor({ slug: "existing" });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(updateCustomProvider).toHaveBeenCalledWith(
      "existing",
      expect.objectContaining({ id: "existing" }),
    );
    // auth.mode none -> auto-enable on save
    expect(setCustomProviderEnabled).toHaveBeenCalledWith("existing", true);
  });
});

describe("CustomProviderEditor test connection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findCustomProvider.mockReturnValue(null);
    getCustomProviderSecret.mockReturnValue("");
    api.unchain.testCustomProvider = jest.fn();
  });
  afterEach(() => {
    delete api.unchain.testCustomProvider;
  });

  test("test connection calls the facade with normalized definition + key", async () => {
    normalizeCustomProvider.mockReturnValue({
      ok: true,
      diagnostics: [],
      provider: {
        id: "myprov",
        display_name: "My Provider",
        protocol: "anthropic",
        base_url: "http://localhost:6655/anthropic",
        auth: { mode: "x-api-key" },
        models: [{ id: "model-a" }],
      },
    });
    api.unchain.testCustomProvider.mockResolvedValue({ ok: true, latency_ms: 42 });

    renderEditor();
    fillRequired();
    fireEvent.change(screen.getByPlaceholderText("Enter your API key"), {
      target: { value: "hs-secret" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    });

    expect(api.unchain.testCustomProvider).toHaveBeenCalledWith(
      expect.objectContaining({ id: "myprov" }),
      "hs-secret",
    );
    expect(screen.getByText(/Connected \(42 ms\)/)).toBeTruthy();
  });
});
