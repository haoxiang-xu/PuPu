import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import ArcSpinner from "../../../BUILTIN_COMPONENTs/spinner/arc_spinner";
import api from "../../../SERVICEs/api";
import { listMcpStoreEntries, resolveMcpIcon } from "../../../SERVICEs/mcp_toolkit_store";
import { toPluginPresentation, loadStoreCuration } from "../../../SERVICEs/plugin_presentation";
import { latestItems, relativeDayLabel, todayIso } from "../../../SERVICEs/store_latest";
import { subscribeToolkitCatalogRefresh } from "../../../SERVICEs/toolkit_catalog_refresh";
import { ToolkitIconFrame } from "../components/toolkit_icon";
import PluginInstallPill, { ACTION_PILL_STYLE } from "../components/plugin_install_pill";
import PluginListRow from "../components/plugin_list_row";
import SectionCaption from "../components/section_caption";
import TypeTag from "../components/type_tag";
import useSkillPackInstall from "../hooks/use_skill_pack_install";
import { typesFor } from "../utils/plugin_types";
import {
  DEFAULT_SKILL_PACK_ICON,
  displayIconForToolkit,
  listStoreSkillPacks,
} from "../utils/skill_pack_store_install";

/* Resolves a curated id against the three places a plugin can live, in this
   order: the MCP store registry (renders GET until installed), the connected
   runtime's catalog (already installed — this includes an installed skill
   pack, whose toolkitId is its pack id, so it renders OPEN), and the curated
   skill packs (not yet installed — GET through the pack installer). An id
   found nowhere is skipped silently: curation tolerance. */
const resolvePluginId = (pluginId, storeById, catalogById, packById) => {
  const storeEntry = storeById.get(pluginId);
  if (storeEntry) return { kind: "store", entry: storeEntry };
  const catalogEntry = catalogById.get(pluginId);
  if (catalogEntry) return { kind: "catalog", entry: catalogEntry };
  const pack = packById.get(pluginId);
  if (pack) return { kind: "pack", entry: pack };
  return null;
};

const iconFor = (resolved) => {
  if (resolved.kind === "store") return resolveMcpIcon(resolved.entry);
  if (resolved.kind === "pack") return resolved.entry.icon || DEFAULT_SKILL_PACK_ICON;
  return displayIconForToolkit(resolved.entry);
};

const keyOf = (resolved) => resolved.entry.toolkitId || resolved.entry.id;

const TEXT = "rgba(var(--pupu-text-rgb),0.90)";
const MUTED = "rgba(var(--pupu-text-rgb),0.44)";
const FAINT = "rgba(var(--pupu-text-rgb),0.38)";

/* CollectionRow — a Collections entry that unfolds into its members (owner
   2026-07-21: collections must be enterable; there is no "Install all", you
   install members from their own rows). The stacked artwork flies toward the
   member rows and fades while its footprint collapses, so the title glides
   left. Easing is the app's shared cubic-bezier(.32,1,.32,1) family. */
const UNFOLD_EASE = "cubic-bezier(0.32, 1, 0.32, 1)";
const STACK_FLY = [
  { x: 6, y: 14 },
  { x: 0, y: 58 },
  { x: -6, y: 102 },
];

const CollectionRow = ({ collection, isDark, fontFamily, t, expanded, onToggle }) => {
  const stackCount = Math.min(collection.resolved.length, 3);
  const stackWidth = stackCount > 0 ? 20 + (stackCount - 1) * 16 : 0;

  return (
    <div
      data-testid={`collection-${collection.id}`}
      onClick={onToggle}
      role="button"
      aria-expanded={expanded}
      style={{ display: "flex", alignItems: "center", gap: 11, padding: "8px 0", cursor: "pointer" }}
    >
      <div
        style={{
          display: "flex",
          flexShrink: 0,
          height: 20,
          width: expanded ? 0 : stackWidth,
          marginRight: expanded ? -11 : 0,
          transition: `width 0.42s ${UNFOLD_EASE}, margin-right 0.42s ${UNFOLD_EASE}`,
        }}
      >
        {collection.resolved.slice(0, 3).map((resolved, idx) => {
          const fly = STACK_FLY[idx] || STACK_FLY[STACK_FLY.length - 1];
          return (
            <span
              key={`${collection.id}-icon-${keyOf(resolved)}`}
              style={{
                width: 20,
                height: 20,
                borderRadius: 6,
                marginRight: -4,
                boxShadow: "0 0 0 2px var(--pupu-background)",
                background: "rgba(var(--pupu-text-rgb),0.06)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transform: expanded ? `translate(${fly.x}px, ${fly.y}px) scale(0.6)` : "none",
                opacity: expanded ? 0 : 1,
                transition: `transform 0.38s ${UNFOLD_EASE} ${idx * 45}ms, opacity 0.3s ease ${idx * 45}ms`,
                pointerEvents: "none",
              }}
            >
              <ToolkitIconFrame
                icon={iconFor(resolved)}
                isDark={isDark}
                size={20}
                iconSize={12}
                borderRadius={6}
                style={{ background: "transparent" }}
              />
            </span>
          );
        })}
      </div>

      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 7 }}>
        <span
          style={{
            fontSize: 13.5,
            fontWeight: 400,
            fontFamily,
            color: TEXT,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {collection.title}
        </span>
        <span
          style={{
            flex: "0 0 auto",
            fontSize: 9.5,
            fontWeight: 500,
            letterSpacing: "0.13em",
            textTransform: "uppercase",
            color: "rgba(var(--pupu-text-rgb),0.26)",
            whiteSpace: "nowrap",
          }}
        >
          {t("toolkit.collection_count", { count: collection.resolved.length })}
        </span>
      </div>
    </div>
  );
};

/* PluginsDiscoverPage — the store's curated front page (#207 Phase 2): a
   featured row, Latest, Essentials and Collections, each under one caption and
   one hairline, every item the same row Browse uses. The WebGL hero and the
   brand-orb grid are retired. Data flow is unchanged in shape: curation from
   loadStoreCuration(), plugins resolved against the registry, the catalog and
   the curated packs; the page's props are what the shell already passes. */
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
  const { t, locale } = useTranslation();
  const fontFamily = theme?.font?.fontFamily || "Jost, sans-serif";
  const zhLocale = String(locale || "").toLowerCase().startsWith("zh");

  const curation = useMemo(() => loadStoreCuration(), []);
  const packs = useMemo(() => listStoreSkillPacks(), []);
  const today = useMemo(() => todayIso(), []);
  const { installingPackIds, packError, installPack } = useSkillPackInstall({ t });

  const [catalogToolkits, setCatalogToolkits] = useState([]);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api.unchain
        .listToolModalCatalog()
        .then((payload) => {
          if (cancelled) return;
          setCatalogToolkits(Array.isArray(payload?.toolkits) ? payload.toolkits : []);
        })
        .catch(() => {
          /* ignore — sections built from the registry and packs still render */
        });
    load();
    /* A pack installed from this page announces itself; reloading here is what
       turns its row from GET into OPEN without reopening the modal. */
    const unsubscribe = subscribeToolkitCatalogRefresh(load);
    return () => {
      cancelled = true;
      if (typeof unsubscribe === "function") unsubscribe();
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

  const packById = useMemo(() => new Map(packs.map((pack) => [pack.id, pack])), [packs]);

  const resolvePlugin = useCallback(
    (pluginId) => resolvePluginId(pluginId, storeById, catalogById, packById),
    [storeById, catalogById, packById],
  );

  const openDetailFor = useCallback(
    (resolved) => {
      if (resolved.kind === "store") onOpenDetail?.(resolved.entry.id);
      else if (resolved.kind === "pack") onOpenDetail?.({ skillPack: resolved.entry });
      else onOpenDetail?.({ ...toPluginPresentation(resolved.entry), raw: resolved.entry });
    },
    [onOpenDetail],
  );

  const summarize = (resolved) => {
    if (resolved.kind === "pack") {
      const pack = resolved.entry;
      return {
        name: zhLocale && pack.titleZh ? pack.titleZh : pack.title,
        description: zhLocale && pack.blurbZh ? pack.blurbZh : pack.blurb,
        types: ["skill"],
      };
    }
    const presentation = toPluginPresentation(resolved.entry);
    return {
      name: presentation.name,
      description: presentation.tagline,
      types: typesFor(resolved.kind === "store" ? "mcp" : resolved.entry.source, presentation),
    };
  };

  const actionFor = (resolved) => {
    if (resolved.kind === "pack") {
      const installing = installingPackIds.has(resolved.entry.id);
      return (
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
              installPack(resolved.entry);
            }}
            style={ACTION_PILL_STYLE}
          />
        </span>
      );
    }
    return (
      <PluginInstallPill
        entry={resolved.entry}
        isDark={isDark}
        installedIds={installedIds}
        forceInstalled={resolved.kind === "catalog"}
        installing={resolved.kind === "store" ? Boolean(installingIds?.has(resolved.entry.id)) : false}
        onInstall={onInstall}
        onOAuthConnect={onOAuthConnect}
        onCancelOAuth={onCancelOAuth}
        onOpenDetail={() => openDetailFor(resolved)}
        t={t}
      />
    );
  };

  const renderRow = (resolved, { testId, showDescription = true, trailing = null }) => {
    const { name, description, types } = summarize(resolved);
    return (
      <PluginListRow
        key={testId}
        testId={testId}
        icon={iconFor(resolved)}
        isDark={isDark}
        name={name}
        types={types}
        description={showDescription ? description : undefined}
        onOpenDetail={() => openDetailFor(resolved)}
      >
        {trailing}
        {actionFor(resolved)}
      </PluginListRow>
    );
  };

  /* ── Featured — one row, no pill (owner 2026-07-18): the whole row opens
       detail, where any credential setup lives. That is also why `featured`
       is exempt from the zero-credential invariant. ── */
  const featured = curation.featured ? resolvePlugin(curation.featured.pluginId) : null;

  const latest = latestItems({ entries: storeEntries, packs, today, limit: 3 })
    .map((row) => ({
      ...row,
      resolved: resolvePlugin(row.kind === "pack" ? row.item.id : row.item.toolkitId),
    }))
    .filter((row) => row.resolved);

  const essentials = (curation.essentials || [])
    .map((id) => resolvePlugin(id))
    .filter(Boolean);

  const [expandedCollectionId, setExpandedCollectionId] = useState(null);
  const visibleCollections = (curation.collections || [])
    .map((col) => ({
      ...col,
      resolved: (col.pluginIds || []).map((id) => resolvePlugin(id)).filter(Boolean),
    }))
    .filter((col) => col.resolved.length > 0);

  const warningColor = isDark ? "#fdba74" : "#c2410c";
  const errorLine = (text) => (
    <div style={{ fontSize: 10.5, fontFamily, color: warningColor, marginBottom: 8 }}>{text}</div>
  );

  const seeAll = onNavigate ? (
    <Button
      label={`${t("toolkit.see_all")} ›`}
      onClick={() => onNavigate("cat:all")}
      style={{
        fontSize: 10.5,
        fontWeight: 500,
        fontFamily,
        color: "rgba(var(--pupu-text-rgb),0.55)",
        paddingVertical: 2,
        paddingHorizontal: 6,
        borderRadius: 6,
      }}
    />
  ) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flexShrink: 0, padding: "20px 26px 0" }}>
        <span style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.01em", fontFamily, color: TEXT }}>
          {t("toolkit.nav_discover")}
        </span>
      </div>

      <div className="scrollable" style={{ flex: 1, overflowY: "auto", padding: "4px 26px 26px" }}>
        {installError && errorLine(installError.message || t("toolkit.store_install_error"))}
        {packError && errorLine(t(`toolkit.skillpack_err_${packError}`))}

        {featured && (
          <>
            <SectionCaption label={t("toolkit.section_featured")} />
            <div
              data-testid="discover-featured"
              onClick={() => openDetailFor(featured)}
              style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 0 11px", cursor: "pointer" }}
            >
              <ToolkitIconFrame icon={iconFor(featured)} isDark={isDark} size={34} iconSize={18} borderRadius={8} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                  <span
                    style={{
                      fontSize: 15,
                      fontWeight: 500,
                      fontFamily,
                      color: TEXT,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {curation.featured.headline}
                  </span>
                  <TypeTag types={summarize(featured).types} />
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    fontWeight: 300,
                    fontFamily,
                    color: MUTED,
                    marginTop: 3,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {curation.featured.blurb}
                </div>
              </div>
            </div>
          </>
        )}

        {latest.length > 0 && (
          <>
            <SectionCaption label={t("toolkit.section_latest")} testId="discover-section-latest" />
            {latest.map((row) =>
              renderRow(row.resolved, {
                testId: `discover-latest-${keyOf(row.resolved)}`,
                showDescription: false,
                trailing: (
                  <span style={{ fontSize: 10.5, fontWeight: 300, color: FAINT, whiteSpace: "nowrap" }}>
                    {relativeDayLabel(row.addedAt, today, locale)}
                  </span>
                ),
              }),
            )}
          </>
        )}

        {essentials.length > 0 && (
          <>
            <SectionCaption label={t("toolkit.section_essentials")} action={seeAll} />
            {essentials.map((resolved) =>
              renderRow(resolved, { testId: `discover-essential-${keyOf(resolved)}` }),
            )}
          </>
        )}

        {visibleCollections.length > 0 && (
          <>
            <SectionCaption label={t("toolkit.section_collections")} />
            {visibleCollections.map((collection) => {
              const open = expandedCollectionId === collection.id;
              return (
                <div key={collection.id}>
                  <CollectionRow
                    collection={collection}
                    isDark={isDark}
                    fontFamily={fontFamily}
                    t={t}
                    expanded={open}
                    onToggle={() => setExpandedCollectionId((prev) => (prev === collection.id ? null : collection.id))}
                  />
                  <div
                    inert={open ? undefined : true}
                    aria-hidden={!open}
                    style={{
                      display: "grid",
                      gridTemplateRows: open ? "1fr" : "0fr",
                      transition: `grid-template-rows 0.42s ${UNFOLD_EASE}`,
                    }}
                  >
                    <div style={{ overflow: "hidden", minHeight: 0 }}>
                      {collection.resolved.map((resolved) =>
                        renderRow(resolved, {
                          testId: `discover-member-${collection.id}-${keyOf(resolved)}`,
                        }),
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
};

export default PluginsDiscoverPage;
