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
});
