import React from "react";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import {
  ConfigContext,
  LocaleContext,
} from "../../../../CONTAINERs/config/context";
import PresetProviderSection from "./preset_provider_section";
import {
  findCustomProvider,
  addCustomProvider,
  normalizeCustomProvider,
  setCustomProviderEnabled,
  getCustomProviderSecret,
  setCustomProviderSecret,
  removeCustomProviderSecret,
  hasCustomProviderSecret,
} from "../../../../SERVICEs/custom_provider_store";
import { readPresetEnvelopes } from "../custom-providers/preset_picker";
import { toast } from "../../../../SERVICEs/toast";

jest.mock("../../../../SERVICEs/custom_provider_store", () => ({
  __esModule: true,
  findCustomProvider: jest.fn(() => null),
  addCustomProvider: jest.fn(),
  normalizeCustomProvider: jest.fn(),
  setCustomProviderEnabled: jest.fn(),
  getCustomProviderSecret: jest.fn(() => ""),
  setCustomProviderSecret: jest.fn(),
  removeCustomProviderSecret: jest.fn(),
  hasCustomProviderSecret: jest.fn(() => false),
}));

jest.mock("../custom-providers/preset_picker", () => ({
  __esModule: true,
  readPresetEnvelopes: jest.fn(() => []),
}));

jest.mock("../../../../SERVICEs/toast", () => ({
  __esModule: true,
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock("../../../../BUILTIN_COMPONENTs/icon/icon", () => ({
  __esModule: true,
  default: ({ src = "icon" }) => <span data-testid={`icon-${src}`} />,
}));

/* ── fixtures ──────────────────────────────────────────────────────────── */

const DEEPSEEK_ENVELOPE = {
  format: "pupu-model-provider",
  format_version: 1,
  provider: {
    config_version: 1,
    id: "deepseek",
    display_name: "DeepSeek",
    protocol: "anthropic",
    base_url: "https://api.deepseek.com/anthropic",
    auth: { mode: "x-api-key" },
    models: [{ id: "deepseek-v4-flash" }],
  },
};

const KIMI_ENVELOPE = {
  format: "pupu-model-provider",
  format_version: 1,
  provider: {
    config_version: 1,
    id: "kimi",
    display_name: "Kimi (Moonshot)",
    protocol: "anthropic",
    base_url: "https://api.moonshot.ai/anthropic",
    auth: { mode: "bearer" },
    models: [{ id: "kimi-k3" }],
  },
};

const KIMI_CN_ENVELOPE = {
  format: "pupu-model-provider",
  format_version: 1,
  provider: {
    config_version: 1,
    id: "kimi-cn",
    display_name: "Kimi (China)",
    protocol: "anthropic",
    base_url: "https://api.moonshot.cn/anthropic",
    auth: { mode: "bearer" },
    models: [{ id: "kimi-k3" }],
  },
};

const durable = (value, persistence = Promise.resolve()) => {
  const result = { ...value };
  Object.defineProperty(result, "persistence", {
    value: persistence,
    enumerable: false,
  });
  return result;
};

const renderSection = (props = {}) =>
  render(
    <LocaleContext.Provider value={{ locale: "en", setLocale: jest.fn() }}>
      <ConfigContext.Provider
        value={{ theme: {}, onThemeMode: "light_mode" }}
      >
        <PresetProviderSection
          title={props.title || "DeepSeek"}
          icon={props.icon || "deepseek"}
          slugs={props.slugs || ["deepseek"]}
          placeholder={props.placeholder || "sk-..."}
        />
      </ConfigContext.Provider>
    </LocaleContext.Provider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  readPresetEnvelopes.mockReturnValue([
    DEEPSEEK_ENVELOPE,
    KIMI_ENVELOPE,
    KIMI_CN_ENVELOPE,
  ]);
  findCustomProvider.mockReturnValue(null);
  hasCustomProviderSecret.mockReturnValue(false);
  getCustomProviderSecret.mockReturnValue("");
  normalizeCustomProvider.mockImplementation((raw) => ({
    ok: true,
    diagnostics: [],
    provider: { ...(raw?.provider || raw) },
  }));
  addCustomProvider.mockImplementation((def) => durable(def));
  setCustomProviderEnabled.mockImplementation((slug, enabled) =>
    durable({ id: slug, enabled }),
  );
  setCustomProviderSecret.mockResolvedValue({ ok: true, status: "stored" });
  removeCustomProviderSecret.mockResolvedValue({
    ok: true,
    status: "deleted",
  });
});

/* ── no key -> save: first-time import + enable + secret write ──────────── */

describe("PresetProviderSection — no key, save", () => {
  test("Save is disabled with an empty value", () => {
    renderSection();
    expect(screen.getByRole("button", { name: "Save" }).disabled).toBe(true);
  });

  test("imports the missing definition, writes the secret, then enables the provider", async () => {
    renderSection();

    const input = screen.getByPlaceholderText("sk-...");
    fireEvent.change(input, { target: { value: "ds-secret-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(addCustomProvider).toHaveBeenCalledTimes(1));
    expect(addCustomProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "deepseek",
        enabled: false,
        source: "preset",
      }),
    );
    expect(setCustomProviderSecret).toHaveBeenCalledWith(
      "deepseek",
      "ds-secret-1",
    );
    await waitFor(() =>
      expect(setCustomProviderEnabled).toHaveBeenCalledWith(
        "deepseek",
        true,
      ),
    );
    expect(toast.success).toHaveBeenCalled();
    // masked view takes over once saved
    expect(
      await screen.findByTestId("preset-provider-masked-row"),
    ).toBeInTheDocument();
  });
});

/* ── existing definition must not be overwritten ─────────────────────────── */

describe("PresetProviderSection — existing definition is preserved", () => {
  test("does not re-import when a definition already exists", async () => {
    findCustomProvider.mockReturnValue({
      id: "deepseek",
      enabled: false,
      auth: { mode: "x-api-key" },
    });
    renderSection();

    const input = screen.getByPlaceholderText("sk-...");
    fireEvent.change(input, { target: { value: "ds-secret-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(setCustomProviderSecret).toHaveBeenCalledWith(
        "deepseek",
        "ds-secret-2",
      ),
    );
    expect(addCustomProvider).not.toHaveBeenCalled();
    expect(setCustomProviderEnabled).toHaveBeenCalledWith("deepseek", true);
  });
});

/* ── delete removes only the secret ──────────────────────────────────────── */

describe("PresetProviderSection — delete removes only the key", () => {
  test("removes the secret and disables the provider, definition untouched", async () => {
    hasCustomProviderSecret.mockReturnValue(true);
    getCustomProviderSecret.mockReturnValue("ds-secret-3");
    findCustomProvider.mockReturnValue({ id: "deepseek", enabled: true });

    renderSection();

    expect(
      screen.getByTestId("preset-provider-masked-row"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(removeCustomProviderSecret).toHaveBeenCalledWith("deepseek"),
    );
    expect(addCustomProvider).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(setCustomProviderEnabled).toHaveBeenCalledWith(
        "deepseek",
        false,
      ),
    );
  });
});

/* ── Kimi dual-site switching with independent keys ──────────────────────── */

describe("PresetProviderSection — Kimi dual-site switching", () => {
  test("renders both site pills, and each site has an independent key", async () => {
    hasCustomProviderSecret.mockImplementation((slug) => slug === "kimi");
    getCustomProviderSecret.mockImplementation((slug) =>
      slug === "kimi" ? "kimi-intl-secret" : "",
    );

    renderSection({ title: "Kimi", icon: "kimi", slugs: ["kimi", "kimi-cn"] });

    expect(
      screen.getByTestId("preset-provider-pill-kimi"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("preset-provider-pill-kimi-cn"),
    ).toBeInTheDocument();
    expect(screen.getByText("api.moonshot.ai")).toBeInTheDocument();
    expect(screen.getByText("api.moonshot.cn")).toBeInTheDocument();

    // "kimi" has a key already -> starts masked
    expect(
      screen.getByTestId("preset-provider-masked-row"),
    ).toBeInTheDocument();

    // switch to "kimi-cn" (no key yet) -> editable input, independent of kimi
    fireEvent.click(screen.getByTestId("preset-provider-pill-kimi-cn"));
    const input = screen.getByPlaceholderText("sk-...");
    expect(input.value).toBe("");

    fireEvent.change(input, { target: { value: "kimi-cn-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(setCustomProviderSecret).toHaveBeenCalledWith(
        "kimi-cn",
        "kimi-cn-secret",
      ),
    );
    expect(setCustomProviderSecret).not.toHaveBeenCalledWith(
      "kimi",
      expect.anything(),
    );
  });
});

/* ── initial site selection ──────────────────────────────────────────────── */

describe("PresetProviderSection — initial site selection", () => {
  test("prefers the site that already has a key (kimi-cn) over the first slug", async () => {
    hasCustomProviderSecret.mockImplementation((slug) => slug === "kimi-cn");
    getCustomProviderSecret.mockImplementation((slug) =>
      slug === "kimi-cn" ? "cn-secret" : "",
    );

    renderSection({ title: "Kimi", icon: "kimi", slugs: ["kimi", "kimi-cn"] });

    expect(
      screen.getByTestId("preset-provider-masked-row"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(removeCustomProviderSecret).toHaveBeenCalledWith("kimi-cn"),
    );
  });

  test("falls back to the first slug when neither site has a key", async () => {
    hasCustomProviderSecret.mockReturnValue(false);
    renderSection({ title: "Kimi", icon: "kimi", slugs: ["kimi", "kimi-cn"] });

    const input = screen.getByPlaceholderText("sk-...");
    expect(input.value).toBe("");

    fireEvent.change(input, { target: { value: "first-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(setCustomProviderSecret).toHaveBeenCalledWith(
        "kimi",
        "first-secret",
      ),
    );
  });
});
