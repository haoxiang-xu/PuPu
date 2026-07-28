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
import {
  subscribeToolkitCatalogRefresh,
  emitToolkitCatalogRefresh,
} from "../../../SERVICEs/toolkit_catalog_refresh";
import { toast } from "../../../SERVICEs/toast";
import { isBaseToolkitId } from "../utils/plugin_actions";
import {
  listStoreSkillPacks,
  installStoreSkillPack,
} from "../utils/skill_pack_store_install";
import useAsyncAction from "../../../BUILTIN_COMPONENTs/mini_react/use_async_action";
import PlaceholderBlock from "../components/placeholder_block";
import PluginListRow from "../components/plugin_list_row";
import PluginInstallPill from "../components/plugin_install_pill";
import CategoryChip from "../components/category_chip";
import SegmentedControl from "../components/segmented_control";

const isMcpSourced = (source) => String(source || "").startsWith("mcp");

/* The r1.2 error-code enum from the S6a download channel — each code has its
   own i18n key; anything outside the enum (facade timeouts, scan failures)
   falls back to the generic line. */
const SKILL_PACK_ERROR_CODES = new Set([
  "invalid_payload",
  "network",
  "timeout",
  "not_found",
  "too_large",
  "malformed",
  "integrity",
  "fs",
]);

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

/* The four type segments of the Store's in-page segmented control (design
   authority: 2026-07-17 store-final mockup, `.seg`/`.sg` blocks). "all" has
   no CategoryChip (mockup: "All 视图不加类型徽标"); the other three each
   carry a color-tinted glyph via CategoryChip (no backdrop). */
const TYPE_SEGMENTS = [
  { key: "all", labelKey: "toolkit.seg_all" },
  { key: "toolkit", labelKey: "toolkit.nav_toolkits", chip: "toolkit" },
  { key: "mcp", labelKey: "toolkit.nav_mcp", chip: "mcp" },
  { key: "skill", labelKey: "toolkit.nav_skills", chip: "skill" },
];

/* PluginsCategoriesPage — the Store page behind plugins_shell.js's "store"
   nav entry. Ground truth: 2026-07-17 store-final mockup screens ①/②.
   CEO decision (2026-07-17, final): the three separate type-category nav
   tabs (Toolkits/MCP/Skills) collapse into ONE Store page carrying an
   in-page segmented control (All/Toolkits/MCP/Skills) — `typeFilter` is now
   this page's own state (segment selection), not a caller-supplied prop.
   The underlying union is unchanged: UNION of (1) the MCP store registry
   (unchanged flow: static registry + any external-registry merge the shell
   loaded into setMcpStoreEntriesCache + refresh-metadata overlay) and (2)
   the installed/builtin catalog (listToolModalCatalog, same visibility
   filter plugins_installed_page.js uses: source !== "plugin", !hidden, not
   a base toolkit id). A toolkitId present in both is deduped down to the
   registry entry only — it already renders as installed/OPEN once
   `installedIds` (which the shell keeps fresh) contains it, so keeping a
   second catalog-only row for it would just be a duplicate. A plugin with
   more than one attribute (a builtin toolkit that also ships a /command, an
   MCP server that also ships a /command) legitimately appears on more than
   one segment — that's a feature of the union, not a bug to dedupe away.
   `typeFilter` ("all" | "toolkit" | "mcp" | "skill") narrows the union;
   "all" applies no type narrowing at all (every filter predicate below
   falls through to its default case for "all", same as it already did for
   the registry's native "mcp" default). The theme pill row (dev/devops/…)
   from the pre-final design is retired entirely — CEO-approved final has no
   theme filtering, only the four type segments. */
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
  const [typeFilter, setTypeFilter] = useState("all");

  /* ── Registry half of the union — unchanged flow (searchMcpStoreEntries
       still owns deprecated-exclusion and text search for registry
       entries), narrowed to `typeFilter` on top. No theme/category argument
       any more — the theme pill row is retired, so the registry search is
       always over the full "all" category. ── */
  const registryEntries = listMcpStoreEntries();
  const filteredRegistryEntries = useMemo(
    () => searchMcpStoreEntries(registryEntries, search),
    [registryEntries, search],
  );
  const registryItems = useMemo(
    () =>
      filteredRegistryEntries
        .filter((entry) => entry?.status !== "needs_review")
        .map((entry) => ({
          kind: "registry",
          key: entry.id,
          entry,
          presentation: toPluginPresentation(entry),
        }))
        .filter((item) => {
          if (typeFilter === "toolkit") return false; // registry entries are all MCP-sourced
          if (typeFilter === "skill") return item.presentation.commands.length > 0;
          return true; // typeFilter === "all" | "mcp"
        }),
    [filteredRegistryEntries, typeFilter],
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
          return true; // typeFilter === "all"
        }),
    [catalogSearchFiltered, typeFilter],
  );

  /* ── Store skill packs (S6b) — curated one-click installable packs from
       the curation JSON's `skillPacks` section. A pack that's already in the
       catalog (installed) drops its store row entirely: the catalog half
       already renders it with the quiet OPEN pill, so keeping both would be
       a duplicate — same dedupe philosophy as registry-vs-catalog above.
       Packs surface on the All and Skills segments only (a pack is a bundle
       of /commands; it is neither an MCP server nor a builtin toolkit). ── */
  const [installingPackIds, setInstallingPackIds] = useState(() => new Set());
  const [packError, setPackError] = useState(null);
  const zhLocale = String(locale || "").toLowerCase().startsWith("zh");

  const installedCatalogIds = useMemo(
    () => new Set(catalogToolkits.map((tk) => tk.toolkitId)),
    [catalogToolkits],
  );

  const packItems = useMemo(() => {
    if (typeFilter !== "all" && typeFilter !== "skill") return [];
    const q = search.trim().toLowerCase();
    return listStoreSkillPacks()
      .filter((pack) => !installedCatalogIds.has(pack.id))
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
  }, [typeFilter, search, installedCatalogIds, zhLocale]);

  const handleInstallPack = async (pack) => {
    if (installingPackIds.has(pack.id)) return;
    setPackError(null);
    setInstallingPackIds((previous) => new Set(previous).add(pack.id));
    try {
      const installed = await installStoreSkillPack(pack);
      emitToolkitCatalogRefresh({ source: "skill_pack_store_install" });
      toast.success(
        t("toolkit.import_skills_success", {
          count: installed.skills.length,
          name: installed.toolkitName,
        }),
      );
    } catch (error) {
      const code = SKILL_PACK_ERROR_CODES.has(error?.code) ? error.code : "generic";
      setPackError(code);
    } finally {
      setInstallingPackIds((previous) => {
        const next = new Set(previous);
        next.delete(pack.id);
        return next;
      });
    }
  };

  const rows = [...registryItems, ...catalogItems];

  /* Skills segment: the command chip renders BEFORE the name (mockup screen
     ②) and the row description prefers the skill's own description over
     the plugin's tagline — "this view, you're picking a command". */
  const commandFirst = typeFilter === "skill";
  const rowDescription = (presentation) =>
    commandFirst
      ? presentation.commands?.[0]?.description || presentation.tagline
      : presentation.tagline;

  const warningColor = isDark ? "#fdba74" : "#c2410c";
  const textColor = isDark ? "rgba(var(--pupu-text-rgb),0.90)" : "rgba(var(--pupu-text-rgb),0.85)";
  const tertiaryText = isDark ? "rgba(var(--pupu-text-rgb),0.34)" : "rgba(var(--pupu-text-rgb),0.4)";

  /* Custom-MCP entry-point and the third-party trademark disclaimer are both
     MCP-specific — they only make sense when the MCP segment is active. */
  const isMcpCategory = typeFilter === "mcp";

  /* Type segments render through the shared SegmentedControl (sliding
     indicator, agents_modal_content.js's section switcher) — its `leading`
     slot carries the tinted CategoryChip per segment. */

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* ── Fixed header — title, the type-segment control (+ refresh action
           on the MCP segment), search, and the metadata/install error
           strips (both tightly bound to the header controls above them). ── */}
      <div style={{ flexShrink: 0, padding: "20px 26px 0", display: "flex", flexDirection: "column", gap: 12 }}>
        <span
          style={{
            fontSize: 22,
            fontWeight: 500,
            letterSpacing: "-0.01em",
            fontFamily,
            color: textColor,
          }}
        >
          {t("toolkit.nav_store")}
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {/* Sliding-indicator segmented control — same component (and same
              0.28s bezier slide) as the agents modal's section switcher;
              category segments carry their tinted CategoryChip via the
              `leading` slot. */}
          <SegmentedControl
            sections={TYPE_SEGMENTS.map((segment) => ({
              key: segment.key,
              label: t(segment.labelKey),
              leading: segment.chip ? (
                <CategoryChip type={segment.chip} />
              ) : undefined,
            }))}
            selected={typeFilter}
            onChange={setTypeFilter}
            isDark={isDark}
            buttonFontWeight={500}
          />

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
        {packItems.map(({ pack, title, blurb }) => {
          const installing = installingPackIds.has(pack.id);
          const firstCommand = String(pack.subset?.[0] || "")
            .split("/")
            .pop();
          return (
            <PluginListRow
              key={pack.id}
              icon={{ type: "builtin", name: "command", color: "#6478f6" }}
              isDark={isDark}
              name={title}
              command={firstCommand ? `/${firstCommand}` : undefined}
              commandFirst={commandFirst}
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
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    paddingVertical: 3,
                    paddingHorizontal: 13,
                    borderRadius: 999,
                    color: isDark ? "#9aa8ff" : "#2563eb",
                    root: {
                      background: isDark
                        ? "rgba(124,140,248,0.12)"
                        : "rgba(37,99,235,0.08)",
                    },
                    state: {
                      disabled: {
                        root: { opacity: 0.6, cursor: "not-allowed" },
                        background: {},
                      },
                    },
                  }}
                />
              </span>
            </PluginListRow>
          );
        })}
        {rows.map((item) =>
            item.kind === "registry" ? (
              <PluginListRow
                key={item.key}
                icon={resolveMcpIcon(item.entry)}
                isDark={isDark}
                name={item.presentation.name}
                command={item.presentation.commands?.[0]?.name}
                commandFirst={commandFirst}
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
                icon={item.toolkit.toolkitIcon}
                isDark={isDark}
                name={item.presentation.name}
                command={item.presentation.commands?.[0]?.name}
                commandFirst={commandFirst}
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
