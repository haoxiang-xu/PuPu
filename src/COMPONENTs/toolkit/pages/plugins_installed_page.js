import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import api from "../../../SERVICEs/api";
import {
  getDefaultToolkitSelection,
  setDefaultToolkitEnabled,
  removeInvalidToolkitIds,
} from "../../../SERVICEs/default_toolkit_store";
import { withMcpStoreIcon } from "../../../SERVICEs/mcp_toolkit_store";
import { subscribeToolkitCatalogRefresh } from "../../../SERVICEs/toolkit_catalog_refresh";
import { toPluginPresentation } from "../../../SERVICEs/plugin_presentation";
import { isBaseToolkitId } from "../utils/plugin_actions";
import { ToolkitIconFrame } from "../components/toolkit_icon";
import { SemiSwitch } from "../../../BUILTIN_COMPONENTs/input/switch";
import { Input } from "../../../BUILTIN_COMPONENTs/input/input";
import Tooltip from "../../../BUILTIN_COMPONENTs/tooltip/tooltip";
import SuspenseFallback from "../../../BUILTIN_COMPONENTs/suspense/suspense_fallback";
import PlaceholderBlock from "../components/placeholder_block";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import useAsyncAction from "../../../BUILTIN_COMPONENTs/mini_react/use_async_action";

/**
 * PluginsInstalledPage — App Store "Installed" screen.
 *
 * Behavior (install/delete/auto-enable/reload) is lifted verbatim from
 * `toolkit_installed_page.js`; only the presentation changed — plugin
 * vocabulary via `toPluginPresentation`, and a leaner row (icon + name +
 * command chip + tagline + switch, no inline delete — delete now lives in
 * the plugin detail page, reached via `onOpenDetail`).
 */
const PluginsInstalledPage = ({
  isDark,
  onOpenDetail,
  onHandlersReady,
  onOpenCustomMcp,
}) => {
  const { theme } = useContext(ConfigContext);
  const { t } = useTranslation();
  const [toolkits, setToolkits] = useState([]);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  const { run: loadCatalog, pending, error: loadError } = useAsyncAction(
    useCallback(async () => {
      const payload = await api.unchain.listToolModalCatalog();
      const list = Array.isArray(payload?.toolkits) ? payload.toolkits : [];
      const visible = list.filter(
        (tk) =>
          tk.source !== "plugin" &&
          !tk.hidden &&
          !isBaseToolkitId(tk.toolkitId),
      );
      const validIds = visible.map((tk) => tk.toolkitId);
      removeInvalidToolkitIds("global", validIds);
      const enabledIds = new Set(getDefaultToolkitSelection("global"));
      return visible.map((tk) =>
        withMcpStoreIcon({
          ...tk,
          defaultEnabled: enabledIds.has(tk.toolkitId),
        }),
      );
    }, []),
    { label: "plugins_installed_catalog_load", pendingDelayMs: 0, onError: () => {} },
  );

  const error = loadError ? (loadError.message || t("toolkit.load_catalog_failed")) : null;
  const loading = pending || !initialLoadDone;

  useEffect(() => {
    loadCatalog().then((result) => {
      if (result !== undefined) setToolkits(result);
      setInitialLoadDone(true);
    });
  }, [loadCatalog]);

  const reload = useCallback(async () => {
    const result = await loadCatalog();
    if (result !== undefined) setToolkits(result);
  }, [loadCatalog]);

  /* Any consumer that changes the underlying catalog (install / OAuth /
     delete happening elsewhere in the shell) emits a catalog-refresh event —
     keep this list in sync even when the change didn't originate here. */
  useEffect(() => subscribeToolkitCatalogRefresh(() => reload()), [reload]);

  const handleToggleEnabled = useCallback((toolkitId, enabled) => {
    const nextIds = setDefaultToolkitEnabled("global", toolkitId, enabled);
    const enabledSet = new Set(nextIds);
    setToolkits((prev) =>
      prev.map((tk) => ({
        ...tk,
        defaultEnabled: enabledSet.has(tk.toolkitId),
      })),
    );
  }, []);

  /* Delete now lives entirely in the plugin detail page, wired through the
     shell's own `deletePluginToolkit` call (review C1) — the shell no
     longer routes delete through this page's handlers, so only `reload` is
     exposed here (used after shell-driven install/OAuth/delete actions to
     keep this list in sync when it's mounted). */
  useEffect(() => {
    onHandlersReady?.({ reload });
  }, [onHandlersReady, reload]);

  const rows = useMemo(
    () =>
      toolkits.map((tk) => ({
        toolkit: tk,
        presentation: toPluginPresentation(tk),
      })),
    [toolkits],
  );

  /* Search — ported from toolkit_installed_page.js (filters by name,
     description and command/tool names), which PluginsInstalledPage dropped
     entirely when it replaced the old page. */
  const [search, setSearch] = useState("");
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(({ toolkit: tk }) => {
      const name = (tk.toolkitName || tk.toolkitId || "").toLowerCase();
      const desc = (tk.toolkitDescription || "").toLowerCase();
      const names = (tk.tools || [])
        .map((tool) => (tool.title || tool.name || "").toLowerCase())
        .concat((tk.skills || []).map((skill) => (skill.title || skill.name || "").toLowerCase()))
        .join(" ");
      return name.includes(q) || desc.includes(q) || names.includes(q);
    });
  }, [rows, search]);

  const fontFamily = theme?.font?.fontFamily || "Jost, sans-serif";
  const titleFontFamily = theme?.font?.titleFontFamily || fontFamily;
  const primaryText = isDark ? "rgba(255,255,255,0.88)" : "rgba(0,0,0,0.85)";
  const tertiaryText = isDark ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.35)";
  const chipColor = isDark ? "#7c8cf8" : "#2563eb";
  const dividerColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";

  if (loading) return <SuspenseFallback minHeight={160} />;

  if (error) {
    return (
      <PlaceholderBlock
        icon="tool"
        title={t("toolkit.unchain_not_connected_title")}
        subtitle={t("toolkit.unchain_not_connected_subtitle")}
        isDark={isDark}
      />
    );
  }

  /* Low-key custom MCP entry — demoted here (and to the same spot on
     PluginsCategoriesPage) from its own legacy "Custom MCP" store tab. */
  const customMcpFooter = (
    <div
      role="button"
      onClick={() => onOpenCustomMcp?.()}
      style={{
        fontSize: 11,
        fontFamily,
        color: tertiaryText,
        cursor: "pointer",
        marginTop: 18,
        paddingTop: 12,
        borderTop: `1px solid ${dividerColor}`,
      }}
    >
      {t("toolkit.add_custom_plugin")} ›
    </div>
  );

  if (toolkits.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column" }}>
        <PlaceholderBlock
          icon="download"
          title={t("toolkit.no_toolkits_title")}
          subtitle={t("toolkit.no_toolkits_subtitle")}
          isDark={isDark}
        />
        {customMcpFooter}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "0 0 16px" }}>
        <span
          style={{
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            fontFamily: titleFontFamily,
            color: isDark ? "#ffffff" : "#1c1c21",
          }}
        >
          {t("toolkit.installed_title")}
        </span>
        <span style={{ fontSize: 12.5, fontFamily, color: tertiaryText }}>
          {t("toolkit.installed_count", { count: filteredRows.length })}
        </span>
      </div>

      <Input
        prefix_icon="search"
        value={search}
        set_value={(value) => setSearch(value)}
        placeholder={t("toolkit.search_placeholder")}
        style={{
          width: "100%",
          fontSize: 13,
          fontFamily,
          borderRadius: 7,
          color: isDark ? "#fff" : "#222",
          paddingVertical: 7,
          paddingHorizontal: 10,
          marginBottom: 14,
        }}
      />

      {filteredRows.length === 0 && (
        <div style={{ fontSize: 12, fontFamily, color: tertiaryText, padding: "16px 4px" }}>
          {t("toolkit.installed_no_matches")}
        </div>
      )}

      {filteredRows.map(({ toolkit: tk, presentation }, idx) => {
        const firstCommand = presentation.commands[0];
        return (
          <div
            key={tk.toolkitId}
            onClick={() => onOpenDetail?.({ ...presentation, raw: tk })}
            style={{
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 13,
              padding: "11px 4px",
              borderBottom:
                idx === filteredRows.length - 1 ? "none" : `1px solid ${dividerColor}`,
            }}
          >
            <ToolkitIconFrame
              icon={tk.toolkitIcon}
              isDark={isDark}
              size={40}
              iconSize={20}
              borderRadius={11}
              fallbackColor={presentation.sourceBadge?.color}
            />

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 0 }}>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily,
                    color: primaryText,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {presentation.name}
                </span>
                {firstCommand && (
                  <span
                    style={{
                      fontFamily: "ui-monospace, Menlo, monospace",
                      fontSize: 10,
                      color: chipColor,
                      marginLeft: 7,
                    }}
                  >
                    {firstCommand.name}
                  </span>
                )}
              </div>
              {presentation.tagline && (
                <div
                  style={{
                    fontSize: 11,
                    fontFamily,
                    color: tertiaryText,
                    marginTop: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {presentation.tagline}
                </div>
              )}
            </div>

            <div onClick={(e) => e.stopPropagation()}>
              <Tooltip
                label={t("toolkit.auto_enable_card")}
                position="top"
                style={{ whiteSpace: "nowrap" }}
                wrapper_style={{ flexShrink: 0 }}
              >
                <SemiSwitch
                  on={Boolean(tk.defaultEnabled)}
                  set_on={(val) => handleToggleEnabled(tk.toolkitId, val)}
                  style={{ width: 44, height: 25 }}
                />
              </Tooltip>
            </div>
          </div>
        );
      })}

      {customMcpFooter}
    </div>
  );
};

export default PluginsInstalledPage;
