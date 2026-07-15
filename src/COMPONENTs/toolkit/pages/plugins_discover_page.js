import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import api from "../../../SERVICEs/api";
import { listMcpStoreEntries, resolveMcpIcon } from "../../../SERVICEs/mcp_toolkit_store";
import { toPluginPresentation, loadStoreCuration } from "../../../SERVICEs/plugin_presentation";
import { SettingsSection } from "../../settings/appearance";
import PluginListRow from "../components/plugin_list_row";
import PluginInstallPill from "../components/plugin_install_pill";

/* Resolves a curated pluginId against the two sources of truth a plugin can
   live in: the connected-runtime catalog (built-in/local plugins — e.g. the
   "plan" skill, always already available so it renders OPEN) and the MCP
   store registry (installable plugins — e.g. "mcp.productivity.notion-remote",
   renders GET until installed). Store entries win the lookup on a toolkitId
   collision (there shouldn't be one — store toolkitIds are namespaced
   "mcp.*"), and an id present in neither is skipped silently per the plan's
   curation-tolerance requirement. */
const resolvePluginId = (pluginId, storeById, catalogById) => {
  const storeEntry = storeById.get(pluginId);
  if (storeEntry) return { kind: "store", entry: storeEntry };
  const catalogEntry = catalogById.get(pluginId);
  if (catalogEntry) return { kind: "catalog", entry: catalogEntry };
  return null;
};

const iconFor = (resolved) =>
  resolved.kind === "store" ? resolveMcpIcon(resolved.entry) : resolved.entry.toolkitIcon;

/* PluginsDiscoverPage — settings-isomorphic "Discover" screen (T3). The
   App Store hero/rail/collection-card layout is retired; Discover now
   speaks the same list language as Installed/Categories — a fixed 22px/600
   title (no search box: Discover has always been curation-driven, not
   search-driven) over a scrollable body of a "Featured" SettingsSection
   (the curated featured pick + essentials, as rows) followed by one
   SettingsSection per collection. Data comes from `loadStoreCuration()` for
   curation and two sources for the actual plugin records: the connected-
   runtime catalog (builtin/local plugins) and the MCP store registry
   (installable plugins) — see `resolvePluginId` above. Curation robustness
   (missing ids skip silently, an empty section is omitted entirely) is
   unchanged from the App Store version. */
const PluginsDiscoverPage = ({
  isDark,
  onOpenDetail,
  installedIds,
  onInstall,
  onOAuthConnect,
  onCancelOAuth,
  installingIds,
  installError,
}) => {
  const { theme } = useContext(ConfigContext) || {};
  const { t } = useTranslation();
  const fontFamily = theme?.font?.fontFamily || "Jost, sans-serif";

  const curation = useMemo(() => loadStoreCuration(), []);

  const [catalogToolkits, setCatalogToolkits] = useState([]);
  useEffect(() => {
    let cancelled = false;
    api.unchain
      .listToolModalCatalog()
      .then((payload) => {
        if (cancelled) return;
        const list = Array.isArray(payload?.toolkits) ? payload.toolkits : [];
        setCatalogToolkits(list);
      })
      .catch(() => {
        /* ignore — essentials/collections built from the store registry
           alone still render */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const storeEntries = listMcpStoreEntries();

  const storeById = useMemo(() => {
    const map = new Map();
    for (const entry of storeEntries) {
      if (entry?.toolkitId) map.set(entry.toolkitId, entry);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeEntries]);

  const catalogById = useMemo(() => {
    const map = new Map();
    for (const tk of catalogToolkits) {
      if (tk?.toolkitId) map.set(tk.toolkitId, tk);
    }
    return map;
  }, [catalogToolkits]);

  const resolvePlugin = useCallback(
    (pluginId) => resolvePluginId(pluginId, storeById, catalogById),
    [storeById, catalogById],
  );

  const openDetailFor = useCallback(
    (resolved) => {
      if (resolved.kind === "store") {
        onOpenDetail?.(resolved.entry.id);
      } else {
        onOpenDetail?.({ ...toPluginPresentation(resolved.entry), raw: resolved.entry });
      }
    },
    [onOpenDetail],
  );

  const featured = curation.featured ? resolvePlugin(curation.featured.pluginId) : null;

  const essentials = (curation.essentials || [])
    .map((id) => ({ id, resolved: resolvePlugin(id) }))
    .filter((item) => item.resolved);

  const collections = (curation.collections || []).map((col) => ({
    ...col,
    resolved: (col.pluginIds || [])
      .map((id) => resolvePlugin(id))
      .filter(Boolean),
  }));
  const visibleCollections = collections.filter((col) => col.resolved.length > 0);

  const warningColor = isDark ? "#fdba74" : "#c2410c";
  const textColor = isDark ? "rgba(255,255,255,0.90)" : "rgba(0,0,0,0.85)";

  /* Same install/OAuth error strip pattern as PluginsCategoriesPage
     (plugins_categories_page.js) — Discover had no visible failure surface
     at all before this (review I3). */
  const errorStrip = installError ? (
    <div style={{ fontSize: 10.5, fontFamily, color: warningColor, marginBottom: 12 }}>
      {installError.message || t("toolkit.store_install_error")}
    </div>
  ) : null;

  const renderRow = (resolved, key) => {
    const presentation = toPluginPresentation(resolved.entry);
    return (
      <PluginListRow
        key={key}
        icon={iconFor(resolved)}
        isDark={isDark}
        name={presentation.name}
        command={presentation.commands?.[0]?.name}
        description={presentation.tagline}
        fallbackColor={presentation.sourceBadge?.color}
        onOpenDetail={() => openDetailFor(resolved)}
        testId={`discover-row-${key}`}
      >
        <PluginInstallPill
          entry={resolved.entry}
          isDark={isDark}
          installedIds={installedIds}
          forceInstalled={resolved.kind === "catalog"}
          installing={resolved.kind === "store" ? installingIds?.has(resolved.entry.id) : false}
          onInstall={onInstall}
          onOAuthConnect={onOAuthConnect}
          onCancelOAuth={onCancelOAuth}
          onOpenDetail={() => openDetailFor(resolved)}
          t={t}
        />
      </PluginListRow>
    );
  };

  const hasFeaturedSection = Boolean(featured) || essentials.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* ── Fixed header — 22px/600 title, no search (Discover is
           curation-driven, not search-driven — Categories owns search). ── */}
      <div style={{ flexShrink: 0, padding: "20px 26px 0" }}>
        <span
          style={{
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            fontFamily,
            color: textColor,
          }}
        >
          {t("toolkit.nav_discover")}
        </span>
      </div>

      {/* ── Scrollable body — Featured section (curated pick + essentials)
           then one SettingsSection per collection. The old "Get all"
           collection-card action has no home in SettingsSection (no
           header-right slot) — dropped per the plan's "trivially portable,
           else drop it and note" clause rather than bolted onto a shared
           component. ── */}
      <div className="scrollable" style={{ flex: 1, overflowY: "auto", padding: "8px 26px 26px" }}>
        {errorStrip}

        {hasFeaturedSection && (
          <SettingsSection title={t("toolkit.section_featured")}>
            {/* M8: featured.pluginId and an essentials id can collide (both
                are drawn from the same curated pluginId space) — prefix so
                the two never produce the same React key/testId. */}
            {featured && renderRow(featured, `featured-${curation.featured.pluginId}`)}
            {essentials.map(({ id, resolved }) => renderRow(resolved, `essential-${id}`))}
          </SettingsSection>
        )}

        {visibleCollections.map((collection) => (
          <SettingsSection key={collection.id} title={collection.title}>
            {collection.resolved.map((resolved, idx) =>
              renderRow(resolved, `${collection.id}-${resolved.entry.toolkitId || idx}`),
            )}
          </SettingsSection>
        ))}
      </div>
    </div>
  );
};

export default PluginsDiscoverPage;
