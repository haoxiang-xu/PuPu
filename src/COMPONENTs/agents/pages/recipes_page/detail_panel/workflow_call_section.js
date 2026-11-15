import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import Input from "./panel_input";
import Select from "./panel_select";
import { subscribeSkeletonLibraryRefresh } from "../../../../../SERVICEs/skeleton_library_refresh";
import { buildAgentPickerTree } from "../../../../../SERVICEs/agent_picker_tree";
import CommandTree from "../../../../chat-input/components/command_tree";
import { binding_sources } from "./input_variables_section";
import { safe_text } from "../document_values";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { agentError, agentMessage, renderAgentMessage } from "../agents_i18n";
import { node_bindings } from "../skeleton_document";
import { expression_summary } from "../skeleton_io";
import { is_unavailable, list_resources, load_resource, publish_workflow } from "../skeleton_resources";
import {
  remember_workflow_version,
  request_workflow_version,
  useWorkflowVersions,
  workflow_version_state,
} from "../workflow_versions";
import {
  call_input_layout,
  callee_interface,
  pinned_reference,
  remove_call_input,
  with_call_input,
  with_workflow_reference,
  workflow_call_problems,
  workflow_reference,
} from "../workflow_call_config";
import { Block } from "./process_timeline";
import { addButtonStyle, note, pickerSelectProps, pickerSlotStyle, problem as problemOf, Region } from "./panel_style";
import { TableHeads, TABLE_CONTROL_INSET } from "./parameter_table";
import TypedInputRow, { typed_input_template } from "./typed_input_row";

/* A Workflow Call node (#357): which published Workflow revision it runs, the
 * values that revision's Start reads, and what its End gives back. Every rule
 * is the fixed runtime's and host's (see `workflow_call_config`):
 *
 *   - the reference is one published revision, pinned by id. The host does
 *     not list a Workflow's revisions — only how many there are — so a
 *     revision is pinned either by publishing the Workflow's current draft
 *     (the host answers an unchanged draft with the revision it already has)
 *     or by its id, which is read back before it is written;
 *   - the inputs ARE the called Workflow's run input, so this section takes
 *     the place of Input Variables: one row per key its Start reads, and no
 *     free-form row. A row it does not read is kept and shown, and can be
 *     removed;
 *   - its result is its End's exports, which the Output Variables below then
 *     pick from;
 *   - there is no error policy to choose. */

const MONO = { fontFamily: "ui-monospace, Menlo, monospace" };
const ROW = { display: "flex", alignItems: "center", gap: 6 };
const FIELD = { width: "100%", fontSize: 12, paddingVertical: 4, paddingHorizontal: 6 };
/* One input row of the Inputs region, as Tool Call's argument rows. */
const ROW_PAD = "8px 10px 8px 11px";

const PUBLISHING = agentMessage("agents.workflow.publishing");
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function refusal_text(result, fallback) {
  if (is_unavailable(result)) return agentMessage("agents.workflow.store_unreachable");
  const error = result && result.error;
  if (error && renderAgentMessage(error, agentMessage) !== error) return renderAgentMessage(error, agentMessage);
  return error && (error.message || error.code) ? safe_text(error.message || error.code) : fallback;
}

/* The Workflows the store lists, archived ones left out of the request: an
   archived Workflow cannot receive a new reference. Re-read when anything says
   the library changed. */
function useWorkflowLibrary() {
  const [state, setState] = useState({ status: "loading", rows: [], error: null });
  const ticket = useRef(0);
  const read = useCallback(async () => {
    const mine = ++ticket.current;
    const result = await list_resources(false);
    if (mine !== ticket.current) return;
    const rows = result.ok && Array.isArray(result.data)
      ? result.data
      : result.ok && record(result.data) && Array.isArray(result.data.resources)
        ? result.data.resources
        : null;
    if (rows) {
      setState({ status: "ready", rows: rows.filter((row) => record(row) && row.kind === "workflow" && typeof row.id === "string"), error: null });
    } else {
      setState({ status: "error", rows: [], error: result.ok ? { error: agentError("agents.workflow.bad_library") } : result });
    }
  }, []);
  useEffect(() => {
    read();
    const off = subscribeSkeletonLibraryRefresh(read);
    return () => {
      ticket.current += 1;
      off();
    };
  }, [read]);
  return [state, read];
}

/* What decides whether the called Workflow has moved on from the version
   this call took: its graph, without where the nodes sit or what it is
   called. Publishing answers an unchanged graph with the version it already
   has, so a wrong "changed" only ever costs an Update that changes nothing. */
const RUN_FIELDS = ["kind", "schema_version", "nodes", "edges", "input_schema"];
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value === undefined ? null : value);
}
const run_shape = (document) => stable(RUN_FIELDS.map((key) => (record(document) ? document[key] : undefined)));

/* The called Workflow's draft as the store has it now, re-read whenever the
   library says something changed (a save of that Workflow included). */
function useCalleeDraft(workflow_id) {
  const [draft, setDraft] = useState(null);
  useEffect(() => {
    let alive = true;
    let ticket = 0;
    const read = async () => {
      if (!workflow_id) return setDraft(null);
      const mine = ++ticket;
      const result = await load_resource(workflow_id);
      if (alive && mine === ticket) setDraft(result.ok && record(result.data) && record(result.data.document) ? { workflow_id, document: result.data.document } : null);
    };
    read();
    const off = subscribeSkeletonLibraryRefresh(read);
    return () => { alive = false; off(); };
  }, [workflow_id]);
  return draft && draft.workflow_id === workflow_id ? draft.document : null;
}

export default function WorkflowCallSection({ document, node, rowDiagnostics, isDark, onChange, onOpenWorkflow }) {
  const { t } = useTranslation();
  const [library, reloadLibrary] = useWorkflowLibrary();
  const pin = pinned_reference(node);
  const stored = workflow_reference(node);
  useWorkflowVersions(pin ? [pin] : []);
  const state = pin ? workflow_version_state(pin.workflow_id, pin.revision_id) : null;
  const version = state && state.status === "ready" ? state.version : null;
  const shape = version ? callee_interface(version.document) : null;

  const unique = Array.isArray(document && document.nodes) && document.nodes.filter((item) => item && item.id === node.id).length === 1;
  const editable = unique && (document.kind === "agent" || document.kind === "workflow") &&
    document.schema_version === 1 && typeof onChange === "function";
  const commit = (next) => {
    if (editable && next !== document) onChange(next);
  };

  /* Which Workflow the revision controls are about. It starts as the pinned
     one and changes only by the author's choice; choosing writes nothing — a
     reference is only ever a pinned revision. */
  const [chosen, setChosen] = useState(pin ? pin.workflow_id : record(stored) && typeof stored.workflow_id === "string" ? stored.workflow_id : "");
  const listed = library.rows.find((row) => row.id === chosen) || null;
  const workflow_name = (version && version.document && typeof version.document.name === "string" && version.document.name)
    || (listed && listed.name) || chosen || t("agents.workflow.the_workflow");

  /* A pin answers later than the click that asked for it. Like the Code
     panel's profile registration (R-357-01), only the request the author is
     still waiting for may write, it writes against the document as it is
     THEN, and changing the Workflow, a newer request or unmounting revokes it. */
  const latest = useRef({ document, editable, onChange });
  latest.current = { document, editable, onChange };
  const intent = useRef({ ticket: 0, pending: null, mounted: true });
  useEffect(() => () => {
    intent.current.pending = null;
    intent.current.mounted = false;
  }, []);
  const [pinState, setPinState] = useState({ status: "idle", message: null });
  const settle = (ticket, workflow_id, revision) => {
    if (intent.current.pending !== ticket) return false;
    intent.current.pending = null;
    if (!revision) return true;
    const now = latest.current;
    if (now.editable) {
      now.onChange(with_workflow_reference(now.document, node.id, { workflow_id, revision_id: revision.revision_id }));
    }
    return true;
  };
  const begin = (message) => {
    const ticket = ++intent.current.ticket;
    intent.current.pending = ticket;
    setPinState({ status: "working", message });
    return ticket;
  };
  /* Taking a Workflow's current version: its draft is published (an
     unchanged draft answers with the version it already has) and that
     version is what this call runs. */
  const publishAndPin = async (workflow_id = chosen) => {
    if (!workflow_id || !editable) return;
    const ticket = begin(PUBLISHING);
    const opened = await load_resource(workflow_id);
    if (intent.current.pending !== ticket) return;
    if (!opened.ok) {
      settle(ticket, workflow_id, null);
      if (intent.current.mounted) setPinState({ status: "refused", message: agentMessage("agents.workflow.lock_failed", { message: refusal_text(opened, agentMessage("agents.workflow.store_refused")) }) });
      return;
    }
    const published = await publish_workflow(workflow_id, opened.data.edit_token);
    if (published.ok) remember_workflow_version(published.data);
    if (!settle(ticket, workflow_id, published.ok ? published.data : null)) return;
    if (!intent.current.mounted) return;
    setPinState(published.ok
      ? { status: "idle", message: null }
      : { status: "refused", message: agentMessage("agents.workflow.lock_failed", { message: refusal_text(published, agentMessage("agents.workflow.publication_refused")) }) });
  };
  const choose = (value) => {
    if (typeof value !== "string" || value === chosen) return;
    intent.current.pending = null;
    setPinState({ status: "idle", message: null });
    setChosen(value);
    /* Picking is taking: the Workflow's current version, at once. */
    publishAndPin(value);
  };

  /* The Workflows as the Agents page files them — its folders, its order,
     each with the Workflow mark — in the panel's explorer Select, the one the
     chat's Agent picker and Skill Read use. Typing searches them flat. */
  const options = [
    ...(chosen && library.status === "ready" && !listed ? [{ value: chosen, label: t("agents.workflow.not_listed", { workflow: safe_text(chosen) }), icon: "workflow", pinned: true }] : []),
    /* A Workflow does not call itself: that run would never end. */
    ...library.rows.filter((row) => row.id !== (document && document.id) || row.id === chosen)
      .map((row) => ({ value: row.id, label: safe_text(row.name || row.id), icon: "workflow", resourceId: row.id })),
  ];
  const optionsKey = options.map((option) => option.value + "\u0001" + option.label).join("\u0000");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tree = useMemo(() => buildAgentPickerTree({ choices: options }), [optionsKey]);
  /* The Select owns the tree's hover and visible rows (see Select's
     palette_tree): the pill follows the pointer onto folder rows too. */
  const renderTree = ({ highlighted_value, render_option, on_hover_row, on_visible_change }) => (
    <CommandTree data={tree.data} root={tree.root} activeNodeId={highlighted_value ?? null}
      onHover={on_hover_row} onVisibleChange={on_visible_change} defaultExpanded={false} isDark={isDark} bare width="100%"
      renderRow={({ node: row, depth }) => render_option(row.option, { depth })} />
  );
  const pin_here = pin && pin.workflow_id === chosen;
  const working = pinState.status === "working";
  const draft = useCalleeDraft(pin_here ? chosen : null);
  const stale = Boolean(version && draft && run_shape(draft) !== run_shape(version.document));

  const layout = call_input_layout(shape, node_bindings(node));
  /* A Start that reads the whole input reads every key the call passes
     (R-WFC-03, measured: an unlisted key arrives in the child), so then a
     stored key the Start does not name is an input like any other — editable
     — and the author can add more. Otherwise it is passed and ignored. */
  const whole = Boolean(shape && shape.readable && shape.whole);
  const passed = layout.extras
    .filter((extra) => !extra.duplicate && record(extra.binding) && typeof extra.binding.name === "string" && extra.binding.name)
    .map((extra) => extra.binding.name);
  const [added, setAdded] = useState([]);
  const [newName, setNewName] = useState("");
  const taken = new Set([...layout.rows.map((row) => row.name), ...passed, ...added]);
  /* A name added here is drawn as its own row only while NO stored row and
     no row of the pinned revision already has that name. Once it is written,
     or once a revision that reads it by name is pinned, the row that holds it
     is the one that draws it — never both (R-WFC-03b). The list itself is not
     pruned: a stored row and the document are never touched to avoid a
     duplicate; only what is drawn. */
  const owned_names = new Set([
    ...layout.rows.map((row) => row.name),
    ...node_bindings(node).filter((binding) => record(binding) && typeof binding.name === "string").map((binding) => binding.name),
  ]);
  const pending_added = whole ? added.filter((name) => !owned_names.has(name)) : [];
  const order = [...layout.rows.map((row) => row.name), ...(whole ? [...passed, ...pending_added] : [])];
  /* The store's own diagnostics for a stored row, by its position: every
     stored row is drawn below, so each lands on the row it is about (R-WFC-04). */
  const diagnostics_at = (index) => (Number.isSafeInteger(index) && index >= 0 && Array.isArray(rowDiagnostics) && Array.isArray(rowDiagnostics[index]) ? rowDiagnostics[index] : []);
  const Diagnostics = ({ index, testid }) => diagnostics_at(index).map((item, at) => (
    <span key={at} data-testid={`${testid}-diagnostic-${at}`} style={problemOf(isDark)}>{safe_text(item && item.message)}</span>
  ));
  const sources = binding_sources(document, node.id);
  const nodes_by_id = new Map(((document && document.nodes) || []).map((entry) => [entry && entry.id, entry]));
  const source_tag = (node_id) => (nodes_by_id.has(node_id) ? { node: nodes_by_id.get(node_id) } : null);
  const problems = workflow_call_problems(node, t);

  const NOTE = note(isDark);
  /* The small text actions, centred with what sits beside them. */
  const SMALL = { ...addButtonStyle(isDark), alignSelf: "auto" };

  return (
    <section data-testid="workflow-call-section" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!editable && (
        <div style={problemOf(isDark)}>
          {!unique ? t("agents.execution.read_only.duplicate_ids") : t("agents.execution.read_only.stored")}
        </div>
      )}

      <div data-testid="workflow-call-target">
      <Block section="workflow-call-workflow" title={t("agents.workflow.workflow")} isDark={isDark}
        help={<span data-testid="workflow-call-failure">
          {t("agents.workflow.failure")} {t("agents.workflow.pinned_contract")}
        </span>}>
        <div style={{ ...ROW, minWidth: 0 }}>
          {/* The Agent panel's Model picker's measure (pickerSelectProps). */}
          <span data-testid="workflow-call-picker" style={pickerSlotStyle}>
            <Select
              options={options}
              value={chosen || null}
              set_value={choose}
              filterable
              palette_tree={renderTree}
              placeholder={library.status === "loading" ? t("agents.workflow.reading_library") : t("agents.workflow.choose")}
              disabled={!editable || library.status !== "ready"}
              dropdown_style={{ maxHeight: "min(280px, 40vh)" }}
              {...pickerSelectProps}
            />
          </span>
          {/* Into the called Workflow, as a referenced subagent opens: its own
              draft, saved as itself, with the breadcrumb back. */}
          {chosen && typeof onOpenWorkflow === "function" && (
            <Button
              label={t("agents.workflow.edit")}
              ariaLabel={t("agents.workflow.edit_label", { name: safe_text(workflow_name) })}
              onClick={() => onOpenWorkflow({ node_id: node.id, workflow_id: chosen })}
              style={{ ...SMALL, flexShrink: 0 }}
            />
          )}
        </div>
        {/* Which version it runs, in one line: the version it took, or that
            the Workflow has changed since and can be taken again. */}
        {working && <span data-testid="workflow-call-pin-state" style={NOTE}>{t("agents.workflow.locking")}</span>}
        {!working && pin_here && version && (
          <div data-testid="workflow-call-pinned" style={{ ...ROW, minHeight: 22 }}>
            <span style={{ ...NOTE, flex: 1, minWidth: 0 }}>
              {stale
                ? t("agents.workflow.changed_since", { name: safe_text(workflow_name), ordinal: version.ordinal })
                : t("agents.workflow.uses_version", { ordinal: version.ordinal })}
            </span>
            {stale && editable && (
              <Button label={t("agents.workflow.update")} ariaLabel={t("agents.workflow.update_label", { name: safe_text(workflow_name) })}
                onClick={() => publishAndPin(chosen)} style={{ ...SMALL, flexShrink: 0, color: "var(--pupu-text)" }} />
            )}
          </div>
        )}
        {!working && pin && !version && (
          <span data-testid="workflow-call-pinned" style={{ ...ROW, ...NOTE }}>
            {state && state.status === "loading"
              ? t("agents.workflow.reading_pin", { id: safe_text(pin.revision_id) })
              : <>{t("agents.workflow.pinned_id", { id: `${safe_text(pin.workflow_id)} · ${safe_text(pin.revision_id)}` })}
                {state && (state.status === "refused" || state.status === "unavailable") && (
                  <Button label={t("agents.workflow.read_again")} onClick={() => request_workflow_version(pin.workflow_id, pin.revision_id)} style={SMALL} />
                )}</>}
          </span>
        )}
        {!working && chosen && editable && !pin_here && pinState.status !== "refused" && (
          <Button label={t("agents.workflow.update")} ariaLabel={t("agents.workflow.update_label", { name: safe_text(workflow_name) })}
            onClick={() => publishAndPin(chosen)} style={SMALL} />
        )}
        {pinState.status === "refused" && pinState.message && (
          <span data-testid="workflow-call-pin-state" style={{ ...ROW, ...problemOf(isDark) }}>
            <span style={{ flex: 1, minWidth: 0 }}>{renderAgentMessage(pinState.message, t)}</span>
            {editable && chosen && <Button label={t("agents.explorer.try_again")} onClick={() => publishAndPin(chosen)} style={{ ...SMALL, flexShrink: 0 }} />}
          </span>
        )}
        {library.status === "error" && (
          <span data-testid="workflow-call-library-error" style={problemOf(isDark)}>
            {t("agents.workflow.library_failed", { message: renderAgentMessage(refusal_text(library.error, agentMessage("agents.workflow.store_refused")), t) })}{" "}
            <Button label={t("agents.explorer.try_again")} onClick={reloadLibrary} style={{ fontSize: 11.5, paddingVertical: 1, paddingHorizontal: 6 }} />
          </span>
        )}
        {library.status === "ready" && library.rows.length === 0 && (
          <span style={NOTE}>{t("agents.workflow.no_workflows")}</span>
        )}
        {record(stored) && !pin && (
          <span data-testid="workflow-call-stored-invalid" style={problemOf(isDark)}>
            {t("agents.workflow.stored", { value: "\uE000" }).split("\uE000").map((part, index) => <React.Fragment key={index}>{index > 0 && <span style={MONO}>{safe_text(JSON.stringify(stored))}</span>}{part}</React.Fragment>)}
          </span>
        )}
      </Block>
      </div>

      <div data-testid="workflow-call-inputs">
      <Block section="workflow-call-inputs" title={t("agents.workflow.inputs")} isDark={isDark}>
        {!pin && <span style={NOTE}>{t("agents.workflow.pin_for_inputs")}</span>}
        {pin && !version && <span style={NOTE}>{t("agents.workflow.inputs_loading")}</span>}
        {shape && !shape.readable && (
          <span style={problemOf(isDark)}>{t("agents.workflow.unreadable_interface")}</span>
        )}
        {shape && shape.readable && shape.inputs.length === 0 && !shape.whole && (
          <span style={NOTE}>{t(shape.declared ? "agents.parameters.none" : "agents.workflow.reads_nothing", { name: safe_text(workflow_name) })}</span>
        )}
        {shape && shape.whole && (
          <span data-testid="workflow-call-whole-input" style={NOTE}>
            {t("agents.workflow.whole_input")}
          </span>
        )}
        {(() => {
          const listed = shape ? layout.rows.map((row) => ({ row, parameter: shape.inputs.find((entry) => entry.key === row.name) })) : [];
          const keyed = [
            ...layout.extras.map((extra) => ({ ...extra, pending: false })),
            ...pending_added.map((name) => ({ binding: null, index: -1, duplicate: false, pending: true, name })),
          ].map((extra) => ({ ...extra, name: extra.pending ? extra.name : record(extra.binding) && typeof extra.binding.name === "string" ? extra.binding.name : "" }));
          const named = keyed.filter((extra) => extra.pending || (whole && !extra.duplicate && extra.name));
          const others = keyed.filter((extra) => !(extra.pending || (whole && !extra.duplicate && extra.name)));
          const template = typed_input_template([...listed.map(({ row }) => row.name), ...named.map((extra) => extra.name)]);
          const table = [...listed, ...named];
          return (
            <Region isDark={isDark}>
              {table.length > 0 && <TableHeads key="heads" testid="workflow-call-input-heads" isDark={isDark} template={template}
                columns={[{ label: t("agents.parameters.name_short") }, { label: t("agents.parameters.type") },
                  { label: t("agents.execution.tool.value_mode"), inset: TABLE_CONTROL_INSET }]} />}
              {listed.map(({ row, parameter }) => (
                <TypedInputRow key={row.name} testid={`workflow-call-input-${row.name}`} template={template}
                  name={row.name} type={parameter.type || null} required={parameter.required !== false}
                  hasDefault={Object.prototype.hasOwnProperty.call(parameter, "default")} defaultValue={parameter.default}
                  description={parameter.description || (shape.declared ? "" : t("agents.workflow.read_as", { names: row.read_as.map((name) => safe_text(name)).join(t("agents.schema.fields.list_separator")) }))}
                  binding={row.binding} sources={sources} sourceTag={source_tag} editable={editable} isDark={isDark}
                  onSet={(binding) => commit(with_call_input(document, node.id, row.name, binding, order))}>
                  <Diagnostics index={row.binding ? row.index : -1} testid={`workflow-call-input-${row.name}`} />
                </TypedInputRow>
              ))}
              {/* One list, one key per input name: a key added here and then
                  written for the first time stays the same row — the same
                  cell, focus and caret — when it moves from "added" to
                  "stored" (R-WFC-03a). */}
              {named.map(({ binding, index, pending, name }) => (
                <div key={`named-${name}`} data-testid={pending ? `workflow-call-added-${name}` : `workflow-call-extra-${index}`} style={{ minWidth: 0 }}>
                <TypedInputRow testid={`workflow-call-input-${name}`} template={template}
                  name={name} type={null} required={false} hasDefault={false} description={t("agents.workflow.whole_key")}
                  binding={binding} sources={sources} sourceTag={source_tag} editable={editable} isDark={isDark}
                  onSet={(next) => {
                    if (next === null) {
                      setAdded(added.filter((item) => item !== name));
                      if (!pending) commit(remove_call_input(document, node.id, index));
                    } else {
                      commit(with_call_input(document, node.id, name, next, order));
                    }
                  }}>
                  <Diagnostics index={index} testid={`workflow-call-extra-${index}`} />
                </TypedInputRow>
                </div>
              ))}
              {others.map(({ binding, index, duplicate, name }) => (
                <div key={`extra-${index}`} data-testid={`workflow-call-extra-${index}`} style={{ display: "flex", flexDirection: "column", gap: 2, padding: ROW_PAD, minWidth: 0 }}>
                  <div style={{ ...ROW, justifyContent: "space-between", flexWrap: "wrap" }}>
                    <span style={{ ...(shape || duplicate ? problemOf(isDark) : NOTE), flex: "1 1 160px", minWidth: 0, overflowWrap: "anywhere" }}>
                      {(duplicate ? t("agents.workflow.duplicate_input", { name: "\uE000", value: "\uE001" })
                        : shape ? t(shape.declared ? "agents.parameters.unknown_argument" : "agents.workflow.ignored_input", { name: "\uE000", value: "\uE001" })
                          : t("agents.workflow.stored_input", { name: "\uE000", value: "\uE001" }))
                        .split(/(\uE000|\uE001)/).map((part, at) => part === "\uE000"
                          ? <span key={at} style={MONO}>{safe_text(name) || t("agents.workflow.unnamed")}</span>
                          : part === "\uE001" ? record(binding) && binding.value
                            ? <React.Fragment key={at}> · <span style={MONO}>{safe_text(expression_summary(binding.value, t))}</span></React.Fragment> : null : part)}
                    </span>
                    <Button
                      label={t("agents.workflow.remove")}
                      ariaLabel={t("agents.workflow.remove_input", { name })}
                      disabled={!editable}
                      onClick={() => commit(remove_call_input(document, node.id, index))}
                      style={{ ...SMALL, flexShrink: 0 }}
                    />
                  </div>
                  <Diagnostics index={index} testid={`workflow-call-extra-${index}`} />
                </div>
              ))}
            </Region>
          );
        })()}
        {whole && editable && (
          <div style={ROW}>
            <Input value={newName} placeholder={t("agents.workflow.input_placeholder")} set_value={setNewName} style={{ ...FIELD, ...MONO }} />
            <Button
              label={t("agents.workflow.add_input")}
              disabled={!newName.trim() || taken.has(newName.trim())}
              onClick={() => {
                setAdded([...added, newName.trim()]);
                setNewName("");
              }}
              style={SMALL}
            />
          </div>
        )}
      </Block>
      </div>

      {shape && shape.readable && (
        <span data-testid="workflow-call-exports" style={NOTE}>
          {shape.outputs.length === 0
            ? t("agents.workflow.no_exports", { name: safe_text(workflow_name) })
            : <>{t("agents.workflow.exports", { names: "\uE000" }).split("\uE000").map((part, index) => <React.Fragment key={index}>{index > 0 && <span style={MONO}>{shape.outputs.map((name) => safe_text(name)).join(t("agents.schema.fields.list_separator"))}</span>}{part}</React.Fragment>)}</>}
        </span>
      )}



      {problems.length > 0 && (
        <div data-testid="workflow-call-problems" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {problems.map((problem, index) => (
            <span key={`${problem.code}-${index}`} style={problemOf(isDark)}>{problem.message}</span>
          ))}
        </div>
      )}
    </section>
  );
}
