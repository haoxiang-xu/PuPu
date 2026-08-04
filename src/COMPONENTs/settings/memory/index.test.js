import React from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigContext, LocaleContext } from "../../../CONTAINERs/config/context";
import { MemorySettings } from "./index";
import { writeFeatureFlags } from "../../../SERVICEs/feature_flags";
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
      <LocaleContext.Provider value={{ locale: "en", setLocale: jest.fn() }}>
        <MemorySettings />
      </LocaleContext.Provider>
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

const setMemoryV2Flag = (enabled, memorySettings = {}) => {
  window.localStorage.setItem(
    "settings",
    JSON.stringify({
      memory: memorySettings,
      feature_flags: { enable_memory_v2: enabled === true },
    }),
  );
};

const LEGACY_NOTE_TITLE = "Legacy Context Memory";
const LEGACY_NOTE_BODY =
  "Short-term context controls (last-N turns, vector top K, and vector threshold) no longer affect Memory V2. Memory Agent is configured in Agent Builder.";

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

describe("MemorySettings legacy context section under enable_memory_v2", () => {
  beforeEach(() => {
    window.localStorage.clear();

    useOllamaEmbeddingModels.mockReturnValue({
      models: [],
      loading: false,
      error: null,
    });

    useOpenAIEmbeddingModels.mockReturnValue({
      models: ["text-embedding-3-small"],
      loading: false,
      error: null,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("flag off keeps the legacy Context Strategy controls untouched", () => {
    setMemoryV2Flag(false, { last_n_turns: 8, vector_top_k: 6, vector_min_score: 0.45 });

    renderMemorySettings();

    expect(screen.getByText("Context Strategy")).toBeInTheDocument();
    expect(screen.getByText("Last N turns — 8")).toBeInTheDocument();
    expect(screen.getByText("Recall top K — 6")).toBeInTheDocument();
    expect(screen.getByText("Recall threshold — 0.45")).toBeInTheDocument();

    // Long-term section keeps its exact untouched title, no "(Legacy)" suffix.
    expect(screen.getByText("Long-Term Memory")).toBeInTheDocument();
    expect(screen.queryByText(LEGACY_NOTE_TITLE)).toBeNull();
  });

  test("flag on hides short-term controls and explains why", () => {
    setMemoryV2Flag(true, { last_n_turns: 8, vector_top_k: 6, vector_min_score: 0.45 });

    renderMemorySettings();

    expect(screen.queryByText("Context Strategy")).toBeNull();
    expect(screen.queryByText("Last N turns — 8")).toBeNull();
    expect(screen.queryByText("Recall top K — 6")).toBeNull();
    expect(screen.queryByText("Recall threshold — 0.45")).toBeNull();

    expect(screen.getByText(LEGACY_NOTE_TITLE)).toBeInTheDocument();
    expect(screen.getByText(LEGACY_NOTE_BODY)).toBeInTheDocument();
  });

  test("flag on keeps long-term and embedding controls, labelling long-term legacy", () => {
    setMemoryV2Flag(true, { long_term_top_k: 5, long_term_min_score: 0.65 });

    renderMemorySettings();

    // Long-term enable / inspect survive.
    expect(screen.getByText("Enable long-term memory")).toBeInTheDocument();
    expect(screen.getByText("Inspect long-term memory")).toBeInTheDocument();
    // Long-term tuning survives, section explicitly marked legacy.
    expect(screen.getByText("Long-Term Memory (Legacy)")).toBeInTheDocument();
    expect(screen.getByText("Long-term top K — 5")).toBeInTheDocument();
    expect(screen.getByText("Long-term threshold — 0.65")).toBeInTheDocument();
    // Embedding provider controls survive.
    expect(screen.getByText("Embedding Model")).toBeInTheDocument();
    expect(screen.getByText("Provider")).toBeInTheDocument();
  });

  test("reacts to a flag change while the settings view stays mounted", () => {
    setMemoryV2Flag(false, { vector_top_k: 6 });

    renderMemorySettings();
    expect(screen.getByText("Recall top K — 6")).toBeInTheDocument();

    act(() => {
      writeFeatureFlags({ enable_memory_v2: true });
    });

    expect(screen.queryByText("Recall top K — 6")).toBeNull();
    expect(screen.getByText(LEGACY_NOTE_TITLE)).toBeInTheDocument();

    act(() => {
      writeFeatureFlags({ enable_memory_v2: false });
    });

    expect(screen.getByText("Recall top K — 6")).toBeInTheDocument();
    expect(screen.queryByText(LEGACY_NOTE_TITLE)).toBeNull();
  });
});
