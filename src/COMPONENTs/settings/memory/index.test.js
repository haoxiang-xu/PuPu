import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  ConfigContext,
  LocaleContext,
} from "../../../CONTAINERs/config/context";
import { MemorySettings } from "./index";
import contextV2Bridge from "../../../SERVICEs/bridges/context_v2_bridge";
import useOllamaEmbeddingModels from "./use_ollama_embedding_models";
import useOpenAIEmbeddingModels from "./use_openai_embedding_models";
import serviceStatusFixture from "./__fixtures__/service_status.json";

jest.mock("../../../SERVICEs/bridges/context_v2_bridge", () => ({
  __esModule: true,
  default: { getStatus: jest.fn() },
}));
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
jest.mock("../../memory-inspect/memory_inspect_modal", () => ({
  MemoryInspectModal: ({ open, onClose }) =>
    open ? (
      <div role="dialog" aria-label="Legacy memory inspector">
        <button onClick={onClose}>Close inspector</button>
      </div>
    ) : null,
}));

const readyStatus = (overrides = {}) => ({
  ...serviceStatusFixture,
  vectorStatus: "ready",
  rolloutMode: "all",
  ...overrides,
});

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};

const renderMemorySettings = ({ onNavigate = jest.fn() } = {}) =>
  render(
    <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
      <LocaleContext.Provider value={{ locale: "en", setLocale: jest.fn() }}>
        <MemorySettings onNavigate={onNavigate} />
      </LocaleContext.Provider>
    </ConfigContext.Provider>,
  );

const setMemorySettings = (memorySettings) => {
  window.localStorage.setItem(
    "settings",
    JSON.stringify({ memory: memorySettings }),
  );
};

const openLegacySettings = () => {
  fireEvent.click(screen.getByRole("button", { name: "Show legacy settings" }));
};

describe("MemorySettings service status", () => {
  beforeEach(() => {
    window.localStorage.clear();
    contextV2Bridge.getStatus.mockResolvedValue(readyStatus());
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

  afterEach(() => jest.clearAllMocks());

  test("consumes the exact status fixture emitted by the Electron producer", async () => {
    contextV2Bridge.getStatus.mockResolvedValue(serviceStatusFixture);
    renderMemorySettings();

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Available for some new conversations",
      ),
    );
    expect(screen.queryByText("Enable memory")).toBeNull();
    expect(useOllamaEmbeddingModels).not.toHaveBeenCalled();
    expect(useOpenAIEmbeddingModels).not.toHaveBeenCalled();
  });

  test.each([
    ["all", "Available for new conversations"],
    ["canary", "Available for some new conversations"],
    ["shadow", "Not active in answers for new conversations"],
    ["off", "Not active for new conversations"],
  ])("renders the %s rollout mode", async (rolloutMode, message) => {
    contextV2Bridge.getStatus.mockResolvedValue(readyStatus({ rolloutMode }));
    renderMemorySettings();

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(message),
    );
  });

  test.each([
    [
      "missing required field",
      () => {
        const status = readyStatus();
        delete status.readOnlyDegraded;
        return status;
      },
    ],
    ["unknown rollout mode", () => readyStatus({ rolloutMode: "unknown" })],
    [
      "unknown feature ceiling",
      () => readyStatus({ featureCeiling: "future" }),
    ],
    ["contradictory ceiling", () => readyStatus({ featureCeiling: "off" })],
    [
      "malformed read-only status",
      () => readyStatus({ rolloutMode: "unknown", readOnlyDegraded: true }),
    ],
  ])("treats %s as unavailable", async (_name, makeStatus) => {
    contextV2Bridge.getStatus.mockResolvedValue(makeStatus());
    renderMemorySettings();

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Memory status unavailable",
      ),
    );
  });

  test("shows read-only only after the rest of the status validates", async () => {
    contextV2Bridge.getStatus.mockResolvedValue(
      readyStatus({ readOnlyDegraded: true }),
    );
    renderMemorySettings();

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Memory is in read-only mode",
      ),
    );
  });

  test("disables refresh while the initial request is pending", async () => {
    const request = deferred();
    contextV2Bridge.getStatus.mockReturnValue(request.promise);
    renderMemorySettings();

    expect(screen.getByRole("status")).toHaveTextContent(
      "Checking memory status…",
    );
    expect(screen.getByRole("button", { name: "Refresh" })).toBeDisabled();

    await act(async () => request.resolve(readyStatus()));
    expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled();
  });

  test("clears a successful status while refresh is pending and on error", async () => {
    const refreshRequest = deferred();
    contextV2Bridge.getStatus
      .mockResolvedValueOnce(readyStatus())
      .mockReturnValueOnce(refreshRequest.promise);
    renderMemorySettings();

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Available for new conversations",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Checking memory status…",
    );
    expect(screen.getByRole("button", { name: "Refresh" })).toBeDisabled();

    await act(async () => refreshRequest.reject(new Error("runtime stopped")));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Memory status unavailable",
    );
  });

  test("retries an unavailable status on explicit refresh", async () => {
    contextV2Bridge.getStatus
      .mockRejectedValueOnce(new Error("not ready"))
      .mockResolvedValueOnce(readyStatus({ rolloutMode: "shadow" }));
    renderMemorySettings();

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Memory status unavailable",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Not active in answers for new conversations",
      ),
    );
  });

  test("a late request from a closed page cannot replace a reopened page", async () => {
    const oldRequest = deferred();
    contextV2Bridge.getStatus
      .mockReturnValueOnce(oldRequest.promise)
      .mockResolvedValueOnce(readyStatus({ rolloutMode: "off" }));
    const firstView = renderMemorySettings();
    firstView.unmount();

    renderMemorySettings();
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Not active for new conversations",
      ),
    );
    await act(async () => oldRequest.resolve(readyStatus()));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Not active for new conversations",
    );
  });
});

describe("MemorySettings legacy disclosure and persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
    contextV2Bridge.getStatus.mockReturnValue(new Promise(() => {}));
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

  afterEach(() => jest.clearAllMocks());

  test("only mounts and labels legacy controls after disclosure", () => {
    renderMemorySettings();

    expect(screen.getByText("Legacy memory")).toBeInTheDocument();
    expect(screen.queryByText("Enable memory")).toBeNull();
    openLegacySettings();

    expect(screen.getByText("Legacy memory settings")).toBeInTheDocument();
    expect(screen.getByText("Enable memory")).toBeInTheDocument();
    expect(screen.getByText("Inspect legacy memory")).toBeInTheDocument();
    expect(useOllamaEmbeddingModels).toHaveBeenCalledTimes(1);
    expect(useOpenAIEmbeddingModels).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Hide legacy settings" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  test("opens the legacy inspector from the disclosed controls", () => {
    renderMemorySettings();
    openLegacySettings();

    fireEvent.click(screen.getByRole("button", { name: "Inspect" }));
    expect(
      screen.getByRole("dialog", { name: "Legacy memory inspector" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close inspector" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("persists a legacy toggle through hide, show, and page reopen", async () => {
    const view = renderMemorySettings();
    openLegacySettings();
    const firstSwitch = view.container.querySelector(".mini-ui-switch-track");
    expect(firstSwitch).toBeTruthy();

    fireEvent.click(firstSwitch);
    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem("settings") || "{}");
      expect(saved.memory?.enabled).toBe(false);
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Hide legacy settings" }),
    );
    openLegacySettings();
    view.unmount();

    const reopened = renderMemorySettings();
    openLegacySettings();
    const reopenedSwitch = reopened.container.querySelector(
      ".mini-ui-switch-track",
    );
    expect(reopenedSwitch).toBeTruthy();
    fireEvent.click(reopenedSwitch);

    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem("settings") || "{}");
      expect(saved.memory?.enabled).toBe(true);
    });
  });

  test("renders the saved OpenAI catalog choice and options", () => {
    setMemorySettings({
      embedding_provider: "openai",
      openai_embedding_model: "text-embedding-3-small",
    });
    renderMemorySettings();
    openLegacySettings();

    const select = screen.getByTestId("mock-select");
    const optionValues = within(select)
      .getAllByRole("option")
      .map((option) => option.value);
    expect(optionValues).toEqual([
      "text-embedding-3-large",
      "text-embedding-3-small",
    ]);
    expect(select).toHaveValue("text-embedding-3-small");
  });

  test("falls back an invalid saved OpenAI model and persists the repair", async () => {
    setMemorySettings({
      embedding_provider: "openai",
      openai_embedding_model: "legacy-invalid-model",
    });
    renderMemorySettings();
    openLegacySettings();

    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem("settings") || "{}");
      expect(saved.memory?.openai_embedding_model).toBe(
        "text-embedding-3-small",
      );
    });
    expect(screen.getByTestId("mock-select")).toHaveValue(
      "text-embedding-3-small",
    );
  });

  test.each([
    ["loading", { models: [], loading: true, error: null }, "Loading models…"],
    [
      "error",
      { models: [], loading: false, error: "boom" },
      "Could not load OpenAI embedding models.",
    ],
    [
      "empty",
      { models: [], loading: false, error: null },
      "No embedding models available.",
    ],
  ])(
    "keeps the OpenAI %s state behind disclosure",
    (_name, result, message) => {
      useOpenAIEmbeddingModels.mockReturnValue(result);
      setMemorySettings({ embedding_provider: "openai" });
      renderMemorySettings();
      expect(screen.queryByText(message)).toBeNull();

      openLegacySettings();
      expect(screen.getByText(message)).toBeInTheDocument();
    },
  );

  test("renders persisted long-term tuning and keeps obsolete context controls hidden", () => {
    setMemorySettings({
      last_n_turns: 8,
      vector_top_k: 6,
      vector_min_score: 0.45,
      long_term_top_k: 5,
      long_term_min_score: 0.65,
    });
    renderMemorySettings();
    openLegacySettings();

    expect(screen.queryByText("Context Strategy")).toBeNull();
    expect(screen.queryByText("Last N turns — 8")).toBeNull();
    expect(screen.queryByText("Recall top K — 6")).toBeNull();
    expect(screen.queryByText("Recall threshold — 0.45")).toBeNull();
    expect(screen.getByText("Long-term top K — 5")).toBeInTheDocument();
    expect(screen.getByText("Long-term threshold — 0.65")).toBeInTheDocument();
  });

  test("routes the empty Ollama action through the settings callback", () => {
    const onNavigate = jest.fn();
    setMemorySettings({ embedding_provider: "ollama" });
    renderMemorySettings({ onNavigate });
    openLegacySettings();

    fireEvent.click(
      screen.getByRole("button", { name: /Go to Model Providers/ }),
    );
    expect(onNavigate).toHaveBeenCalledWith("model_providers");
  });
});
