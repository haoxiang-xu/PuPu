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
import PluginListRow from "../components/plugin_list_row";
import ComputerStatusPill from "../components/computer_status_pill";
import { BUILTIN_COMPUTER_TOOLKIT_ID } from "../plugin_settings_registry";
import { SettingsSection } from "../../settings/appearance";
import { SemiSwitch } from "../../../BUILTIN_COMPONENTs/input/switch";
import { Input } from "../../../BUILTIN_COMPONENTs/input/input";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import Tooltip from "../../../BUILTIN_COMPONENTs/tooltip/tooltip";
import SuspenseFallback from "../../../BUILTIN_COMPONENTs/suspense/suspense_fallback";
import PlaceholderBlock from "../components/placeholder_block";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import useAsyncAction from "../../../BUILTIN_COMPONENTs/mini_react/use_async_action";

/**
 * PluginsInstalledPage — settings-isomorphic "Installed" screen (T3).
 * Ground truth: mockup screen ③ — a fixed 22px/600 title + search, and a
 * scrollable body of two SettingsSections ("Built-in" / "MCP") grouping
 * plugin_list_row rows by source, right-slotted with the auto-enable
 * SemiSwitch. There is no update-detection mechanism in the codebase today
 * (grepped mcp_toolkit_store.js / mcp_install.js) so the mockup's UPDATE
 * pill is omitted per the plan's "keep existing detection, else omit"
 * clause rather than faked.
 *
 * Behavior (catalog load/filter/toggle-write-back/refresh-subscription) is
 * unchanged from the App Store version this replaces — only the
 * presentation (fixed header, source-grouped sections, plugin_list_row
 * instead of an inline row) changed. Delete still lives entirely in the
 * plugin detail page, reached via `onOpenDetail`.
 */
const PluginsInstalledPage = ({
  isDark,
  onOpenDetail,
  onHandlersReady,
  onOpenCustomMcp,
  onOpenImportSkills,
  onOpenPluginSettings,
}) => {
  const { theme } = useContext(ConfigContext);
  const { t } = useTranslation();
  const [toolkits, setToolkits] = useState([]);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  const { run: loadCatalog, pending, error: loadError } = useAsyncAction(
    useCallback(async () => {
      const [catalogResult, installedMcpResult] = await Promise.allSettled([
        api.unchain.listToolModalCatalog(),
        api.unchain.listMcpToolkits(),
      ]);
      if (catalogResult.status === "rejected" && installedMcpResult.status === "rejected") {
        throw catalogResult.reason || installedMcpResult.reason;
      }

      const catalog = catalogResult.status === "fulfilled" ? catalogResult.value : {};
      const list = Array.isArray(catalog?.toolkits) ? catalog.toolkits : [];
      const visibleCatalog = list.filter(
        (tk) =>
          tk.source !== "plugin" &&
          !tk.hidden &&
          !isBaseToolkitId(tk.toolkitId),
      );
      const validIds = visibleCatalog.map((tk) => tk.toolkitId);
      if (catalogResult.status === "fulfilled") {
        removeInvalidToolkitIds("global", validIds);
      }
      const enabledIds = new Set(getDefaultToolkitSelection("global"));
      const installedPayload = installedMcpResult.status === "fulfilled"
        ? installedMcpResult.value
        : {};
      const installedMcp = Array.isArray(installedPayload?.toolkits)
        ? installedPayload.toolkits
        : [];
      const merged = new Map(
        visibleCatalog.map((tk) => [
          tk.toolkitId,
          {
            ...tk,
            defaultEnabled: enabledIds.has(tk.toolkitId),
          },
        ]),
      );
      for (const record of installedMcp) {
        const toolkitId = String(record?.toolkitId || "").trim();
        if (!toolkitId || isBaseToolkitId(toolkitId)) continue;
        const existing = merged.get(toolkitId);
        if (existing) {
          merged.set(toolkitId, {
            ...record,
            ...existing,
            status: record.status || existing.status,
            lastError: record.lastError || existing.lastError,
            releaseBlocked: Boolean(record.releaseBlocked || existing.releaseBlocked),
          });
        } else {
          merged.set(toolkitId, {
            ...record,
            source: record.source || "mcp",
            defaultEnabled: false,
          });
        }
      }
      return [...merged.values()].map((tk) => withMcpStoreIcon(tk));
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
  const tertiaryText = isDark ? "rgba(var(--pupu-text-rgb),0.38)" : "rgba(var(--pupu-text-rgb),0.35)";
  const dividerColor = "rgba(var(--pupu-text-rgb),0.06)";

  /* Source grouping (T3) — mockup screen ③ splits Installed into a
     "Built-in" section (source builtin/local), an "MCP" section (source mcp /
     mcp_registry), and a "Skill packs" section (source skillpack, imported
     SKILL.md packs). Skill packs are pure-skill plugins, not builtins, so they
     get their own section rather than falling under "Built-in". */
  const skillPackRows = filteredRows.filter(
    ({ toolkit: tk }) => String(tk.source || "") === "skillpack",
  );
  const builtinRows = filteredRows.filter(
    ({ toolkit: tk }) =>
      !String(tk.source || "").startsWith("mcp") &&
      String(tk.source || "") !== "skillpack",
  );
  const mcpRows = filteredRows.filter(({ toolkit: tk }) =>
    String(tk.source || "").startsWith("mcp"),
  );

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
      style={{
        marginTop: 6,
        paddingTop: 12,
        borderTop: `1px solid ${dividerColor}`,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        role="button"
        onClick={() => onOpenCustomMcp?.()}
        style={{
          fontSize: 11,
          fontFamily,
          color: tertiaryText,
          cursor: "pointer",
        }}
      >
        {t("toolkit.add_custom_plugin")} ›
      </div>
      <div
        role="button"
        onClick={() => onOpenImportSkills?.()}
        style={{
          fontSize: 11,
          fontFamily,
          color: tertiaryText,
          cursor: "pointer",
        }}
      >
        {t("toolkit.import_skills_link")} ›
      </div>
    </div>
  );

  const renderRow = ({ toolkit: tk, presentation }) => {
    const isComputer =
      tk.toolkitId === BUILTIN_COMPUTER_TOOLKIT_ID ||
      tk.settingsKind === "computer_use";
    const normalizedStatus = String(tk.status || "").trim().toLowerCase();
    const needsAttention =
      ["error", "unavailable"].includes(normalizedStatus) ||
      Boolean(tk.releaseBlocked) ||
      (String(tk.authType || "").toLowerCase() === "oauth" &&
        String(tk.authStatus || "").toLowerCase() !== "connected");
    const openDetail = () =>
      isComputer
        ? onOpenPluginSettings?.(tk.toolkitId)
        : onOpenDetail?.({ ...presentation, raw: tk });
    return (
      <PluginListRow
        key={tk.toolkitId}
        icon={tk.toolkitIcon}
        isDark={isDark}
        name={presentation.name}
        command={presentation.commands[0]?.name}
        description={presentation.tagline}
        fallbackColor={presentation.sourceBadge?.color}
        onOpenDetail={openDetail}
        testId={`installed-row-${tk.toolkitId}`}
      >
        {needsAttention ? (
          <Button
            label={t("toolkit.installed_needs_attention")}
            onClick={openDetail}
            style={{
              fontSize: 11,
              fontWeight: 500,
              paddingVertical: 3,
              paddingHorizontal: 11,
              borderRadius: 999,
              color: isDark ? "#fdba74" : "#c2410c",
              root: {
                background: isDark
                  ? "rgba(253,186,116,0.10)"
                  : "rgba(194,65,12,0.08)",
              },
            }}
          />
        ) : isComputer ? (
          <ComputerStatusPill isDark={isDark} />
        ) : (
          <Tooltip
            label={t("toolkit.auto_enable_card")}
            position="top"
            style={{ whiteSpace: "nowrap" }}
            wrapper_style={{ flexShrink: 0 }}
          >
            <SemiSwitch
              on={Boolean(tk.defaultEnabled)}
              set_on={(val) => handleToggleEnabled(tk.toolkitId, val)}
              style={{ width: 56, height: 28 }}
            />
          </Tooltip>
        )}
      </PluginListRow>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* ── Fixed header — 22px/600 title + search, ported to plugin_list_row
           semantics but pinned above the scrollable body (settings_modal_content.js's
           own title+content split). ── */}
      <div style={{ flexShrink: 0, padding: "20px 26px 0" }}>
        <span
          style={{
            fontSize: 22,
            fontWeight: 500,
            letterSpacing: "-0.01em",
            fontFamily,
            color: "var(--pupu-text)",
          }}
        >
          {t("toolkit.installed_title")}
        </span>

        <Input
          prefix_icon="search"
          value={search}
          set_value={(value) => setSearch(value)}
          placeholder={t("toolkit.search_placeholder")}
          style={{
            width: "100%",
            fontSize: 12.5,
            fontFamily,
            borderRadius: 7,
            color: "var(--pupu-text)",
            paddingVertical: 7,
            paddingHorizontal: 10,
            marginTop: 12,
            marginBottom: 4,
          }}
        />
      </div>

      {/* ── Scrollable body — Built-in / MCP SettingsSections + footer. ── */}
      <div className="scrollable" style={{ flex: 1, overflowY: "auto", padding: "0 26px 26px" }}>
        {filteredRows.length === 0 && (
          <div style={{ fontSize: 12, fontFamily, color: tertiaryText, padding: "16px 0" }}>
            {t("toolkit.installed_no_matches")}
          </div>
        )}

        {builtinRows.length > 0 && (
          <SettingsSection title={t("toolkit.source_builtin")}>
            {builtinRows.map(renderRow)}
          </SettingsSection>
        )}

        {mcpRows.length > 0 && (
          <SettingsSection title={t("toolkit.source_mcp")}>
            {mcpRows.map(renderRow)}
          </SettingsSection>
        )}

        {skillPackRows.length > 0 && (
          <SettingsSection title={t("toolkit.source_skillpack")}>
            {skillPackRows.map(renderRow)}
          </SettingsSection>
        )}

        {customMcpFooter}
      </div>
    </div>
  );
};

export default PluginsInstalledPage;
