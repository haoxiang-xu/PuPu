import { build_model_options } from "./build_model_options";

describe("build_model_options", () => {
  test("prefers live ollama models over provider catalog", () => {
    const result = build_model_options({
      live_ollama_models: ["llama-live"],
      providers: {
        ollama: ["llama-catalog"],
        openai: ["gpt-4.1"],
        anthropic: ["claude-3.7"],
      },
      collapsed_groups: {},
    });

    expect(result[0].group).toBe("Ollama");
    expect(result[0].options).toEqual([
      {
        value: "ollama:llama-live",
        label: "llama-live",
        trigger_label: "llama-live",
      },
    ]);
  });

  test("maps collapsed group state", () => {
    const result = build_model_options({
      live_ollama_models: [],
      providers: {
        ollama: ["llama3"],
        openai: ["gpt-4.1"],
        anthropic: ["claude-3.7"],
      },
      collapsed_groups: {
        OpenAI: true,
      },
    });

    const openaiGroup = result.find((group) => group.group === "OpenAI");
    const ollamaGroup = result.find((group) => group.group === "Ollama");

    expect(openaiGroup.collapsed).toBe(true);
    expect(ollamaGroup.collapsed).toBe(false);
  });

  test("returns empty array when providers are missing", () => {
    const result = build_model_options({
      live_ollama_models: [],
      providers: null,
      collapsed_groups: {},
    });

    expect(result).toEqual([]);
  });

  describe("custom provider groups", () => {
    const customGroup = (overrides = {}) => ({
      slug: "sap-hyperspace",
      display_name: "SAP Hyperspace",
      default_model: "anthropic--claude-4.5-sonnet",
      models: [
        { id: "anthropic--claude-4.5-haiku", display_name: "Claude 4.5 Haiku" },
        { id: "anthropic--claude-4.5-sonnet", display_name: "Claude 4.5 Sonnet" },
      ],
      ...overrides,
    });

    test("appends a custom group after the built-in groups", () => {
      const result = build_model_options({
        live_ollama_models: [],
        providers: { openai: ["gpt-5"] },
        custom_provider_groups: [customGroup()],
        collapsed_groups: {},
      });

      const custom = result.find((g) => g.is_custom);
      expect(custom).toBeDefined();
      expect(custom.group).toBe("SAP Hyperspace");
      expect(custom.group_key).toBe("custom.sap-hyperspace");
      expect(custom.badge).toBe("Custom");
      // Built-in group comes before the custom group.
      expect(result.indexOf(result.find((g) => g.group === "OpenAI"))).toBeLessThan(
        result.indexOf(custom),
      );
    });

    test("orders default_model first, values are custom.<slug>:<id>", () => {
      const result = build_model_options({
        live_ollama_models: [],
        providers: {},
        custom_provider_groups: [customGroup()],
        collapsed_groups: {},
      });

      const custom = result.find((g) => g.is_custom);
      expect(custom.options[0].value).toBe(
        "custom.sap-hyperspace:anthropic--claude-4.5-sonnet",
      );
      expect(custom.options[1].value).toBe(
        "custom.sap-hyperspace:anthropic--claude-4.5-haiku",
      );
    });

    test("collapse state keyed by full providerKey", () => {
      const result = build_model_options({
        live_ollama_models: [],
        providers: {},
        custom_provider_groups: [customGroup()],
        collapsed_groups: { "custom.sap-hyperspace": true },
      });

      const custom = result.find((g) => g.is_custom);
      expect(custom.collapsed).toBe(true);
    });

    test("skips a custom group with no models", () => {
      const result = build_model_options({
        live_ollama_models: [],
        providers: {},
        custom_provider_groups: [customGroup({ models: [] })],
        collapsed_groups: {},
      });

      expect(result.find((g) => g.is_custom)).toBeUndefined();
    });

    test("no custom_provider_groups leaves output unchanged", () => {
      const result = build_model_options({
        live_ollama_models: [],
        providers: { openai: ["gpt-5"] },
        collapsed_groups: {},
      });

      expect(result.every((g) => !g.is_custom)).toBe(true);
    });
  });
});
