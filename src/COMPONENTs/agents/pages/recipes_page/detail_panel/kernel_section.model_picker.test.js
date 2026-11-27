import React, { useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import KernelSection from "./kernel_section";
import { kernel_profiles } from "../skeleton_resources";
import { isFeatureFlagEnabled } from "../../../../../SERVICEs/feature_flags";
import { emitModelCatalogRefresh } from "../../../../../SERVICEs/model_catalog_refresh";
import { providerSecretConfigured } from "../../../../../SERVICEs/provider_secret_status";

jest.mock("../skeleton_resources", () => ({ kernel_profiles: jest.fn(), is_unavailable: () => false }));
jest.mock("../../../../../SERVICEs/feature_flags", () => ({
  ...jest.requireActual("../../../../../SERVICEs/feature_flags"),
  isFeatureFlagEnabled: jest.fn(() => false),
}));
jest.mock("../../../../../SERVICEs/provider_secret_status", () => ({
  providerSecretConfigured: jest.fn(),
}));
jest.mock("../../../../../SERVICEs/custom_provider_store", () => {
  const actual = jest.requireActual("../../../../../SERVICEs/custom_provider_store");
  return {
    ...actual,
    readRuntimeProviderDefinitions: (options) => [
      ...actual.readRuntimeProviderDefinitions(options),
      ...(options.includeUserAuthored ? [{ id: "team", enabled: true, auth: { mode: "none" }, models: [] }] : []),
    ],
  };
});

beforeEach(() => {
  providerSecretConfigured.mockImplementation((id) =>
    ["openai", "anthropic", "custom.deepseek", "custom.kimi"].includes(id));
});

const profile = {
  id: "pinned-openai-profile", provider: "openai", model: "Research",
  protocol: "openai-responses", endpoint: "http://127.0.0.1:1", credential_ref: "offline",
  context_window: 32000, output_limit: 4096,
  capabilities: { json_schema: true, images: false, files: false },
};
const other = { ...profile, id: "pinned-anthropic-profile", provider: "anthropic", protocol: "anthropic", model: "Review" };
const seed = { id: "picker", kind: "agent", nodes: [{ id: "agent", type: "agent", config: {
  execution: { inputs: [], outputs: [] },
  kernel: { schema_version: 1, profile, prompt: "Keep these instructions", max_iterations: 12, output_tokens: 1024, history: "root", overflow: "error", json_schema: null },
} }], edges: [] };

async function show(profiles = [profile, other], stored = profile) {
  const changed = jest.fn();
  kernel_profiles.mockResolvedValue({ ok: true, data: { profiles, unavailable: [] } });
  function Editor() {
    const [document, setDocument] = useState({
      ...seed, nodes: [{ ...seed.nodes[0], config: {
        ...seed.nodes[0].config, kernel: { ...seed.nodes[0].config.kernel, profile: stored },
      } }],
    });
    return <ConfigContext.Provider value={{ theme: {}, onThemeMode: "dark_mode" }}>
      <KernelSection document={document} node={document.nodes[0]} isDark onChange={(next) => { changed(next); setDocument(next); }} />
    </ConfigContext.Provider>;
  }
  render(<Editor />);
  await act(async () => { await Promise.resolve(); });
  return { changed, picker: within(screen.getByTestId("kernel-model")).getByRole("combobox") };
}

test("the model trigger uses the Attach Panel pill rather than the generic field", async () => {
  const { picker, changed } = await show();
  expect(picker).toHaveStyle({ height: "32px", borderRadius: "16px", width: "100%", maxWidth: "100%" });
  expect(picker).toHaveTextContent("Research");
  expect(picker).not.toHaveTextContent("openai ·");
  expect(changed).not.toHaveBeenCalled();
});

test("provider rail navigation is read-only, and selecting keeps the picker open", async () => {
  const { picker, changed } = await show();
  fireEvent.click(picker);
  fireEvent.click(screen.getByTitle("Anthropic"));
  expect(changed).not.toHaveBeenCalled();
  const list = screen.getByRole("listbox", { hidden: true });
  expect(within(list).queryByText("Research")).not.toBeInTheDocument();
  fireEvent.click(within(list).getByText("Review", { exact: true }));
  expect(changed).toHaveBeenCalledTimes(1);
  expect(changed.mock.calls[0][0].nodes[0].config.kernel).toMatchObject({ profile: other, prompt: "Keep these instructions" });
  expect(picker).toHaveAttribute("aria-expanded", "true");
});

test("the shared model search finds another provider without changing the document", async () => {
  const { picker, changed } = await show();
  fireEvent.click(picker);
  fireEvent.change(screen.getByPlaceholderText(/search models/i), { target: { value: "Review" } });
  const list = screen.getByRole("listbox", { hidden: true });
  expect(within(list).getByText("Review", { exact: true })).toBeInTheDocument();
  expect(within(list).queryByText("Research")).not.toBeInTheDocument();
  expect(changed).not.toHaveBeenCalled();
});

const local = { ...profile, id: "ollama:local:latest", provider: "ollama", protocol: "ollama", model: "local:latest" };
const deepseek = { ...other, id: "custom.deepseek:deepseek-v4-flash", provider: "custom.deepseek",
  model: "deepseek-v4-flash", endpoint: "https://api.deepseek.com/anthropic", credential_ref: "custom.deepseek", auth_mode: "x-api-key" };
const kimi = { ...deepseek, id: "custom.kimi:kimi-k3", provider: "custom.kimi", model: "kimi-k3",
  credential_ref: "custom.kimi", auth_mode: "bearer" };
const kimiChina = { ...kimi, id: "custom.kimi-cn:kimi-k3", provider: "custom.kimi-cn",
  credential_ref: "custom.kimi-cn" };
const team = { ...deepseek, id: "custom.team:team-model", provider: "custom.team", model: "team-model", credential_ref: "custom.team", auth_mode: "none" };

test.each([false, true])("shipped and local providers are independent of the authored provider flag (%s)", async (enabled) => {
  isFeatureFlagEnabled.mockReturnValueOnce(enabled);
  const { picker, changed } = await show([profile, local, deepseek, kimi, team]);
  fireEvent.click(picker);
  expect(screen.getByTitle("Ollama")).toBeInTheDocument();
  expect(screen.getByTitle("DeepSeek")).toBeInTheDocument();
  expect(screen.getByTitle("Kimi (Moonshot)")).toBeInTheDocument();
  expect(Boolean(screen.queryByTitle("custom.team (Custom)"))).toBe(enabled);
  fireEvent.click(screen.getByTitle("Kimi (Moonshot)"));
  const list = screen.getByRole("listbox", { hidden: true });
  fireEvent.click(within(list).getByText("Kimi K3", { exact: true }));
  expect(changed).toHaveBeenCalledTimes(1);
  expect(changed.mock.calls[0][0].nodes[0].config.kernel.profile).toEqual(kimi);
});

test("a settings refresh updates choices without rewriting the stored model", async () => {
  const { picker, changed } = await show();
  kernel_profiles.mockResolvedValueOnce({ ok: true, data: { profiles: [profile, local], unavailable: [] } });
  await act(async () => { emitModelCatalogRefresh({ reason: "ollama_install_completed" }); });
  fireEvent.click(picker);
  expect(screen.getByTitle("Ollama")).toBeInTheDocument();
  expect(picker).toHaveTextContent("Research");
  expect(changed).not.toHaveBeenCalled();
});

test("only the configured Kimi site is selectable, even if the other site is saved in the draft", async () => {
  providerSecretConfigured.mockImplementation((id) => ["openai", "custom.kimi-cn"].includes(id));
  const { picker, changed } = await show([profile, other, local, deepseek, kimi, kimiChina], kimi);
  fireEvent.click(picker);
  expect(screen.getByTitle("Kimi (China)")).toBeInTheDocument();
  expect(screen.queryByTitle("Kimi (Moonshot)")).not.toBeInTheDocument();
  expect(screen.queryByTitle("Anthropic")).not.toBeInTheDocument();
  expect(screen.queryByTitle("DeepSeek")).not.toBeInTheDocument();
  expect(screen.getByTitle("Ollama")).toBeInTheDocument();
  expect(screen.getByTestId("kernel-pending-model")).toHaveTextContent("custom.kimi · kimi-k3");
  expect(changed).not.toHaveBeenCalled();
});

test("removing one site key hides only that site while the catalog refresh is pending", async () => {
  providerSecretConfigured.mockImplementation((id) => ["openai", "custom.kimi", "custom.kimi-cn"].includes(id));
  const { picker, changed } = await show([profile, kimi, kimiChina]);
  fireEvent.click(picker);
  expect(screen.getByTitle("Kimi (Moonshot)")).toBeInTheDocument();
  expect(screen.getByTitle("Kimi (China)")).toBeInTheDocument();

  kernel_profiles.mockReturnValueOnce(new Promise(() => {}));
  providerSecretConfigured.mockImplementation((id) => ["openai", "custom.kimi-cn"].includes(id));
  await act(async () => { emitModelCatalogRefresh({ reason: "settings_changed" }); });

  expect(screen.queryByTitle("Kimi (Moonshot)")).not.toBeInTheDocument();
  expect(screen.getByTitle("Kimi (China)")).toBeInTheDocument();
  expect(changed).not.toHaveBeenCalled();
});
