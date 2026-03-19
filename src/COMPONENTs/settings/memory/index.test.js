import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { MemorySettings } from "./index";
import useOllamaEmbeddingModels from "./use_ollama_embedding_models";
import useOpenAIEmbeddingModels from "./use_openai_embedding_models";

jest.mock("./use_ollama_embedding_models");
jest.mock("./use_openai_embedding_models");
jest.mock("../../../BUILTIN_COMPONENTs/icon/icon", () => ({
  __esModule: true,
  default: ({ src = "icon" }) => <span data-testid={`icon-${src}`} />,
}));
jest.mock("../../../BUILTIN_COMPONENTs/select/select", () => {
  const MockSelect = ({
    options = [],
    value = "",
    set_value = () => {},
    placeholder = "select",
  }) => (
    <select
      data-testid="mock-select"
      value={value || ""}
      onChange={(event) => set_value(event.target.value)}
      aria-label={placeholder}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label || option.value}
        </option>
      ))}
    </select>
  );

  return {
    __esModule: true,
    default: MockSelect,
    Select: MockSelect,
  };
});

const renderMemorySettings = () =>
  render(
    <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
      <MemorySettings />
    </ConfigContext.Provider>,
  );

const setMemorySettings = (memorySettings) => {
  window.localStorage.setItem(
    "settings",
    JSON.stringify({
      memory: memorySettings,
    }),
  );
};

describe("MemorySettings OpenAI embedding selector", () => {
  beforeEach(() => {
    window.localStorage.clear();

    useOllamaEmbeddingModels.mockReturnValue({
      models: [],
      loading: false,
      error: null,
    });

    useOpenAIEmbeddingModels.mockReturnValue({
      models: ["text-embedding-3-large", "text-embedding-3-small"],
      loading: false,
      error: null,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("renders OpenAI model selector with backend catalog options", () => {
    setMemorySettings({
      embedding_provider: "openai",
      openai_embedding_model: "text-embedding-3-small",
    });

    renderMemorySettings();

    const select = screen.getByTestId("mock-select");
    const optionValues = within(select)
      .getAllByRole("option")
      .map((option) => option.value);

    expect(optionValues).toEqual([
      "text-embedding-3-large",
      "text-embedding-3-small",
    ]);
    expect(screen.queryByPlaceholderText("text-embedding-3-small")).toBeNull();
  });

  test("falls back invalid saved OpenAI model to text-embedding-3-small", async () => {
    setMemorySettings({
      embedding_provider: "openai",
      openai_embedding_model: "legacy-invalid-model",
    });

    renderMemorySettings();

    await waitFor(() => {
      const root = JSON.parse(window.localStorage.getItem("settings") || "{}");
      expect(root.memory?.openai_embedding_model).toBe("text-embedding-3-small");
    });
    expect(screen.getByTestId("mock-select")).toHaveValue(
      "text-embedding-3-small",
    );
  });

  test("shows loading state while OpenAI embedding models are loading", () => {
    useOpenAIEmbeddingModels.mockReturnValue({
      models: [],
      loading: true,
      error: null,
    });
    setMemorySettings({
      embedding_provider: "openai",
    });

    renderMemorySettings();
    expect(screen.getByText("Loading models…")).toBeInTheDocument();
  });

  test("shows error state when OpenAI embedding models fail to load", () => {
    useOpenAIEmbeddingModels.mockReturnValue({
      models: [],
      loading: false,
      error: "boom",
    });
    setMemorySettings({
      embedding_provider: "openai",
    });

    renderMemorySettings();
    expect(
      screen.getByText("Could not load OpenAI embedding models."),
    ).toBeInTheDocument();
  });

  test("shows empty state when OpenAI embedding model catalog is empty", () => {
    useOpenAIEmbeddingModels.mockReturnValue({
      models: [],
      loading: false,
      error: null,
    });
    setMemorySettings({
      embedding_provider: "openai",
    });

    renderMemorySettings();
    expect(screen.getByText("No embedding models available.")).toBeInTheDocument();
  });

  test("renders persisted recall top-k and threshold settings", () => {
    setMemorySettings({
      vector_top_k: 6,
      vector_min_score: 0.45,
      long_term_top_k: 5,
      long_term_min_score: 0.65,
    });

    renderMemorySettings();

    expect(screen.getByText("Recall top K — 6")).toBeInTheDocument();
    expect(screen.getByText("Recall threshold — 0.45")).toBeInTheDocument();
    expect(screen.getByText("Long-term top K — 5")).toBeInTheDocument();
    expect(screen.getByText("Long-term threshold — 0.65")).toBeInTheDocument();
  });
});
