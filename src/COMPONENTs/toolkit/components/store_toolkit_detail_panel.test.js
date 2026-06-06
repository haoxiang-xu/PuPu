import { render, screen } from "@testing-library/react";
import StoreToolkitDetailPanel from "./store_toolkit_detail_panel";

jest.mock("../../../BUILTIN_COMPONENTs/mini_react/use_translation", () => ({
  __esModule: true,
  useTranslation: () => ({ t: (key) => key, locale: "en", setLocale: () => {} }),
}));

jest.mock("./toolkit_icon", () => ({
  __esModule: true,
  default: ({ icon }) => (
    <span data-testid="toolkit-icon">{icon?.name || "fallback"}</span>
  ),
  isBuiltinToolkitIcon: (icon) => icon?.type === "builtin",
  isFileToolkitIcon: () => false,
}));

jest.mock("../../../BUILTIN_COMPONENTs/code/code", () => ({
  __esModule: true,
  default: ({ code }) => <pre data-testid="code">{code}</pre>,
}));

jest.mock("../../../BUILTIN_COMPONENTs/markdown/markdown", () => ({
  __esModule: true,
  default: ({ content }) => <div data-testid="markdown">{content}</div>,
}));

jest.mock("../../../BUILTIN_COMPONENTs/icon/icon", () => ({
  __esModule: true,
  default: ({ src }) => <span data-testid={`icon-${src}`} />,
}));

jest.mock("../../../SERVICEs/mcp_install", () => ({
  __esModule: true,
  entryInstallState: (entry, ids) => {
    if (ids && ids.has(entry.toolkitId)) return "installed";
    if (entry.status === "needs_review") return "needs_review";
    if (
      ["browser.playwright", "memory.memory", "workspace.filesystem"].includes(
        entry.id,
      )
    )
      return "installable";
    return "coming_soon";
  },
}));

const entry = {
  id: "browser.playwright",
  toolkitId: "mcp.browser.playwright",
  toolkitName: "Playwright Browser",
  toolkitDescription:
    "Browser automation through the official Playwright MCP server.",
  source: "mcp",
  status: "available",
  trustLevel: "verified",
  license: "Apache-2.0",
  sourceRepo: "https://github.com/microsoft/playwright-mcp",
  docsUrl: "https://github.com/microsoft/playwright-mcp",
  toolkitIcon: { type: "builtin", name: "globe", backgroundColor: "#dbeafe" },
  mcp: { transport: "stdio" },
  setupPreview: "npx -y @playwright/mcp@latest",
  prerequisites: ["Node.js >= 18"],
  secrets: [],
  tools: [
    { name: "browser_navigate", title: "Navigate", requiresConfirmation: false },
    { name: "browser_click", title: "Click", requiresConfirmation: true },
  ],
  policySummary: { defaultEnabledTools: 0, confirmationRequiredTools: 1 },
  readmeMarkdown: "## Playwright\n\nDrives a browser.",
};

describe("StoreToolkitDetailPanel", () => {
  test("installable detail shows an enabled Install button", () => {
    render(
      <StoreToolkitDetailPanel
        entry={entry}
        isDark={false}
        installedIds={new Set()}
        onInstall={jest.fn()}
        onBack={() => {}}
      />,
    );
    expect(
      screen.getByRole("button", { name: "toolkit.store_install" }),
    ).not.toBeDisabled();
  });

  test("installed detail shows a disabled Installed button", () => {
    render(
      <StoreToolkitDetailPanel
        entry={entry}
        isDark={false}
        installedIds={new Set(["mcp.browser.playwright"])}
        onInstall={() => {}}
        onBack={() => {}}
      />,
    );
    expect(
      screen.getByRole("button", { name: "toolkit.store_installed" }),
    ).toBeDisabled();
  });

  test("workspace error shows inline message", () => {
    render(
      <StoreToolkitDetailPanel
        entry={{
          ...entry,
          id: "workspace.filesystem",
          toolkitId: "mcp.workspace.filesystem",
        }}
        isDark={false}
        installedIds={new Set()}
        onInstall={() => {}}
        installError={{ code: "mcp_workspace_required" }}
        onBack={() => {}}
      />,
    );
    expect(
      screen.getByText("toolkit.store_workspace_required"),
    ).toBeInTheDocument();
  });

  test("renders setup command, tools, permissions and markdown", () => {
    render(
      <StoreToolkitDetailPanel
        entry={entry}
        isDark={false}
        installedIds={new Set()}
        onInstall={() => {}}
        onBack={() => {}}
      />,
    );

    expect(screen.getByTestId("code")).toHaveTextContent(
      "npx -y @playwright/mcp@latest",
    );
    expect(screen.getByText("Navigate")).toBeInTheDocument();
    expect(
      screen.getByText((text) => text.includes("Click")),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, node) => node?.textContent === "0 toolkit.store_auto_enabled",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, node) => node?.textContent === "1 toolkit.store_ask_before_run",
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("markdown")).toHaveTextContent("Playwright");
  });

  test("renders repository and docs links as external anchors", () => {
    render(
      <StoreToolkitDetailPanel
        entry={entry}
        isDark={false}
        installedIds={new Set()}
        onInstall={() => {}}
        onBack={() => {}}
      />,
    );

    const repo = screen.getByText("toolkit.store_repository").closest("a");
    expect(repo).toHaveAttribute(
      "href",
      "https://github.com/microsoft/playwright-mcp",
    );
    expect(repo).toHaveAttribute("target", "_blank");
    expect(repo).toHaveAttribute("rel", "noreferrer");
  });

  test("needs_review entry renders the Phase 2A warning", () => {
    render(
      <StoreToolkitDetailPanel
        entry={{ ...entry, status: "needs_review", trustLevel: "needs_review" }}
        isDark={false}
        installedIds={new Set()}
        onInstall={() => {}}
        onBack={() => {}}
      />,
    );

    expect(
      screen.getByText("toolkit.store_needs_review_title"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("toolkit.store_needs_review_phase2a"),
    ).toBeInTheDocument();
  });
});
