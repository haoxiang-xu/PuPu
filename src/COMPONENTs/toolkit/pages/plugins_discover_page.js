import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import api from "../../../SERVICEs/api";
import { listMcpStoreEntries, resolveMcpIcon } from "../../../SERVICEs/mcp_toolkit_store";
import { entryInstallState, entryOpensSetup } from "../../../SERVICEs/mcp_install";
import { toPluginPresentation, loadStoreCuration } from "../../../SERVICEs/plugin_presentation";
import { usePluginInstallState } from "../hooks/use_plugin_install_state";
import { ToolkitIconFrame } from "../components/toolkit_icon";
import PluginTile from "../components/plugin_tile";

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

/* PluginsDiscoverPage — App Store "Discover" screen: an editorial hero
   (featured plugin, curated gradient), an Essentials rail, and Collections
   cards that expand in-page into a tile list. Ground truth: mockup screen ①
   (.hero / .rail / .tile / .collx / .coll). Data comes from T1's
   `loadStoreCuration()` for curation and two sources for the actual plugin
   records: the connected-runtime catalog (builtin/local plugins) and the MCP
   store registry (installable plugins) — see `resolvePluginId` above. */
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

  const openDetailFor = (resolved) => {
    if (resolved.kind === "store") {
      onOpenDetail?.(resolved.entry.id);
    } else {
      onOpenDetail?.({ ...toPluginPresentation(resolved.entry), raw: resolved.entry });
    }
  };

  const featured = curation.featured ? resolvePlugin(curation.featured.pluginId) : null;
  const featuredPresentation = featured ? toPluginPresentation(featured.entry) : null;

  const featuredInstallMachine = usePluginInstallState({
    entry: featured?.entry,
    installedIds,
    installing: featured?.kind === "store" ? installingIds?.has(featured.entry.id) : false,
    forceInstalled: featured?.kind === "catalog",
    onInstall,
    onOAuthConnect,
    onCancelOAuth,
    t,
  });

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

  const [expandedCollectionId, setExpandedCollectionId] = useState(null);
  const expandedCollection =
    visibleCollections.find((col) => col.id === expandedCollectionId) || null;

  const handleGetAll = useCallback(
    async (collection) => {
      /* opensSetup entries (secrets / http-secret / custom recipe) can't be
         batch-installed silently — skip them here and open the first
         skipped entry's detail once the rest are done, so the user lands
         somewhere that can actually collect what setup needs. */
      let firstSkipped = null;
      for (const resolved of collection.resolved) {
        if (resolved.kind !== "store") continue;
        if (entryOpensSetup(resolved.entry, installedIds)) {
          if (!firstSkipped) firstSkipped = resolved;
          continue;
        }
        const state = entryInstallState(resolved.entry, installedIds);
        if (state === "installable") {
          await onInstall?.(resolved.entry);
        } else if (state === "oauth") {
          await onOAuthConnect?.(resolved.entry);
        }
      }
      if (firstSkipped) openDetailFor(firstSkipped);
    },
    [installedIds, onInstall, onOAuthConnect, openDetailFor],
  );

  const textColor = isDark ? "rgba(255,255,255,0.90)" : "rgba(0,0,0,0.85)";
  const dividerAccent = isDark ? "#7c8cf8" : "#4a5bd8";
  const warningColor = isDark ? "#fdba74" : "#c2410c";

  /* Same install/OAuth error strip pattern as PluginsCategoriesPage
     (plugins_categories_page.js) — Discover had no visible failure surface
     at all before this (review I3). */
  const errorStrip = installError ? (
    <div style={{ fontSize: 10.5, fontFamily, color: warningColor, marginBottom: 12 }}>
      {installError.message || t("toolkit.store_install_error")}
    </div>
  ) : null;

  const sectionHeader = (labelKey, onClickSeeAll) => (
    <div style={{ display: "flex", alignItems: "baseline", margin: "24px 0 12px" }}>
      <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em", color: textColor, fontFamily }}>
        {t(labelKey)}
      </span>
      <span
        onClick={onClickSeeAll}
        style={{
          marginLeft: "auto",
          fontSize: 12,
          color: dividerAccent,
          fontWeight: 500,
          cursor: onClickSeeAll ? "pointer" : "default",
        }}
      >
        {t("toolkit.see_all")} ›
      </span>
    </div>
  );

  if (expandedCollection) {
    return (
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          onClick={() => setExpandedCollectionId(null)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            fontWeight: 500,
            color: isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.55)",
            cursor: "pointer",
            marginBottom: 14,
            fontFamily,
          }}
        >
          {"‹ "}
          {t("toolkit.back_to_discover")}
        </div>
        {errorStrip}
        <span style={{ fontSize: 20, fontWeight: 700, color: textColor, fontFamily, marginBottom: 4 }}>
          {expandedCollection.title}
        </span>
        {expandedCollection.blurb && (
          <span
            style={{
              fontSize: 12.5,
              color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)",
              fontFamily,
              marginBottom: 16,
            }}
          >
            {expandedCollection.blurb}
          </span>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
          {expandedCollection.resolved.map((resolved) => (
            <PluginTile
              key={resolved.entry.toolkitId}
              presentation={toPluginPresentation(resolved.entry)}
              entry={resolved.entry}
              icon={iconFor(resolved)}
              isDark={isDark}
              installedIds={installedIds}
              forceInstalled={resolved.kind === "catalog"}
              installing={resolved.kind === "store" ? installingIds?.has(resolved.entry.id) : false}
              onInstall={onInstall}
              onOAuthConnect={onOAuthConnect}
              onCancelOAuth={onCancelOAuth}
              onClick={() => openDetailFor(resolved)}
              testId={`collection-expanded-tile-${resolved.entry.toolkitId}`}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {errorStrip}
      {curation.featured && featured && featuredPresentation && (
        <div
          data-testid="discover-hero"
          style={{
            borderRadius: 16,
            padding: "26px 28px",
            position: "relative",
            overflow: "hidden",
            background: `linear-gradient(135deg, ${curation.featured.gradient[0]}, ${curation.featured.gradient[1]})`,
            boxShadow: "0 18px 50px rgba(74,91,216,0.35), 0 4px 16px rgba(0,0,0,0.25)",
          }}
        >
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.75)",
              fontFamily,
            }}
          >
            {curation.featured.kicker}
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              margin: "6px 0 4px",
              color: "#fff",
              fontFamily,
            }}
          >
            {curation.featured.headline}
          </div>
          <div
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.85)",
              maxWidth: "46ch",
              lineHeight: 1.5,
              fontFamily,
            }}
          >
            {curation.featured.blurb}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 18 }}>
            <ToolkitIconFrame
              icon={iconFor(featured)}
              isDark={isDark}
              size={52}
              iconSize={26}
              borderRadius={13}
              style={{ boxShadow: "0 6px 18px rgba(0,0,0,0.25)" }}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", fontSize: 14, fontWeight: 600, color: "#fff", fontFamily }}>
                {featuredPresentation.name}
                {featuredPresentation.commands?.[0] && (
                  <span
                    style={{
                      fontFamily: "ui-monospace, Menlo, monospace",
                      fontSize: 11,
                      background: "rgba(255,255,255,0.18)",
                      borderRadius: 6,
                      padding: "2px 8px",
                      marginLeft: 8,
                    }}
                  >
                    {featuredPresentation.commands[0].name}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", fontFamily }}>
                {[featuredPresentation.category, "by PuPu"].filter(Boolean).join(" · ")}
              </div>
            </div>
            <Button
              label={featuredInstallMachine.stateLabel}
              disabled={!(featuredInstallMachine.installState === "installed" || featuredInstallMachine.canInstall)}
              onClick={() => {
                if (
                  featuredInstallMachine.installState === "installed" ||
                  featuredInstallMachine.opensSetup
                ) {
                  openDetailFor(featured);
                  return;
                }
                featuredInstallMachine.onInstall();
              }}
              style={{
                marginLeft: "auto",
                background: "rgba(255,255,255,0.92)",
                color: "#3446c8",
                fontWeight: 700,
                fontSize: 12.5,
                fontFamily,
                paddingVertical: 6,
                paddingHorizontal: 18,
                borderRadius: 999,
                flexShrink: 0,
                root: { background: "rgba(255,255,255,0.92)" },
                state: { disabled: { root: { opacity: 0.7, cursor: "not-allowed" }, background: {} } },
              }}
            />
          </div>
        </div>
      )}

      {essentials.length > 0 && (
        <>
          {sectionHeader("toolkit.section_essentials")}
          <div data-testid="essentials-rail" style={{ display: "flex", gap: 12, overflowX: "auto" }}>
            {essentials.map(({ id, resolved }) => (
              <PluginTile
                key={id}
                presentation={toPluginPresentation(resolved.entry)}
                entry={resolved.entry}
                icon={iconFor(resolved)}
                isDark={isDark}
                installedIds={installedIds}
                forceInstalled={resolved.kind === "catalog"}
                installing={resolved.kind === "store" ? installingIds?.has(resolved.entry.id) : false}
                onInstall={onInstall}
                onOAuthConnect={onOAuthConnect}
                onCancelOAuth={onCancelOAuth}
                onClick={() => openDetailFor(resolved)}
                testId={`essentials-tile-${id}`}
              />
            ))}
          </div>
        </>
      )}

      {visibleCollections.length > 0 && (
        <>
          {sectionHeader("toolkit.section_collections")}
          <div style={{ display: "flex", gap: 12 }}>
            {visibleCollections.map((collection) => (
              <div
                key={collection.id}
                data-testid={`collection-${collection.id}`}
                /* jsdom's CSSOM cannot parse linear-gradient() and silently
                   drops the whole `background` declaration — this data
                   attribute lets tests assert the curated gradient reached
                   the DOM without depending on CSS-value parsing. */
                data-gradient={`${collection.gradient[0]},${collection.gradient[1]}`}
                onClick={() => setExpandedCollectionId(collection.id)}
                style={{
                  flex: 1,
                  borderRadius: 14,
                  padding: 16,
                  position: "relative",
                  overflow: "hidden",
                  minHeight: 104,
                  cursor: "pointer",
                  background: `linear-gradient(135deg, ${collection.gradient[0]}, ${collection.gradient[1]})`,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.7)",
                    fontFamily,
                  }}
                >
                  {t("toolkit.collection_count", { count: collection.resolved.length })}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, margin: "4px 0 2px", color: "#fff", fontFamily }}>
                  {collection.title}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", fontFamily }}>
                  {collection.blurb}
                </div>
                <div style={{ display: "flex", marginTop: 10, alignItems: "center" }}>
                  {collection.resolved.slice(0, 5).map((resolved, idx) => (
                    <span
                      key={`${collection.id}-${resolved.entry.toolkitId || idx}`}
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 7,
                        background: "rgba(255,255,255,0.9)",
                        marginRight: -6,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
                      }}
                    >
                      <ToolkitIconFrame icon={iconFor(resolved)} size={14} iconSize={12} borderRadius={4} />
                    </span>
                  ))}
                  <Button
                    label={t("toolkit.get_all")}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleGetAll(collection);
                    }}
                    style={{
                      marginLeft: "auto",
                      fontSize: 10.5,
                      fontWeight: 600,
                      fontFamily,
                      color: "#fff",
                      paddingVertical: 4,
                      paddingHorizontal: 11,
                      borderRadius: 999,
                      root: { background: "rgba(255,255,255,0.2)" },
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default PluginsDiscoverPage;
