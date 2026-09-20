import { fireEvent, render, screen } from "@testing-library/react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { OllamaPane, OllamaHeadingActions, OLLAMA_STATUS_CAPTION_KEY } from "./ollama_pane";

jest.mock("./ollama/ollama_store", () => ({
  __esModule: true,
  OllamaStore: () => <div data-testid="ollama-library" />,
}));
jest.mock("../../settings/model_providers/components/active_downloads", () => ({
  __esModule: true,
  default: () => <div data-testid="active-downloads" />,
}));
jest.mock("../../settings/local_storage/components/ollama_model_row", () => ({
  __esModule: true,
  default: ({ model, onDelete }) => (
    <div data-testid={`installed-row-${model.name}`}>
      <button onClick={() => onDelete(model.name)}>delete</button>
    </div>
  ),
}));
jest.mock("../../../BUILTIN_COMPONENTs/mini_react/use_translation", () => ({
  __esModule: true,
  useTranslation: () => ({ t: (k) => k }),
}));
jest.mock("../../../BUILTIN_COMPONENTs/icon/icon", () => () => null);

const makeOllama = (overrides = {}) => ({
  status: "ready",
  models: [],
  hasOllamaBridge: true,
  load: jest.fn(),
  restart: jest.fn(),
  removeLocally: jest.fn(),
  ...overrides,
});

const renderPane = (state) =>
  render(
    <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
      <OllamaHeadingActions ollama={state} />
      <OllamaPane ollama={state} />
    </ConfigContext.Provider>,
  );

describe("OllamaPane", () => {
  test("ready: installed list with delete, then downloads and the library", () => {
    const state = makeOllama({
      models: [
        { name: "qwen3:30b", size: 18e9 },
        { name: "llama3.2:3b", size: 2e9 },
      ],
    });
    renderPane(state);
    expect(OLLAMA_STATUS_CAPTION_KEY.ready).toBe("model_providers.page.ollama_running");
    expect(screen.getByTestId("installed-row-qwen3:30b")).toBeInTheDocument();
    expect(screen.getByTestId("installed-row-llama3.2:3b")).toBeInTheDocument();
    expect(screen.getByTestId("active-downloads")).toBeInTheDocument();
    expect(screen.getByTestId("ollama-library")).toBeInTheDocument();

    fireEvent.click(screen.getAllByText("delete")[0]);
    expect(state.removeLocally).toHaveBeenCalledWith("qwen3:30b");
    // Ready state offers Reload but not Restart.
    expect(screen.getByText("local_storage.reload")).toBeInTheDocument();
    expect(screen.queryByText("local_storage.restart")).toBeNull();
  });

  test("ready with nothing installed says so; the library is still there to pull from", () => {
    renderPane(makeOllama({ models: [] }));
    expect(screen.getByText("local_storage.no_models")).toBeInTheDocument();
    expect(screen.getByTestId("ollama-library")).toBeInTheDocument();
  });

  test("not_found: install hint, no installed list, no restart", () => {
    renderPane(makeOllama({ status: "not_found" }));
    expect(OLLAMA_STATUS_CAPTION_KEY.not_found).toBe("local_storage.not_installed");
    expect(screen.getByText("local_storage.ollama_not_installed")).toBeInTheDocument();
    expect(screen.getByText("https://ollama.com")).toBeInTheDocument();
    expect(screen.queryByTestId("ollama-installed-list")).toBeNull();
    expect(screen.queryByText("local_storage.restart")).toBeNull();
  });

  test("offline with a bridge: failed-start copy and a Restart action that calls the hook", () => {
    const state = makeOllama({ status: "offline" });
    renderPane(state);
    expect(screen.getByText("local_storage.ollama_failed_start")).toBeInTheDocument();
    expect(screen.getByText("ollama serve")).toBeInTheDocument();
    fireEvent.click(screen.getByText("local_storage.restart"));
    expect(state.restart).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("local_storage.reload"));
    expect(state.load).toHaveBeenCalledTimes(1);
  });

  test("offline without a bridge: not-running copy, no Restart", () => {
    renderPane(makeOllama({ status: "offline", hasOllamaBridge: false }));
    expect(screen.getByText("local_storage.ollama_not_running")).toBeInTheDocument();
    expect(screen.queryByText("local_storage.restart")).toBeNull();
  });
});
