import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import { api } from "../../../../../SERVICEs/api";
import { subscribeToolkitCatalogRefresh } from "../../../../../SERVICEs/toolkit_catalog_refresh";
import { safe_text } from "../document_values";
import { read_toolkit_catalog, toolkit_pool_problems, with_toolkit_config } from "../toolkit_pool_config";

const record = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const own = (v, key) => Object.prototype.hasOwnProperty.call(v, key);
const NOTE = { color: "#86868b", fontSize: 11, lineHeight: 1.5 };
const PROBLEM = { ...NOTE, color: "#b02020" };
const ROW = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };

/* All row controls derive from the document. No text or selection is held
   against a row position; malformed entries remain removable by that position. */
function ToolkitRow({ entry, info, currentInfo, index, editable, isDark, onSet, onRemove, reading }) {
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
      <Button label="Remove" ariaLabel="Remove toolkit" disabled={!editable} onClick={onRemove} />
    </div>
    {valid && <>
      {!reading && !info && <div style={NOTE}>Not listed in the current tool library. This reference is kept; availability is checked when run.</div>}
      <div style={ROW}>
        <Button label="All tools" disabled={!editable} onClick={() => onSet({ enabled_tools: null })} />
        <Button label={enabled === null ? "Choose tools" : "Clear selection"} disabled={!editable} onClick={() => onSet({ enabled_tools: [] })} />
      </div>
      <div style={NOTE}>{enabled === null ? "All tools in this toolkit, including tools added later." : Array.isArray(enabled) ? enabled.length === 0 ? "No tools selected." : `${enabled.length} stored selection${enabled.length === 1 ? "" : "s"}.` : `Invalid stored tool selection: ${safe_text(enabled)}.`}</div>
      {(currentInfo?.tools || []).map((tool) => <label key={tool.name} style={ROW}>
        <input type="checkbox" aria-label={tool.name} disabled={!editable} checked={enabled === null || (Array.isArray(enabled) && enabled.includes(tool.name))} onChange={(event) => toggle(tool.name, event.target.checked)} />
        <span style={NOTE}>{tool.name}</span>
      </label>)}
      {currentInfo && currentInfo.tools.length === 0 && <div style={NOTE}>This toolkit lists no executable tools. It may provide skills or instructions.</div>}
      {Array.isArray(enabled) && enabled.map((name, at) => !known.has(name) && <div key={at} style={ROW}>
        <span style={NOTE}>Stored selection: {safe_text(name)}{reading ? " (directory not current)" : " (not in this toolkit's current directory)"}</span>
        <Button label="Remove selection" ariaLabel={`Remove stored selection ${at + 1}`} disabled={!editable} onClick={() => onSet({ enabled_tools: enabled.filter((_, i) => i !== at) })} />
      </div>)}
    </>}
  </div>;
}

/* Native data only. Library refresh never edits a stored restriction; null,
   an empty list and a nonempty list remain different author choices. */
export default function ToolkitPoolSection({ document, node, onChange, isDark }) {
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

  if (legacy) return <div data-testid="native-toolkit-legacy" style={NOTE}>Legacy tool settings are kept as stored. This panel does not convert them. Remove this pool and add a new Toolkit Pool if you want to replace its tool settings.</div>;
  if (!record(config)) return <div style={PROBLEM}>This pool has no readable tool configuration.</div>;
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
  const extra = Object.keys(config).filter((key) => key !== "toolkits" && key !== "merge_with_user_selected");

  return <section data-testid="native-toolkit-section" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    <strong style={{ ...NOTE, textTransform: "uppercase", letterSpacing: 0.4 }}>Tools</strong>
    <div style={NOTE}>Attach this pool to an Agent node to give it these tools. Availability, workspace access and model support are checked when the Agent runs.</div>
    {!editable && <div style={PROBLEM}>{!unique ? "Duplicate node ids prevent editing this pool." : "Toolkit Pools belong to Agent graphs. These stored settings are read-only here."}</div>}
    {toolkit_pool_problems(config).map((message, index) => <div key={index} style={PROBLEM}>{message}</div>)}
    <label style={ROW}>
      <input type="checkbox" aria-label="Include chat-selected toolkits" checked={config.merge_with_user_selected === true} disabled={!editable} onChange={(event) => commit({ ...config, merge_with_user_selected: event.target.checked })} />
      <span style={NOTE}>Include chat-selected toolkits</span>
    </label>
    <div style={NOTE}>Explicit entries keep their restrictions. This option can add other toolkits selected for the chat.</div>
    {typeof config.merge_with_user_selected !== "boolean" && <div style={PROBLEM}>Stored value: {safe_text(config.merge_with_user_selected)}. Choose on or off to replace it.</div>}
    {extra.map((key) => <div key={key} style={ROW}><span style={PROBLEM}>Unsupported setting: {key}</span><Button label="Remove setting" ariaLabel={`Remove setting ${key}`} disabled={!editable} onClick={() => { const next = { ...config }; delete next[key]; commit(next); }} /></div>)}
    {!Array.isArray(config.toolkits) ? <Button label="Replace invalid toolkit list with an empty list" disabled={!editable} onClick={() => setEntries([])} /> : entries.length === 0 && <div style={NOTE}>No toolkits configured here.</div>}
    {entries.map((entry, index) => {
      const info = record(entry) && typeof entry.id === "string" ? byId.get(entry.id) : null;
      return <ToolkitRow key={index} entry={entry} index={index} info={info} currentInfo={library.status === "ready" ? info : null} reading={library.status !== "ready"} editable={editable} isDark={isDark}
        onSet={(patch) => setEntry(index, patch)} onRemove={() => setEntries(entries.filter((_, at) => at !== index))} />;
    })}
    {library.status === "loading" && <div style={NOTE}>Reading the tool library…</div>}
    {library.status === "error" && <div data-testid="native-toolkit-library-error" style={PROBLEM}>Could not read the tool library. Stored tool settings are kept.</div>}
    {library.status !== "loading" && <Button label="Read tool library again" onClick={readLibrary} />}
    {library.status === "ready" && <div data-testid="native-toolkit-library-ready" style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {library.rows.length === 0 ? <span style={NOTE}>No toolkits are listed in this library.</span> : <>
        <input aria-label="Search toolkits" placeholder="Search toolkits" value={search} onChange={(event) => setSearch(event.target.value)} style={{ background: "transparent", color: "inherit", border: "1px solid #8885", borderRadius: 6, padding: 6 }} />
        {choices.map((item) => <Button key={item.toolkitId} label={`Add ${item.toolkitName || item.toolkitId}`} disabled={!editable || !Array.isArray(config.toolkits)} onClick={() => setEntries([...entries, { id: item.toolkitId, enabled_tools: null }])} />)}
        {choices.length === 0 && <span style={NOTE}>No additional toolkit matches.</span>}
      </>}
    </div>}
  </section>;
}
