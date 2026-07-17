import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Input } from "../../../BUILTIN_COMPONENTs/input/input";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import ArcSpinner from "../../../BUILTIN_COMPONENTs/spinner/arc_spinner";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import api from "../../../SERVICEs/api";
import {
  listMcpStoreEntries,
  searchMcpStoreEntries,
  resolveMcpIcon,
  withMcpStoreIcon,
} from "../../../SERVICEs/mcp_toolkit_store";
import { toPluginPresentation } from "../../../SERVICEs/plugin_presentation";
import { subscribeToolkitCatalogRefresh } from "../../../SERVICEs/toolkit_catalog_refresh";
import { isBaseToolkitId } from "../utils/plugin_actions";
import useAsyncAction from "../../../BUILTIN_COMPONENTs/mini_react/use_async_action";
import { STORE_CATEGORY_CONFIG } from "../constants";
import PlaceholderBlock from "../components/placeholder_block";
import PluginListRow from "../components/plugin_list_row";
import PluginInstallPill from "../components/plugin_install_pill";

/* Title (and nav label) per `typeFilter` — the three category nav entries
   (plugins_shell.js's cat_toolkits/cat_mcp/cat_skills) all route to this one
   page, distinguished only by which type they filter for. */
const TYPE_LABEL_KEY = {
  toolkit: "toolkit.nav_toolkits",
  mcp: "toolkit.nav_mcp",
  skill: "toolkit.nav_skills",
};

const isMcpSourced = (source) => String(source || "").startsWith("mcp");

/* CatalogOpenPill — the quiet "OPEN" pill for a catalog-only row (a builtin/
   local plugin, or an MCP install with no matching store registry entry).
   These rows are already installed by definition (they only exist because
   they came back from listToolModalCatalog), so there's no GET/Set-up/OAuth
   state machine to run — just the same visual language PluginInstallPill
   uses for its own "installed" state (opacity pill, `pill_open` label). */
const CatalogOpenPill = ({ isDark, label, onClick }) => {
  const pillOpenColor = isDark ? "rgba(var(--pupu-text-rgb),0.55)" : "rgba(var(--pupu-text-rgb),0.50)";
  const pillOpenBg = isDark ? "rgba(var(--pupu-text-rgb),0.08)" : "rgba(var(--pupu-text-rgb),0.06)";
  return (
    <Button
      label={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
      style={{
        fontSize: 11,
        fontWeight: 700,
        paddingVertical: 3,
        paddingHorizontal: 13,
        borderRadius: 999,
        color: pillOpenColor,
        root: { background: pillOpenBg },
      }}
    />
  );
};

/* PluginsCategoriesPage — the shared type-category screen (Toolkits / MCP /
   Skills) behind plugins_shell.js's three category nav entries. Ground
   truth: mockup screen ③ row/pill language, unchanged.
   CEO decision (2026-07-17): the single theme-only "Categories" tab is
   retired in favor of three TYPE tabs, each a unified directory —
   UNION of (1) the MCP store registry (unchanged flow: static registry +
   any external-registry merge the shell loaded into
   setMcpStoreEntriesCache + refresh-metadata overlay) and (2) the
   installed/builtin catalog (listToolModalCatalog, same visibility filter
   plugins_installed_page.js uses: source !== "plugin", !hidden, not a base
   toolkit id). A toolkitId present in both is deduped down to the registry
   entry only — it already renders as installed/OPEN once `installedIds`
   (which the shell keeps fresh) contains it, so keeping a second catalog-only
   row for it would just be a duplicate. A plugin with more than one
   attribute (a builtin toolkit that also ships a /command, an MCP server
   that also ships a /command) legitimately appears on more than one category
   page — that's a feature of the union, not a bug to dedupe away.
   `typeFilter` ("toolkit" | "mcp" | "skill") narrows the union; the theme
   pill row (dev/devops/…) narrows further WITHIN that type, but themes are a
   registry-only concept — catalog-only rows have no theme, so they only
   ever show up when the pill is "all". */
const PluginsCategoriesPage = ({
  typeFilter,
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

  /* ── Registry half of the union — unchanged flow (searchMcpStoreEntries
       still owns deprecated-exclusion, theme-category matching and text
       search for registry entries), narrowed to `typeFilter` on top. ── */
  const registryEntries = listMcpStoreEntries();
  const filteredRegistryEntries = useMemo(
    () => searchMcpStoreEntries(registryEntries, search, category),
    [registryEntries, search, category],
  );
  const registryItems = useMemo(
    () =>
      filteredRegistryEntries
        .map((entry) => ({
          kind: "registry",
          key: entry.id,
          entry,
          presentation: toPluginPresentation(entry),
        }))
        .filter((item) => {
          if (typeFilter === "toolkit") return false; // registry entries are all MCP-sourced
          if (typeFilter === "skill") return item.presentation.commands.length > 0;
          return true; // typeFilter === "mcp"
        }),
    [filteredRegistryEntries, typeFilter],
  );

  /* ── Catalog half of the union — same load pattern as
       plugins_installed_page.js (listToolModalCatalog, visibility filter,
       withMcpStoreIcon), deduped against ALL registry toolkitIds (not just
       the ones the current search/pill happens to show) so a registry entry
       hidden by the pill never re-appears as a duplicate catalog row. ── */
  const [catalogToolkits, setCatalogToolkits] = useState([]);
  const { run: loadCatalog } = useAsyncAction(
    useCallback(async () => {
      const payload = await api.unchain.listToolModalCatalog();
      const list = Array.isArray(payload?.toolkits) ? payload.toolkits : [];
      const visible = list.filter(
        (tk) =>
          tk.source !== "plugin" &&
          !tk.hidden &&
          !isBaseToolkitId(tk.toolkitId),
      );
      return visible.map((tk) => withMcpStoreIcon(tk));
    }, []),
    { label: "plugins_category_catalog_load", pendingDelayMs: 0, onError: () => {} },
  );

  useEffect(() => {
    loadCatalog().then((result) => {
      if (result !== undefined) setCatalogToolkits(result);
    });
  }, [loadCatalog]);

  useEffect(
    () =>
      subscribeToolkitCatalogRefresh(() => {
        loadCatalog().then((result) => {
          if (result !== undefined) setCatalogToolkits(result);
        });
      }),
    [loadCatalog],
  );

  const registryToolkitIds = useMemo(
    () => new Set(registryEntries.map((entry) => entry.toolkitId)),
    [registryEntries],
  );
  const catalogOnly = useMemo(
    () => catalogToolkits.filter((tk) => !registryToolkitIds.has(tk.toolkitId)),
    [catalogToolkits, registryToolkitIds],
  );

  /* Theme pills are a registry-only concept — a catalog-only row has no
     `category`, so it only ever shows under the "all" pill. Text search on
     the catalog half mirrors plugins_installed_page.js's own search
     (name/description/tool+skill names). */
  const catalogSearchFiltered = useMemo(() => {
    if (category !== "all") return [];
    const q = search.trim().toLowerCase();
    if (!q) return catalogOnly;
    return catalogOnly.filter((tk) => {
      const name = (tk.toolkitName || tk.toolkitId || "").toLowerCase();
      const desc = (tk.toolkitDescription || "").toLowerCase();
      const names = (tk.tools || [])
        .map((tool) => (tool.title || tool.name || "").toLowerCase())
        .concat((tk.skills || []).map((skill) => (skill.title || skill.name || "").toLowerCase()))
        .join(" ");
      return name.includes(q) || desc.includes(q) || names.includes(q);
    });
  }, [catalogOnly, category, search]);

  const catalogItems = useMemo(
    () =>
      catalogSearchFiltered
        .map((tk) => ({
          kind: "catalog",
          key: tk.toolkitId,
          toolkit: tk,
          presentation: toPluginPresentation(tk),
        }))
        .filter((item) => {
          if (typeFilter === "skill") return item.presentation.commands.length > 0;
          const mcpSourced = isMcpSourced(item.toolkit.source);
          if (typeFilter === "mcp") return mcpSourced;
          if (typeFilter === "toolkit") return !mcpSourced;
          return true;
        }),
    [catalogSearchFiltered, typeFilter],
  );

  const rows = [...registryItems, ...catalogItems];

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

  const titleKey = TYPE_LABEL_KEY[typeFilter] || "toolkit.nav_categories";
  /* Custom-MCP entry-point and the third-party trademark disclaimer are both
     MCP-specific — they only make sense on the MCP category page now that
     Toolkits/Skills also route through this component. */
  const isMcpCategory = typeFilter === "mcp";

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
          {t(titleKey)}
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
          {isMcpCategory && (
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
          )}
        </div>

        {isMcpCategory && metadataError && (
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

      {/* ── Scrollable body — plugin_list_row list (registry rows get the
           Get/Open pill; catalog-only rows get the quiet OPEN pill), the
           low-key custom MCP footer link (MCP category only), and the
           trademark disclaimer (MCP category only). ── */}
      <div className="scrollable" style={{ flex: 1, overflowY: "auto", padding: "10px 26px 26px" }}>
        {rows.length > 0 ? (
          rows.map((item) =>
            item.kind === "registry" ? (
              <PluginListRow
                key={item.key}
                icon={resolveMcpIcon(item.entry)}
                isDark={isDark}
                name={item.presentation.name}
                command={item.presentation.commands?.[0]?.name}
                description={item.presentation.tagline}
                fallbackColor={item.presentation.sourceBadge?.color}
                onOpenDetail={() => onOpenDetail?.(item.entry.id)}
                testId={`category-row-${item.entry.id}`}
              >
                <PluginInstallPill
                  entry={item.entry}
                  isDark={isDark}
                  installedIds={installedIds}
                  installing={installingIds?.has(item.entry.id) || false}
                  onInstall={onInstall}
                  onOAuthConnect={onOAuthConnect}
                  onCancelOAuth={onCancelOAuth}
                  onOpenDetail={() => onOpenDetail?.(item.entry.id)}
                  t={t}
                />
              </PluginListRow>
            ) : (
              <PluginListRow
                key={item.key}
                icon={item.toolkit.toolkitIcon}
                isDark={isDark}
                name={item.presentation.name}
                command={item.presentation.commands?.[0]?.name}
                description={item.presentation.tagline}
                fallbackColor={item.presentation.sourceBadge?.color}
                onOpenDetail={() => onOpenDetail?.({ ...item.presentation, raw: item.toolkit })}
                testId={`category-row-${item.toolkit.toolkitId}`}
              >
                <CatalogOpenPill
                  isDark={isDark}
                  label={t("toolkit.pill_open")}
                  onClick={() => onOpenDetail?.({ ...item.presentation, raw: item.toolkit })}
                />
              </PluginListRow>
            ),
          )
        ) : (
          <PlaceholderBlock
            icon="search"
            title={t("toolkit.category_empty_search")}
            subtitle={search.trim()}
            isDark={isDark}
          />
        )}

        {/* ── Low-key footer: custom MCP entry moved down here from its own
            store tab (legacy toolkit_store_page.js "Add Custom MCP" card) —
            demoted to a footer link on the Installed screen and (now that
            Categories has split into three type pages) the MCP category
            page specifically, since a custom entry is always an MCP
            server. ── */}
        {isMcpCategory && (
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
        )}

        {isMcpCategory && (
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
        )}
      </div>
    </div>
  );
};

export default PluginsCategoriesPage;
