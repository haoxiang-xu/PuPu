/**
 * C4 regression guard — the editor's form round-trip must preserve
 * default_model / description / metadata across defToForm -> formToRaw ->
 * normalizeCustomProvider (the schema-authoritative validator).
 *
 * This uses the REAL custom_provider_store (no mock) so it exercises the true
 * contract: a preset-imported provider that goes through the editor and back
 * out must keep the fields that have no dedicated text UI. Regressing any of
 * the three (form field carry, formToRaw emit, or normalize whitelist) fails
 * here.
 */
import { defToForm, formToRaw } from "./custom_provider_editor";
import { normalizeCustomProvider } from "../../../../SERVICEs/custom_provider_store";

/** Shape of a stored provider as read back from the store (post-normalize). */
const presetDef = {
  config_version: 1,
  id: "sap-hyperspace",
  display_name: "SAP Hyperspace (local proxy)",
  description: "SAP internal LLM proxy via local hai CLI",
  protocol: "anthropic",
  base_url: "http://localhost:6655/anthropic",
  auth: {
    mode: "x-api-key",
    key_label: "Hyperspace API Key (x-api-key)",
    key_hint: "Run `hai proxy start` first.",
  },
  timeout_seconds: 600,
  default_model: "anthropic--claude-4.5-haiku",
  models: [
    {
      id: "anthropic--claude-4.5-haiku",
      display_name: "Claude 4.5 Haiku",
      capabilities: { supports_tools: true, supports_vision: true },
    },
    {
      id: "anthropic--claude-4.5-sonnet",
      display_name: "Claude 4.5 Sonnet",
      capabilities: { supports_tools: true, supports_reasoning: true },
    },
  ],
  metadata: { revision: 3 },
  notes: "Run `hai proxy start` before use.",
};

describe("editor form round-trip preserves invisible fields (C4)", () => {
  test("defToForm carries default_model / description / metadata", () => {
    const form = defToForm(presetDef);
    expect(form.default_model).toBe("anthropic--claude-4.5-haiku");
    expect(form.description).toBe("SAP internal LLM proxy via local hai CLI");
    expect(form.metadata).toEqual({ revision: 3 });
  });

  test("formToRaw re-emits default_model / description / metadata", () => {
    const raw = formToRaw(defToForm(presetDef));
    expect(raw.default_model).toBe("anthropic--claude-4.5-haiku");
    expect(raw.description).toBe("SAP internal LLM proxy via local hai CLI");
    expect(raw.metadata).toEqual({ revision: 3 });
  });

  test("full round-trip through the real normalizer keeps all three", () => {
    const raw = formToRaw(defToForm(presetDef));
    const result = normalizeCustomProvider(raw);
    expect(result.ok).toBe(true);
    expect(result.provider.default_model).toBe("anthropic--claude-4.5-haiku");
    expect(result.provider.description).toBe(
      "SAP internal LLM proxy via local hai CLI",
    );
    expect(result.provider.metadata).toEqual({ revision: 3 });
  });

  test("editing an unrelated field (timeout) still preserves the three fields", () => {
    const form = defToForm(presetDef);
    form.timeout_seconds = "300"; // simulate the user changing the timeout
    const result = normalizeCustomProvider(formToRaw(form));
    expect(result.ok).toBe(true);
    expect(result.provider.timeout_seconds).toBe(300);
    expect(result.provider.default_model).toBe("anthropic--claude-4.5-haiku");
    expect(result.provider.description).toBe(
      "SAP internal LLM proxy via local hai CLI",
    );
    expect(result.provider.metadata).toEqual({ revision: 3 });
  });

  test("a provider with no default_model / description / metadata round-trips cleanly", () => {
    const minimal = {
      config_version: 1,
      id: "minimal",
      display_name: "Minimal",
      protocol: "ollama",
      base_url: "http://localhost:11434",
      auth: { mode: "none" },
      models: [{ id: "m1" }],
    };
    const result = normalizeCustomProvider(formToRaw(defToForm(minimal)));
    expect(result.ok).toBe(true);
    expect(result.provider.default_model).toBeUndefined();
    expect(result.provider.description).toBeUndefined();
    expect(result.provider.metadata).toBeUndefined();
  });

  test("changing the default model's id text follows it (default_model stays valid)", () => {
    const form = defToForm(presetDef);
    // Rename the default model row's id; the editor keeps default_model pinned.
    const defaultRow = form.models.find(
      (m) => m.id === "anthropic--claude-4.5-haiku",
    );
    // Emulate setModelField("id") default-follow behavior at the form level:
    const newId = "anthropic--claude-4.5-haiku-v2";
    form.models = form.models.map((m) =>
      m.rowId === defaultRow.rowId ? { ...m, id: newId } : m,
    );
    form.default_model = newId; // editor updates this in lockstep
    const result = normalizeCustomProvider(formToRaw(form));
    expect(result.ok).toBe(true);
    expect(result.provider.default_model).toBe(newId);
  });
});
