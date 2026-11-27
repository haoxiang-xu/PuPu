import React, { useRef, useState } from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import Input from "./panel_input";
import { binding_sources } from "./input_variables_section";
import { safe_text } from "../document_values";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { node_bindings } from "../skeleton_document";
import { expression_summary } from "../skeleton_io";
import { useWorkflowVersions, workflow_version_state } from "../workflow_versions";
import WorkflowPicker from "./workflow_picker";
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
import { addButtonStyle, note, problem as problemOf, Region } from "./panel_style";
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

const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export default function WorkflowCallSection({ document, node, rowDiagnostics, isDark, onChange, onOpenWorkflow }) {
  const { t } = useTranslation();
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

  const workflow_name = (version && version.document && typeof version.document.name === "string" && version.document.name)
    || (pin && pin.workflow_id) || t("agents.workflow.the_workflow");
  const latest = useRef({ document, editable, onChange });
  latest.current = { document, editable, onChange };

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
        <WorkflowPicker pin={pin} stored={stored} editable={editable} isDark={isDark} testid="workflow-call"
          selfId={document && document.id}
          onPin={(workflow_id, revision) => {
            const now = latest.current;
            if (now.editable) now.onChange(with_workflow_reference(now.document, node.id, { workflow_id, revision_id: revision.revision_id }));
          }}
          onOpen={typeof onOpenWorkflow === "function" ? (workflow_id) => onOpenWorkflow({ node_id: node.id, workflow_id }) : undefined} />
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
