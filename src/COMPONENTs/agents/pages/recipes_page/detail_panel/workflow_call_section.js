import React, { useCallback, useEffect, useRef, useState } from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import Input from "../../../../../BUILTIN_COMPONENTs/input/input";
import Select from "../../../../../BUILTIN_COMPONENTs/select/select";
import { subscribeSkeletonLibraryRefresh } from "../../../../../SERVICEs/skeleton_library_refresh";
import { ArgumentRow } from "./tool_call_section";
import { binding_sources } from "./input_variables_section";
import { safe_text } from "../document_values";
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
  WORKFLOW_CALL_FAILURE_NOTE,
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

const LABEL = { fontSize: 11, fontWeight: 600, color: "#86868b", textTransform: "uppercase", letterSpacing: 0.4 };
const NOTE = { fontSize: 10.5, color: "#86868b", lineHeight: 1.45 };
const MONO = { fontFamily: "ui-monospace, Menlo, monospace" };
const ROW = { display: "flex", alignItems: "center", gap: 6 };
const FIELD = { width: "100%", fontSize: 11.5, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 5 };
const SMALL = { fontSize: 10.5, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 5 };
const problem_style = (isDark) => ({
  fontSize: 10.5,
  lineHeight: 1.45,
  color: isDark ? "rgba(255,140,140,0.95)" : "rgba(176,32,32,0.95)",
});
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function Divider({ isDark }) {
  return <div style={{ height: 1, margin: "2px 0", background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)" }} />;
}

function refusal_text(result, fallback) {
  if (is_unavailable(result)) return "The store could not be reached.";
  const error = result && result.error;
  return safe_text((error && (error.message || error.code)) || fallback);
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
      setState({ status: "error", rows: [], error: result.ok ? { error: { message: "The library answer was not a list." } } : result });
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
    || (listed && listed.name) || chosen || "the Workflow";

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
    const ticket = begin("Publishing…");
    const opened = await load_resource(workflow_id);
    if (intent.current.pending !== ticket) return;
    if (!opened.ok) {
      settle(ticket, workflow_id, null);
      if (intent.current.mounted) setPinState({ status: "refused", message: `The Workflow could not be read: ${refusal_text(opened, "the store refused")}.` });
      return;
    }
    const published = await publish_workflow(workflow_id, opened.data.edit_token);
    if (published.ok) remember_workflow_version(published.data);
    if (!settle(ticket, workflow_id, published.ok ? published.data : null)) return;
    if (!intent.current.mounted) return;
    setPinState(published.ok
      ? { status: "done", message: `Pinned revision ${published.data.ordinal}.` }
      : { status: "refused", message: `Nothing was pinned: ${refusal_text(published, "the store refused the publication")}.` });
  };
  const pinTyped = async () => {
    const workflow_id = chosen;
    const revision_id = typedRevision.trim();
    if (!revision_id) return;
    const ticket = begin("Reading that revision…");
    const answer = await request_workflow_version(workflow_id, revision_id);
    const ok = answer && answer.status === "ready";
    if (!settle(ticket, workflow_id, ok ? answer.version : null)) return;
    if (!intent.current.mounted) return;
    if (ok) {
      setTypedRevision("");
      setPinState({ status: "done", message: `Pinned revision ${answer.version.ordinal}.` });
    } else {
      const missing = answer && answer.error && answer.error.code === "resource_missing";
      setPinState({ status: "refused", message: missing ? `“${safe_text(workflow_id)}” has no published revision “${safe_text(revision_id)}”. Nothing was pinned.` : `Nothing was pinned: ${refusal_text(answer, "the store refused")}.` });
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
    ...(chosen && library.status === "ready" && !listed ? [{ value: chosen, label: `${safe_text(chosen)} (not in the library now)` }] : []),
    ...library.rows.map((row) => {
      const count = Number.isSafeInteger(row.published_revisions) ? row.published_revisions : 0;
      return { value: row.id, label: `${safe_text(row.name || row.id)} · ${count === 0 ? "never published" : `${count} published`}` };
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
  const problems = workflow_call_problems(node);

  return (
    <section data-testid="workflow-call-section" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {!editable && (
        <div style={problem_style(isDark)}>
          {!unique ? "Duplicate node ids prevent editing this step." : "These stored settings are read-only here."}
        </div>
      )}

      <div data-testid="workflow-call-target" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={LABEL}>Workflow</span>
        <span data-testid="workflow-call-picker">
          <Select
            options={options}
            value={chosen || null}
            set_value={choose}
            filterable={false}
            placeholder={library.status === "loading" ? "reading the library…" : "choose a Workflow"}
            disabled={!editable || library.status !== "ready"}
            style={FIELD}
          />
        </span>
        {library.status === "error" && (
          <span data-testid="workflow-call-library-error" style={problem_style(isDark)}>
            The library could not be read: {refusal_text(library.error, "the store refused")}.{" "}
            <Button label="Try again" onClick={reloadLibrary} style={{ fontSize: 10.5, paddingVertical: 1, paddingHorizontal: 6 }} />
          </span>
        )}
        {library.status === "ready" && library.rows.length === 0 && (
          <span style={NOTE}>There are no Workflows in the library. A Workflow Call runs a published revision of one.</span>
        )}
        {record(stored) && !pin && (
          <span data-testid="workflow-call-stored-invalid" style={problem_style(isDark)}>
            Stored: <span style={MONO}>{safe_text(JSON.stringify(stored))}</span>. Kept as it is until you pin a revision.
          </span>
        )}
      </div>

      <div data-testid="workflow-call-revision" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={LABEL}>Revision</span>
        {pin && (
          <span data-testid="workflow-call-pinned" style={NOTE}>
            {version
              ? <>Pinned: revision <b>{version.ordinal}</b> of <b>{safe_text(workflow_name)}</b> · <span style={MONO}>{safe_text(pin.revision_id)}</span></>
              : state && state.status === "loading"
                ? <>Reading <span style={MONO}>{safe_text(pin.revision_id)}</span>…</>
                : <>Pinned: <span style={MONO}>{safe_text(pin.workflow_id)} · {safe_text(pin.revision_id)}</span></>}
          </span>
        )}
        {pin && state && (state.status === "refused" || state.status === "unavailable") && (
          <span style={ROW}>
            <Button label="Read it again" onClick={() => request_workflow_version(pin.workflow_id, pin.revision_id)} style={SMALL} />
          </span>
        )}
        {/* Offered whatever this node's own settings allow: looking at the
            pinned graph writes nothing. */}
        {pin && typeof onOpenPinned === "function" && (
          <span style={ROW}>
            <Button
              label={opening ? "Opening…" : "Open the pinned graph (read-only)"}
              ariaLabel="Open the pinned graph (read-only)"
              onClick={openPinned}
              style={SMALL}
            />
          </span>
        )}
        {chosen && editable && (
          <>
            <div style={ROW}>
              <Button
                label={working && pinState.message === "Publishing…" ? "Publishing…" : pin_here ? "Publish its current draft and pin again" : "Publish its current draft and pin it"}
                disabled={working}
                onClick={publishAndPin}
                style={{ ...SMALL, color: "#4a5bd8" }}
              />
            </div>
            <span style={NOTE}>
              Publishing writes {safe_text(listed ? listed.name || chosen : chosen)}: it stores a new revision only if the draft changed since its last one, and pins the revision it answers with.{chosen_count !== null ? ` It has ${chosen_count} published.` : ""}
            </span>
            <div style={ROW}>
              <Input
                value={typedRevision}
                placeholder="or a revision id, e.g. rev-2-…"
                set_value={setTypedRevision}
                style={{ ...FIELD, ...MONO }}
              />
              <Button label="Pin" ariaLabel="Pin this revision" disabled={working || !typedRevision.trim()} onClick={pinTyped} style={SMALL} />
            </div>
            <span style={NOTE}>The host lists how many revisions a Workflow has, not their ids; a typed id is read back before it is pinned.</span>
          </>
        )}
        {pinState.message && pinState.status !== "idle" && (
          <span data-testid="workflow-call-pin-state" style={pinState.status === "refused" ? problem_style(isDark) : NOTE}>{pinState.message}</span>
        )}
      </div>

      <Divider isDark={isDark} />

      <div data-testid="workflow-call-inputs" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={LABEL}>Inputs</span>
        {!pin && <span style={NOTE}>Pin a revision; its Start decides which values this call passes.</span>}
        {pin && !version && <span style={NOTE}>The inputs are listed once the pinned revision has been read.</span>}
        {shape && !shape.readable && (
          <span style={problem_style(isDark)}>The pinned revision's Start and End are not a shape this editor can read, so its inputs are not listed.</span>
        )}
        {shape && shape.readable && shape.inputs.length === 0 && !shape.whole && (
          <span style={NOTE}>{safe_text(workflow_name)} reads nothing from its run input.</span>
        )}
        {shape && shape.whole && (
          <span data-testid="workflow-call-whole-input" style={NOTE}>
            Its Start also reads the whole input object, so every row below is passed in and read, including ones it does not name. Add any other key it should receive.
          </span>
        )}
        {shape && layout.rows.map((row) => (
          <div key={row.name} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <ArgumentRow
              row={{ name: row.name, required: true, type: null, description: `its Start reads it as ${row.read_as.map((name) => safe_text(name)).join(", ")}`, binding: row.binding }}
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
                  row={{ name, required: false, type: null, description: "its Start reads the whole input, so this key is passed in", binding }}
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
                  <span style={MONO}>{safe_text(name) || "(unnamed)"}</span>
                  {record(binding) && binding.value ? <> · <span style={MONO}>{safe_text(expression_summary(binding.value))}</span></> : null}
                  {duplicate
                    ? " is listed again: another row already passes it, and the store refuses a second one. Remove the one you do not mean."
                    : shape
                      ? " is not read by the pinned revision; the call passes it and the Workflow ignores it."
                      : " is stored for this call."}
                </span>
                <Button
                  label="Remove"
                  ariaLabel={`Remove stored input ${name}`}
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
            <Input value={newName} placeholder="another input name" set_value={setNewName} style={{ ...FIELD, ...MONO }} />
            <Button
              label="Add input"
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
            ? `${safe_text(workflow_name)}'s End exports nothing.`
            : <>It gives back <span style={MONO}>{shape.outputs.map((name) => safe_text(name)).join(", ")}</span>; pick them in the Output Variables below.</>}
        </span>
      )}

      <span data-testid="workflow-call-failure" style={NOTE}>
        {WORKFLOW_CALL_FAILURE_NOTE} The run uses exactly the pinned revision, whatever the Workflow's draft holds later.
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
