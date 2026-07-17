import { useContext, useMemo, useState } from "react";
import { Input } from "../../../BUILTIN_COMPONENTs/input/input";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import ArcSpinner from "../../../BUILTIN_COMPONENTs/spinner/arc_spinner";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import {
  listMcpStoreEntries,
  searchMcpStoreEntries,
  resolveMcpIcon,
} from "../../../SERVICEs/mcp_toolkit_store";
import { toPluginPresentation } from "../../../SERVICEs/plugin_presentation";
import { STORE_CATEGORY_CONFIG } from "../constants";
import PlaceholderBlock from "../components/placeholder_block";
import PluginListRow from "../components/plugin_list_row";
import PluginInstallPill from "../components/plugin_install_pill";

/* PluginsCategoriesPage — settings-isomorphic "Categories" screen (T3): a
   fixed header (22px/600 title + search + category pills + the
   refresh-metadata action) over a scrollable body of plugin_list_row rows
   (replacing the plugin_tile grid), right-slotted with the Get/Open pill.
   Data flow (fetch / external-registry merge / refresh-metadata) is lifted
   verbatim from the legacy toolkit_store_page.js — `listMcpStoreEntries()`
   reads the same merged cache (static registry + any external registry
   entries the shell has loaded into setMcpStoreEntriesCache), so behavior
   is identical; only the presentation changed. */
const PluginsCategoriesPage = ({
  isDark,
  onOpenDetail,
  installedIds,
  onInstall,
  onOAuthConnect,
  onCancelOAuth,
  installingIds,
  installError,
  metadataRefreshing = false,
  metadataError = null,
  onRefreshMetadata,
  onOpenCustomMcp,
  search: controlledSearch,
  onSearchChange,
}) => {
  const context = useContext(ConfigContext) || {};
  const { t } = useTranslation();
  const fontFamily = context.theme?.font?.fontFamily || "Jost, sans-serif";
  /* The search box is controlled by the shell when it's reached via the
     sidebar search input (review I7) — that keeps the sidebar box and this
     page's own box as one source of truth instead of two states that can
     drift. Falls back to fully-local state for any other caller (tests
     included) that doesn't pass `search`/`onSearchChange`. */
  const [localSearch, setLocalSearch] = useState("");
  const search = controlledSearch !== undefined ? controlledSearch : localSearch;
  const setSearch = onSearchChange || setLocalSearch;
  const [category, setCategory] = useState("all");

  const categorySections = useMemo(
    () =>
      STORE_CATEGORY_CONFIG.map((item) => ({
        ...item,
        label: t(item.labelKey),
      })),
    [t],
  );

  const entries = listMcpStoreEntries();
  const filtered = useMemo(
    () => searchMcpStoreEntries(entries, search, category),
    [entries, search, category],
  );

  /* Category pill group — same visual language as the legacy store page's
     pill row (mirrors the Ollama model library browser); already flat, so
     T3 restyles only the list below it. */
  const pillActiveBg = isDark ? "rgba(var(--pupu-text-rgb),0.11)" : "rgba(var(--pupu-text-rgb),0.08)";
  const pillHoverBg = isDark ? "rgba(var(--pupu-text-rgb),0.06)" : "rgba(var(--pupu-text-rgb),0.04)";
  const pillActiveTxt = isDark ? "rgba(var(--pupu-text-rgb),0.90)" : "rgba(var(--pupu-text-rgb),0.85)";
  const pillInactiveTxt = isDark ? "rgba(var(--pupu-text-rgb),0.45)" : "rgba(var(--pupu-text-rgb),0.42)";
  const activePillBorder = "rgba(var(--pupu-text-rgb),0.15)";
  const warningColor = isDark ? "#fdba74" : "#c2410c";
  const textColor = isDark ? "rgba(var(--pupu-text-rgb),0.90)" : "rgba(var(--pupu-text-rgb),0.85)";
  const tertiaryText = isDark ? "rgba(var(--pupu-text-rgb),0.34)" : "rgba(var(--pupu-text-rgb),0.4)";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* ── Fixed header — title, search, category pills + refresh action,
           and the metadata/install error strips (both tightly bound to the
           header controls above them). ── */}
      <div style={{ flexShrink: 0, padding: "20px 26px 0", display: "flex", flexDirection: "column", gap: 12 }}>
        <span
          style={{
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            fontFamily,
            color: textColor,
          }}
        >
          {t("toolkit.nav_categories")}
        </span>

        <Input
          prefix_icon="search"
          value={search}
          set_value={(value) => setSearch(value)}
          placeholder={t("toolkit.search_placeholder_v2")}
          style={{
            width: "100%",
            fontSize: 12.5,
            fontFamily,
            borderRadius: 7,
            color: "var(--pupu-text)",
            paddingVertical: 7,
            paddingHorizontal: 10,
          }}
        />

        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {categorySections.map((cat) => {
            const active = category === cat.key;
            return (
              <button
                key={cat.key}
                onClick={() => setCategory(cat.key)}
                style={{
                  fontSize: 11,
                  fontFamily,
                  fontWeight: 500,
                  padding: "3px 10px",
                  borderRadius: 999,
                  border: `1px solid ${active ? activePillBorder : "transparent"}`,
                  backgroundColor: active ? pillActiveBg : "transparent",
                  color: active ? pillActiveTxt : pillInactiveTxt,
                  cursor: "pointer",
                  outline: "none",
                  transition: "background 0.12s, color 0.12s",
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.backgroundColor = pillHoverBg;
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                {cat.label}
              </button>
            );
          })}
          <span
            title={
              metadataRefreshing
                ? t("toolkit.store_refreshing_metadata")
                : t("toolkit.store_refresh_metadata")
            }
            style={{ display: "inline-flex", alignItems: "center" }}
          >
            {metadataRefreshing ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 4,
                }}
              >
                <ArcSpinner
                  size={14}
                  stroke_width={2}
                  color={isDark ? "rgba(255,255,255,0.62)" : "rgba(0,0,0,0.58)"}
                />
              </span>
            ) : (
              <Button
                prefix_icon="update"
                ariaLabel={t("toolkit.store_refresh_metadata")}
                title={t("toolkit.store_refresh_metadata")}
                onClick={onRefreshMetadata}
                style={{
                  paddingVertical: 4,
                  paddingHorizontal: 4,
                  borderRadius: 999,
                  color: isDark ? "rgba(var(--pupu-text-rgb),0.62)" : "rgba(var(--pupu-text-rgb),0.58)",
                  hoverBackgroundColor: isDark ? "rgba(var(--pupu-text-rgb),0.08)" : "rgba(var(--pupu-text-rgb),0.06)",
                  content: { icon: { width: 14, height: 14 } },
                }}
              />
            )}
          </span>
        </div>

        {metadataError && (
          <div style={{ fontSize: 10.5, fontFamily, color: warningColor, marginTop: -8 }}>
            {t("toolkit.store_metadata_error")}
          </div>
        )}

        {installError && (
          <div style={{ fontSize: 10.5, fontFamily, color: warningColor, marginTop: -8 }}>
            {installError.message || t("toolkit.store_install_error")}
          </div>
        )}
      </div>

      {/* ── Scrollable body — plugin_list_row list (replacing the tile
           grid), the low-key custom MCP footer link, and the trademark
           disclaimer. ── */}
      <div className="scrollable" style={{ flex: 1, overflowY: "auto", padding: "10px 26px 26px" }}>
        {filtered.length > 0 ? (
          filtered.map((entry) => {
            const presentation = toPluginPresentation(entry);
            return (
              <PluginListRow
                key={entry.id}
                icon={resolveMcpIcon(entry)}
                isDark={isDark}
                name={presentation.name}
                command={presentation.commands?.[0]?.name}
                description={presentation.tagline}
                fallbackColor={presentation.sourceBadge?.color}
                onOpenDetail={() => onOpenDetail?.(entry.id)}
                testId={`category-row-${entry.id}`}
              >
                <PluginInstallPill
                  entry={entry}
                  isDark={isDark}
                  installedIds={installedIds}
                  installing={installingIds?.has(entry.id) || false}
                  onInstall={onInstall}
                  onOAuthConnect={onOAuthConnect}
                  onCancelOAuth={onCancelOAuth}
                  onOpenDetail={() => onOpenDetail?.(entry.id)}
                  t={t}
                />
              </PluginListRow>
            );
          })
        ) : (
          <PlaceholderBlock
            icon="search"
            title={t("toolkit.store_empty_search")}
            subtitle={search.trim()}
            isDark={isDark}
          />
        )}

        {/* ── Low-key footer: custom MCP entry moved down here from its own
            store tab (legacy toolkit_store_page.js "Add Custom MCP" card) —
            T5 demotes it to a footer link on both the Categories and Installed
            screens, opening the same CustomMcpPage form unchanged. ── */}
        <div
          role="button"
          onClick={() => onOpenCustomMcp?.()}
          style={{
            fontSize: 11,
            fontFamily,
            color: tertiaryText,
            cursor: "pointer",
            marginTop: 8,
          }}
        >
          {t("toolkit.add_custom_plugin")} ›
        </div>

        <div
          style={{
            fontSize: 10.5,
            lineHeight: 1.5,
            fontFamily,
            color: tertiaryText,
            marginTop: 4,
            paddingTop: 8,
          }}
        >
          {t("toolkit.store_trademark_disclaimer")}
        </div>
      </div>
    </div>
  );
};

export default PluginsCategoriesPage;
