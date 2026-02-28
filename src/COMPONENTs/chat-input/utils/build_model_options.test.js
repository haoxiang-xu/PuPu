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
});
