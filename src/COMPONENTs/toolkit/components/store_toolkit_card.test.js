import { fireEvent, render, screen } from "@testing-library/react";
import StoreToolkitCard from "./store_toolkit_card";

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

/* Mock the install-state helper so the card test does not pull in api.unchain. */
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
  toolkitIcon: { type: "builtin", name: "globe", backgroundColor: "#dbeafe" },
  mcp: { transport: "stdio" },
  tools: [
    { name: "browser_navigate", title: "Navigate" },
    { name: "browser_click", title: "Click" },
    { name: "browser_type", title: "Type" },
  ],
};

describe("StoreToolkitCard", () => {
  test("renders MCP metadata tags and tool count", () => {
    render(<StoreToolkitCard entry={entry} isDark={false} onClick={() => {}} />);

    expect(screen.getByText("Playwright Browser")).toBeInTheDocument();
    expect(screen.getByText("toolkit.source_mcp · stdio")).toBeInTheDocument();
    expect(screen.getByText("toolkit.trust_verified")).toBeInTheDocument();
    expect(screen.getByText("Apache-2.0")).toBeInTheDocument();
    expect(screen.getByText("3 toolkit.store_tools_count")).toBeInTheDocument();
  });

  test("clicking the card body fires onClick with the entry id", () => {
    const onClick = jest.fn();
    render(<StoreToolkitCard entry={entry} isDark={false} onClick={onClick} />);

    fireEvent.click(screen.getByText("Playwright Browser"));

    expect(onClick).toHaveBeenCalledWith("browser.playwright");
  });

  test("needs_review entry shows review tag and omits unverified license", () => {
    render(
      <StoreToolkitCard
        entry={{
          ...entry,
          id: "productivity.slack",
          toolkitId: "mcp.productivity.slack",
          status: "needs_review",
          trustLevel: "needs_review",
          license: "Unverified",
        }}
        isDark={false}
        onClick={() => {}}
      />,
    );

    expect(screen.getByText("toolkit.trust_needs_review")).toBeInTheDocument();
    expect(screen.queryByText("Unverified")).toBeNull();
  });

  test("installable entry shows Install and click stops propagation", () => {
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

    fireEvent.click(screen.getByText("toolkit.store_install"));

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

  test("unsupported entry shows Coming soon", () => {
    render(
      <StoreToolkitCard
        entry={{
          ...entry,
          id: "dev.github-remote",
          toolkitId: "mcp.dev.github-remote",
        }}
        isDark={false}
        installedIds={new Set()}
        onInstall={() => {}}
        onClick={() => {}}
      />,
    );

    expect(screen.getByText("toolkit.store_coming_soon")).toBeInTheDocument();
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
