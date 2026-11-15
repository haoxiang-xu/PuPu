import { normalizeModelCatalog } from "./api.shared";
import fixture from "./__fixtures__/ticket_387_catalog.json";
import { readReasoningEffortPref, writeReasoningEffortPref } from "./reasoning_effort_prefs";

test.each(Object.entries(fixture))("%s reaches the existing model and effort controls", (modelId, entry) => {
  const normalized = normalizeModelCatalog(entry.catalog);
  const [provider, model] = modelId.split(":");
  expect(normalized.activeModel).toBe(modelId);
  expect(normalized.providers[provider]).toEqual([model]);
  const cap = normalized.modelCapabilities[modelId];
  expect(normalized.activeCapabilities).toEqual(cap);
  expect(cap.reasoning_efforts).toEqual(entry.catalog.model_capabilities[modelId].reasoning_efforts);
  expect(cap.default_reasoning_effort).toBe(entry.catalog.model_capabilities[modelId].default_reasoning_effort);
  expect(cap.computer_use.supported).toBe(false);
  expect(cap.max_context_window_tokens).toBe(provider === "openai" ? 1050000 : 1000000);
  const wireKey = provider === "openai" ? "reasoning" : "output_config";
  for (const effort of cap.reasoning_efforts) {
    expect(entry.payloads[effort]).toEqual({ [wireKey]: { effort } });
  }
});

test("an older runtime cannot invent new catalog entries", () => {
  const old = normalizeModelCatalog({ providers: { openai: ["gpt-6-sol"], anthropic: ["claude-sonnet-5"] } });
  for (const modelId of Object.keys(fixture)) {
    const [provider, model] = modelId.split(":");
    expect(old.providers[provider]).not.toContain(model);
    expect(old.modelCapabilities).not.toHaveProperty(modelId);
  }
});

test("saved old-model effort choices remain independent of the refreshed models", () => {
  window.localStorage.clear();
  writeReasoningEffortPref("openai:gpt-6-sol", "high");
  writeReasoningEffortPref("anthropic:claude-sonnet-5", "max");
  for (const modelId of Object.keys(fixture)) {
    expect(readReasoningEffortPref(modelId)).toBeNull();
    writeReasoningEffortPref(modelId, "low");
  }
  expect(readReasoningEffortPref("openai:gpt-6-sol")).toBe("high");
  expect(readReasoningEffortPref("anthropic:claude-sonnet-5")).toBe("max");
});
