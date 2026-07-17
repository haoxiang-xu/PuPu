import { fireEvent, render, screen } from "@testing-library/react";
import PluginInstallPill from "./plugin_install_pill";

/* M6 regression: the list-row pill only used to swap its label text to
   "Installing…" while an install was in flight — no spinner, unlike the
   retired plugin_tile.js's tile pill which paired the label with a small
   ArcSpinner. Ported the spinner back onto this pill (the shared list-row
   right slot Discover/Categories both use). */

const ENTRY = {
  id: "notion",
  toolkitId: "mcp.productivity.notion-remote",
  toolkitName: "Notion",
  source: "mcp",
  status: "available",
  installable: true,
  tools: [],
};

const noop = () => {};

describe("PluginInstallPill — installing spinner", () => {
  /* No `t` prop supplied — usePluginInstallState's translate() falls back
     to its literal English copy ("Installing…", "GET", …) whenever t isn't
     a function, same as every other caller-less usage in this suite. */
  test("shows the ArcSpinner alongside the label while installing", () => {
    const { container } = render(
      <PluginInstallPill
        entry={ENTRY}
        isDark={false}
        installedIds={new Set()}
        installing
        onInstall={noop}
        onOAuthConnect={noop}
        onCancelOAuth={noop}
        onOpenDetail={noop}
      />,
    );

    expect(screen.getByText("Installing…")).toBeInTheDocument();
    expect(container.querySelector(".mini-ui-arc-spinner-svg")).toBeTruthy();
  });

  test("does not show the spinner when not installing", () => {
    const { container } = render(
      <PluginInstallPill
        entry={ENTRY}
        isDark={false}
        installedIds={new Set()}
        installing={false}
        onInstall={noop}
        onOAuthConnect={noop}
        onCancelOAuth={noop}
        onOpenDetail={noop}
      />,
    );

    expect(container.querySelector(".mini-ui-arc-spinner-svg")).toBeNull();
  });

  test("clicking the pill while not installed fires onInstall", () => {
    const onInstall = jest.fn();
    render(
      <PluginInstallPill
        entry={ENTRY}
        isDark={false}
        installedIds={new Set()}
        installing={false}
        onInstall={onInstall}
        onOAuthConnect={noop}
        onCancelOAuth={noop}
        onOpenDetail={noop}
      />,
    );

    fireEvent.click(screen.getByRole("button"));
    expect(onInstall).toHaveBeenCalledWith(ENTRY);
  });
});
