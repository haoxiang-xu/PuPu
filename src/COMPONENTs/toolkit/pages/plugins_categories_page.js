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
import {
  DEFAULT_SKILL_PACK_ICON,
  listStoreSkillPacks,
} from "../utils/skill_pack_store_install";
import useAsyncAction from "../../../BUILTIN_COMPONENTs/mini_react/use_async_action";
import PlaceholderBlock from "../components/placeholder_block";
import PluginListRow from "../components/plugin_list_row";
import PluginInstallPill, { ACTION_PILL_STYLE } from "../components/plugin_install_pill";
import { matchesCategory } from "../../../SERVICEs/store_categories";
import useSkillPackInstall from "../hooks/use_skill_pack_install";
import { typesFor } from "../utils/plugin_types";

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
        fontWeight: 500,
        paddingVertical: 3,
        paddingHorizontal: 13,
        borderRadius: 999,
        color: pillOpenColor,
        root: { background: pillOpenBg },
      }}
    />
  );
};

/* PluginsCategoriesPage — one category of the store, behind plugins_shell.js's
   Browse group (#207). The sidebar rail owns which category is open and hands
   it down as `category` ("all" or a subject id); this page no longer carries a
   type control of its own, because type is a tag on every row now.

   The list is still the UNION of (1) the MCP store registry (static registry +
   any external-registry merge the shell loaded into setMcpStoreEntriesCache +
   refresh-metadata overlay), (2) the installed/builtin catalog
   (listToolModalCatalog, same visibility filter plugins_installed_page.js uses:
   source !== "plugin", !hidden, not a base toolkit id), and (3) the curated
   skill packs. A toolkitId present in registry and catalog is deduped down to
   the registry entry only. A plugin with more than one type legitimately
   carries more than one tag.

   `category` narrows the union through store_categories.matchesCategory.
   Admission is OPEN: a registry entry with no recognised category, and any
   catalog-only row, belongs to All and to no other category. */
const PluginsCategoriesPage = ({
  isDark,
  category = "all",
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
  const { t, locale } = useTranslation();
  const fontFamily = context.theme?.font?.fontFamily || "Jost, sans-serif";
  /* The search box is controlled by the shell when it's reached via the
     sidebar search input (review I7) — that keeps the sidebar box and this
     page's own box as one source of truth instead of two states that can
     drift. Falls back to fully-local state for any other caller (tests
     included) that doesn't pass `search`/`onSearchChange`. */
  const [localSearch, setLocalSearch] = useState("");
  const search = controlledSearch !== undefined ? controlledSearch : localSearch;
  const setSearch = onSearchChange || setLocalSearch;

  /* ── Registry half of the union — unchanged flow (searchMcpStoreEntries
       still owns deprecated-exclusion and text search for registry
       entries), narrowed to `category` on top. searchMcpStoreEntries gets no
       category argument: the narrowing is store_categories.matchesCategory. ── */
  const registryEntries = listMcpStoreEntries();
  const filteredRegistryEntries = useMemo(
    () => searchMcpStoreEntries(registryEntries, search),
    [registryEntries, search],
  );
  const registryItems = useMemo(
    () =>
      filteredRegistryEntries
        .filter((entry) => entry?.status !== "needs_review")
        .filter((entry) => matchesCategory(entry, category))
        .map((entry) => ({
          kind: "registry",
          key: entry.id,
          entry,
          presentation: toPluginPresentation(entry),
        })),
    [filteredRegistryEntries, category],
  );

  /* ── Catalog half of the union — same load pattern as
       plugins_installed_page.js (listToolModalCatalog, visibility filter,
       withMcpStoreIcon), deduped against ALL registry toolkitIds (not just
       the ones the current search happens to show) so a registry entry
       hidden by the search never re-appears as a duplicate catalog row. ── */
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

  /* Text search on the catalog half mirrors plugins_installed_page.js's own
     search (name/description/tool+skill names). No category gating any
     more — the theme pill row (the only thing that ever hid catalog-only
     rows, since they carry no `category`) is retired. */
  const catalogSearchFiltered = useMemo(() => {
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
  }, [catalogOnly, search]);

  /* A catalog row carries no category of its own until the catalog sends one
     (BC-001). An installed skill pack is the one catalog row whose category we
     do know — its store row is dropped once installed, so without this it
     would vanish from the very category it was listed under. It inherits its
     curated pack's category by id; every other catalog-only row stays under
     All. A category the catalog does send wins. */
  const packCategoryById = useMemo(
    () =>
      new Map(
        listStoreSkillPacks().map((pack) => [pack.id, pack.storeCategory]),
      ),
    [],
  );

  const catalogItems = useMemo(
    () =>
      catalogSearchFiltered
        .filter((tk) =>
          matchesCategory(
            { storeCategory: tk.storeCategory ?? packCategoryById.get(tk.toolkitId) },
            category,
          ),
        )
        .map((tk) => ({
          kind: "catalog",
          key: tk.toolkitId,
          toolkit: tk,
          presentation: toPluginPresentation(tk),
        })),
    [catalogSearchFiltered, category, packCategoryById],
  );

  /* ── Store skill packs (S6b) — curated one-click installable packs from
       the curation JSON's `skillPacks` section. A pack that's already in the
       catalog (installed) drops its store row entirely: the catalog half
       already renders it with the quiet OPEN pill, so keeping both would be
       a duplicate — same dedupe philosophy as registry-vs-catalog above.
       A pack is a bundle of /commands, so it carries the SKILL tag. ── */
  const {
    installingPackIds,
    packError,
    installPack: handleInstallPack,
  } = useSkillPackInstall({ t });
  const zhLocale = String(locale || "").toLowerCase().startsWith("zh");

  const installedCatalogIds = useMemo(
    () => new Set(catalogToolkits.map((tk) => tk.toolkitId)),
    [catalogToolkits],
  );

  const packItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return listStoreSkillPacks()
      .filter((pack) => !installedCatalogIds.has(pack.id))
      .filter((pack) => matchesCategory(pack, category))
      .map((pack) => ({
        pack,
        title: zhLocale && pack.titleZh ? pack.titleZh : pack.title,
        blurb: zhLocale && pack.blurbZh ? pack.blurbZh : pack.blurb,
      }))
      .filter(
        (item) =>
          !q ||
          [item.title, item.blurb, item.pack.title, item.pack.blurb]
            .join(" ")
            .toLowerCase()
            .includes(q),
      );
  }, [category, search, installedCatalogIds, zhLocale]);

  const rows = [...registryItems, ...catalogItems];

  const rowDescription = (presentation) => presentation.tagline;

  const warningColor = isDark ? "#fdba74" : "#c2410c";
  const textColor = isDark ? "rgba(var(--pupu-text-rgb),0.90)" : "rgba(var(--pupu-text-rgb),0.85)";
  const tertiaryText = isDark ? "rgba(var(--pupu-text-rgb),0.34)" : "rgba(var(--pupu-text-rgb),0.4)";

  /* The custom-MCP entry point and the metadata refresh act on the whole MCP
     registry, so they live on All. The trademark disclaimer belongs to
     whichever page actually lists registry servers. */
  const showMcpChrome = category === "all";
  const showTrademarkDisclaimer = registryItems.length > 0;
  const title = t(`toolkit.store_category_${category}`);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* ── Fixed header — title, the type-segment control (+ refresh action
           on the MCP segment), search, and the metadata/install error
           strips (both tightly bound to the header controls above them). ── */}
      <div style={{ flexShrink: 0, padding: "20px 26px 0", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: 22,
              fontWeight: 500,
              letterSpacing: "-0.01em",
              fontFamily,
              color: textColor,
            }}
          >
            {title}
          </span>

          {showMcpChrome && (
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

        {showMcpChrome && metadataError && (
          <div style={{ fontSize: 10.5, fontFamily, color: warningColor, marginTop: -8 }}>
            {t("toolkit.store_metadata_error")}
          </div>
        )}

        {installError && (
          <div style={{ fontSize: 10.5, fontFamily, color: warningColor, marginTop: -8 }}>
            {installError.message || t("toolkit.store_install_error")}
          </div>
        )}

        {packError && (
          <div style={{ fontSize: 10.5, fontFamily, color: warningColor, marginTop: -8 }}>
            {t(`toolkit.skillpack_err_${packError}`)}
          </div>
        )}
      </div>

      {/* ── Scrollable body — plugin_list_row list (registry rows get the
           Get/Open pill; catalog-only rows get the quiet OPEN pill), the
           low-key custom MCP footer link (MCP segment only), and the
           trademark disclaimer (MCP segment only). ── */}
      <div className="scrollable" style={{ flex: 1, overflowY: "auto", padding: "10px 26px 26px" }}>
        {/* Store skill packs render ABOVE the union rows — curated picks
            lead the Skills segment. The pill mirrors PluginInstallPill's GET
            state (same colors/metrics); the whole install machine is local
            (handleInstallPack) since packs have no registry entry. */}
        {packItems.map(({ pack, title: packTitle, blurb }) => {
          const installing = installingPackIds.has(pack.id);
          const firstCommand = String(pack.subset?.[0] || "")
            .split("/")
            .pop();
          return (
            <PluginListRow
              key={pack.id}
              trustEntry={pack}
              icon={pack.icon || DEFAULT_SKILL_PACK_ICON}
              isDark={isDark}
              name={packTitle}
              types={["skill"]}
              command={firstCommand ? `/${firstCommand}` : undefined}
              description={blurb}
              onOpenDetail={() => onOpenDetail?.({ skillPack: pack })}
              testId={`skillpack-row-${pack.id}`}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {installing && (
                  <ArcSpinner
                    size={12}
                    stroke_width={2}
                    color={isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.55)"}
                  />
                )}
                <Button
                  label={t("toolkit.pill_get")}
                  disabled={installing}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleInstallPack(pack);
                  }}
                  style={ACTION_PILL_STYLE}
                />
              </span>
            </PluginListRow>
          );
        })}
        {rows.map((item) =>
            item.kind === "registry" ? (
              <PluginListRow
                key={item.key}
                trustEntry={item.entry}
                icon={resolveMcpIcon(item.entry)}
                isDark={isDark}
                name={item.presentation.name}
                types={typesFor("mcp", item.presentation)}
                command={item.presentation.commands?.[0]?.name}
                description={rowDescription(item.presentation)}
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
                trustEntry={item.toolkit}
                icon={item.toolkit.toolkitIcon}
                isDark={isDark}
                name={item.presentation.name}
                types={typesFor(item.toolkit.source, item.presentation)}
                command={item.presentation.commands?.[0]?.name}
                description={rowDescription(item.presentation)}
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
        )}
        {rows.length === 0 && packItems.length === 0 && (
          <PlaceholderBlock
            icon="search"
            title={t("toolkit.category_empty_search")}
            subtitle={search.trim()}
            isDark={isDark}
          />
        )}

        {/* ── Low-key footer: custom MCP entry moved down here from its own
            store tab (legacy toolkit_store_page.js "Add Custom MCP" card) —
            demoted to a footer link on the Installed screen and the MCP
            segment here, since a custom entry is always an MCP server. ── */}
        {showMcpChrome && (
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

        {showTrademarkDisclaimer && (
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
