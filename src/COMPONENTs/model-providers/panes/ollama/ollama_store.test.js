import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import { OllamaStore } from "./ollama_store";
import { __resetOllamaModelTagsCache } from "./use_ollama_model_tags";

/* ── the library hook is the data source; the store only presents it ── */
const mockLibrary = {
  category: "",
  setCategory: jest.fn(),
  sort: "",
  setSort: jest.fn(),
  rawQuery: "",
  setRawQuery: jest.fn(),
  debouncedQuery: "",
  models: [],
  loading: false,
  error: null,
  installedNames: new Set(),
  pullingMap: {},
  handlePull: jest.fn(),
  handleCancel: jest.fn(),
  retrySearch: jest.fn(),
};
jest.mock("../../../settings/model_providers/hooks/use_ollama_library", () => ({
  __esModule: true,
  useOllamaLibrary: () => mockLibrary,
}));

const mockTags = { impl: null };
jest.mock("../../../../SERVICEs/api", () => ({
  __esModule: true,
  default: { ollama: { fetchLibraryTags: (name) => mockTags.impl(name) } },
}));

jest.mock("../../../../SERVICEs/ollama_featured_models.json", () => [
  { name: "qwen3", why_key: "why.qwen3" },
  { name: "not-in-list", why_key: "why.nil" },
]);

jest.mock("../../../toolkit/components/segmented_control", () => ({
  __esModule: true,
  default: ({ sections, selected, onChange }) => (
    <div>
      {sections.map((s) => (
        <button key={s.key || "default"} data-testid={`sort-${s.key || "default"}`} data-on={s.key === selected} onClick={() => onChange(s.key)}>
          {s.label}
        </button>
      ))}
    </div>
  ),
}));
jest.mock("../../../../BUILTIN_COMPONENTs/input/input", () => ({
  __esModule: true,
  Input: ({ value, set_value, placeholder }) => (
    <input aria-label={placeholder} value={value} onChange={(e) => set_value(e.target.value)} />
  ),
}));
jest.mock("../../../../BUILTIN_COMPONENTs/mini_react/use_translation", () => ({
  __esModule: true,
  useTranslation: () => ({
    t: (k, vars) =>
      vars ? `${k} ${Object.values(vars).join(" ")}` : k,
  }),
}));
jest.mock("../../../../BUILTIN_COMPONENTs/icon/icon", () => () => null);
jest.mock("../../../../BUILTIN_COMPONENTs/spinner/arc_spinner", () => () => null);
jest.mock("../../../../BUILTIN_COMPONENTs/spinner/cell_split_spinner", () => () => null);

const MODELS = [
  { name: "qwen3", description: "Qwen3 desc", tags: ["tools", "thinking"], sizes: ["0.6b", "14b", "32b"], pulls: "12.3M" },
  { name: "llama3.3", description: "Llama desc", tags: ["tools"], sizes: ["70b"], pulls: "9.8M" },
  { name: "gemma3", description: "Gemma desc", tags: ["vision"], sizes: ["1b", "4b"], pulls: "8.1M" },
];
const QWEN_TAGS = [
  { tag: "latest", size_label: "5.2GB", size_bytes: 5.2e9, context: "40K", input: "Text", updated: "1 year ago" },
  { tag: "14b", size_label: "9.3GB", size_bytes: 9.3e9, context: "40K", input: "Text", updated: "1 year ago" },
  { tag: "32b", size_label: "20GB", size_bytes: 2e10, context: "40K", input: "Text", updated: "1 year ago" },
  { tag: "8b-q4_K_M", size_label: "5.2GB", size_bytes: 5.2e9, context: "40K", input: "Text", updated: "1 year ago" },
];

const renderStore = () =>
  render(
    <ConfigContext.Provider value={{ theme: {}, onThemeMode: "dark_mode" }}>
      <OllamaStore isDark />
    </ConfigContext.Provider>,
  );

const flush = () => act(() => Promise.resolve());

beforeEach(() => {
  __resetOllamaModelTagsCache();
  Object.assign(mockLibrary, {
    category: "",
    sort: "",
    rawQuery: "",
    debouncedQuery: "",
    models: MODELS,
    loading: false,
    error: null,
    installedNames: new Set(["qwen3:14b"]),
    pullingMap: {},
  });
  mockLibrary.setCategory.mockReset();
  mockLibrary.setSort.mockReset();
  mockLibrary.handlePull.mockReset();
  mockLibrary.handleCancel.mockReset();
  mockTags.impl = jest.fn(() => Promise.resolve(QWEN_TAGS));
});

describe("OllamaStore — default view", () => {
  test("featured row from the curated list (resolved against the library), then the rest of the grid", () => {
    renderStore();
    const featured = screen.getByTestId("ollama-store-featured");
    expect(within(featured).getByTestId("store-card-qwen3")).toBeInTheDocument();
    // a featured name the library did not return still gets a (bare) card
    expect(within(featured).getByTestId("store-card-not-in-list")).toBeInTheDocument();
    expect(within(featured).getByText("why.qwen3")).toBeInTheDocument();

    const grid = screen.getByTestId("ollama-store-grid");
    expect(within(grid).queryByTestId("store-card-qwen3")).toBeNull(); // not repeated
    expect(within(grid).getByTestId("store-card-llama3.3")).toBeInTheDocument();
    expect(within(grid).getByTestId("store-card-gemma3")).toBeInTheDocument();
  });

  test("installed mark on a model with any installed tag; size range otherwise", () => {
    renderStore();
    const qwen = within(screen.getByTestId("ollama-store-featured")).getByTestId("store-card-qwen3");
    expect(within(qwen).getByText("model_providers.store.installed")).toBeInTheDocument();
    const llama = screen.getByTestId("store-card-llama3.3");
    expect(within(llama).getByText("70b")).toBeInTheDocument();
    expect(within(llama).getByText("model_providers.store.pulls 9.8M")).toBeInTheDocument();
  });

  test("sort and category go to the hook (BC-003 producer side)", () => {
    renderStore();
    fireEvent.click(screen.getByTestId("sort-newest"));
    expect(mockLibrary.setSort).toHaveBeenCalledWith("newest");
    fireEvent.click(screen.getByTestId("store-category-vision"));
    expect(mockLibrary.setCategory).toHaveBeenCalledWith("vision");
  });

  test("featured hides once the view is no longer the default", () => {
    mockLibrary.debouncedQuery = "qwen";
    renderStore();
    expect(screen.queryByTestId("ollama-store-featured")).toBeNull();
    expect(within(screen.getByTestId("ollama-store-grid")).getByTestId("store-card-qwen3")).toBeInTheDocument();
  });

  test("Installed filter keeps only models with an installed tag", () => {
    renderStore();
    fireEvent.click(screen.getByTestId("store-category-installed"));
    expect(screen.queryByTestId("ollama-store-featured")).toBeNull();
    const grid = screen.getByTestId("ollama-store-grid");
    expect(within(grid).getByTestId("store-card-qwen3")).toBeInTheDocument();
    expect(within(grid).queryByTestId("store-card-llama3.3")).toBeNull();
  });

  test("error state offers retry; loading shows nothing else", () => {
    mockLibrary.error = "boom";
    renderStore();
    fireEvent.click(screen.getByText("model_providers.retry"));
    expect(mockLibrary.retrySearch).toHaveBeenCalled();
  });
});

describe("OllamaStore — expanding a card and the size picker (AC-11)", () => {
  test("click expands one card at a time; the picker fetches the tags page (BC-002) and lists plain tags", async () => {
    renderStore();
    fireEvent.click(screen.getByTestId("store-card-llama3.3"));
    expect(screen.getByTestId("store-card-llama3.3").dataset.expanded).toBe("true");
    expect(mockTags.impl).toHaveBeenCalledWith("llama3.3");

    fireEvent.click(within(screen.getByTestId("ollama-store-featured")).getByTestId("store-card-qwen3"));
    await flush();
    expect(screen.getByTestId("store-card-llama3.3").dataset.expanded).toBe("false");
    const picker = screen.getByTestId("size-picker-qwen3");
    expect(within(picker).getByTestId("size-row-latest")).toBeInTheDocument();
    expect(within(picker).getByTestId("size-row-32b")).toBeInTheDocument();
    // quantisation variants are behind "show all"
    expect(within(picker).queryByTestId("size-row-8b-q4_K_M")).toBeNull();
    expect(within(picker).getByText("5.2GB · 40K ctx")).toBeInTheDocument();
    // installed tag shows the mark, not a size
    expect(within(within(picker).getByTestId("size-row-14b")).getByText("model_providers.store.installed")).toBeInTheDocument();

    fireEvent.click(within(picker).getByText("model_providers.store.show_all_tags 4"));
    expect(within(picker).getByTestId("size-row-8b-q4_K_M")).toBeInTheDocument();
  });

  test("default selection skips installed tags; Pull calls the existing pull path with name + tag", async () => {
    renderStore();
    fireEvent.click(within(screen.getByTestId("ollama-store-featured")).getByTestId("store-card-qwen3"));
    await flush();
    const picker = screen.getByTestId("size-picker-qwen3");
    // first non-installed row is "latest"
    expect(within(picker).getByText("model_providers.store.pull_tag qwen3:latest")).toBeInTheDocument();
    fireEvent.click(within(picker).getByTestId("size-row-32b"));
    fireEvent.click(within(picker).getByText("model_providers.store.pull_tag qwen3:32b"));
    expect(mockLibrary.handlePull).toHaveBeenCalledWith("qwen3", "32b");
  });

  test("a running pull renders progress + Cancel in the picker", async () => {
    mockLibrary.pullingMap = { "qwen3:latest": { status: "pulling", percent: 41, error: null } };
    renderStore();
    fireEvent.click(within(screen.getByTestId("ollama-store-featured")).getByTestId("store-card-qwen3"));
    await flush();
    const picker = screen.getByTestId("size-picker-qwen3");
    expect(within(picker).getByText(/pulling 41%/)).toBeInTheDocument();
    fireEvent.click(within(picker).getByText("Cancel"));
    expect(mockLibrary.handleCancel).toHaveBeenCalledWith("qwen3:latest");
  });

  test("tags page failure falls back to the list's size chips and offers Retry", async () => {
    mockTags.impl = jest.fn(() => Promise.reject(new Error("timeout")));
    renderStore();
    fireEvent.click(screen.getByTestId("store-card-gemma3"));
    await flush();
    const picker = screen.getByTestId("size-picker-gemma3");
    expect(within(picker).getByTestId("size-row-1b")).toBeInTheDocument();
    expect(within(picker).getByTestId("size-row-4b")).toBeInTheDocument();
    expect(within(picker).getByText("model_providers.store.tags_failed")).toBeInTheDocument();
    fireEvent.click(within(picker).getByText("model_providers.store.tags_retry"));
    expect(mockTags.impl).toHaveBeenCalledTimes(2);
  });

  test("a bare featured card (no library record) still expands and fetches its tags", async () => {
    renderStore();
    fireEvent.click(within(screen.getByTestId("ollama-store-featured")).getByTestId("store-card-not-in-list"));
    expect(mockTags.impl).toHaveBeenCalledWith("not-in-list");
  });
});
