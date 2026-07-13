import { fireEvent, render, screen } from "@testing-library/react";
import ToolkitStorePage from "./toolkit_store_page";
import {
  setMcpStoreEntriesCache,
  clearMcpStoreEntriesCache,
} from "../../../SERVICEs/mcp_toolkit_store";

jest.mock("../../../BUILTIN_COMPONENTs/mini_react/use_translation", () => ({
  __esModule: true,
  useTranslation: () => ({ t: (key) => key, locale: "en", setLocale: () => {} }),
}));

jest.mock("../../../BUILTIN_COMPONENTs/icon/icon", () => ({
  __esModule: true,
  default: ({ src }) => <span data-testid={`icon-${src}`} />,
}));

jest.mock("../components/toolkit_icon", () => ({
  __esModule: true,
  default: ({ icon }) => (
    <span data-testid="toolkit-icon">{icon?.name || "fallback"}</span>
  ),
  isBuiltinToolkitIcon: (icon) => icon?.type === "builtin",
  isFileToolkitIcon: () => false,
}));

describe("ToolkitStorePage", () => {
  afterEach(() => {
    clearMcpStoreEntriesCache();
  });

  test("forwards onOAuthConnect so the Connect button fires for oauth entries", () => {
    // installState resolves to "oauth": auth.oauth present + secrets empty
    // (setupKindForEntry → "oauth" → entryInstallState → "oauth").
    const oauthEntry = {
      id: "dev.figma-remote",
      toolkitId: "mcp.figma",
      toolkitName: "Figma",
      toolkitDescription: "Figma MCP",
      source: "mcp",
      installable: false,
      status: "available",
      auth: { oauth: { provider: "figma" } },
      secrets: [],
      tools: [],
      mcp: { transport: "http", url: "https://example.com" },
    };
    // Render exactly [oauthEntry] by seeding the store-entries cache.
    setMcpStoreEntriesCache({ entries: [oauthEntry] });

    const onOAuthConnect = jest.fn();
    render(
      <ToolkitStorePage
        isDark={false}
        installedIds={new Set()}
        onInstall={jest.fn()}
        onOAuthConnect={onOAuthConnect}
        installingIds={new Set()}
        installError={null}
      />,
    );

    // Harness mock: t(key) => key, so the label renders as the raw key.
    fireEvent.click(screen.getByText("toolkit.store_connect"));
    expect(onOAuthConnect).toHaveBeenCalledTimes(1);
    expect(onOAuthConnect.mock.calls[0][0].id).toBe("dev.figma-remote");
  });

  test("renders curated MCP entries without custom MCP CTA", () => {
    render(<ToolkitStorePage isDark={false} onEntryClick={() => {}} />);

    expect(screen.getByText("Playwright Browser")).toBeInTheDocument();
    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(screen.getByText("Notion")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "toolkit.store_add_custom" }),
    ).toBeNull();
    expect(screen.queryByText("toolkit.store_add_custom_subtitle")).toBeNull();
  });

  test("search filters by registry text", () => {
    render(<ToolkitStorePage isDark={false} onEntryClick={() => {}} />);

    fireEvent.change(
      screen.getByPlaceholderText("toolkit.store_search_placeholder"),
      { target: { value: "filesystem" } },
    );

    expect(screen.getByText("Filesystem")).toBeInTheDocument();
    expect(screen.queryByText("Playwright Browser")).toBeNull();
  });

  test("category filter narrows cards", () => {
    render(<ToolkitStorePage isDark={false} onEntryClick={() => {}} />);

    fireEvent.click(screen.getByText("toolkit.store_category_dev"));

    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(screen.queryByText("Playwright Browser")).toBeNull();
  });

  test("empty state appears when search has no matches", () => {
    render(<ToolkitStorePage isDark={false} onEntryClick={() => {}} />);

    fireEvent.change(
      screen.getByPlaceholderText("toolkit.store_search_placeholder"),
      { target: { value: "zzzzzz" } },
    );

    expect(screen.getByText("toolkit.store_empty_search")).toBeInTheDocument();
  });

  test("clicking a card sends the entry id", () => {
    const onEntryClick = jest.fn();
    render(<ToolkitStorePage isDark={false} onEntryClick={onEntryClick} />);

    fireEvent.click(screen.getByText("Playwright Browser"));

    expect(onEntryClick).toHaveBeenCalledWith("browser.playwright");
  });

  test("refresh metadata action calls the provided handler", () => {
    const onRefreshMetadata = jest.fn();
    render(
      <ToolkitStorePage
        isDark={false}
        onEntryClick={() => {}}
        onRefreshMetadata={onRefreshMetadata}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "toolkit.store_refresh_metadata" }));

    expect(onRefreshMetadata).toHaveBeenCalledTimes(1);
  });

  test("does not expose registry import controls in the Store", () => {
    render(<ToolkitStorePage isDark={false} onEntryClick={() => {}} />);

    expect(
      screen.queryByRole("button", { name: "toolkit.store_import_registry" }),
    ).toBeNull();
    expect(
      screen.queryByPlaceholderText("toolkit.store_registry_url_placeholder"),
    ).toBeNull();
    expect(
      screen.queryByPlaceholderText("toolkit.store_registry_json_placeholder"),
    ).toBeNull();
  });
});
