import { useCallback, useMemo } from "react";
import {
  entryInstallState,
  entryOpensSetup,
} from "../../../SERVICEs/mcp_install";

/**
 * usePluginInstallState — the install/setup/oauth/needs-review/installing
 * state machine, extracted verbatim (state derivation + label + click
 * dispatch) from `store_toolkit_card.js:34-56` so every App-Store surface
 * that needs a GET/OPEN action (Task 3's plugin_detail_page, Task 4's
 * discover/categories tiles) shares one source of truth instead of
 * re-deriving it.
 *
 * `forceInstalled` is for callers that already know the plugin is installed
 * without an MCP store entry to check against (e.g. the Installed page's
 * built-in/local plugins, which never appear in `installedIds` because that
 * set only tracks MCP installs) — it short-circuits straight to "installed"
 * instead of letting `entryInstallState` mis-classify it as coming_soon.
 */
export function usePluginInstallState({
  entry,
  installedIds,
  installing = false,
  forceInstalled = false,
  onInstall,
  onOAuthConnect,
  onCancelOAuth,
  t,
} = {}) {
  const translate = useCallback(
    (key, fallback) => (typeof t === "function" ? t(key) : fallback),
    [t],
  );

  const { installState, opensSetup } = useMemo(() => {
    const state = forceInstalled
      ? "installed"
      : entry
        ? entryInstallState(entry, installedIds)
        : "coming_soon";
    const setup = forceInstalled ? false : entryOpensSetup(entry, installedIds);
    return { installState: state, opensSetup: setup };
  }, [entry, installedIds, forceInstalled]);

  const stateLabel = installing
    ? installState === "oauth"
      ? translate("toolkit.store_waiting_for_oauth", "Waiting for OAuth")
      : translate("toolkit.store_installing", "Installing…")
    : installState === "installed"
      ? translate("toolkit.pill_open", "OPEN")
      : installState === "installable"
        ? opensSetup
          ? translate("toolkit.store_setup", "Set up")
          : translate("toolkit.pill_get", "GET")
        : installState === "needs_review"
          ? translate("toolkit.store_needs_review_action", "Needs review")
          : installState === "oauth"
            ? translate("toolkit.store_connect", "Connect")
            : translate("toolkit.store_coming_soon", "Coming soon");

  const canInstall = ["installable", "oauth"].includes(installState) && !installing;

  const handleInstall = useCallback(() => {
    if (!canInstall || !entry) return;
    if (installState === "oauth") {
      onOAuthConnect?.(entry);
      return;
    }
    /* opensSetup entries need a secrets/http-secret/custom form before they
       can install — callers (plugin_tile.js, plugins_discover_page.js) are
       expected to check `opensSetup` and open the detail page instead of
       calling this; this is a defense-in-depth no-op so a caller that
       forgets the check can never fire a secretless install. */
    if (opensSetup) return;
    onInstall?.(entry);
  }, [canInstall, installState, opensSetup, entry, onInstall, onOAuthConnect]);

  const handleCancelOauth = useCallback(() => {
    if (!entry) return;
    onCancelOAuth?.(entry);
  }, [entry, onCancelOAuth]);

  return {
    installState,
    opensSetup,
    stateLabel,
    canInstall,
    installing,
    onInstall: handleInstall,
    onCancelOauth: handleCancelOauth,
  };
}

export default usePluginInstallState;
