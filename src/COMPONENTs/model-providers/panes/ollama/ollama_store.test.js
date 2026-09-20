import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import { OllamaStore } from "./ollama_store";
import { __resetOllamaModelTagsCache } from "./use_ollama_model_tags";

/* ── the library hook is the data source; the store only presents it ── */
const mockLibrary = {
  category: "",
  setCategory: jest.fn(),
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
  refreshInstalled: jest.fn(() => Promise.resolve()),
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

const mockDelete = { impl: null };
jest.mock("../../../settings/local_storage/utils/ollama_models", () => ({
  __esModule: true,
  deleteOllamaModel: (ref) => mockDelete.impl(ref),
}));
jest.mock("../../../../SERVICEs/model_catalog_refresh", () => ({
  __esModule: true,
  emitModelCatalogRefresh: jest.fn(),
}));
jest.mock("../../../settings/local_storage/components/confirm_delete_modal", () => ({
  __esModule: true,
  default: ({ open, onConfirm, target }) =>
    open ? (
      <div data-testid="confirm-delete" data-target={target}>
        <button onClick={onConfirm}>confirm</button>
      </div>
    ) : null,
}));

jest.mock("../../../../SERVICEs/ollama_featured_models.json", () => [
  { name: "qwen3", why_key: "why.qwen3" },
  { name: "gemma3", why_key: "why.gemma3" },
]);

/* The BUILTIN Select is a portal + palette; a plain <select> stands in. */
jest.mock("../../../../BUILTIN_COMPONENTs/select/select", () => ({
  __esModule: true,
  default: ({ options, value, set_value, on_open_change }) => (
    <select
      value={value}
      onFocus={() => on_open_change?.(true)}
      onChange={(e) => set_value(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
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
    t: (k, vars) => (vars ? `${k} ${Object.values(vars).join(" ")}` : k),
  }),
}));
jest.mock("../../../../BUILTIN_COMPONENTs/icon/icon", () => () => null);
jest.mock("../../../../BUILTIN_COMPONENTs/spinner/cell_split_spinner", () => () => null);

const { emitModelCatalogRefresh } = require("../../../../SERVICEs/model_catalog_refresh");

const MODELS = [
  { name: "qwen3", description: "Qwen3 desc", tags: ["tools"], sizes: ["0.6b", "14b", "32b"], pulls: "12.3M" },
  { name: "llama3.3", description: "Llama desc", tags: ["tools"], sizes: ["70b"], pulls: "9.8M" },
  { name: "gemma3", description: "Gemma desc", tags: ["vision"], sizes: ["1b", "4b"], pulls: "8.1M" },
];
const QWEN_TAGS = [
  { tag: "latest", size_label: "5.2GB", size_bytes: 5.2e9, context: "40K", input: "Text", updated: "1 year ago" },
  { tag: "14b", size_label: "9.3GB", size_bytes: 9.3e9, context: "40K", input: "Text", updated: "1 year ago" },
  { tag: "32b", size_label: "20GB", size_bytes: 2e10, context: "40K", input: "Text", updated: "1 year ago" },
  { tag: "8b-q4_K_M", size_label: "5.2GB", size_bytes: 5.2e9, context: "40K", input: "Text", updated: "1 year ago" },
];

const renderStore = (props = {}) =>
  render(
    <ConfigContext.Provider value={{ theme: {}, onThemeMode: "dark_mode" }}>
      <OllamaStore isDark {...props} />
    </ConfigContext.Provider>,
  );

const flush = () => act(() => Promise.resolve());
const row = (name) => screen.getByTestId(`store-row-${name}`);

beforeEach(() => {
  __resetOllamaModelTagsCache();
  Object.assign(mockLibrary, {
    category: "",
    rawQuery: "",
    debouncedQuery: "",
    models: MODELS,
    loading: false,
    error: null,
    installedNames: new Set(["qwen3:14b"]),
    pullingMap: {},
  });
  mockLibrary.setCategory.mockReset();
  mockLibrary.setRawQuery.mockReset();
  mockLibrary.handlePull.mockReset();
  mockLibrary.handleCancel.mockReset();
  mockLibrary.refreshInstalled.mockClear();
  mockTags.impl = jest.fn(() => Promise.resolve(QWEN_TAGS));
  mockDelete.impl = jest.fn(() => Promise.resolve());
  emitModelCatalogRefresh.mockClear();
});

describe("OllamaStore (S3) — default view", () => {
  test("one row per model, the featured ones carry their reason; Try chips fill the search", () => {
    renderStore();
    expect(screen.getAllByTestId(/^store-row-/).map((e) => e.dataset.testid)).toEqual([
      "store-row-qwen3",
      "store-row-llama3.3",
      "store-row-gemma3",
    ]);
    expect(within(row("qwen3")).getByText("why.qwen3")).toBeInTheDocument();
    expect(within(row("llama3.3")).getByText("Llama desc")).toBeInTheDocument();

    const tryRow = screen.getByTestId("ollama-store-try");
    fireEvent.click(within(tryRow).getByText("gemma3"));
    expect(mockLibrary.setRawQuery).toHaveBeenCalledWith("gemma3");
  });

  test("the search placeholder counts the library; the category select drives the hook", () => {
    renderStore();
    expect(screen.getByLabelText("model_providers.store.search_count 3")).toBeInTheDocument();
    const select = within(screen.getByTestId("store-category-select")).getByRole("combobox");
    fireEvent.change(select, { target: { value: "vision" } });
    expect(mockLibrary.setCategory).toHaveBeenCalledWith("vision");
  });

  test("Try chips hide once the view is not the default", () => {
    mockLibrary.debouncedQuery = "qwen";
    renderStore();
    expect(screen.queryByTestId("ollama-store-try")).toBeNull();
  });

  test("Installed chip keeps only models with an installed tag", () => {
    renderStore();
    fireEvent.click(screen.getByTestId("store-category-installed"));
    expect(screen.queryByTestId("store-row-llama3.3")).toBeNull();
    expect(screen.getByTestId("store-row-qwen3")).toBeInTheDocument();
  });

  test("error offers retry", () => {
    mockLibrary.error = "boom";
    renderStore();
    fireEvent.click(screen.getByText("model_providers.retry"));
    expect(mockLibrary.retrySearch).toHaveBeenCalled();
  });
});

describe("OllamaStore (S3) — the row's size select and actions", () => {
  test("before the select is touched the sizes are the list's chips; the default skips installed tags", () => {
    renderStore();
    const select = within(row("qwen3")).getByRole("combobox");
    expect([...select.options].map((o) => o.textContent)).toEqual(["0.6b", "14b", "32b"]);
    expect(select.value).toBe("0.6b");
    expect(mockTags.impl).not.toHaveBeenCalled();
  });

  test("touching the select fetches the tags page (BC-002) and relabels with real sizes, plain tags only", async () => {
    renderStore();
    const select = within(row("qwen3")).getByRole("combobox");
    fireEvent.focus(select);
    await flush();
    expect(mockTags.impl).toHaveBeenCalledWith("qwen3");
    const relabelled = within(row("qwen3")).getByRole("combobox");
    expect([...relabelled.options].map((o) => o.textContent)).toEqual([
      "latest · 5.2GB",
      "14b · 9.3GB",
      "32b · 20GB",
    ]);
  });

  test("Pull sends name + the picked tag through the existing pull path", () => {
    renderStore();
    const select = within(row("qwen3")).getByRole("combobox");
    fireEvent.change(select, { target: { value: "32b" } });
    fireEvent.click(within(row("qwen3")).getByLabelText("Pull qwen3:32b"));
    expect(mockLibrary.handlePull).toHaveBeenCalledWith("qwen3", "32b");
  });

  test("a running pull shows progress and Cancel in the row", () => {
    mockLibrary.pullingMap = { "qwen3:0.6b": { status: "pulling", percent: 41, error: null } };
    renderStore();
    expect(within(row("qwen3")).getByText("0.6b · pulling 41%")).toBeInTheDocument();
    fireEvent.click(within(row("qwen3")).getByLabelText("Cancel qwen3:0.6b"));
    expect(mockLibrary.handleCancel).toHaveBeenCalledWith("qwen3:0.6b");
  });

  test("an installed tag shows the trash icon; confirming deletes and refreshes both installed sets", async () => {
    const onInstalledChanged = jest.fn();
    renderStore({ onInstalledChanged });
    const select = within(row("qwen3")).getByRole("combobox");
    fireEvent.change(select, { target: { value: "14b" } });
    fireEvent.click(within(row("qwen3")).getByLabelText("Delete qwen3:14b"));
    expect(screen.getByTestId("confirm-delete").dataset.target).toBe("qwen3:14b");
    fireEvent.click(screen.getByText("confirm"));
    await flush();
    await flush();
    expect(mockDelete.impl).toHaveBeenCalledWith("qwen3:14b");
    expect(emitModelCatalogRefresh).toHaveBeenCalled();
    expect(mockLibrary.refreshInstalled).toHaveBeenCalled();
    expect(onInstalledChanged).toHaveBeenCalledWith("qwen3:14b");
  });

  test("tags page failure keeps the list's chips (fallback)", async () => {
    mockTags.impl = jest.fn(() => Promise.reject(new Error("timeout")));
    renderStore();
    const select = within(row("gemma3")).getByRole("combobox");
    fireEvent.focus(select);
    await flush();
    expect([...within(row("gemma3")).getByRole("combobox").options].map((o) => o.value)).toEqual(["1b", "4b"]);
  });
});
