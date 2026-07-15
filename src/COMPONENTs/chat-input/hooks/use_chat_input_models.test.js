import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import api from "../../../SERVICEs/api";
import { useChatInputModels } from "./use_chat_input_models";

jest.mock("../../../SERVICEs/api", () => ({
  __esModule: true,
  default: {
    ollama: {
      listChatModels: jest.fn(),
      listModels: jest.fn(),
    },
  },
}));

jest.mock("../../settings/model_providers/storage", () => ({
  readModelProviders: jest.fn(() => ({
    openai_api_key: "sk-test",
    anthropic_api_key: "sk-ant-test",
  })),
}));

jest.mock("../../../SERVICEs/model_catalog_refresh", () => ({
  subscribeModelCatalogRefresh: jest.fn(() => () => {}),
  emitModelCatalogRefresh: jest.fn(),
}));

const HookHarness = ({ modelCatalog, selectedModelId = "" }) => {
  const { modelOptions } = useChatInputModels({
    model_catalog: modelCatalog,
    selected_model_id: selectedModelId,
  });

  return (
    <pre data-testid="options">{JSON.stringify(modelOptions, null, 2)}</pre>
  );
};

const readOptions = () =>
  JSON.parse(screen.getByTestId("options").textContent || "[]");

describe("useChatInputModels", () => {
  beforeEach(() => {
    api.ollama.listChatModels.mockReset();
    api.ollama.listModels.mockReset();
    const { readModelProviders } = require("../../settings/model_providers/storage");
    readModelProviders.mockReturnValue({
      openai_api_key: "sk-test",
      anthropic_api_key: "sk-ant-test",
    });
  });

  test("uses chat-only live Ollama models for selector options", async () => {
    api.ollama.listChatModels.mockResolvedValue([{ name: "llama3", size: 42 }]);
    api.ollama.listModels.mockResolvedValue([
      { name: "nomic-embed-text", size: 8 },
    ]);

    render(
      <HookHarness
        modelCatalog={{
          providers: {
            ollama: ["catalog-model"],
            openai: [],
            anthropic: [],
          },
        }}
      />,
    );

    await waitFor(() => expect(api.ollama.listChatModels).toHaveBeenCalledTimes(1));
    expect(api.ollama.listModels).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(readOptions()[0].options).toEqual([
        {
          value: "ollama:llama3",
          label: "llama3",
          trigger_label: "llama3",
        },
      ]),
    );
  });

  test("falls back to provider catalog when live chat model fetch fails", async () => {
    api.ollama.listChatModels.mockRejectedValue(new Error("offline"));

    render(
      <HookHarness
        modelCatalog={{
          providers: {
            ollama: ["llama3"],
            openai: ["gpt-4.1"],
            anthropic: [],
          },
        }}
      />,
    );

    await waitFor(() => expect(api.ollama.listChatModels).toHaveBeenCalledTimes(1));
    const options = readOptions();
    const ollamaGroup = options.find((group) => group.group === "Ollama");

    expect(ollamaGroup.options).toEqual([
      {
        value: "ollama:llama3",
        label: "llama3",
        trigger_label: "llama3",
      },
    ]);
    expect(
      ollamaGroup.options.find((option) => option.label === "nomic-embed-text"),
    ).toBeUndefined();
  });

  test("hides OpenAI and Anthropic groups when no API keys are configured", async () => {
    const { readModelProviders } = require("../../settings/model_providers/storage");
    readModelProviders.mockReturnValue({});
    api.ollama.listChatModels.mockResolvedValue([]);

    render(
      <HookHarness
        modelCatalog={{
          providers: {
            ollama: [],
            openai: ["gpt-4o"],
            anthropic: ["claude-3-7-sonnet-latest"],
          },
        }}
      />,
    );

    await waitFor(() => expect(api.ollama.listChatModels).toHaveBeenCalledTimes(1));
    const options = readOptions();
    expect(options.find((g) => g.group === "OpenAI")).toBeUndefined();
    expect(options.find((g) => g.group === "Anthropic")).toBeUndefined();
  });

  test("shows only OpenAI group when only OpenAI key is configured", async () => {
    const { readModelProviders } = require("../../settings/model_providers/storage");
    readModelProviders.mockReturnValue({ openai_api_key: "sk-test" });
    api.ollama.listChatModels.mockResolvedValue([]);

    render(
      <HookHarness
        modelCatalog={{
          providers: {
            ollama: [],
            openai: ["gpt-4o"],
            anthropic: ["claude-3-7-sonnet-latest"],
          },
        }}
      />,
    );

    await waitFor(() => expect(api.ollama.listChatModels).toHaveBeenCalledTimes(1));
    const options = readOptions();
    expect(options.find((g) => g.group === "OpenAI")).toBeDefined();
    expect(options.find((g) => g.group === "Anthropic")).toBeUndefined();
  });

  describe("custom provider gating (through the hook)", () => {
    const {
      addCustomProvider,
      normalizeCustomProvider,
      setCustomProviderEnabled,
      setCustomProviderSecret,
    } = require("../../../SERVICEs/custom_provider_store");

    const seed = ({ enabled = true, withSecret = true } = {}) => {
      const norm = normalizeCustomProvider({
        format: "pupu-model-provider",
        format_version: 1,
        provider: {
          config_version: 1,
          id: "sap-hyperspace",
          display_name: "SAP Hyperspace",
          protocol: "anthropic",
          base_url: "http://localhost:6655/anthropic",
          auth: { mode: "x-api-key" },
          default_model: "anthropic--claude-4.5-haiku",
          models: [{ id: "anthropic--claude-4.5-haiku", display_name: "Haiku" }],
        },
      });
      addCustomProvider(norm.provider);
      if (enabled) {
        setCustomProviderEnabled("sap-hyperspace", true);
      }
      if (withSecret) {
        setCustomProviderSecret("sap-hyperspace", "hs-key");
      }
    };

    beforeEach(() => {
      window.localStorage.clear();
    });

    afterEach(() => {
      window.localStorage.clear();
    });

    test("enabled + keyed custom provider surfaces as a group", async () => {
      seed();
      api.ollama.listChatModels.mockResolvedValue([]);

      render(<HookHarness modelCatalog={{ providers: {} }} />);

      await waitFor(() =>
        expect(api.ollama.listChatModels).toHaveBeenCalledTimes(1),
      );
      const custom = readOptions().find((g) => g.is_custom);
      expect(custom).toBeDefined();
      expect(custom.group_key).toBe("custom.sap-hyperspace");
      expect(custom.options[0].value).toBe(
        "custom.sap-hyperspace:anthropic--claude-4.5-haiku",
      );
    });

    test("enabled provider without a key is gated out", async () => {
      seed({ withSecret: false });
      api.ollama.listChatModels.mockResolvedValue([]);

      render(<HookHarness modelCatalog={{ providers: {} }} />);

      await waitFor(() =>
        expect(api.ollama.listChatModels).toHaveBeenCalledTimes(1),
      );
      expect(readOptions().find((g) => g.is_custom)).toBeUndefined();
    });

    test("disabled provider is gated out even with a key", async () => {
      seed({ enabled: false });
      api.ollama.listChatModels.mockResolvedValue([]);

      render(<HookHarness modelCatalog={{ providers: {} }} />);

      await waitFor(() =>
        expect(api.ollama.listChatModels).toHaveBeenCalledTimes(1),
      );
      expect(readOptions().find((g) => g.is_custom)).toBeUndefined();
    });
  });
});
