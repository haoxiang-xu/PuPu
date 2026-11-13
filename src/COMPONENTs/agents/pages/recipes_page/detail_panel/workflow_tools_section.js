import React, { useEffect, useRef, useState } from "react";
import AddButton from "./add_button";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import Icon from "../../../../../BUILTIN_COMPONENTs/icon/icon";
import useReducedMotion from "../../../../../BUILTIN_COMPONENTs/mini_react/use_reduced_motion";
import { ToolkitIconFrame } from "../../../../toolkit/components/toolkit_icon";
import Input from "./panel_input";
import { api } from "../../../../../SERVICEs/api";
import { checkSkeletonWorkflowToolCapabilities } from "../../../../../SERVICEs/skeleton_workflow_tool_capabilities";
import { safe_text } from "../document_values";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { agentMessage, renderAgentMessage } from "../agents_i18n";
import { python_strip } from "../kernel_config";
import useListIdentities from "./list_identity";
import usePendingText from "./pending_text";
import WorkflowPinControl from "./workflow_pin_control";
import { addButtonStyle, muted, note as noteOf, problem as problemOf, Region, removeButtonStyle, text } from "./panel_style";

const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const has = (value, key) => record(value) && Object.prototype.hasOwnProperty.call(value, key);
const id_ok = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{1,48}$/.test(value);
const pin_of = (value) => record(value) && Object.keys(value).length === 2 &&
  ["workflow_id", "revision_id"].every((key) => has(value, key) && typeof value[key] === "string" && value[key] && python_strip(value[key]) === value[key]) ? value : null;
const ROW = { display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" };
const ACCENT = "#4a5bd8";
const WORKFLOW_ICON = { type: "builtin", name: "workflow" };

// Tool ids are scoped to the Kernels this pool actually supplies. An unrelated
// Kernel's pool does not reserve a name here. This never edits sibling pools.
export function workflow_tool_ids(document, poolId) {
  const nodes = Array.isArray(document.nodes) ? document.nodes : [];
  const edges = Array.isArray(document.edges) ? document.edges : [];
  const owners = new Set(edges.filter((edge) => edge?.kind === "attach" && edge.target_node_id === poolId).map((edge) => edge.source_node_id));
  const pools = new Set([poolId, ...edges.filter((edge) => edge?.kind === "attach" && owners.has(edge.source_node_id)).map((edge) => edge.target_node_id)]);
  return new Set(nodes.filter((node) => node?.type === "toolkit_pool" && pools.has(node.id))
    .flatMap((node) => Array.isArray(node.config?.workflow_tools) ? node.config.workflow_tools : [])
    .filter(record).map((entry) => entry.id).filter(id_ok));
}

/* One strip per Workflow tool, drawn like a toolkit's: the icon, its id and
   the fold arrow, the pinned Workflow and the way out on the right. Its
   settings open in place below. A row that still needs something — a bad
   entry, an invalid id, no pin, an unsupported setting — starts open, so a
   newly added tool shows its fields straight away. */
function WorkflowToolRow({ entry, index, identity, canEdit, canRemove, onSet, onRemove, isDark }) {
  const { t } = useTranslation();
  const valid = record(entry);
  const id = valid ? entry.id : undefined;
  const pending = usePendingText(id, identity);
  const problem = problemOf(isDark);
  const pin = pin_of(valid ? entry.workflow : null);
  const extra = valid ? Object.keys(entry).filter((key) => key !== "id" && key !== "workflow") : [];
  const [expanded, setExpanded] = useState(() => !(valid && id_ok(id) && pin && extra.length === 0));
  const reducedMotion = useReducedMotion();
  const set = (patch) => onSet((current) => ({ ...current, ...patch }));
  const NOTE_ = noteOf(isDark);
  const title = id_ok(id) ? id : t("agents.workflow_tools.row", { index: index + 1 });
  return <div data-testid={`native-workflow-tool-row-${index}`} style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 32, padding: "0 5px 0 8px", minWidth: 0 }}>
      <button type="button" aria-label={title} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}
        style={{ font: "inherit", flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, minHeight: 32, padding: 0, border: "none", background: "none", color: text(isDark), cursor: "pointer", textAlign: "left" }}>
        <ToolkitIconFrame icon={WORKFLOW_ICON} isDark={isDark} size={18} iconSize={11} transparentIconSize={14} borderRadius={5} fallbackColor={ACCENT} />
        <span style={{ minWidth: 0, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
        <Icon src="arrow_down" color="#86868b" style={{ width: 11, height: 11, flexShrink: 0, opacity: 0.8,
          transform: expanded ? "rotate(180deg)" : "none", transition: "transform 200ms cubic-bezier(0.32,0.72,0,1)" }} />
        <span style={{ flex: 1 }} />
        {pin && <span data-testid={`native-workflow-tool-pinned-${index}`} style={{ minWidth: 0, maxWidth: "45%", fontSize: 11.5, color: muted(isDark), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 1 }}>{pin.workflow_id}</span>}
      </button>
      <Button prefix_icon="close" ariaLabel={t("agents.workflow_tools.remove_tool")} disabled={!canRemove} onClick={onRemove} style={removeButtonStyle(isDark)} />
    </div>
    <div aria-hidden={!expanded} inert={!expanded} data-testid={`native-workflow-tool-body-${index}`}
      style={{ display: "grid", gridTemplateRows: expanded ? "1fr" : "0fr", opacity: expanded ? 1 : 0,
        visibility: expanded ? "visible" : "hidden", minWidth: 0,
        transition: reducedMotion ? "none"
          : `grid-template-rows 200ms cubic-bezier(0.2, 0, 0, 1), opacity 160ms ease, visibility 0s ${expanded ? "0s" : "200ms"}` }}>
    <div style={{ minHeight: 0, overflow: "hidden" }}>
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "2px 10px 10px" }}>
    {!valid ? <span style={problem}>{t("agents.workflow_tools.bad_entry", { value: safe_text(entry) })}</span> : <>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={NOTE_}>{t("agents.workflow_tools.id")}</span>
        <Input value={pending.text ?? (typeof id === "string" ? id : "")} disabled={!canEdit}
          set_value={(value) => {
            if (!id_ok(value)) { pending.hold(value); return; }
            pending.release();
            if (value !== id) set({ id: value });
          }} style={{ width: "100%", fontSize: 12.5, height: 30, paddingVertical: 0, paddingHorizontal: 8, fontFamily: "ui-monospace, Menlo, monospace" }} />
      </label>
      {id_ok(id) ? <span style={NOTE_}>{t("agents.workflow_tools.function_name", { name: "" }).split("").map((part, at) => <React.Fragment key={at}>{at > 0 && <code>{`workflow_${id}`}</code>}{part}</React.Fragment>)}</span> : <span style={problem}>{t("agents.workflow_tools.bad_id", { id: safe_text(id) })}</span>}
      {pending.text !== null && <span style={problem}>{t("agents.workflow_tools.pending_id")}</span>}
      {!pin && <span style={problem}>{has(entry, "workflow") ? t("agents.workflow_tools.bad_reference", { value: safe_text(entry.workflow) }) : t("agents.workflow_tools.pin_required")}</span>}
      <WorkflowPinControl pin={pin} stored={entry.workflow} editable={canEdit} onPin={(workflow_id, revision_id) => set({ workflow: { workflow_id, revision_id } })}
        isDark={isDark} testid={`native-workflow-tool-pin-${identity}`} />
      {extra.map((key) => <div key={key} style={ROW}>
        <span style={problem}>{t("agents.workflow_tools.unsupported", { key, value: safe_text(entry[key]) })}</span>
        <Button label={t("agents.workflow_tools.remove_setting")} ariaLabel={t("agents.workflow_tools.remove_setting_key", { key })} disabled={!canEdit} onClick={() => onSet((current) => { const next = { ...current }; delete next[key]; return next; })} />
      </div>)}
    </>}
    </div>
    </div>
    </div>
  </div>;
}

/* The Workflow tools of a pool, as pieces the pool's one list composes: the
   rows (keyed, ready to sit in a Region beside the toolkit rows), the notes,
   the problems, the "remove the setting" control and an add() function.
   The facade validates the host's CLOSED capability. No capability means no
   authoring support; saved values remain visible and explicitly removable.
   `active` false (a legacy or unreadable pool) reads nothing. */
export function useWorkflowTools({ document, node, editable, commit, isDark, active = true }) {
  const { t } = useTranslation();
  const config = record(node.config) ? node.config : {};
  const rows = Array.isArray(config.workflow_tools) ? config.workflow_tools : [];
  const identities = useListIdentities(node.id, rows.length, config.workflow_tools);
  const [capability, setCapability] = useState({ status: "loading" });
  useEffect(() => {
    if (!active) return undefined;
    let live = true;
    const read = api?.unchain?.getSkeletonWorkflowToolCapabilities;
    if (typeof read !== "function") {
      setCapability({ status: "unavailable", reason: agentMessage("agents.workflow_tools.no_contract") });
      return undefined;
    }
    Promise.resolve().then(() => read()).then((reply) => {
      checkSkeletonWorkflowToolCapabilities(reply);
      if (live) setCapability({ status: "ready" });
    }).catch((error) => {
      if (live) setCapability({ status: "unavailable", reason: error?.code || error?.message ? safe_text(error.code || error.message) : agentMessage("agents.workflow_tools.no_answer") });
    });
    return () => { live = false; };
  }, [active]);
  const latest = useRef(null);
  latest.current = { config, rows, identities, editable, commit, capability };
  const writeRows = (next) => {
    const current = latest.current;
    if (!current.editable) return;
    current.identities.carrying(next);
    current.commit({ ...current.config, workflow_tools: next });
  };
  const updateRow = (identity, change) => {
    const current = latest.current;
    if (!current.editable || current.capability.status !== "ready") return;
    const index = current.identities.ids.indexOf(identity);
    if (index < 0 || !record(current.rows[index])) return;
    writeRows(current.rows.map((row, at) => at === index ? change(row) : row));
  };
  const supported = capability.status === "ready";
  const problem = problemOf(isDark);
  const unavailable = capability.status === "unavailable"
    ? t("agents.workflow_tools.unavailable", { reason: renderAgentMessage(capability.reason, t) }) : null;
  const small = addButtonStyle(isDark);
  const canAdd = supported && (!has(config, "workflow_tools") || Array.isArray(config.workflow_tools));
  const add = () => {
    if (!editable || !canAdd) return;
    const used = workflow_tool_ids(document, node.id);
    let index = 1;
    while (used.has(`tool-${index}`)) index += 1;
    identities.added();
    writeRows([...rows, { id: `tool-${index}` }]);
  };
  return {
    status: capability.status,
    count: rows.length,
    help: t("agents.workflow_tools.contract"),
    problems: unavailable ? [unavailable] : [],
    canAdd,
    addDisabled: !editable,
    add,
    rows: rows.map((entry, index) => <WorkflowToolRow key={`wf-${identities.ids[index]}`} entry={entry} index={index} identity={identities.ids[index]}
      canEdit={editable && supported} canRemove={editable} isDark={isDark} onSet={(change) => updateRow(identities.ids[index], change)}
      onRemove={() => { identities.removed(index); writeRows(rows.filter((_, at) => at !== index)); }} />),
    notes: <div data-testid={`native-workflow-tools-${capability.status}`} style={{ display: "contents" }}>
      {capability.status === "loading" && <span style={noteOf(isDark)}>{t("agents.workflow_tools.reading")}</span>}
      {unavailable && <span style={problem}>{unavailable}</span>}
      {has(config, "workflow_tools") && !Array.isArray(config.workflow_tools) && <>
        <span style={problem}>{t("agents.workflow_tools.list_required", { value: safe_text(config.workflow_tools) })}</span>
        {supported && <Button label={t("agents.workflow_tools.replace_list")} disabled={!editable} onClick={() => writeRows([])} style={small} />}
      </>}
    </div>,
    removeAll: has(config, "workflow_tools") ? <Button label={t("agents.workflow_tools.remove_all")} disabled={!editable} onClick={() => {
      const current = latest.current;
      const next = { ...current.config };
      delete next.workflow_tools;
      current.commit(next);
    }} style={{ ...small, marginLeft: "auto", opacity: 0.8 }} /> : null,
  };
}

/* The Workflow tools on their own, without a pool around them. The panel
   composes useWorkflowTools into the Toolkit Pool's one list instead. */
export default function WorkflowToolsSection({ document, node, editable, commit, isDark }) {
  const { t } = useTranslation();
  const tools = useWorkflowTools({ document, node, editable, commit, isDark });
  return <section style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
    {tools.notes}
    <Region isDark={isDark}>{tools.rows}</Region>
    <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
      {tools.canAdd && <AddButton label={t("agents.workflow_tools.add")} isDark={isDark} disabled={tools.addDisabled} onClick={tools.add} />}
      {tools.removeAll}
    </div>
  </section>;
}
