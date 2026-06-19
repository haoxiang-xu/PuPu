import { fireEvent, render, screen } from "@testing-library/react";
import StoreToolkitCard from "./store_toolkit_card";

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
  isBuiltinToolkitIcon: (icon) => icon?.type === "builtin",
  isFileToolkitIcon: () => false,
}));

/* Mock the install-state helper so the card test does not pull in api.unchain. */
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
  toolkitIcon: { type: "builtin", name: "globe", backgroundColor: "#dbeafe" },
  mcp: { transport: "stdio" },
  tools: [{ name: "a" }, { name: "b" }, { name: "c" }],
};

describe("StoreToolkitCard", () => {
  test("renders the name and description", () => {
    render(<StoreToolkitCard entry={entry} isDark={false} onClick={() => {}} />);
    expect(screen.getByText("Playwright Browser")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Browser automation through the official Playwright MCP server.",
      ),
    ).toBeInTheDocument();
  });

  test("clicking the row fires onClick with the entry id", () => {
    const onClick = jest.fn();
    render(<StoreToolkitCard entry={entry} isDark={false} onClick={onClick} />);
    fireEvent.click(screen.getByText("Playwright Browser"));
    expect(onClick).toHaveBeenCalledWith("browser.playwright");
  });

  test("installable entry shows an enabled install action and stops propagation", () => {
    const onInstall = jest.fn();
    const onClick = jest.fn();
    render(
      <StoreToolkitCard
        entry={entry}
        isDark={false}
        installedIds={new Set()}
        onInstall={onInstall}
        onClick={onClick}
      />,
    );

    const installBtn = screen.getByRole("button");
    expect(installBtn).not.toBeDisabled();
    fireEvent.click(installBtn);

    expect(onInstall).toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });

  test("installed entry shows Installed", () => {
    render(
      <StoreToolkitCard
        entry={entry}
        isDark={false}
        installedIds={new Set(["mcp.browser.playwright"])}
        onInstall={() => {}}
        onClick={() => {}}
      />,
    );
    expect(screen.getByText("toolkit.store_installed")).toBeInTheDocument();
  });

  test("default mcp icon matches installed row sizing", () => {
    render(
      <StoreToolkitCard
        entry={{ ...entry, toolkitIcon: undefined }}
        isDark={false}
        installedIds={new Set()}
        onInstall={() => {}}
        onClick={() => {}}
      />,
    );

    const icon = screen.getByTestId("toolkit-icon");
    expect(icon).toHaveTextContent("mcp");
    expect(icon).toHaveAttribute("data-size", "18");
    expect(screen.getByTestId("store-card-icon-wrap")).toHaveStyle({
      width: "36px",
      height: "36px",
      backgroundColor: "transparent",
    });
  });

  test("unsupported entry shows Coming soon", () => {
    render(
      <StoreToolkitCard
        entry={{
          ...entry,
          id: "unknown.entry",
          toolkitId: "mcp.unknown.entry",
        }}
        isDark={false}
        installedIds={new Set()}
        onInstall={() => {}}
        onClick={() => {}}
      />,
    );
    expect(screen.getByText("toolkit.store_coming_soon")).toBeInTheDocument();
  });

  test("secret-backed entry shows setup action and opens detail instead of installing", () => {
    const onInstall = jest.fn();
    const onClick = jest.fn();
    render(
      <StoreToolkitCard
        entry={{
          ...entry,
          id: "browser.browser-use-local",
          toolkitId: "mcp.browser.browser-use-local",
          secrets: [{ key: "OPENAI_API_KEY", label: "OpenAI API key" }],
        }}
        isDark={false}
        installedIds={new Set()}
        onInstall={onInstall}
        onClick={onClick}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "toolkit.store_setup" }));

    expect(onClick).toHaveBeenCalledWith("browser.browser-use-local");
    expect(onInstall).not.toHaveBeenCalled();
  });

  test("oauth-only entry shows enabled Connect action", () => {
    const onOAuthConnect = jest.fn();
    render(
      <StoreToolkitCard
        entry={{
          ...entry,
          id: "productivity.notion-remote",
          toolkitId: "mcp.productivity.notion-remote",
          mcp: { transport: "http" },
          secrets: [],
        }}
        isDark={false}
        installedIds={new Set()}
        onInstall={() => {}}
        onOAuthConnect={onOAuthConnect}
        onClick={() => {}}
      />,
    );

    const button = screen.getByRole("button", {
      name: "toolkit.store_connect",
    });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(onOAuthConnect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "productivity.notion-remote" }),
    );
  });

  test("needs_review entry shows Needs review", () => {
    render(
      <StoreToolkitCard
        entry={{
          ...entry,
          id: "productivity.slack",
          toolkitId: "mcp.productivity.slack",
          status: "needs_review",
          trustLevel: "needs_review",
        }}
        isDark={false}
        installedIds={new Set()}
        onInstall={() => {}}
        onClick={() => {}}
      />,
    );
    expect(
      screen.getByText("toolkit.store_needs_review_action"),
    ).toBeInTheDocument();
  });

  test("shows a compact inline install error", () => {
    render(
      <StoreToolkitCard
        entry={entry}
        isDark={false}
        installedIds={new Set()}
        onInstall={() => {}}
        onClick={() => {}}
        installError={{ entryId: "browser.playwright", code: "mcp_install_failed" }}
      />,
    );
    expect(screen.getByText("toolkit.store_install_error")).toBeInTheDocument();
  });

  test("shows backend install error message when available", () => {
    render(
      <StoreToolkitCard
        entry={entry}
        isDark={false}
        installedIds={new Set()}
        onInstall={() => {}}
        onClick={() => {}}
        installError={{
          entryId: "browser.playwright",
          code: "mcp_runtime_install_failed",
          message: "Unable to download PuPu-managed Node runtime",
        }}
      />,
    );
    expect(
      screen.getByText("Unable to download PuPu-managed Node runtime"),
    ).toBeInTheDocument();
  });

  test("shows workspace-required inline error", () => {
    render(
      <StoreToolkitCard
        entry={entry}
        isDark={false}
        installedIds={new Set()}
        onInstall={() => {}}
        onClick={() => {}}
        installError={{
          entryId: "browser.playwright",
          code: "mcp_workspace_required",
        }}
      />,
    );
    expect(
      screen.getByText("toolkit.store_workspace_required"),
    ).toBeInTheDocument();
  });
});
