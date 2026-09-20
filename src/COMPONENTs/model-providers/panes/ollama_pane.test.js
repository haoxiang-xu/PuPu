import { fireEvent, render, screen } from "@testing-library/react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { OllamaPane, OllamaHeadingActions, OLLAMA_STATUS_CAPTION_KEY } from "./ollama_pane";
import { useState } from "react";

jest.mock("./ollama/ollama_store", () => ({
  __esModule: true,
  OllamaStore: () => <div data-testid="ollama-library" />,
}));
jest.mock("../../toolkit/components/segmented_control", () => ({
  __esModule: true,
  default: ({ sections, selected, onChange }) => (
    <div data-testid="ollama-tabs-control">
      {sections.map((s) => (
        <button key={s.key} data-testid={`tab-${s.key}`} data-on={s.key === selected} onClick={() => onChange(s.key)}>
          {s.label}
        </button>
      ))}
    </div>
  ),
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

/* The header (tabs + reload) and the pane share the tab the way the modal
   content wires them: one state, header writes, pane reads. */
const Harness = ({ state, initialTab }) => {
  const [tab, setTab] = useState(initialTab ?? (state.status === "ready" && state.models.length > 0 ? "installed" : "library"));
  return (
    <>
      <OllamaHeadingActions ollama={state} tab={tab} onTabChange={setTab} />
      <OllamaPane ollama={state} tab={tab} />
    </>
  );
};
const renderPane = (state, initialTab) =>
  render(
    <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
      <Harness state={state} initialTab={initialTab} />
    </ConfigContext.Provider>,
  );

describe("OllamaPane (S4: Installed / Library group button)", () => {
  test("ready with models: opens on Installed with the count, rows with delete, Library behind the other tab", () => {
    const state = makeOllama({
      models: [
        { name: "qwen3:30b", size: 18e9 },
        { name: "llama3.2:3b", size: 2e9 },
      ],
    });
    renderPane(state);
    expect(screen.getByTestId("tab-installed").textContent).toBe("model_providers.store.tab_installed · 2");
    expect(screen.getByTestId("tab-installed").dataset.on).toBe("true");
    expect(screen.getByTestId("installed-row-qwen3:30b")).toBeInTheDocument();
    expect(screen.getByTestId("active-downloads")).toBeInTheDocument();
    expect(screen.queryByTestId("ollama-library")).toBeNull();

    fireEvent.click(screen.getAllByText("delete")[0]);
    expect(state.removeLocally).toHaveBeenCalledWith("qwen3:30b");
    // Ready state offers the icon Reload (aria-label) but not Restart.
    expect(screen.getByLabelText("local_storage.reload")).toBeInTheDocument();
    expect(screen.queryByText("local_storage.restart")).toBeNull();

    fireEvent.click(screen.getByTestId("tab-library"));
    expect(screen.getByTestId("ollama-library")).toBeInTheDocument();
    expect(screen.queryByTestId("installed-row-qwen3:30b")).toBeNull();
  });

  test("ready with nothing installed: opens on Library", () => {
    renderPane(makeOllama({ models: [] }));
    expect(screen.getByTestId("tab-library").dataset.on).toBe("true");
    expect(screen.getByTestId("ollama-library")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("tab-installed"));
    expect(screen.getByText("local_storage.no_models")).toBeInTheDocument();
  });

  test("not_found: opens on Library with the install hint; Installed tab shows the hint too, no restart", () => {
    renderPane(makeOllama({ status: "not_found" }));
    expect(OLLAMA_STATUS_CAPTION_KEY.not_found).toBe("local_storage.not_installed");
    expect(screen.getByTestId("tab-library").dataset.on).toBe("true");
    expect(screen.getByText("local_storage.ollama_not_installed")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("tab-installed"));
    expect(screen.getByText("https://ollama.com")).toBeInTheDocument();
    expect(screen.queryByTestId("ollama-installed-list")).toBeNull();
    expect(screen.queryByText("local_storage.restart")).toBeNull();
  });

  test("offline with a bridge: failed-start copy on the Installed tab and a Restart action that calls the hook", () => {
    const state = makeOllama({ status: "offline" });
    renderPane(state);
    fireEvent.click(screen.getByTestId("tab-installed"));
    expect(screen.getByText("local_storage.ollama_failed_start")).toBeInTheDocument();
    expect(screen.getByText("ollama serve")).toBeInTheDocument();
    fireEvent.click(screen.getByText("local_storage.restart"));
    expect(state.restart).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByLabelText("local_storage.reload"));
    expect(state.load).toHaveBeenCalledTimes(1);
  });

  test("offline without a bridge: not-running copy, no Restart", () => {
    renderPane(makeOllama({ status: "offline", hasOllamaBridge: false }));
    fireEvent.click(screen.getByTestId("tab-installed"));
    expect(screen.getByText("local_storage.ollama_not_running")).toBeInTheDocument();
    expect(screen.queryByText("local_storage.restart")).toBeNull();
  });
});
