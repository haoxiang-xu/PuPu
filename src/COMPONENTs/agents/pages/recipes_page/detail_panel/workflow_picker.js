import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import Select from "./panel_select";
import { subscribeSkeletonLibraryRefresh } from "../../../../../SERVICEs/skeleton_library_refresh";
import { buildAgentPickerTree } from "../../../../../SERVICEs/agent_picker_tree";
import CommandTree from "../../../../chat-input/components/command_tree";
import { safe_text } from "../document_values";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { agentError, agentMessage, renderAgentMessage } from "../agents_i18n";
import { is_unavailable, list_resources, load_resource, publish_workflow } from "../skeleton_resources";
import {
  remember_workflow_version,
  request_workflow_version,
  useWorkflowVersions,
  workflow_version_state,
} from "../workflow_versions";
import { addButtonStyle, note, pickerSelectProps, pickerSlotStyle, problem as problemOf } from "./panel_style";

/* Which Workflow something runs, as one control (#357, #484): the Workflows
 * as the Agents page files them in the panel's explorer Select; picking one
 * takes its current version at once (its draft is published — an unchanged
 * draft answers with the version it already has) and pins that revision; one
 * line says which version is used, or that the Workflow has changed since,
 * with Update; Edit opens it. A Workflow Call and a Hook use it.
 *
 * A pin answers later than the click that asked for it: only the request the
 * author is still waiting for may write (`onPin`, against the caller's
 * document as it is THEN), and a newer request or unmounting revokes it.
 *
 * `extraOptions` are choices of the caller's own (a Hook's "Its own
 * Workflow"), offered first; while one is chosen (`extraValue`) the caller
 * draws the status line (`extraStatus`) and an action beside the picker. */

const MONO = { fontFamily: "ui-monospace, Menlo, monospace" };
const ROW = { display: "flex", alignItems: "center", gap: 6 };
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
export function useWorkflowLibrary() {
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
export const run_shape = (document) => stable(RUN_FIELDS.map((key) => (record(document) ? document[key] : undefined)));

/* The called Workflow's draft as the store has it now, re-read whenever the
   library says something changed (a save of that Workflow included). */
export function useCalleeDraft(workflow_id) {
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

export default function WorkflowPicker({ pin, stored, editable, isDark, testid, selfId, onPin, onOpen,
  extraOptions = [], extraValue = null, onExtra, extraStatus = null, extraAction = null }) {
  const { t } = useTranslation();
  const [library, reloadLibrary] = useWorkflowLibrary();
  useWorkflowVersions(pin ? [pin] : []);
  const state = pin ? workflow_version_state(pin.workflow_id, pin.revision_id) : null;
  const version = state && state.status === "ready" ? state.version : null;
  /* Which Workflow the revision controls are about. It starts as the pinned
     one and changes only by the author's choice; choosing writes nothing — a
     reference is only ever a pinned revision. */
  const [chosen, setChosen] = useState(pin ? pin.workflow_id : record(stored) && typeof stored.workflow_id === "string" ? stored.workflow_id : "");
  /* A pin set from outside this control (an undo, another editor) is the
     Workflow it is about. */
  useEffect(() => {
    if (pin && pin.workflow_id !== chosen) setChosen(pin.workflow_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin && pin.workflow_id]);
  const listed = library.rows.find((row) => row.id === chosen) || null;
  const workflow_name = (version && version.document && typeof version.document.name === "string" && version.document.name)
    || (listed && listed.name) || chosen || t("agents.workflow.the_workflow");

  /* A pin answers later than the click that asked for it. Like the Code
     panel's profile registration (R-357-01), only the request the author is
     still waiting for may write, it writes against the document as it is
     THEN, and changing the Workflow, a newer request or unmounting revokes it. */
  const latest = useRef({ onPin });
  latest.current = { onPin };
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
    latest.current.onPin(workflow_id, revision);
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
    if (extraOptions.some((option) => option.value === value)) {
      intent.current.pending = null;
      setPinState({ status: "idle", message: null });
      onExtra(value);
      return;
    }
    if (typeof value !== "string" || (value === chosen && !extraValue)) return;
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
    ...extraOptions,
    ...(chosen && library.status === "ready" && !listed ? [{ value: chosen, label: t("agents.workflow.not_listed", { workflow: safe_text(chosen) }), icon: "workflow", pinned: true }] : []),
    /* A Workflow does not call itself: that run would never end. */
    ...library.rows.filter((row) => row.id !== selfId || row.id === chosen)
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

  const NOTE = note(isDark);
  const SMALL = { ...addButtonStyle(isDark), alignSelf: "auto" };
  return (
    <>
        <div style={{ ...ROW, minWidth: 0 }}>
          {/* The Agent panel's Model picker's measure (pickerSelectProps). */}
          <span data-testid={`${testid}-picker`} style={pickerSlotStyle}>
            <Select
              options={options}
              value={extraValue || chosen || null}
              set_value={choose}
              filterable
              palette_tree={renderTree}
              placeholder={library.status === "loading" ? t("agents.workflow.reading_library") : t("agents.workflow.choose")}
              disabled={!editable || library.status !== "ready"}
              dropdown_style={{ maxHeight: "min(280px, 40vh)" }}
              {...pickerSelectProps}
            />
          </span>
          {extraAction}
          {/* Into the called Workflow, as a referenced subagent opens: its own
              draft, saved as itself, with the breadcrumb back. */}
          {!extraValue && chosen && typeof onOpen === "function" && (
            <Button
              label={t("agents.workflow.edit")}
              ariaLabel={t("agents.workflow.edit_label", { name: safe_text(workflow_name) })}
              onClick={() => onOpen(chosen)}
              style={{ ...SMALL, flexShrink: 0 }}
            />
          )}
        </div>
        {/* Which version it runs, in one line: the version it took, or that
            the Workflow has changed since and can be taken again. */}
        {extraValue ? extraStatus : <>
        {working && <span data-testid={`${testid}-pin-state`} style={NOTE}>{t("agents.workflow.locking")}</span>}
        {!working && pin_here && version && (
          <div data-testid={`${testid}-pinned`} style={{ ...ROW, minHeight: 22 }}>
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
          <span data-testid={`${testid}-pinned`} style={{ ...ROW, ...NOTE }}>
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
          <span data-testid={`${testid}-pin-state`} style={{ ...ROW, ...problemOf(isDark) }}>
            <span style={{ flex: 1, minWidth: 0 }}>{renderAgentMessage(pinState.message, t)}</span>
            {editable && chosen && <Button label={t("agents.explorer.try_again")} onClick={() => publishAndPin(chosen)} style={{ ...SMALL, flexShrink: 0 }} />}
          </span>
        )}
        {library.status === "error" && (
          <span data-testid={`${testid}-library-error`} style={problemOf(isDark)}>
            {t("agents.workflow.library_failed", { message: renderAgentMessage(refusal_text(library.error, agentMessage("agents.workflow.store_refused")), t) })}{" "}
            <Button label={t("agents.explorer.try_again")} onClick={reloadLibrary} style={{ fontSize: 11.5, paddingVertical: 1, paddingHorizontal: 6 }} />
          </span>
        )}
        {library.status === "ready" && library.rows.length === 0 && (
          <span style={NOTE}>{t("agents.workflow.no_workflows")}</span>
        )}
        {record(stored) && !pin && (
          <span data-testid={`${testid}-stored-invalid`} style={problemOf(isDark)}>
            {t("agents.workflow.stored", { value: "\uE000" }).split("\uE000").map((part, index) => <React.Fragment key={index}>{index > 0 && <span style={MONO}>{safe_text(JSON.stringify(stored))}</span>}{part}</React.Fragment>)}
          </span>
        )}
        </>}
    </>
  );
}
