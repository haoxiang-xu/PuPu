import React, { useCallback, useEffect, useRef, useState } from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import Input from "../../../../../BUILTIN_COMPONENTs/input/input";
import Select from "../../../../../BUILTIN_COMPONENTs/select/select";
import { subscribeSkeletonLibraryRefresh } from "../../../../../SERVICEs/skeleton_library_refresh";
import { safe_text } from "../document_values";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { agentError, agentMessage, renderAgentMessage } from "../agents_i18n";
import { is_unavailable, list_resources, load_resource, publish_workflow } from "../skeleton_resources";
import { remember_workflow_version, request_workflow_version, useWorkflowVersions, workflow_version_state } from "../workflow_versions";

/* Choosing and pinning one published Workflow revision (#357 Hooks Pool).
 *
 * The same rules the accepted Workflow Call section follows (workflow-call-01,
 * frozen a0ed1551), as one control a Hook entry uses:
 *
 *   - choosing a Workflow writes nothing; a reference is only ever a pinned
 *     revision, so the author pins one explicitly — by publishing that
 *     Workflow's current draft (the host answers an unchanged draft with the
 *     revision it already has) or by an id that is read back first;
 *   - every revision answer goes through the v2 reads, whose adapter refuses
 *     an answer about another Workflow or revision (R-WFC-05), and one read
 *     per revision is in flight at a time (R-WFC-01);
 *   - an answer pins only for the request the author is still waiting for:
 *     changing the Workflow, a newer request or unmounting revokes it, and
 *     `onPin` is called with the parent's CURRENT document, not the one the
 *     click closed over.
 *
 * There is no "latest": the host lists how many revisions a Workflow has, not
 * which, and the run resolves exactly the pinned one. */

const LABEL = { fontSize: 11, fontWeight: 600, color: "#86868b", textTransform: "uppercase", letterSpacing: 0.4 };
const NOTE = { fontSize: 10.5, color: "#86868b", lineHeight: 1.45 };
const MONO = { fontFamily: "ui-monospace, Menlo, monospace" };
const ROW = { display: "flex", alignItems: "center", gap: 6 };
const FIELD = { width: "100%", fontSize: 11.5, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 5 };
const SMALL = { fontSize: 10.5, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 5 };
const problem_style = (isDark) => ({ fontSize: 10.5, lineHeight: 1.45, color: isDark ? "rgba(255,140,140,0.95)" : "rgba(176,32,32,0.95)" });
const PUBLISHING = agentMessage("agents.workflow.publishing");
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function refusal_text(result, fallback) {
  if (is_unavailable(result)) return agentMessage("agents.workflow.store_unreachable");
  const error = result && result.error;
  if (error && renderAgentMessage(error, agentMessage) !== error) return renderAgentMessage(error, agentMessage);
  return error && (error.message || error.code) ? safe_text(error.message || error.code) : fallback;
}

/* The Workflows the store lists, archived ones left out of the request. */
export function useWorkflowLibrary() {
  const [state, setState] = useState({ status: "loading", rows: [], error: null });
  const ticket = useRef(0);
  const read = useCallback(async () => {
    const mine = ++ticket.current;
    const result = await list_resources(false);
    if (mine !== ticket.current) return;
    const rows = result.ok && Array.isArray(result.data)
      ? result.data
      : result.ok && record(result.data) && Array.isArray(result.data.resources) ? result.data.resources : null;
    if (rows) setState({ status: "ready", rows: rows.filter((row) => record(row) && row.kind === "workflow" && typeof row.id === "string"), error: null });
    else setState({ status: "error", rows: [], error: result.ok ? { error: agentError("agents.workflow.bad_library") } : result });
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

export default function WorkflowPinControl({ pin, stored, editable, onPin, isDark, testid }) {
  const { t } = useTranslation();
  const [library, reloadLibrary] = useWorkflowLibrary();
  useWorkflowVersions(pin ? [pin] : []);
  const state = pin ? workflow_version_state(pin.workflow_id, pin.revision_id) : null;
  const version = state && state.status === "ready" ? state.version : null;
  const [chosen, setChosen] = useState(pin ? pin.workflow_id : record(stored) && typeof stored.workflow_id === "string" ? stored.workflow_id : "");
  const listed = library.rows.find((row) => row.id === chosen) || null;
  const name = (version && typeof version.document.name === "string" && version.document.name) || (listed && listed.name) || chosen || t("agents.workflow.the_workflow");

  const latest = useRef({ editable, onPin });
  latest.current = { editable, onPin };
  const intent = useRef({ ticket: 0, pending: null, mounted: true });
  useEffect(() => () => {
    intent.current.pending = null;
    intent.current.mounted = false;
  }, []);
  const [pinState, setPinState] = useState({ status: "idle", message: null });
  const [typed, setTyped] = useState("");

  const settle = (ticket, workflow_id, revision) => {
    if (intent.current.pending !== ticket) return false;
    intent.current.pending = null;
    if (revision && latest.current.editable) latest.current.onPin(workflow_id, revision.revision_id);
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
    const revision_id = typed.trim();
    if (!revision_id) return;
    const ticket = begin(agentMessage("agents.workflow.reading_revision"));
    const answer = await request_workflow_version(workflow_id, revision_id);
    const ok = answer && answer.status === "ready";
    if (!settle(ticket, workflow_id, ok ? answer.version : null)) return;
    if (!intent.current.mounted) return;
    if (ok) {
      setTyped("");
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
    setTyped("");
    setChosen(value);
  };
  const options = [
    ...(chosen && library.status === "ready" && !listed ? [{ value: chosen, label: t("agents.workflow.not_listed", { workflow: safe_text(chosen) }) }] : []),
    ...library.rows.map((row) => {
      const count = Number.isSafeInteger(row.published_revisions) ? row.published_revisions : 0;
      return { value: row.id, label: count === 0 ? t("agents.workflow.unpublished", { name: safe_text(row.name || row.id) }) : t("agents.workflow.published", { name: safe_text(row.name || row.id), count }) };
    }),
  ];
  const working = pinState.status === "working";
  const pin_here = pin && pin.workflow_id === chosen;

  return (
    <div data-testid={testid} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={LABEL}>{t("agents.workflow.workflow")}</span>
      <span data-testid={`${testid}-picker`}>
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
        <span style={problem_style(isDark)}>
          {t("agents.workflow.library_failed", { message: renderAgentMessage(refusal_text(library.error, agentMessage("agents.workflow.store_refused")), t) })}{" "}
          <Button label={t("agents.explorer.try_again")} onClick={reloadLibrary} style={{ fontSize: 10.5, paddingVertical: 1, paddingHorizontal: 6 }} />
        </span>
      )}
      {record(stored) && !pin && (
        <span data-testid={`${testid}-stored-invalid`} style={problem_style(isDark)}>
          {t("agents.workflow.stored", { value: "\uE000" }).split("\uE000").map((part, index) => <React.Fragment key={index}>{index > 0 && <span style={MONO}>{safe_text(JSON.stringify(stored))}</span>}{part}</React.Fragment>)}
        </span>
      )}
      {stored !== undefined && !record(stored) && (
        <span data-testid={`${testid}-stored-invalid`} style={problem_style(isDark)}>
          {t("agents.workflow.stored_not_ref", { value: "\uE000" }).split("\uE000").map((part, index) => <React.Fragment key={index}>{index > 0 && <span style={MONO}>{safe_text(JSON.stringify(stored))}</span>}{part}</React.Fragment>)}
        </span>
      )}
      {pin && (
        <span data-testid={`${testid}-pinned`} style={NOTE}>
          {version
            ? <>{t("agents.workflow.pinned", { ordinal: "\uE000", name: "\uE001", id: "\uE002" }).split(/(\uE000|\uE001|\uE002)/).map((part, index) => part === "\uE000"
                ? <b key={index}>{version.ordinal}</b> : part === "\uE001" ? <b key={index}>{safe_text(name)}</b>
                  : part === "\uE002" ? <span key={index} style={MONO}>{safe_text(pin.revision_id)}</span> : part)}</>
            : state && state.status === "loading"
              ? <>{t("agents.workflow.reading_pin", { id: "\uE000" }).split("\uE000").map((part, index) => <React.Fragment key={index}>{index > 0 && <span style={MONO}>{safe_text(pin.revision_id)}</span>}{part}</React.Fragment>)}</>
              : <>{t("agents.workflow.pinned_id", { id: "\uE000" }).split("\uE000").map((part, index) => <React.Fragment key={index}>{index > 0 && <span style={MONO}>{safe_text(pin.workflow_id)} · {safe_text(pin.revision_id)}</span>}{part}</React.Fragment>)}</>}
        </span>
      )}
      {pin && state && (state.status === "refused" || state.status === "unavailable") && (
        <span style={{ ...ROW, ...problem_style(isDark) }}>
          {state.error && state.error.code === "resource_missing"
            ? t("agents.workflow.missing_revision", { revision: safe_text(pin.revision_id), workflow: safe_text(pin.workflow_id) })
            : t("agents.workflow.revision_failed", { message: renderAgentMessage(refusal_text(state, agentMessage("agents.workflow.store_refused")), t) })}
          <Button label={t("agents.workflow.read_again")} onClick={() => request_workflow_version(pin.workflow_id, pin.revision_id)} style={SMALL} />
        </span>
      )}
      {chosen && editable && (
        <>
          <div style={ROW}>
            <Button
              label={working && pinState.message === PUBLISHING ? t("agents.workflow.publishing") : pin_here ? t("agents.workflow.publish_again") : t("agents.workflow.publish")}
              disabled={working}
              onClick={publishAndPin}
              style={{ ...SMALL, color: "#4a5bd8" }}
            />
          </div>
          <span style={NOTE}>{t("agents.workflow.publish_contract", { name: safe_text(listed ? listed.name || chosen : chosen) })}</span>
          <div style={ROW}>
            <Input value={typed} placeholder={t("agents.workflow.revision_placeholder")} set_value={setTyped} style={{ ...FIELD, ...MONO }} />
            <Button label={t("agents.workflow.pin")} ariaLabel={t("agents.workflow.pin_revision")} disabled={working || !typed.trim()} onClick={pinTyped} style={SMALL} />
          </div>
        </>
      )}
      {pinState.message && pinState.status !== "idle" && (
        <span data-testid={`${testid}-pin-state`} style={pinState.status === "refused" ? problem_style(isDark) : NOTE}>{renderAgentMessage(pinState.message, t)}</span>
      )}
    </div>
  );
}
