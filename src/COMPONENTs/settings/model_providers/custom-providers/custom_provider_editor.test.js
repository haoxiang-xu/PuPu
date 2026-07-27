import React from "react";
import {
  fireEvent,
  render,
  screen,
  act,
  waitFor,
} from "@testing-library/react";
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
  setCustomProviderSecret: jest.fn(() =>
    Promise.resolve({ ok: true, status: "stored" }),
  ),
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

// Render the real Modal (portal) but with a trivial Input so we can drive
// values. input_ref is forwarded so the C12 auto-focus path can be asserted.
jest.mock("../../../../BUILTIN_COMPONENTs/input/input", () => ({
  __esModule: true,
  Input: ({ value, set_value = () => {}, placeholder, disabled, input_ref }) => (
    <input
      ref={input_ref}
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
          autoFocusKey={props.autoFocusKey ?? false}
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

const durableDefinition = (definition = {}, persistence = Promise.resolve()) => {
  const result = { ...definition };
  Object.defineProperty(result, "persistence", {
    value: persistence,
    enumerable: false,
  });
  return result;
};

beforeEach(() => {
  setCustomProviderSecret.mockResolvedValue({ ok: true, status: "stored" });
  addCustomProvider.mockImplementation((definition) =>
    durableDefinition(definition),
  );
  updateCustomProvider.mockImplementation((_slug, definition) =>
    durableDefinition(definition),
  );
  setCustomProviderEnabled.mockImplementation((slug, enabled) =>
    durableDefinition({ id: slug, enabled }),
  );
});

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
    setCustomProviderSecret.mockResolvedValue({ ok: true, status: "stored" });
    findCustomProvider.mockReturnValue(null);
    getCustomProviderSecret.mockReturnValue("");
  });

  test("saving with a required key stores secret and auto-enables (§8.3)", async () => {
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

    await waitFor(() => expect(addCustomProvider).toHaveBeenCalledTimes(1));
    expect(setCustomProviderSecret).toHaveBeenCalledWith("myprov", "hs-secret");
    expect(setCustomProviderEnabled).toHaveBeenCalledWith("myprov", true);
    expect(toast.success).toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledWith("myprov");
    expect(onClose).toHaveBeenCalled();
  });

  test("saving without a key does NOT auto-enable a key-requiring provider", async () => {
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

    await waitFor(() => expect(addCustomProvider).toHaveBeenCalledTimes(1));
    // empty secret is written through (clears any stale value) but NOT enabled
    expect(setCustomProviderSecret).toHaveBeenCalledWith("myprov", "");
    expect(setCustomProviderEnabled).toHaveBeenCalledWith("myprov", false);
  });

  test("edit mode calls updateCustomProvider against the addressed slug", async () => {
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

    await waitFor(() =>
      expect(updateCustomProvider).toHaveBeenCalledWith(
        "existing",
        expect.objectContaining({ id: "existing" }),
      ),
    );
    // auth.mode none -> auto-enable on save
    expect(setCustomProviderEnabled).toHaveBeenCalledWith("existing", true);
  });

  test("waits for the disabled definition ack before writing the credential", async () => {
    let resolveDefinition;
    const definitionAck = new Promise((resolve) => {
      resolveDefinition = resolve;
    });
    addCustomProvider.mockImplementation((definition) =>
      durableDefinition(definition, definitionAck),
    );
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
    fireEvent.change(screen.getByPlaceholderText("Enter your API key"), {
      target: { value: "hs-secret" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(addCustomProvider).toHaveBeenCalledTimes(1));
    expect(addCustomProvider).toHaveBeenCalledWith(
      expect.objectContaining({ id: "myprov", enabled: false }),
    );
    expect(setCustomProviderSecret).not.toHaveBeenCalled();

    await act(async () => resolveDefinition());
    await waitFor(() =>
      expect(setCustomProviderSecret).toHaveBeenCalledWith(
        "myprov",
        "hs-secret",
      ),
    );
  });

  test("an async definition rejection never writes the new credential", async () => {
    const error = Object.assign(new Error("definition IPC rejected"), {
      code: "storage_io_error",
    });
    addCustomProvider.mockImplementation((definition) =>
      durableDefinition(definition, Promise.reject(error)),
    );
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
    fireEvent.change(screen.getByPlaceholderText("Enter your API key"), {
      target: { value: "hs-new-key" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText(/definition IPC rejected/i)).toBeTruthy();
    expect(setCustomProviderSecret).not.toHaveBeenCalled();
    expect(setCustomProviderEnabled).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
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

    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));

    expect(api.unchain.testCustomProvider).toHaveBeenCalledWith(
      expect.objectContaining({ id: "myprov" }),
      "hs-secret",
    );
    expect(await screen.findByText(/Connected \(42 ms\)/)).toBeTruthy();
  });

  test("Test connection button is enabled once the facade exists and fields are valid (S4b)", () => {
    normalizeCustomProvider.mockReturnValue({
      ok: true,
      diagnostics: [],
      provider: { id: "myprov" },
    });
    renderEditor();
    fillRequired();
    expect(
      screen.getByRole("button", { name: "Test connection" }).disabled,
    ).toBe(false);
  });

  test("renders the nested {ok:false, error:{code}} failure shape", async () => {
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
    api.unchain.testCustomProvider.mockResolvedValue({
      ok: false,
      error: { code: "provider_auth_failed", message: "401" },
    });
    renderEditor();
    fillRequired();
    fireEvent.change(screen.getByPlaceholderText("Enter your API key"), {
      target: { value: "bad-key" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    expect(await screen.findByText(/provider_auth_failed/)).toBeTruthy();
  });
});

/**
 * C4: a preset-imported provider carries default_model / description /
 * metadata.revision. Opening it in the editor and pressing Save must NOT drop
 * any of them — the wholesale updateCustomProvider replace only survives
 * because the form re-emits these fields.
 */
describe("CustomProviderEditor field round-trip (C4)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setCustomProviderSecret.mockResolvedValue({ ok: true, status: "stored" });
    getCustomProviderSecret.mockReturnValue("");
    // Pass-through normalize: echo the raw the editor built so we can assert the
    // form re-emitted the previously-invisible fields.
    normalizeCustomProvider.mockImplementation((raw) => ({
      ok: true,
      diagnostics: [],
      provider: { config_version: 1, ...raw },
    }));
  });

  const presetDef = {
    id: "sap-hyperspace",
    display_name: "SAP Hyperspace (local proxy)",
    description: "SAP internal LLM proxy",
    protocol: "anthropic",
    base_url: "http://localhost:6655/anthropic",
    auth: { mode: "x-api-key" },
    timeout_seconds: 600,
    default_model: "anthropic--claude-4.5-haiku",
    models: [
      { id: "anthropic--claude-4.5-haiku", display_name: "Claude 4.5 Haiku" },
      { id: "anthropic--claude-4.5-sonnet", display_name: "Claude 4.5 Sonnet" },
    ],
    metadata: { revision: 1 },
  };

  test("Save preserves default_model, description and metadata.revision", async () => {
    findCustomProvider.mockReturnValue(presetDef);

    renderEditor({ slug: "sap-hyperspace" });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateCustomProvider).toHaveBeenCalledTimes(1),
    );
    const [, savedProvider] = updateCustomProvider.mock.calls[0];
    expect(savedProvider.default_model).toBe("anthropic--claude-4.5-haiku");
    expect(savedProvider.description).toBe("SAP internal LLM proxy");
    expect(savedProvider.metadata).toEqual({ revision: 1 });
  });

  test("the default model row shows the 'Default' state and others show 'Set default'", () => {
    findCustomProvider.mockReturnValue(presetDef);
    renderEditor({ slug: "sap-hyperspace" });
    // The default model (row 1) renders the "Default" pill; the other renders
    // "Set default".
    expect(screen.getByText("Default")).toBeTruthy();
    expect(screen.getByText("Set default")).toBeTruthy();
  });

  test("re-selecting a different default model updates default_model on Save", async () => {
    findCustomProvider.mockReturnValue(presetDef);
    renderEditor({ slug: "sap-hyperspace" });

    // Click the "Set default" pill on the second model row.
    fireEvent.click(screen.getByText("Set default"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateCustomProvider).toHaveBeenCalledTimes(1),
    );
    const [, savedProvider] = updateCustomProvider.mock.calls[0];
    expect(savedProvider.default_model).toBe("anthropic--claude-4.5-sonnet");
  });
});

/**
 * C3 companion UX: the editor greys out "Add header" at the schema's
 * maxProperties: 10 cap. This is a soft signal only — validation stays in the
 * store. (Starts at 1 blank row, so 9 clicks reach the cap.)
 */
describe("CustomProviderEditor extra-header cap (C3 UX)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findCustomProvider.mockReturnValue(null);
    getCustomProviderSecret.mockReturnValue("");
  });

  test("Add header disables at 10 header rows", () => {
    renderEditor();
    const addBtn = () => screen.getByRole("button", { name: "Add header" });
    expect(addBtn().disabled).toBe(false);
    for (let i = 0; i < 9; i += 1) {
      fireEvent.click(addBtn());
    }
    // 10 rows now -> add is disabled.
    expect(addBtn().disabled).toBe(true);
    // Clicking again does not exceed the cap.
    fireEvent.click(addBtn());
    expect(addBtn().disabled).toBe(true);
  });
});

/**
 * C12: importing a provider that needs a key opens the editor with
 * autoFocusKey -> the API-key input receives focus (and is scrolled into view).
 */
describe("CustomProviderEditor autoFocusKey (C12)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getCustomProviderSecret.mockReturnValue("");
    findCustomProvider.mockReturnValue({
      id: "sap-hyperspace",
      display_name: "SAP Hyperspace",
      protocol: "anthropic",
      base_url: "http://localhost:6655/anthropic",
      auth: { mode: "x-api-key", key_label: "Hyperspace API Key" },
      models: [{ id: "model-a" }],
    });
  });

  test("focuses the API-key input when autoFocusKey is set", () => {
    // The ref-callback focuses the input when its DOM node mounts, so no fake
    // timers / rAF are needed — focus lands during the render commit.
    renderEditor({ slug: "sap-hyperspace", autoFocusKey: true });
    const keyInput = screen.getByPlaceholderText("Enter your API key");
    expect(keyInput).toHaveFocus();
  });

  test("does NOT auto-focus when autoFocusKey is false", () => {
    renderEditor({ slug: "sap-hyperspace" });
    const keyInput = screen.getByPlaceholderText("Enter your API key");
    expect(keyInput).not.toHaveFocus();
  });
});
