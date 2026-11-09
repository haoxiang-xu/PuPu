import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import Input from "../../../../../BUILTIN_COMPONENTs/input/input";
import { api } from "../../../../../SERVICEs/api";
import { subscribeToolkitCatalogRefresh } from "../../../../../SERVICEs/toolkit_catalog_refresh";
import { safe_text } from "../document_values";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { read_toolkit_catalog, toolkit_pool_problems, with_toolkit_config } from "../toolkit_pool_config";
import WorkflowToolsSection from "./workflow_tools_section";

const record = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const own = (v, key) => Object.prototype.hasOwnProperty.call(v, key);
const NOTE = { color: "#86868b", fontSize: 11, lineHeight: 1.5 };
const PROBLEM = { ...NOTE, color: "#b02020" };
const ROW = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };

/* All row controls derive from the document. No text or selection is held
   against a row position; malformed entries remain removable by that position. */
function ToolkitRow({ entry, info, currentInfo, index, editable, isDark, onSet, onRemove, reading }) {
  const { t } = useTranslation();
  const valid = record(entry);
  const enabled = valid ? entry.enabled_tools : undefined;
  const names = (currentInfo?.tools || []).map((tool) => tool.name);
  const known = new Set(names);
  const toggle = (name, checked) => {
    const before = enabled === null ? names : Array.isArray(enabled) ? enabled : [];
    onSet({ enabled_tools: checked ? [...before, name] : before.filter((value) => value !== name) });
  };
  return <div data-testid={`native-toolkit-row-${index}`} style={{ display: "flex", flexDirection: "column", gap: 7, padding: 10, border: isDark ? "1px solid #ffffff20" : "1px solid #00000016", borderRadius: 8 }}>
    <div style={{ ...ROW, justifyContent: "space-between" }}>
      <strong style={{ fontSize: 12 }}>{info?.toolkitName || safe_text(valid ? entry.id : entry)}</strong>
      <Button label={t("agents.toolkit.remove")} ariaLabel={t("agents.toolkit.remove_toolkit")} disabled={!editable} onClick={onRemove} />
    </div>
    {valid && <>
      {!reading && !info && <div style={NOTE}>{t("agents.toolkit.unlisted")}</div>}
      <div style={ROW}>
        <Button label={t("agents.toolkit.all_tools")} disabled={!editable} onClick={() => onSet({ enabled_tools: null })} />
        <Button label={enabled === null ? t("agents.toolkit.choose_tools") : t("agents.toolkit.clear_selection")} disabled={!editable} onClick={() => onSet({ enabled_tools: [] })} />
      </div>
      <div style={NOTE}>{enabled === null ? t("agents.toolkit.all_note") : Array.isArray(enabled) ? enabled.length === 0 ? t("agents.toolkit.no_selection") : enabled.length === 1 ? t("agents.toolkit.selection_one") : t("agents.toolkit.selection_other", { count: enabled.length }) : t("agents.toolkit.selection_invalid", { value: safe_text(enabled) })}</div>
      {(currentInfo?.tools || []).map((tool) => <label key={tool.name} style={ROW}>
        <input type="checkbox" aria-label={tool.name} disabled={!editable} checked={enabled === null || (Array.isArray(enabled) && enabled.includes(tool.name))} onChange={(event) => toggle(tool.name, event.target.checked)} />
        <span style={NOTE}>{tool.name}</span>
      </label>)}
      {currentInfo && currentInfo.tools.length === 0 && <div style={NOTE}>{t("agents.toolkit.no_executable")}</div>}
      {Array.isArray(enabled) && enabled.map((name, at) => !known.has(name) && <div key={at} style={ROW}>
        <span style={NOTE}>{reading ? t("agents.toolkit.selection_stale", { name: safe_text(name) }) : t("agents.toolkit.selection_unlisted", { name: safe_text(name) })}</span>
        <Button label={t("agents.toolkit.remove_selection")} ariaLabel={t("agents.toolkit.remove_selection_index", { index: at + 1 })} disabled={!editable} onClick={() => onSet({ enabled_tools: enabled.filter((_, i) => i !== at) })} />
      </div>)}
    </>}
  </div>;
}

/* Native data only. Library refresh never edits a stored restriction; null,
   an empty list and a nonempty list remain different author choices. */
export default function ToolkitPoolSection({ document, node, onChange, isDark }) {
  const { t } = useTranslation();
  const problemStyle = { ...PROBLEM, color: isDark ? "rgba(255,140,140,0.95)" : "rgba(176,32,32,0.95)" };
  const config = node.config;
  const legacy = record(config) && own(config, "legacy_fields");
  const [library, setLibrary] = useState({ status: "loading", rows: [] });
  const [search, setSearch] = useState("");
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

  if (legacy) return <div data-testid="native-toolkit-legacy" style={NOTE}>{t("agents.toolkit.legacy")}</div>;
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
  const choices = library.rows.filter((item) => item.hidden !== true && !occupied.has(item.toolkitId) && `${item.toolkitName || item.toolkitId} ${item.toolkitId}`.toLowerCase().includes(search.toLowerCase()));
  const extra = Object.keys(config).filter((key) => key !== "toolkits" && key !== "merge_with_user_selected" && key !== "workflow_tools");

  return <section data-testid="native-toolkit-section" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    <strong style={{ ...NOTE, textTransform: "uppercase", letterSpacing: 0.4 }}>{t("agents.toolkit.tools")}</strong>
    <div style={NOTE}>{t("agents.toolkit.attach_note")}</div>
    {!editable && <div style={problemStyle}>{!unique ? t("agents.toolkit.duplicate_ids") : t("agents.toolkit.read_only")}</div>}
    {toolkit_pool_problems(config, t).map((message, index) => <div key={index} style={problemStyle}>{message}</div>)}
    <label style={ROW}>
      <input type="checkbox" aria-label={t("agents.toolkit.merge")} checked={config.merge_with_user_selected === true} disabled={!editable} onChange={(event) => commit({ ...config, merge_with_user_selected: event.target.checked })} />
      <span style={NOTE}>{t("agents.toolkit.merge")}</span>
    </label>
    <div style={NOTE}>{t("agents.toolkit.merge_note")}</div>
    {typeof config.merge_with_user_selected !== "boolean" && <div style={problemStyle}>{t("agents.toolkit.stored_merge", { value: safe_text(config.merge_with_user_selected) })}</div>}
    {extra.map((key) => <div key={key} style={ROW}><span style={problemStyle}>{t("agents.toolkit.unsupported", { key })}</span><Button label={t("agents.toolkit.remove_setting")} ariaLabel={t("agents.toolkit.remove_setting_key", { key })} disabled={!editable} onClick={() => { const next = { ...config }; delete next[key]; commit(next); }} /></div>)}
    {!Array.isArray(config.toolkits) ? <Button label={t("agents.toolkit.replace_list")} disabled={!editable} onClick={() => setEntries([])} /> : entries.length === 0 && <div style={NOTE}>{t("agents.toolkit.empty")}</div>}
    {entries.map((entry, index) => {
      const info = record(entry) && typeof entry.id === "string" ? byId.get(entry.id) : null;
      return <ToolkitRow key={index} entry={entry} index={index} info={info} currentInfo={library.status === "ready" ? info : null} reading={library.status !== "ready"} editable={editable} isDark={isDark}
        onSet={(patch) => setEntry(index, patch)} onRemove={() => setEntries(entries.filter((_, at) => at !== index))} />;
    })}
    <WorkflowToolsSection document={document} node={node} editable={editable} commit={commit} isDark={isDark} />
    {library.status === "loading" && <div style={NOTE}>{t("agents.toolkit.reading")}</div>}
    {library.status === "error" && <div data-testid="native-toolkit-library-error" style={problemStyle}>{t("agents.toolkit.library_failed")}</div>}
    {library.status !== "loading" && <Button label={t("agents.toolkit.read_again")} onClick={readLibrary} />}
    {library.status === "ready" && <div data-testid="native-toolkit-library-ready" style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {library.rows.length === 0 ? <span style={NOTE}>{t("agents.toolkit.empty_library")}</span> : <>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={NOTE}>{t("agents.toolkit.search")}</span>
          <Input placeholder={t("agents.toolkit.search")} value={search} set_value={setSearch} style={{ width: "100%", fontSize: 11, borderRadius: 6 }} />
        </label>
        {choices.map((item) => <Button key={item.toolkitId} label={t("agents.toolkit.add", { name: item.toolkitName || item.toolkitId })} disabled={!editable || !Array.isArray(config.toolkits)} onClick={() => setEntries([...entries, { id: item.toolkitId, enabled_tools: null }])} />)}
        {choices.length === 0 && <span style={NOTE}>{t("agents.toolkit.no_match")}</span>}
      </>}
    </div>}
  </section>;
}
