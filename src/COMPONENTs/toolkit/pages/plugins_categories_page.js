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
import PluginTile from "../components/plugin_tile";

/* PluginsCategoriesPage — App Store "Categories" screen: search + category
   pills + a plugin_tile grid. Data flow (fetch / external-registry merge /
   refresh-metadata) is lifted verbatim from the legacy toolkit_store_page.js
   — `listMcpStoreEntries()` reads the same merged cache (static registry +
   any external registry entries the shell has loaded into
   setMcpStoreEntriesCache), so behavior is identical; only the presentation
   changed from StoreToolkitCard rows to a plugin_tile grid. */
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
     pill row (mirrors the Ollama model library browser). */
  const pillActiveBg = isDark ? "rgba(255,255,255,0.11)" : "rgba(0,0,0,0.08)";
  const pillHoverBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
  const pillActiveTxt = isDark ? "rgba(255,255,255,0.90)" : "rgba(0,0,0,0.85)";
  const pillInactiveTxt = isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.42)";
  const activePillBorder = isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)";
  const warningColor = isDark ? "#fdba74" : "#c2410c";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Input
        prefix_icon="search"
        value={search}
        set_value={(value) => setSearch(value)}
        placeholder={t("toolkit.search_placeholder_v2")}
        style={{
          width: "100%",
          fontSize: 13,
          fontFamily,
          borderRadius: 7,
          color: isDark ? "#fff" : "#222",
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
                color: isDark ? "rgba(255,255,255,0.62)" : "rgba(0,0,0,0.58)",
                hoverBackgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
                content: { icon: { width: 14, height: 14 } },
              }}
            />
          )}
        </span>
      </div>

      {metadataError && (
        <div style={{ fontSize: 10.5, fontFamily, color: warningColor, marginTop: -6 }}>
          {t("toolkit.store_metadata_error")}
        </div>
      )}

      {installError && (
        <div style={{ fontSize: 10.5, fontFamily, color: warningColor, marginTop: -6 }}>
          {installError.message || t("toolkit.store_install_error")}
        </div>
      )}

      {filtered.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {filtered.map((entry) => (
            <PluginTile
              key={entry.id}
              presentation={toPluginPresentation(entry)}
              entry={entry}
              icon={resolveMcpIcon(entry)}
              isDark={isDark}
              installedIds={installedIds}
              installing={installingIds?.has(entry.id) || false}
              onInstall={onInstall}
              onOAuthConnect={onOAuthConnect}
              onCancelOAuth={onCancelOAuth}
              onClick={() => onOpenDetail?.(entry.id)}
              testId={`category-tile-${entry.id}`}
            />
          ))}
        </div>
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
          color: isDark ? "rgba(255,255,255,0.34)" : "rgba(0,0,0,0.4)",
          cursor: "pointer",
          marginTop: 2,
        }}
      >
        {t("toolkit.add_custom_plugin")} ›
      </div>

      <div
        style={{
          fontSize: 10.5,
          lineHeight: 1.5,
          fontFamily,
          color: isDark ? "rgba(255,255,255,0.34)" : "rgba(0,0,0,0.36)",
          marginTop: 4,
          paddingTop: 8,
        }}
      >
        {t("toolkit.store_trademark_disclaimer")}
      </div>
    </div>
  );
};

export default PluginsCategoriesPage;
