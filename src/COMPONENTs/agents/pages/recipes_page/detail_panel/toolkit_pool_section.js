import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import Input from "../../../../../BUILTIN_COMPONENTs/input/input";
import Switch from "../../../../../BUILTIN_COMPONENTs/input/switch";
import Icon from "../../../../../BUILTIN_COMPONENTs/icon/icon";
import { BUILDER_SWITCH_SIZE } from "../builder_switch_size";
import { ToolkitIconFrame } from "../../../../toolkit/components/toolkit_icon";
import { withMcpStoreIcon } from "../../../../../SERVICEs/mcp_toolkit_store";
import { api } from "../../../../../SERVICEs/api";
import { subscribeToolkitCatalogRefresh } from "../../../../../SERVICEs/toolkit_catalog_refresh";
import { safe_text } from "../document_values";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { read_toolkit_catalog, toolkit_pool_problems, with_toolkit_config } from "../toolkit_pool_config";
import WorkflowToolsSection from "./workflow_tools_section";

const record = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const own = (v, key) => Object.prototype.hasOwnProperty.call(v, key);
const ACCENT = "#4a5bd8";
const SECTION_LABEL = { fontSize: 11, fontWeight: 600, color: "#86868b", textTransform: "uppercase", letterSpacing: 0.4 };
const ROW = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };
/* A control that is a real checkbox for keyboard and screen readers, drawn
   as the design's pill. */
const VISUALLY_HIDDEN = { position: "absolute", opacity: 0, width: 1, height: 1, margin: 0, pointerEvents: "none" };

function palette(isDark) {
  return {
    muted: isDark ? "#9a9aa3" : "#86868b",
    divider: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
    row_bg: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.025)",
    chip_bg: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.045)",
    chip_off: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.32)",
    problem: isDark ? "rgba(255,140,140,0.95)" : "rgba(176,32,32,0.95)",
  };
}

/* The design's pool row: collapsed to one line (chevron, icon, name, count,
   All / None, remove); expanded it shows the tools as pills. All controls
   derive from the document. Null, an empty list and a nonempty list stay
   three different author choices — All writes null, None writes []. */
function ToolkitRow({ entry, info, currentInfo, index, editable, isDark, onSet, onRemove, reading }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const c = palette(isDark);
  const note = { fontSize: 11, color: c.muted, lineHeight: 1.45 };
  const valid = record(entry);
  const enabled = valid ? entry.enabled_tools : undefined;
  const tools = currentInfo?.tools || [];
  const names = tools.map((tool) => tool.name);
  const known = new Set(names);
  const on_count = enabled === null ? names.length : Array.isArray(enabled) ? enabled.filter((name) => known.has(name)).length : 0;
  const toggle = (name, checked) => {
    const before = enabled === null ? names : Array.isArray(enabled) ? enabled : [];
    onSet({ enabled_tools: checked ? [...before, name] : before.filter((value) => value !== name) });
  };
  const title = info?.toolkitName || safe_text(valid ? entry.id : entry);
  const icon = info ? withMcpStoreIcon(info).toolkitIcon : {};
  return <div data-testid={`native-toolkit-row-${index}`} style={{ background: c.row_bg, borderRadius: 6, display: "flex", flexDirection: "column" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 6px 6px 8px" }}>
      <button type="button" aria-label={title} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}
        style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, padding: 0, border: "none", background: "none", color: "inherit", font: "inherit", cursor: "pointer", textAlign: "left" }}>
        <Icon src={expanded ? "arrow_down" : "arrow_right"} style={{ width: 9, height: 9, opacity: 0.55, flexShrink: 0 }} />
        <ToolkitIconFrame icon={icon || {}} isDark={isDark} size={20} iconSize={12} transparentIconSize={14} borderRadius={5} fallbackColor={ACCENT} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
        {valid && currentInfo && names.length > 0 && <span data-testid={`native-toolkit-count-${index}`} style={{ fontSize: 10.5, color: c.muted, flexShrink: 0 }}>{`${on_count}/${names.length}`}</span>}
      </button>
      {valid && currentInfo && names.length > 0 && <button type="button" disabled={!editable}
        onClick={() => onSet({ enabled_tools: enabled === null ? [] : null })}
        style={{ fontSize: 10.5, color: ACCENT, padding: "0 2px", border: "none", background: "none", cursor: editable ? "pointer" : "default", opacity: editable ? 1 : 0.5, flexShrink: 0 }}>
        {enabled === null ? t("agents.legacy_tools.none") : t("agents.legacy_tools.all")}
      </button>}
      <Button prefix_icon="close" ariaLabel={t("agents.toolkit.remove_toolkit")} disabled={!editable} onClick={onRemove}
        style={{ paddingVertical: 3, paddingHorizontal: 3, borderRadius: 4, content: { icon: { width: 11, height: 11 } } }} />
    </div>
    {valid && expanded && <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "0 8px 8px 28px" }}>
      {!reading && !info && <span style={note}>{t("agents.toolkit.unlisted")}</span>}
      {enabled !== null && !Array.isArray(enabled) && <span style={{ ...note, color: c.problem }}>{t("agents.toolkit.selection_invalid", { value: safe_text(enabled) })}</span>}
      {currentInfo && tools.length === 0 && <span style={note}>{t("agents.toolkit.no_executable")}</span>}
      {tools.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {tools.map((tool) => {
          const on = enabled === null || (Array.isArray(enabled) && enabled.includes(tool.name));
          return <label key={tool.name} title={tool.description || undefined} style={{ position: "relative", fontSize: 10.5, fontFamily: "ui-monospace, Menlo, monospace", color: on ? "#fff" : c.chip_off, background: on ? ACCENT : c.chip_bg, padding: "2px 7px", borderRadius: 999, cursor: editable ? "pointer" : "default", userSelect: "none" }}>
            <input type="checkbox" aria-label={tool.name} disabled={!editable} checked={on} onChange={(event) => toggle(tool.name, event.target.checked)} style={VISUALLY_HIDDEN} />
            {tool.name}
          </label>;
        })}
      </div>}
      {Array.isArray(enabled) && enabled.map((name, at) => !known.has(name) && <div key={at} style={ROW}>
        <span style={note}>{reading ? t("agents.toolkit.selection_stale", { name: safe_text(name) }) : t("agents.toolkit.selection_unlisted", { name: safe_text(name) })}</span>
        <Button prefix_icon="close" ariaLabel={t("agents.toolkit.remove_selection_index", { index: at + 1 })} disabled={!editable} onClick={() => onSet({ enabled_tools: enabled.filter((_, i) => i !== at) })}
          style={{ paddingVertical: 2, paddingHorizontal: 2, borderRadius: 4, content: { icon: { width: 10, height: 10 } } }} />
      </div>)}
    </div>}
  </div>;
}

/* Native data only. Library refresh never edits a stored restriction; null,
   an empty list and a nonempty list remain different author choices.
   The look is the original Tool Pool panel's: a merge card, the pool, then
   the installed library below a hairline. */
export default function ToolkitPoolSection({ document, node, onChange, isDark }) {
  const { t } = useTranslation();
  const c = palette(isDark);
  const note = { fontSize: 11, color: c.muted, lineHeight: 1.45 };
  const problemStyle = { ...note, color: c.problem };
  const config = node.config;
  const legacy = record(config) && own(config, "legacy_fields");
  const [library, setLibrary] = useState({ status: "loading", rows: [] });
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("installed");
  const request = useRef(0);
  const alive = useRef(true);
  const readLibrary = useCallback(async () => {
    const ticket = ++request.current;
    setLibrary((old) => ({ ...old, status: "loading" }));
    try {
      const payload = await api.unchain.listToolModalCatalog({ strict: true });
      const rows = read_toolkit_catalog(payload);
      if (alive.current && ticket === request.current) setLibrary({ status: "ready", rows });
    } catch (_error) {
      if (alive.current && ticket === request.current) setLibrary((old) => ({ ...old, status: "error" }));
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    if (!legacy) readLibrary();
    const unsubscribe = legacy ? () => {} : subscribeToolkitCatalogRefresh(readLibrary);
    return () => { alive.current = false; request.current += 1; unsubscribe(); };
  }, [legacy, readLibrary]);
  const byId = useMemo(() => new Map(library.rows.map((item) => [item.toolkitId, item])), [library.rows]);

  if (legacy) return <div data-testid="native-toolkit-legacy" style={note}>{t("agents.toolkit.legacy")}</div>;
  if (!record(config)) return <div style={problemStyle}>{t("agents.toolkit.unreadable")}</div>;
  const unique = Array.isArray(document.nodes) && document.nodes.filter((candidate) => record(candidate) && candidate.id === node.id).length === 1;
  const editable = unique && document.kind === "agent" && document.schema_version === 1 && typeof onChange === "function";
  const entries = Array.isArray(config.toolkits) ? config.toolkits : [];
  const commit = (next) => {
    if (!editable) return;
    const changed = with_toolkit_config(document, node.id, next);
    if (changed !== document) onChange(changed);
  };
  const setEntries = (next) => commit({ ...config, toolkits: next });
  const setEntry = (index, patch) => setEntries(entries.map((entry, at) => at === index ? { ...entry, ...patch } : entry));
  const occupied = new Set(entries.filter(record).map((entry) => entry.id).filter((id) => typeof id === "string"));
  const query = search.trim().toLowerCase();
  const choices = library.rows.filter((item) => {
    if (item.hidden === true || occupied.has(item.toolkitId)) return false;
    if (!query) return true;
    const text = `${item.toolkitName || ""} ${item.toolkitId} ${item.toolkitDescription || ""}`.toLowerCase();
    return text.includes(query) || item.tools.some((tool) => tool.name.toLowerCase().includes(query));
  });
  const extra = Object.keys(config).filter((key) => key !== "toolkits" && key !== "merge_with_user_selected" && key !== "workflow_tools");
  const merge_on = config.merge_with_user_selected === true;
  const set_merge = () => commit({ ...config, merge_with_user_selected: !merge_on });

  return <section data-testid="native-toolkit-section" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    {!editable && <div style={problemStyle}>{!unique ? t("agents.toolkit.duplicate_ids") : t("agents.toolkit.read_only")}</div>}
    {toolkit_pool_problems(config, t).map((message, index) => <div key={index} style={problemStyle}>{message}</div>)}
    {extra.map((key) => <div key={key} style={ROW}><span style={problemStyle}>{t("agents.toolkit.unsupported", { key })}</span><Button label={t("agents.toolkit.remove_setting")} ariaLabel={t("agents.toolkit.remove_setting_key", { key })} disabled={!editable} onClick={() => { const next = { ...config }; delete next[key]; commit(next); }} /></div>)}

    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "6px 8px", borderRadius: 6, background: c.row_bg }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 500 }}>{t("agents.legacy_tools.merge")}</span>
        <span style={{ fontSize: 10.5, color: c.muted }}>{merge_on ? t("agents.legacy_tools.merge_on") : t("agents.legacy_tools.merge_off")}</span>
      </div>
      <span role="switch" aria-checked={merge_on} aria-label={t("agents.legacy_tools.merge")} aria-disabled={!editable} tabIndex={editable ? 0 : -1}
        onClick={() => { if (editable) set_merge(); }}
        onKeyDown={(event) => { if (editable && (event.key === " " || event.key === "Enter")) { event.preventDefault(); set_merge(); } }}
        style={{ display: "inline-flex", flexShrink: 0, cursor: editable ? "pointer" : "default", opacity: editable ? 1 : 0.5 }}>
        <span style={{ display: "inline-flex", pointerEvents: "none" }}><Switch on={merge_on} set_on={() => {}} style={BUILDER_SWITCH_SIZE} /></span>
      </span>
    </div>
    {typeof config.merge_with_user_selected !== "boolean" && <div style={problemStyle}>{t("agents.toolkit.stored_merge", { value: safe_text(config.merge_with_user_selected) })}</div>}

    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {/* The count is already the header's subtitle; saying it twice adds nothing. */}
      <span style={SECTION_LABEL}>{t("agents.legacy_tools.pool")}</span>
      {!Array.isArray(config.toolkits) ? <Button label={t("agents.toolkit.replace_list")} disabled={!editable} onClick={() => setEntries([])} /> : entries.length === 0 && <span style={note}>{t("agents.toolkit.empty")}</span>}
      {entries.map((entry, index) => {
        const info = record(entry) && typeof entry.id === "string" ? byId.get(entry.id) : null;
        return <ToolkitRow key={index} entry={entry} index={index} info={info} currentInfo={library.status === "ready" ? info : null} reading={library.status !== "ready"} editable={editable} isDark={isDark}
          onSet={(patch) => setEntry(index, patch)} onRemove={() => setEntries(entries.filter((_, at) => at !== index))} />;
      })}
    </div>

    <WorkflowToolsSection document={document} node={node} editable={editable} commit={commit} isDark={isDark} />

    <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 10, borderTop: `1px solid ${c.divider}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {[["installed", "tool"], ["store", "search"]].map(([key, icon]) => <Button key={key} prefix_icon={icon}
          label={t(`agents.legacy_tools.${key}`)} onClick={() => setTab(key)}
          style={{ fontSize: 11.5, fontWeight: 500, opacity: tab === key ? 1 : 0.5, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, gap: 4, content: { icon: { width: 12, height: 12 } } }} />)}
      </div>
      {tab === "store" && <div style={{ padding: "24px 12px", textAlign: "center", fontSize: 11.5, color: c.muted }}>{t("agents.legacy_tools.soon")}</div>}
      {tab === "installed" && <>
      {library.status === "loading" && <span style={note}>{t("agents.toolkit.reading")}</span>}
      {library.status === "error" && <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span data-testid="native-toolkit-library-error" style={problemStyle}>{t("agents.toolkit.library_failed")}</span>
        <Button label={t("agents.toolkit.read_again")} onClick={readLibrary} style={{ alignSelf: "flex-start", fontSize: 11, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6 }} />
      </div>}
      {library.status === "ready" && <div data-testid="native-toolkit-library-ready" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {library.rows.length === 0 ? <span style={note}>{t("agents.toolkit.empty_library")}</span> : <>
          <Input prefix_icon="search" placeholder={t("agents.legacy_tools.search")} value={search} set_value={setSearch}
            style={{ width: "100%", fontSize: 12, paddingVertical: 5, paddingHorizontal: 8, borderRadius: 6 }} />
          {/* One card per row in a narrow panel; two once each can keep
              about 220px. Never more than two, so names stay readable. */}
          {choices.length > 0 && <div data-testid="native-toolkit-library-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(max(220px, calc((100% - 6px) / 2)), 1fr))", gap: 6 }}>
          {choices.map((item) => <div key={item.toolkitId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, background: c.row_bg, minWidth: 0 }}>
            <ToolkitIconFrame icon={withMcpStoreIcon(item).toolkitIcon || {}} isDark={isDark} size={24} iconSize={13} transparentIconSize={16} borderRadius={7} fallbackColor={ACCENT} />
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.toolkitName || item.toolkitId}</span>
              <span style={{ fontSize: 10.5, color: c.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.toolkitDescription || t(item.tools.length === 1 ? "agents.legacy_tools.tool_count_one" : "agents.legacy_tools.tool_count_other", { count: item.tools.length })}</span>
            </div>
            <Button prefix_icon="add" label={t("agents.legacy_tools.add")} ariaLabel={t("agents.toolkit.add", { name: item.toolkitName || item.toolkitId })}
              disabled={!editable || !Array.isArray(config.toolkits)} onClick={() => setEntries([...entries, { id: item.toolkitId, enabled_tools: null }])}
              style={{ fontSize: 11, fontWeight: 500, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, gap: 3, color: ACCENT, content: { icon: { width: 11, height: 11 } } }} />
          </div>)}
          </div>}
          {choices.length === 0 && <span style={note}>{query ? t("agents.legacy_tools.no_match", { search: search.trim() }) : t("agents.legacy_tools.all_added")}</span>}
        </>}
      </div>}
      </>}
    </div>
  </section>;
}
