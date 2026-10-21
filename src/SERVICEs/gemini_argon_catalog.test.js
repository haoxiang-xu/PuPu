import { normalizeModelCatalog } from "./api.shared";
import fixture from "./__fixtures__/gemini_argon_catalog.json";

test("the real Argon host catalog reaches the existing model and effort controls", () => {
  const normalized = normalizeModelCatalog(fixture.catalog);
  const modelId = "gemini:gemini-4-argon";
  expect(normalized.activeModel).toBe(modelId);
  expect(normalized.providers.gemini).toEqual(["gemini-4-argon"]);
  const capabilities = normalized.modelCapabilities[modelId];
  expect(normalized.activeCapabilities).toEqual(capabilities);
  expect(capabilities.reasoning_efforts).toEqual(["low", "medium", "high"]);
  expect(capabilities.default_reasoning_effort).toBe("medium");
  expect(capabilities.max_context_window_tokens).toBe(1048576);
  expect(capabilities.input_modalities).toEqual(["text", "image", "pdf"]);
  expect(capabilities.input_source_types).toEqual({ image: ["url", "base64"], pdf: ["url", "base64"] });
  for (const effort of capabilities.reasoning_efforts) {
    expect(fixture.payloads[effort]).toEqual({
      thinking_config: { thinking_level: effort, include_thoughts: true },
    });
  }
});

test("an older runtime catalog cannot invent an Argon model or capability entry", () => {
  const normalized = normalizeModelCatalog({ providers: { gemini: ["gemini-3.6-flash"] } });
  expect(normalized.providers.gemini).not.toContain("gemini-4-argon");
  expect(normalized.modelCapabilities).not.toHaveProperty("gemini:gemini-4-argon");
});
