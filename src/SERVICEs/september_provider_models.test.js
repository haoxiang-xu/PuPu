import {
  buildProviderInjectionPayload,
  resolveShippedDefinition,
} from "./custom_provider_store";
import injection from "./__fixtures__/deepseek_flash_injection.json";

test("DeepSeek's real frontend producer matches the backend consumer fixture", () => {
  const definition = resolveShippedDefinition("deepseek");
  expect(definition.default_model).toBe("deepseek-v4-flash");
  expect(definition.models.map((model) => model.id)).toEqual([
    "deepseek-flash", "deepseek-v4-pro", "deepseek-v4-flash",
  ]);
  expect(buildProviderInjectionPayload(definition)).toEqual(injection);
});
