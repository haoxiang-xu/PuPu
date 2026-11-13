import React, { useEffect, useRef, useState } from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import Input from "../../../../../BUILTIN_COMPONENTs/input/input";
import { api } from "../../../../../SERVICEs/api";
import { checkSkeletonWorkflowToolCapabilities } from "../../../../../SERVICEs/skeleton_workflow_tool_capabilities";
import { safe_text } from "../document_values";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { agentMessage, renderAgentMessage } from "../agents_i18n";
import { python_strip } from "../kernel_config";
import useListIdentities from "./list_identity";
import usePendingText from "./pending_text";
import WorkflowPinControl from "./workflow_pin_control";
import { Block } from "./process_timeline";
import { addButtonStyle, fill, muted, note as noteOf, problem as problemOf, removeButtonStyle, text } from "./panel_style";

const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const has = (value, key) => record(value) && Object.prototype.hasOwnProperty.call(value, key);
const id_ok = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{1,48}$/.test(value);
const pin_of = (value) => record(value) && Object.keys(value).length === 2 &&
  ["workflow_id", "revision_id"].every((key) => has(value, key) && typeof value[key] === "string" && value[key] && python_strip(value[key]) === value[key]) ? value : null;
const ROW = { display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" };

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

function WorkflowToolRow({ entry, index, identity, canEdit, canRemove, onSet, onRemove, isDark }) {
  const { t } = useTranslation();
  const valid = record(entry);
  const id = valid ? entry.id : undefined;
  const pending = usePendingText(id, identity);
  const problem = problemOf(isDark);
  const pin = pin_of(valid ? entry.workflow : null);
  const set = (patch) => onSet((current) => ({ ...current, ...patch }));
  const NOTE_ = noteOf(isDark);
  return <div data-testid={`native-workflow-tool-row-${index}`} style={{ display: "flex", flexDirection: "column", gap: 8, padding: "6px 5px 10px 10px", background: fill(isDark), borderRadius: 8, minWidth: 0 }}>
    <div style={{ ...ROW, flexWrap: "nowrap", justifyContent: "space-between", minHeight: 22 }}>
      <span style={{ fontSize: 12.5, color: text(isDark) }}>{t("agents.workflow_tools.row", { index: index + 1 })}</span>
      <Button prefix_icon="close" ariaLabel={t("agents.workflow_tools.remove_tool")} disabled={!canRemove} onClick={onRemove} style={removeButtonStyle(isDark)} />
    </div>
    {!valid ? <span style={problem}>{t("agents.workflow_tools.bad_entry", { value: safe_text(entry) })}</span> : <>
      <label style={{ display: "flex", flexDirection: "column", gap: 4, paddingRight: 5 }}>
        <span style={NOTE_}>{t("agents.workflow_tools.id")}</span>
        <Input value={pending.text ?? (typeof id === "string" ? id : "")} disabled={!canEdit}
          set_value={(value) => {
            if (!id_ok(value)) { pending.hold(value); return; }
            pending.release();
            if (value !== id) set({ id: value });
          }} style={{ width: "100%", fontSize: 12.5, height: 30, paddingVertical: 0, paddingHorizontal: 8, borderRadius: 8, fontFamily: "ui-monospace, Menlo, monospace", backgroundColor: isDark ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.9)", border: "1px solid transparent" }} />
      </label>
      {id_ok(id) ? <span style={NOTE_}>{t("agents.workflow_tools.function_name", { name: "\uE000" }).split("\uE000").map((part, at) => <React.Fragment key={at}>{at > 0 && <code>{`workflow_${id}`}</code>}{part}</React.Fragment>)}</span> : <span style={problem}>{t("agents.workflow_tools.bad_id", { id: safe_text(id) })}</span>}
      {pending.text !== null && <span style={problem}>{t("agents.workflow_tools.pending_id")}</span>}
      {!pin && <span style={problem}>{has(entry, "workflow") ? t("agents.workflow_tools.bad_reference", { value: safe_text(entry.workflow) }) : t("agents.workflow_tools.pin_required")}</span>}
      <WorkflowPinControl pin={pin} stored={entry.workflow} editable={canEdit} onPin={(workflow_id, revision_id) => set({ workflow: { workflow_id, revision_id } })}
        isDark={isDark} testid={`native-workflow-tool-pin-${identity}`} />
      {Object.keys(entry).filter((key) => key !== "id" && key !== "workflow").map((key) => <div key={key} style={ROW}>
        <span style={problem}>{t("agents.workflow_tools.unsupported", { key, value: safe_text(entry[key]) })}</span>
        <Button label={t("agents.workflow_tools.remove_setting")} ariaLabel={t("agents.workflow_tools.remove_setting_key", { key })} disabled={!canEdit} onClick={() => onSet((current) => { const next = { ...current }; delete next[key]; return next; })} />
      </div>)}
    </>}
  </div>;
}

// The facade validates the host's CLOSED capability. No capability means no
// authoring support; saved values remain visible and explicitly removable.
export default function WorkflowToolsSection({ document, node, editable, commit, isDark }) {
  const { t } = useTranslation();
  const config = node.config;
  const rows = Array.isArray(config.workflow_tools) ? config.workflow_tools : [];
  const identities = useListIdentities(node.id, rows.length, config.workflow_tools);
  const [capability, setCapability] = useState({ status: "loading" });
  useEffect(() => {
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
  }, []);
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
  const small = { fontSize: 11, paddingVertical: 5, paddingHorizontal: 6, borderRadius: 5, color: muted(isDark) };
  return <section data-testid={`native-workflow-tools-${capability.status}`} style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
    <Block section="workflow-tools" title={t("agents.workflow_tools.title")} isDark={isDark}
      help={t("agents.workflow_tools.contract")} problems={unavailable ? [unavailable] : []}
      aside={rows.length ? String(rows.length) : undefined}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
        {capability.status === "loading" && <span style={noteOf(isDark)}>{t("agents.workflow_tools.reading")}</span>}
        {unavailable && <span style={problem}>{unavailable}</span>}
        {has(config, "workflow_tools") && !Array.isArray(config.workflow_tools) && <>
          <span style={problem}>{t("agents.workflow_tools.list_required", { value: safe_text(config.workflow_tools) })}</span>
          {supported && <Button label={t("agents.workflow_tools.replace_list")} disabled={!editable} onClick={() => writeRows([])} style={{ ...small, alignSelf: "flex-start" }} />}
        </>}
        {rows.map((entry, index) => <WorkflowToolRow key={identities.ids[index]} entry={entry} index={index} identity={identities.ids[index]}
          canEdit={editable && supported} canRemove={editable} isDark={isDark} onSet={(change) => updateRow(identities.ids[index], change)}
          onRemove={() => { identities.removed(index); writeRows(rows.filter((_, at) => at !== index)); }} />)}
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
          {supported && (!has(config, "workflow_tools") || Array.isArray(config.workflow_tools)) && <Button label={`+ ${t("agents.workflow_tools.add")}`} ariaLabel={t("agents.workflow_tools.add")} disabled={!editable} onClick={() => {
            const used = workflow_tool_ids(document, node.id);
            let index = 1;
            while (used.has(`tool-${index}`)) index += 1;
            identities.added();
            writeRows([...rows, { id: `tool-${index}` }]);
          }} style={addButtonStyle(isDark)} />}
          {has(config, "workflow_tools") && <Button label={t("agents.workflow_tools.remove_all")} disabled={!editable} onClick={() => {
            const current = latest.current;
            const next = { ...current.config };
            delete next.workflow_tools;
            current.commit(next);
          }} style={{ ...small, marginLeft: "auto", opacity: 0.8 }} />}
        </div>
      </div>
    </Block>
  </section>;
}
