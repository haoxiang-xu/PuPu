import React, { useCallback, useEffect, useRef, useState } from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import Input from "../../../../../BUILTIN_COMPONENTs/input/input";
import Select from "../../../../../BUILTIN_COMPONENTs/select/select";
import { subscribeSkeletonLibraryRefresh } from "../../../../../SERVICEs/skeleton_library_refresh";
import { ArgumentRow } from "./tool_call_section";
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

const LABEL = { fontSize: 11, fontWeight: 600, color: "var(--pupu-text-muted)", textTransform: "uppercase", letterSpacing: 0.4 };
const NOTE = { fontSize: 10.5, color: "var(--pupu-text-muted)", lineHeight: 1.45 };
const MONO = { fontFamily: "ui-monospace, Menlo, monospace" };
const ROW = { display: "flex", alignItems: "center", gap: 6 };
const FIELD = { width: "100%", fontSize: 11.5, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 5 };
const SMALL = { fontSize: 10.5, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 5 };
const problem_style = (isDark) => ({
  fontSize: 10.5,
  lineHeight: 1.45,
  color: isDark ? "rgba(255,140,140,0.95)" : "rgba(176,32,32,0.95)",
});
const PUBLISHING = agentMessage("agents.workflow.publishing");
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function Divider({ isDark }) {
  return <div style={{ height: 1, margin: "2px 0", background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)" }} />;
}

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

export default function WorkflowCallSection({ document, node, rowDiagnostics, isDark, onChange, onOpenPinned }) {
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
  const [typedRevision, setTypedRevision] = useState("");
  /* Opening the pinned graph is the page's: it reads the revision and decides,
     when the answer comes, whether it is still about this node's pin. This
     only says that a read is under way. */
  const [opening, setOpening] = useState(false);
  const openPinned = async () => {
    if (!pin || typeof onOpenPinned !== "function") return;
    setOpening(true);
    try {
      await onOpenPinned({ node_id: node.id, workflow_id: pin.workflow_id, revision_id: pin.revision_id });
    } finally {
      if (intent.current.mounted) setOpening(false);
    }
  };

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
  const publishAndPin = async () => {
    const workflow_id = chosen;
    const ticket = begin(PUBLISHING);
    const opened = await load_resource(workflow_id);
    if (intent.current.pending !== ticket) return;
    if (!opened.ok) {
      settle(ticket, workflow_id, null);
      if (intent.current.mounted) setPinState({ status: "refused", message: agentMessage("agents.workflow.read_failed", { message: refusal_text(opened, agentMessage("agents.workflow.store_refused")) }) });
      return;
    }
    const published = await publish_workflow(workflow_id, opened.data.edit_token);
    if (published.ok) remember_workflow_version(published.data);
    if (!settle(ticket, workflow_id, published.ok ? published.data : null)) return;
    if (!intent.current.mounted) return;
    setPinState(published.ok
      ? { status: "done", message: agentMessage("agents.workflow.pinned_ordinal", { ordinal: published.data.ordinal }) }
      : { status: "refused", message: agentMessage("agents.workflow.pin_failed", { message: refusal_text(published, agentMessage("agents.workflow.publication_refused")) }) });
  };
  const pinTyped = async () => {
    const workflow_id = chosen;
    const revision_id = typedRevision.trim();
    if (!revision_id) return;
    const ticket = begin(agentMessage("agents.workflow.reading_revision"));
    const answer = await request_workflow_version(workflow_id, revision_id);
    const ok = answer && answer.status === "ready";
    if (!settle(ticket, workflow_id, ok ? answer.version : null)) return;
    if (!intent.current.mounted) return;
    if (ok) {
      setTypedRevision("");
      setPinState({ status: "done", message: agentMessage("agents.workflow.pinned_ordinal", { ordinal: answer.version.ordinal }) });
    } else {
      const missing = answer && answer.error && answer.error.code === "resource_missing";
      setPinState({ status: "refused", message: missing ? agentMessage("agents.workflow.revision_absent", { workflow: safe_text(workflow_id), revision: safe_text(revision_id) }) : agentMessage("agents.workflow.pin_failed", { message: refusal_text(answer, agentMessage("agents.workflow.store_refused")) }) });
    }
  };
  const choose = (value) => {
    if (typeof value !== "string" || value === chosen) return;
    intent.current.pending = null;
    setPinState({ status: "idle", message: null });
    setTypedRevision("");
    setChosen(value);
  };

  const options = [
    ...(chosen && library.status === "ready" && !listed ? [{ value: chosen, label: t("agents.workflow.not_listed", { workflow: safe_text(chosen) }) }] : []),
    ...library.rows.map((row) => {
      const count = Number.isSafeInteger(row.published_revisions) ? row.published_revisions : 0;
      return { value: row.id, label: count === 0 ? t("agents.workflow.unpublished", { name: safe_text(row.name || row.id) }) : t("agents.workflow.published", { name: safe_text(row.name || row.id), count }) };
    }),
  ];
  const chosen_count = listed && Number.isSafeInteger(listed.published_revisions) ? listed.published_revisions : null;
  const pin_here = pin && pin.workflow_id === chosen;
  const working = pinState.status === "working";

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
    <span key={at} data-testid={`${testid}-diagnostic-${at}`} style={problem_style(isDark)}>{safe_text(item && item.message)}</span>
  ));
  const sources = binding_sources(document, node.id);
  const problems = workflow_call_problems(node, t);

  return (
    <section data-testid="workflow-call-section" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {!editable && (
        <div style={problem_style(isDark)}>
          {!unique ? t("agents.execution.read_only.duplicate_ids") : t("agents.execution.read_only.stored")}
        </div>
      )}

      <div data-testid="workflow-call-target" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={LABEL}>{t("agents.workflow.workflow")}</span>
        <span data-testid="workflow-call-picker">
          <Select
            options={options}
            value={chosen || null}
            set_value={choose}
            filterable={false}
            placeholder={library.status === "loading" ? t("agents.workflow.reading_library") : t("agents.workflow.choose")}
            disabled={!editable || library.status !== "ready"}
            style={FIELD}
          />
        </span>
        {library.status === "error" && (
          <span data-testid="workflow-call-library-error" style={problem_style(isDark)}>
            {t("agents.workflow.library_failed", { message: renderAgentMessage(refusal_text(library.error, agentMessage("agents.workflow.store_refused")), t) })}{" "}
            <Button label={t("agents.explorer.try_again")} onClick={reloadLibrary} style={{ fontSize: 10.5, paddingVertical: 1, paddingHorizontal: 6 }} />
          </span>
        )}
        {library.status === "ready" && library.rows.length === 0 && (
          <span style={NOTE}>{t("agents.workflow.no_workflows")}</span>
        )}
        {record(stored) && !pin && (
          <span data-testid="workflow-call-stored-invalid" style={problem_style(isDark)}>
            {t("agents.workflow.stored", { value: "\uE000" }).split("\uE000").map((part, index) => <React.Fragment key={index}>{index > 0 && <span style={MONO}>{safe_text(JSON.stringify(stored))}</span>}{part}</React.Fragment>)}
          </span>
        )}
      </div>

      <div data-testid="workflow-call-revision" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={LABEL}>{t("agents.workflow.revision")}</span>
        {pin && (
          <span data-testid="workflow-call-pinned" style={NOTE}>
            {version
              ? <>{t("agents.workflow.pinned", { ordinal: "\uE000", name: "\uE001", id: "\uE002" }).split(/(\uE000|\uE001|\uE002)/).map((part, index) => part === "\uE000"
                ? <b key={index}>{version.ordinal}</b> : part === "\uE001" ? <b key={index}>{safe_text(workflow_name)}</b>
                  : part === "\uE002" ? <span key={index} style={MONO}>{safe_text(pin.revision_id)}</span> : part)}</>
              : state && state.status === "loading"
                ? <>{t("agents.workflow.reading_pin", { id: "\uE000" }).split("\uE000").map((part, index) => <React.Fragment key={index}>{index > 0 && <span style={MONO}>{safe_text(pin.revision_id)}</span>}{part}</React.Fragment>)}</>
                : <>{t("agents.workflow.pinned_id", { id: "\uE000" }).split("\uE000").map((part, index) => <React.Fragment key={index}>{index > 0 && <span style={MONO}>{safe_text(pin.workflow_id)} · {safe_text(pin.revision_id)}</span>}{part}</React.Fragment>)}</>}
          </span>
        )}
        {pin && state && (state.status === "refused" || state.status === "unavailable") && (
          <span style={ROW}>
            <Button label={t("agents.workflow.read_again")} onClick={() => request_workflow_version(pin.workflow_id, pin.revision_id)} style={SMALL} />
          </span>
        )}
        {/* Offered whatever this node's own settings allow: looking at the
            pinned graph writes nothing. */}
        {pin && typeof onOpenPinned === "function" && (
          <span style={ROW}>
            <Button
              label={opening ? t("agents.workflow.opening") : t("agents.workflow.open_pinned")}
              ariaLabel={t("agents.workflow.open_pinned")}
              onClick={openPinned}
              style={SMALL}
            />
          </span>
        )}
        {chosen && editable && (
          <>
            <div style={ROW}>
              <Button
                label={working && pinState.message === PUBLISHING ? t("agents.workflow.publishing") : pin_here ? t("agents.workflow.publish_again") : t("agents.workflow.publish")}
                disabled={working}
                onClick={publishAndPin}
                style={{ ...SMALL, color: "var(--pupu-accent)" }}
              />
            </div>
            <span style={NOTE}>
              {t("agents.workflow.publish_contract", { name: safe_text(listed ? listed.name || chosen : chosen) })}{chosen_count !== null ? t("agents.workflow.published_count", { count: chosen_count }) : ""}
            </span>
            <div style={ROW}>
              <Input
                value={typedRevision}
                placeholder={t("agents.workflow.revision_placeholder")}
                set_value={setTypedRevision}
                style={{ ...FIELD, ...MONO }}
              />
              <Button label={t("agents.workflow.pin")} ariaLabel={t("agents.workflow.pin_revision")} disabled={working || !typedRevision.trim()} onClick={pinTyped} style={SMALL} />
            </div>
            <span style={NOTE}>{t("agents.workflow.revision_explanation")}</span>
          </>
        )}
        {pinState.message && pinState.status !== "idle" && (
          <span data-testid="workflow-call-pin-state" style={pinState.status === "refused" ? problem_style(isDark) : NOTE}>{renderAgentMessage(pinState.message, t)}</span>
        )}
      </div>

      <Divider isDark={isDark} />

      <div data-testid="workflow-call-inputs" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={LABEL}>{t("agents.workflow.inputs")}</span>
        {!pin && <span style={NOTE}>{t("agents.workflow.pin_for_inputs")}</span>}
        {pin && !version && <span style={NOTE}>{t("agents.workflow.inputs_loading")}</span>}
        {shape && !shape.readable && (
          <span style={problem_style(isDark)}>{t("agents.workflow.unreadable_interface")}</span>
        )}
        {shape && shape.readable && shape.inputs.length === 0 && !shape.whole && (
          <span style={NOTE}>{t("agents.workflow.reads_nothing", { name: safe_text(workflow_name) })}</span>
        )}
        {shape && shape.whole && (
          <span data-testid="workflow-call-whole-input" style={NOTE}>
            {t("agents.workflow.whole_input")}
          </span>
        )}
        {shape && layout.rows.map((row) => (
          <div key={row.name} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <ArgumentRow
              row={{ name: row.name, required: true, type: null, description: t("agents.workflow.read_as", { names: row.read_as.map((name) => safe_text(name)).join(t("agents.schema.fields.list_separator")) }), binding: row.binding }}
              sources={sources}
              toolName={workflow_name}
              editable={editable}
              isDark={isDark}
              onSet={(binding) => commit(with_call_input(document, node.id, row.name, binding, order))}
            />
            <Diagnostics index={row.binding ? row.index : -1} testid={`workflow-call-input-${row.name}`} />
          </div>
        ))}
        {/* One list, one key per input name: a key added here and then
            written for the first time stays the same row — the same text box,
            focus and caret — when it moves from "added" to "stored"
            (R-WFC-03a). Stored rows keep their stored order; a name added
            here and not yet written comes after them, which is also where the
            first write puts it. */}
        {[
          ...layout.extras.map((extra) => ({ ...extra, pending: false })),
          ...pending_added.map((name) => ({ binding: null, index: -1, duplicate: false, pending: true, name })),
        ].map(({ binding, index, duplicate, pending, name: pending_name }) => {
          const name = pending ? pending_name : record(binding) && typeof binding.name === "string" ? binding.name : "";
          if (pending || (whole && !duplicate && name)) {
            return (
              <div key={`named-${name}`} data-testid={pending ? `workflow-call-added-${name}` : `workflow-call-extra-${index}`} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <ArgumentRow
                  row={{ name, required: false, type: null, description: t("agents.workflow.whole_key"), binding }}
                  sources={sources}
                  toolName={workflow_name}
                  editable={editable}
                  isDark={isDark}
                  onSet={(next) => {
                    if (next === null) {
                      setAdded(added.filter((item) => item !== name));
                      if (!pending) commit(remove_call_input(document, node.id, index));
                    } else {
                      commit(with_call_input(document, node.id, name, next, order));
                    }
                  }}
                />
                <Diagnostics index={index} testid={`workflow-call-extra-${index}`} />
              </div>
            );
          }
          return (
            <div key={`extra-${index}`} data-testid={`workflow-call-extra-${index}`} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <div style={{ ...ROW, justifyContent: "space-between" }}>
                <span style={shape || duplicate ? problem_style(isDark) : NOTE}>
                  {(duplicate ? t("agents.workflow.duplicate_input", { name: "\uE000", value: "\uE001" })
                    : shape ? t("agents.workflow.ignored_input", { name: "\uE000", value: "\uE001" })
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
                  style={{ fontSize: 10.5, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 5 }}
                />
              </div>
              <Diagnostics index={index} testid={`workflow-call-extra-${index}`} />
            </div>
          );
        })}
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
      </div>

      {shape && shape.readable && (
        <span data-testid="workflow-call-exports" style={NOTE}>
          {shape.outputs.length === 0
            ? t("agents.workflow.no_exports", { name: safe_text(workflow_name) })
            : <>{t("agents.workflow.exports", { names: "\uE000" }).split("\uE000").map((part, index) => <React.Fragment key={index}>{index > 0 && <span style={MONO}>{shape.outputs.map((name) => safe_text(name)).join(t("agents.schema.fields.list_separator"))}</span>}{part}</React.Fragment>)}</>}
        </span>
      )}

      <span data-testid="workflow-call-failure" style={NOTE}>
        {t("agents.workflow.failure")} {t("agents.workflow.pinned_contract")}
      </span>

      {problems.length > 0 && (
        <div data-testid="workflow-call-problems" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {problems.map((problem, index) => (
            <span key={`${problem.code}-${index}`} style={problem_style(isDark)}>{problem.message}</span>
          ))}
        </div>
      )}
    </section>
  );
}
