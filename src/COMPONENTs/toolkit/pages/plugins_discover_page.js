import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import api from "../../../SERVICEs/api";
import { listMcpStoreEntries, resolveMcpIcon } from "../../../SERVICEs/mcp_toolkit_store";
import { entryInstallState, entryOpensSetup } from "../../../SERVICEs/mcp_install";
import { toPluginPresentation, loadStoreCuration } from "../../../SERVICEs/plugin_presentation";
import { ToolkitIconFrame } from "../components/toolkit_icon";
import AuroraFeatureCard from "../components/aurora_feature_card";
import BrandOrbCard from "../components/brand_orb_card";
import PluginInstallPill from "../components/plugin_install_pill";

/* Resolves a curated pluginId against the two sources of truth a plugin can
   live in: the connected-runtime catalog (built-in/local plugins — e.g. the
   "plan" skill, always already available so it renders OPEN) and the MCP
   store registry (installable plugins referenced by their registry toolkitId,
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

/* CollectionRow — a Collections-section entry: 32px stacked icons on an
   OPAQUE ring surface (CEO 2026-07-21: bigger icons, no translucency — the
   solid values match what the old alpha tints resolved to on the modal
   ground), a name + "· N plugins" tagline, a "GET ALL" pill, and — the row
   itself is CLICKABLE now — it toggles an inline member list underneath
   (see CollectionMembers) so a collection can actually be explored, not
   just batch-installed. */
const CollectionRow = ({ collection, isDark, fontFamily, textColor, t, onGetAll, expanded, onToggle }) => {
  const taglineColor = isDark ? "rgba(var(--pupu-text-rgb),0.42)" : "rgba(var(--pupu-text-rgb),0.45)";
  const iconRingBg = isDark ? "#26262c" : "#ececee";
  const chipColor = isDark ? "#9aa8ff" : "#2563eb";
  const pillBg = "rgba(124,140,248,0.12)";

  const tagline = [collection.blurb, t("toolkit.collection_count", { count: collection.resolved.length })]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      data-testid={`collection-${collection.id}`}
      onClick={onToggle}
      role="button"
      aria-expanded={expanded}
      style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", cursor: "pointer" }}
    >
      <div style={{ display: "flex", flexShrink: 0 }}>
        {collection.resolved.slice(0, 3).map((resolved, idx) => (
          <span
            key={`${collection.id}-icon-${resolved.entry.toolkitId || idx}`}
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              marginRight: -8,
              boxShadow: "0 0 0 2px var(--pupu-background)",
              background: iconRingBg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ToolkitIconFrame
              icon={iconFor(resolved)}
              isDark={isDark}
              size={32}
              iconSize={16}
              borderRadius={9}
              style={{ background: "transparent" }}
            />
          </span>
        ))}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 500,
            color: textColor,
            fontFamily,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {collection.title}
        </div>
        <div
          style={{
            fontSize: 11,
            color: taglineColor,
            fontFamily,
            marginTop: 2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {tagline}
        </div>
      </div>

      <Button
        label={t("toolkit.get_all")}
        onClick={(event) => {
          event.stopPropagation();
          onGetAll(collection);
        }}
        style={{
          flexShrink: 0,
          fontSize: 11,
          fontWeight: 500,
          fontFamily,
          paddingVertical: 3,
          paddingHorizontal: 13,
          borderRadius: 999,
          color: chipColor,
          root: { background: pillBg },
        }}
      />
    </div>
  );
};

/* PluginsDiscoverPage — Discover screen, C2 design (aurora featured card +
   brand-orb Essentials grid + Collections rows; design authority:
   2026-07-18 discover-c2 mockup, screen "C2"). This is a PRESENTATION
   rework only — data flow is unchanged from the settings-isomorphic T3
   version: `loadStoreCuration()` for curation, the connected-runtime
   catalog and the MCP store registry as the two plugin-record sources (see
   `resolvePluginId` above), curation robustness (missing ids skip silently,
   an empty section is omitted), `opensSetup` gating on every install pill,
   and `onOpenDetail` routing all unchanged. */
const PluginsDiscoverPage = ({
  isDark,
  onOpenDetail,
  onNavigate,
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

  /* CEO 2026-07-18j: the hero carries NO pill — the whole card opens the
     detail page, where GET/setup/OAuth live. The per-card install machine
     is gone with it. */
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

  /* Restores the pre-T3 "Get all" collection action (dropped when
     SettingsSection's row layout had no header-right slot for it; the C2
     Collections row does) — batch logic unchanged from that version:
     opensSetup entries (secrets / http-secret / custom recipe) can't be
     installed silently, so they're skipped and the first skipped entry's
     detail is opened once the rest are done. */
  const handleGetAll = useCallback(
    async (collection) => {
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

  const warningColor = isDark ? "#fdba74" : "#c2410c";
  const textColor = isDark ? "rgba(var(--pupu-text-rgb),0.90)" : "rgba(var(--pupu-text-rgb),0.85)";
  const headerLabelColor = isDark ? "#fff" : "#222";
  const dividerAccent = isDark ? "#7c8cf8" : "#4a5bd8";
  const collectionsBorder = isDark ? "rgba(255,255,255,0.055)" : "rgba(0,0,0,0.055)";

  /* Same install/OAuth error strip pattern as PluginsCategoriesPage
     (plugins_categories_page.js) — Discover had no visible failure surface
     at all before this (review I3). */
  const errorStrip = installError ? (
    <div style={{ fontSize: 10.5, fontFamily, color: warningColor, marginBottom: 12 }}>
      {installError.message || t("toolkit.store_install_error")}
    </div>
  ) : null;

  /* Matches SettingsSection's own header typography (appearance.js) so
     Essentials/Collections read as the same family of section as the rest
     of Settings/Plugins, plus an optional right-side accent link the shared
     component has no slot for. */
  const sectionHeader = (label, onSeeAll) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6, padding: "12px 0 4px" }}>
      <span
        style={{
          fontSize: 11,
          fontFamily,
          textTransform: "uppercase",
          letterSpacing: "1.5px",
          color: headerLabelColor,
          opacity: 0.35,
        }}
      >
        {label}
      </span>
      {onSeeAll && (
        <Button
          label={`${t("toolkit.see_all")} ›`}
          onClick={onSeeAll}
          style={{
            marginLeft: "auto",
            fontSize: 10.5,
            fontWeight: 500,
            fontFamily,
            color: dividerAccent,
            paddingVertical: 2,
            paddingHorizontal: 6,
            borderRadius: 6,
          }}
        />
      )}
    </div>
  );

  /* Inline collection expansion (CEO 2026-07-21: collections must be
     enterable). One open at a time; member rows open their detail on click
     and carry the same install pill the essentials grid uses. */
  const [expandedCollectionId, setExpandedCollectionId] = useState(null);

  const renderCollectionMember = (resolved) => {
    const presentation = toPluginPresentation(resolved.entry);
    return (
      <div
        key={`member-${resolved.entry.toolkitId}`}
        onClick={() => openDetailFor(resolved)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 11,
          padding: "8px 0 8px 44px",
          cursor: "pointer",
        }}
      >
        <ToolkitIconFrame icon={iconFor(resolved)} isDark={isDark} size={32} iconSize={16} borderRadius={9} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: textColor,
              fontFamily,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {presentation.name}
          </div>
          <div
            style={{
              fontSize: 10.5,
              color: isDark ? "rgba(var(--pupu-text-rgb),0.4)" : "rgba(var(--pupu-text-rgb),0.45)",
              fontFamily,
              marginTop: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {presentation.tagline}
          </div>
        </div>
        <div onClick={(event) => event.stopPropagation()} style={{ flexShrink: 0 }}>
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
        </div>
      </div>
    );
  };

  const renderEssentialCard = ({ id, resolved }) => {
    const presentation = toPluginPresentation(resolved.entry);
    return (
      <BrandOrbCard
        key={id}
        testId={`discover-grid-${id}`}
        isDark={isDark}
        icon={iconFor(resolved)}
        source={resolved.entry.source}
        name={presentation.name}
        description={presentation.tagline}
        command={presentation.commands?.[0]?.name}
        onClick={() => openDetailFor(resolved)}
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
      </BrandOrbCard>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* ── Fixed header — 22px/500 title, no search (Discover is
           curation-driven, not search-driven — Categories owns search). ── */}
      <div style={{ flexShrink: 0, padding: "20px 26px 0" }}>
        <span
          style={{
            fontSize: 22,
            fontWeight: 500,
            letterSpacing: "-0.01em",
            fontFamily,
            color: textColor,
          }}
        >
          {t("toolkit.nav_discover")}
        </span>
      </div>

      {/* ── Scrollable body — the aurora featured card (no header — it's the
           page's one deliberately "always on" surface), an Essentials
           brand-orb grid, then Collections rows. ── */}
      <div className="scrollable" style={{ flex: 1, overflowY: "auto", padding: "8px 26px 26px" }}>
        {errorStrip}

        {featured && (
          <div style={{ marginBottom: 8 }}>
            <AuroraFeatureCard
              testId="discover-featured-aurora"
              isDark={isDark}
              onClick={() => openDetailFor(featured)}
              icon={iconFor(featured)}
              source={featured.entry.source}
              kicker={curation.featured.kicker}
              title={curation.featured.headline}
              blurb={curation.featured.blurb}
            />
          </div>
        )}

        {essentials.length > 0 && (
          <>
            {sectionHeader(t("toolkit.section_essentials"), onNavigate ? () => onNavigate("store") : null)}
            <div
              data-testid="essentials-grid"
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, paddingTop: 8, marginBottom: 12 }}
            >
              {essentials.map(renderEssentialCard)}
            </div>
          </>
        )}

        {visibleCollections.length > 0 && (
          <>
            {sectionHeader(t("toolkit.section_collections"))}
            <div style={{ borderTop: `1px solid ${collectionsBorder}` }}>
              {visibleCollections.map((collection) => (
                <div key={collection.id}>
                  <CollectionRow
                    collection={collection}
                    isDark={isDark}
                    fontFamily={fontFamily}
                    textColor={textColor}
                    t={t}
                    onGetAll={handleGetAll}
                    expanded={expandedCollectionId === collection.id}
                    onToggle={() =>
                      setExpandedCollectionId((prev) => (prev === collection.id ? null : collection.id))
                    }
                  />
                  {expandedCollectionId === collection.id &&
                    collection.resolved.map(renderCollectionMember)}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PluginsDiscoverPage;
