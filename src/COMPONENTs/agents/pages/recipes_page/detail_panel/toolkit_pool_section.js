import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import Input from "../../../../../BUILTIN_COMPONENTs/input/input";
import { SemiSwitch } from "../../../../../BUILTIN_COMPONENTs/input/switch";
import Icon from "../../../../../BUILTIN_COMPONENTs/icon/icon";
import useReducedMotion from "../../../../../BUILTIN_COMPONENTs/mini_react/use_reduced_motion";
import { ToolkitIconFrame } from "../../../../toolkit/components/toolkit_icon";
import { withMcpStoreIcon } from "../../../../../SERVICEs/mcp_toolkit_store";
import { api } from "../../../../../SERVICEs/api";
import { subscribeToolkitCatalogRefresh } from "../../../../../SERVICEs/toolkit_catalog_refresh";
import { safe_text } from "../document_values";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { read_toolkit_catalog, toolkit_pool_problems, with_toolkit_config } from "../toolkit_pool_config";
import { useWorkflowTools } from "./workflow_tools_section";
import AddButton from "./add_button";
import ContextMenu from "../../../../../BUILTIN_COMPONENTs/context_menu/context_menu";
import PanelHelp from "./panel_help";
import { Block } from "./process_timeline";
import { fieldFill, muted, PANEL_SWITCH, note as noteStyle, problem as problemOf, Region, removeButtonStyle, SettingRow, text } from "./panel_style";

const record = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const own = (v, key) => Object.prototype.hasOwnProperty.call(v, key);
const ACCENT = "#4a5bd8";
const ROW = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };
/* A control that is a real checkbox for keyboard and screen readers, drawn
   as the design's pill. */
const VISUALLY_HIDDEN = { position: "absolute", opacity: 0, width: 1, height: 1, margin: 0, pointerEvents: "none" };
/* A chosen tool's tag: the theme's success green, semibold. White text on
   the light green; the dark theme's green is brighter, so its text is a
   near-black green instead. */
export const chosenToolTag = (isDark) => (isDark
  ? { background: "var(--pupu-success, #4ade80)", color: "#052e16", fontWeight: 600 }
  : { background: "var(--pupu-success, #22c55e)", color: "#ffffff", fontWeight: 600 });
/* Under the pointer a chosen tag goes a shade darker, pressed a little more;
   the text keeps its colour. */
export const chosenToolTagFilter = (hovered, pressed) =>
  pressed ? "brightness(0.86)" : hovered ? "brightness(0.93)" : "none";

/* One tool's tag: a real checkbox drawn as a pill. */
function ToolTag({ tool, on, editable, isDark, onToggle }) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const chosen = on ? chosenToolTag(isDark) : null;
  const live = on && editable;
  return <label title={tool.description || undefined}
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => { setHovered(false); setPressed(false); }}
    onMouseDown={() => setPressed(true)} onMouseUp={() => setPressed(false)}
    style={{ position: "relative", fontSize: 11.5, fontFamily: "ui-monospace, Menlo, monospace",
      color: chosen ? chosen.color : muted(isDark), fontWeight: chosen ? chosen.fontWeight : undefined,
      opacity: on ? 1 : 0.6, background: chosen ? chosen.background : "transparent",
      filter: live ? chosenToolTagFilter(hovered, pressed) : "none",
      padding: "3px 8px", borderRadius: 999, cursor: editable ? "pointer" : "default", userSelect: "none" }}>
    <input type="checkbox" aria-label={tool.name} disabled={!editable} checked={on} onChange={(event) => onToggle(tool.name, event.target.checked)} style={VISUALLY_HIDDEN} />
    {tool.name}
  </label>;
}


/* One filled row per toolkit: its icon, its name and the fold arrow; how many
   of its tools are on, All / None and the way out on the right. Open, the
   tools follow inside the same surface as chips. All controls derive from the
   document. Null, an empty list and a nonempty list stay three different
   author choices — All writes null, None writes []. */
function ToolkitRow({ entry, info, currentInfo, index, editable, isDark, onSet, onRemove, reading }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const reducedMotion = useReducedMotion();
  const note = noteStyle(isDark);
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
  return <div data-testid={`native-toolkit-row-${index}`} style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 32, padding: "0 5px 0 8px", minWidth: 0 }}>
      <button type="button" aria-label={title} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}
        style={{ font: "inherit", flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, minHeight: 32, padding: 0, border: "none", background: "none", color: text(isDark), cursor: "pointer", textAlign: "left" }}>
        <ToolkitIconFrame icon={icon || {}} isDark={isDark} size={18} iconSize={11} transparentIconSize={14} borderRadius={5} fallbackColor={ACCENT} />
        <span style={{ minWidth: 0, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
        <Icon src="arrow_down" color="#86868b" style={{ width: 11, height: 11, flexShrink: 0, opacity: 0.8,
          transform: expanded ? "rotate(180deg)" : "none", transition: "transform 200ms cubic-bezier(0.32,0.72,0,1)" }} />
        <span style={{ flex: 1 }} />
        {valid && currentInfo && names.length > 0 && <span data-testid={`native-toolkit-count-${index}`} style={{ fontSize: 11.5, color: muted(isDark), fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{`${on_count}/${names.length}`}</span>}
      </button>
      {valid && currentInfo && names.length > 0 && <button type="button" disabled={!editable}
        onClick={() => onSet({ enabled_tools: enabled === null ? [] : null })}
        style={{ font: "inherit", fontSize: 11.5, color: text(isDark), opacity: editable ? 0.7 : 0.35, padding: "0 4px", border: "none", background: "none", cursor: editable ? "pointer" : "default", flexShrink: 0 }}>
        {enabled === null ? t("agents.legacy_tools.none") : t("agents.legacy_tools.all")}
      </button>}
      <Button prefix_icon="close" ariaLabel={t("agents.toolkit.remove_toolkit")} disabled={!editable} onClick={onRemove}
        style={removeButtonStyle(isDark)} />
    </div>
    {/* The tools open in place: the body keeps its height intrinsic and
       grows from nothing, the same disclosure as a variable's settings. */}
    {valid && <div aria-hidden={!expanded} inert={!expanded} data-testid={`native-toolkit-body-${index}`}
      style={{ display: "grid", gridTemplateRows: expanded ? "1fr" : "0fr", opacity: expanded ? 1 : 0,
        visibility: expanded ? "visible" : "hidden", minWidth: 0,
        transition: reducedMotion ? "none"
          : `grid-template-rows 200ms cubic-bezier(0.2, 0, 0, 1), opacity 160ms ease, visibility 0s ${expanded ? "0s" : "200ms"}` }}>
    <div style={{ minHeight: 0, overflow: "hidden" }}>
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "2px 10px 10px" }}>
      {!reading && !info && <span style={note}>{t("agents.toolkit.unlisted")}</span>}
      {enabled !== null && !Array.isArray(enabled) && <span style={problemOf(isDark)}>{t("agents.toolkit.selection_invalid", { value: safe_text(enabled) })}</span>}
      {currentInfo && tools.length === 0 && <span style={note}>{t("agents.toolkit.no_executable")}</span>}
      {tools.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {tools.map((tool) => {
          const on = enabled === null || (Array.isArray(enabled) && enabled.includes(tool.name));
          return <ToolTag key={tool.name} tool={tool} on={on} editable={editable} isDark={isDark} onToggle={toggle} />;
        })}
      </div>}
      {Array.isArray(enabled) && enabled.map((name, at) => !known.has(name) && <div key={at} style={ROW}>
        <span style={note}>{reading ? t("agents.toolkit.selection_stale", { name: safe_text(name) }) : t("agents.toolkit.selection_unlisted", { name: safe_text(name) })}</span>
        <Button prefix_icon="close" ariaLabel={t("agents.toolkit.remove_selection_index", { index: at + 1 })} disabled={!editable} onClick={() => onSet({ enabled_tools: enabled.filter((_, i) => i !== at) })}
          style={removeButtonStyle(isDark)} />
      </div>)}
    </div>
    </div>
    </div>}
  </div>;
}

/* Native data only. Library refresh never edits a stored restriction; null,
   an empty list and a nonempty list remain different author choices.
   The look is the original Tool Pool panel's: a merge card, the pool, then
   the installed library below a hairline. */
export default function ToolkitPoolSection({ document, node, onChange, isDark }) {
  const { t } = useTranslation();
  const note = noteStyle(isDark);
  const problemStyle = problemOf(isDark);
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
  const unique = Array.isArray(document.nodes) && document.nodes.filter((candidate) => record(candidate) && candidate.id === node.id).length === 1;
  const editable = unique && document.kind === "agent" && document.schema_version === 1 && typeof onChange === "function";
  const commit = (next) => {
    if (!editable) return;
    const changed = with_toolkit_config(document, node.id, next);
    if (changed !== document) onChange(changed);
  };
  const workflows = useWorkflowTools({ document, node, editable, commit, isDark, active: !legacy && record(config) });
  /* The one Add under the list: a small menu at the button, Toolkit (whose
     installed choices replace the menu's rows in place, the menu having no
     submenus) or Workflow. */
  const [menu, setMenu] = useState(null);
  const [menuLevel, setMenuLevel] = useState("root");
  const addAnchor = useRef(null);
  const keepMenu = useRef(false);
  const swallowClick = useRef(false);
  const closeMenu = useCallback(() => {
    /* A row that changes level asks the menu to stay; the menu closes itself
       after every chosen row. */
    if (keepMenu.current) { keepMenu.current = false; return; }
    setMenu(null);
    setMenuLevel("root");
  }, []);

  if (legacy) return <div data-testid="native-toolkit-legacy" style={note}>{t("agents.toolkit.legacy")}</div>;
  if (!record(config)) return <div style={problemStyle}>{t("agents.toolkit.unreadable")}</div>;
  const entries = Array.isArray(config.toolkits) ? config.toolkits : [];
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
  const addable = library.status === "ready" ? library.rows.filter((item) => item.hidden !== true && !occupied.has(item.toolkitId)) : [];
  const canAddToolkit = editable && Array.isArray(config.toolkits);
  const addToolkit = (item) => { if (canAddToolkit) setEntries([...entries, { id: item.toolkitId, enabled_tools: null }]); };
  const changeLevel = (level) => { keepMenu.current = true; setMenuLevel(level); };
  const menuItems = menuLevel === "toolkits" ? [
    { label: <span data-testid="native-toolkit-add-menu-back">{t("agents.upgrade.toolkit")}</span>, prefix_icon: "arrow_left", onClick: () => changeLevel("root") },
    { type: "separator" },
    ...addable.map((item) => ({
      label: <span data-testid={`native-toolkit-add-menu-item-${item.toolkitId}`} style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0, maxWidth: "100%", verticalAlign: "middle" }}>
        <ToolkitIconFrame icon={withMcpStoreIcon(item).toolkitIcon || {}} isDark={isDark} size={16} iconSize={10} transparentIconSize={13} borderRadius={4} fallbackColor={ACCENT} />
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.toolkitName || item.toolkitId}</span>
      </span>,
      disabled: !canAddToolkit,
      onClick: () => addToolkit(item),
    })),
  ] : [
    { label: <span data-testid="native-toolkit-add-menu-toolkit">{t("agents.upgrade.toolkit")}</span>, prefix_icon: "tool", trail_icon: "arrow_right",
      disabled: !canAddToolkit || addable.length === 0, onClick: () => changeLevel("toolkits") },
    ...(workflows.canAdd ? [{ label: <span data-testid="native-toolkit-add-menu-workflow">{t("agents.workflow.workflow")}</span>, prefix_icon: "workflow",
      disabled: workflows.addDisabled, onClick: workflows.add }] : []),
  ];
  const openMenu = () => {
    if (swallowClick.current) { swallowClick.current = false; return; }
    if (menu) { keepMenu.current = false; closeMenu(); return; }
    const bounds = addAnchor.current?.getBoundingClientRect?.();
    setMenuLevel("root");
    setMenu({ x: bounds ? bounds.left : 0, y: bounds ? bounds.bottom + 4 : 0 });
  };
  const extra = Object.keys(config).filter((key) => key !== "toolkits" && key !== "merge_with_user_selected" && key !== "workflow_tools");
  const merge_on = config.merge_with_user_selected === true;
  const set_merge = () => commit({ ...config, merge_with_user_selected: !merge_on });

  const poolProblems = [
    ...(!editable ? [!unique ? t("agents.toolkit.duplicate_ids") : t("agents.toolkit.read_only")] : []),
    ...toolkit_pool_problems(config, t),
  ];
  const listed = entries.length + workflows.count;

  return <section data-testid="native-toolkit-section" style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
    {/* A setting of the pool, not another heading: the words on the left,
        the switch on the right, what it means behind the info. It is the
        first thing in the panel, above the Pool heading, on its own
        surface, so a long list of toolkits never pushes it out of sight. */}
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
    <Region testid="native-toolkit-merge" isDark={isDark}><div style={{ padding: "4px 10px 4px 11px", minWidth: 0 }}>
    <SettingRow isDark={isDark} label={<span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      {t("agents.legacy_tools.merge")}
      <PanelHelp label={t("agents.legacy_tools.merge")}>{merge_on ? t("agents.legacy_tools.merge_on") : t("agents.legacy_tools.merge_off")}</PanelHelp>
    </span>}>
      <span role="switch" aria-checked={merge_on} aria-label={t("agents.legacy_tools.merge")} aria-disabled={!editable} tabIndex={editable ? 0 : -1}
        onClick={() => { if (editable) set_merge(); }}
        onKeyDown={(event) => { if (editable && (event.key === " " || event.key === "Enter")) { event.preventDefault(); set_merge(); } }}
        style={{ display: "inline-flex", flexShrink: 0, cursor: editable ? "pointer" : "default", opacity: editable ? 1 : 0.5 }}>
        {/* The switch stops its click from bubbling, so it commits the
            change itself; the outer span answers the keyboard. */}
        <span style={{ display: "inline-flex", pointerEvents: editable ? "auto" : "none" }}>
          <SemiSwitch on={merge_on} set_on={() => { if (editable) set_merge(); }} style={PANEL_SWITCH} />
        </span>
      </span>
    </SettingRow>
    </div></Region>
    {typeof config.merge_with_user_selected !== "boolean" && <div style={problemStyle}>{t("agents.toolkit.stored_merge", { value: safe_text(config.merge_with_user_selected) })}</div>}
    </div>
    {/* One list: the pooled toolkits, then the Workflow tools, the same
        strips in one surface, and one Add under it. */}
    <Block section="toolkits" title={t("agents.legacy_tools.tools_and_workflows")} help={workflows.help} problems={[...poolProblems, ...workflows.problems]} isDark={isDark}
      aside={Array.isArray(config.toolkits) || workflows.count > 0 ? String(listed) : undefined}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
        {poolProblems.map((message, index) => <div key={index} style={problemStyle}>{message}</div>)}
        {extra.map((key) => <div key={key} style={ROW}><span style={problemStyle}>{t("agents.toolkit.unsupported", { key })}</span><Button label={t("agents.toolkit.remove_setting")} ariaLabel={t("agents.toolkit.remove_setting_key", { key })} disabled={!editable} onClick={() => { const next = { ...config }; delete next[key]; commit(next); }} style={{ fontSize: 11, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 5 }} /></div>)}
        {!Array.isArray(config.toolkits) ? <Button label={t("agents.toolkit.replace_list")} disabled={!editable} onClick={() => setEntries([])} style={{ alignSelf: "flex-start", fontSize: 11, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 5 }} /> : listed === 0 && <span style={note}>{t("agents.legacy_tools.empty")}</span>}
        {workflows.notes}
        <Region isDark={isDark}>
          {entries.map((entry, index) => {
            const info = record(entry) && typeof entry.id === "string" ? byId.get(entry.id) : null;
            return <ToolkitRow key={`tk-${index}`} entry={entry} index={index} info={info} currentInfo={library.status === "ready" ? info : null} reading={library.status !== "ready"} editable={editable} isDark={isDark}
              onSet={(patch) => setEntry(index, patch)} onRemove={() => setEntries(entries.filter((_, at) => at !== index))} />;
          })}
          {workflows.rows}
        </Region>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
          {/* The menu closes on a press outside it, this button included; a
              press here while it is open must not open it again. */}
          <span ref={addAnchor} onMouseDown={() => { swallowClick.current = menu !== null; }} style={{ display: "inline-flex" }}>
            <AddButton label={t("agents.legacy_tools.add")} isDark={isDark} disabled={!editable} onClick={openMenu} testid="native-toolkit-add" />
          </span>
          {workflows.removeAll}
        </div>
        <ContextMenu visible={menu !== null} x={menu?.x ?? 0} y={menu?.y ?? 0} items={menuItems} onClose={closeMenu}
          isDark={isDark} selectionKey={menuLevel} scrollable />
      </div>
    </Block>

    {/* What can still be added: the installed library, searchable. */}
    <Block section="toolkit-library" title={t("agents.legacy_tools.installed")} isDark={isDark}>
      {library.status === "loading" && <span style={note}>{t("agents.toolkit.reading")}</span>}
      {library.status === "error" && <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span data-testid="native-toolkit-library-error" style={problemStyle}>{t("agents.toolkit.library_failed")}</span>
        <Button label={t("agents.toolkit.read_again")} onClick={readLibrary} style={{ alignSelf: "flex-start", fontSize: 11, paddingVertical: 5, paddingHorizontal: 6, borderRadius: 5, color: muted(isDark) }} />
      </div>}
      {library.status === "ready" && <div data-testid="native-toolkit-library-ready" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {library.rows.length === 0 ? <span style={note}>{t("agents.toolkit.empty_library")}</span> : <>
          <Input prefix_icon="search" placeholder={t("agents.legacy_tools.search")} value={search} set_value={setSearch}
            style={{ width: "100%", fontSize: 12.5, height: 32, paddingVertical: 0, paddingHorizontal: 10, borderRadius: 8,
              ...fieldFill(isDark) }} />
          {choices.length > 0 && <Region testid="native-toolkit-library-grid" isDark={isDark}>
          {choices.map((item) => <div key={item.toolkitId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 5px 7px 10px", minWidth: 0 }}>
            <ToolkitIconFrame icon={withMcpStoreIcon(item).toolkitIcon || {}} isDark={isDark} size={20} iconSize={12} transparentIconSize={15} borderRadius={6} fallbackColor={ACCENT} />
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
              <span style={{ fontSize: 12.5, color: text(isDark), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.toolkitName || item.toolkitId}</span>
              <span style={{ fontSize: 11.5, color: muted(isDark), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.toolkitDescription || t(item.tools.length === 1 ? "agents.legacy_tools.tool_count_one" : "agents.legacy_tools.tool_count_other", { count: item.tools.length })}</span>
            </div>
            <Button prefix_icon="add" label={t("agents.legacy_tools.add")} ariaLabel={t("agents.toolkit.add", { name: item.toolkitName || item.toolkitId })}
              disabled={!editable || !Array.isArray(config.toolkits)} onClick={() => setEntries([...entries, { id: item.toolkitId, enabled_tools: null }])}
              style={{ flexShrink: 0, fontSize: 11.5, paddingVertical: 4, paddingHorizontal: 7, borderRadius: 6, gap: 3, color: text(isDark), content: { icon: { width: 11, height: 11 } } }} />
          </div>)}
          </Region>}
          {choices.length === 0 && <span style={note}>{query ? t("agents.legacy_tools.no_match", { search: search.trim() }) : t("agents.legacy_tools.all_added")}</span>}
        </>}
      </div>}
    </Block>
  </section>;
}
