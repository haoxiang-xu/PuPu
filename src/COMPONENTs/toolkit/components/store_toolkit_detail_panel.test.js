import { fireEvent, render, screen } from "@testing-library/react";
import StoreToolkitDetailPanel from "./store_toolkit_detail_panel";

jest.mock("../../../BUILTIN_COMPONENTs/mini_react/use_translation", () => ({
  __esModule: true,
  useTranslation: () => ({ t: (key) => key, locale: "en", setLocale: () => {} }),
}));

jest.mock("./toolkit_icon", () => ({
  __esModule: true,
  default: ({ icon, size }) => (
    <span data-testid="toolkit-icon" data-size={String(size)}>
      {icon?.name || "fallback"}
    </span>
  ),
  hasTransparentToolkitIconBackground: (backgroundColor) =>
    !backgroundColor || backgroundColor === "transparent",
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
    if (entry.mcp?.transport === "http" && (entry.secrets || []).length === 0)
      return "oauth";
    if (
      [
        "browser.playwright",
        "browser.browser-use-local",
        "dev.github-remote",
        "memory.memory",
        "productivity.slack",
        "workspace.filesystem",
      ].includes(entry.id)
    )
      return "installable";
    return "coming_soon";
  },
  setupKindForEntry: (entry) => {
    if (entry?.id === "workspace.filesystem") return "workspace";
    if (entry?.mcp?.transport === "http") {
      return (entry.secrets || []).length ? "http_secret" : "oauth";
    }
    if ((entry?.secrets || []).length) return "secrets";
    return "direct";
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

const secretEntry = {
  ...entry,
  id: "browser.browser-use-local",
  toolkitId: "mcp.browser.browser-use-local",
  toolkitName: "Browser Use",
  secrets: [{ key: "OPENAI_API_KEY", label: "OpenAI API key" }],
};

const oauthEntry = {
  ...entry,
  id: "productivity.notion-remote",
  toolkitId: "mcp.productivity.notion-remote",
  toolkitName: "Notion",
  mcp: { transport: "http" },
  secrets: [],
};

const dualAuthEntry = {
  ...entry,
  id: "dev.github-remote",
  toolkitId: "mcp.dev.github-remote",
  toolkitName: "GitHub",
  mcp: { transport: "http" },
  secrets: [{ key: "GITHUB_MCP_PAT", label: "GitHub Personal Access Token" }],
  auth: {
    oauth: {
      provider: "github",
      clientRegistration: "user_credentials",
    },
  },
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

  test("uses the default mcp icon with no background when entry omits toolkitIcon", () => {
    render(
      <StoreToolkitDetailPanel
        entry={{ ...entry, toolkitIcon: undefined }}
        isDark={false}
        installedIds={new Set()}
        onInstall={() => {}}
        onBack={() => {}}
      />,
    );

    const icon = screen.getByTestId("toolkit-icon");
    expect(icon).toHaveTextContent("mcp");
    expect(icon).toHaveAttribute("data-size", "24");
    expect(icon.parentElement).toHaveStyle({ backgroundColor: "transparent" });
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

  test("secret-backed entry explains missing secrets before install and passes secrets after input", () => {
    const onInstall = jest.fn();
    render(
      <StoreToolkitDetailPanel
        entry={secretEntry}
        isDark={false}
        installedIds={new Set()}
        onInstall={onInstall}
        onBack={() => {}}
      />,
    );

    const installButton = screen.getByRole("button", {
      name: "toolkit.store_enter_required_secrets",
    });
    expect(installButton).toBeDisabled();
    expect(
      screen.getByText((text) => text.includes("OPENAI_API_KEY")),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("OpenAI API key"), {
      target: { value: "sk-test" },
    });
    expect(
      screen.getByRole("button", { name: "toolkit.store_install" }),
    ).not.toBeDisabled();
    expect(installButton).not.toBeDisabled();
    fireEvent.click(installButton);

    expect(onInstall).toHaveBeenCalledWith(secretEntry, {
      secrets: { OPENAI_API_KEY: "sk-test" },
    });
  });

  test("oauth-only entry shows enabled Connect action", () => {
    const onOAuthConnect = jest.fn();
    render(
      <StoreToolkitDetailPanel
        entry={oauthEntry}
        isDark={false}
        installedIds={new Set()}
        onInstall={() => {}}
        onOAuthConnect={onOAuthConnect}
        onBack={() => {}}
      />,
    );

    const button = screen.getByRole("button", {
      name: "toolkit.store_connect",
    });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(onOAuthConnect).toHaveBeenCalledWith(oauthEntry);
  });

  test("secret-backed oauth entry keeps PAT install setup and offers oauth connect", () => {
    const onOAuthConnect = jest.fn();
    render(
      <StoreToolkitDetailPanel
        entry={dualAuthEntry}
        isDark={false}
        installedIds={new Set()}
        onInstall={() => {}}
        onOAuthConnect={onOAuthConnect}
        onBack={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "toolkit.store_enter_required_secrets",
      }),
    ).toBeDisabled();
    const oauthButton = screen.getByRole("button", {
      name: "toolkit.store_connect_oauth",
    });
    expect(oauthButton).not.toBeDisabled();
    fireEvent.click(oauthButton);
    expect(onOAuthConnect).toHaveBeenCalledWith(dualAuthEntry);
  });
});
