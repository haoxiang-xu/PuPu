import React, { useCallback, useEffect, useRef, useState } from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import Input from "../../../../../BUILTIN_COMPONENTs/input/input";
import Select from "../../../../../BUILTIN_COMPONENTs/select/select";
import { subscribeSkeletonLibraryRefresh } from "../../../../../SERVICEs/skeleton_library_refresh";
import { safe_text } from "../document_values";
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
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function refusal_text(result, fallback) {
  if (is_unavailable(result)) return "The store could not be reached.";
  const error = result && result.error;
  return safe_text((error && (error.message || error.code)) || fallback);
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
    else setState({ status: "error", rows: [], error: result.ok ? { error: { message: "The library answer was not a list." } } : result });
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
  const [library, reloadLibrary] = useWorkflowLibrary();
  useWorkflowVersions(pin ? [pin] : []);
  const state = pin ? workflow_version_state(pin.workflow_id, pin.revision_id) : null;
  const version = state && state.status === "ready" ? state.version : null;
  const [chosen, setChosen] = useState(pin ? pin.workflow_id : record(stored) && typeof stored.workflow_id === "string" ? stored.workflow_id : "");
  const listed = library.rows.find((row) => row.id === chosen) || null;
  const name = (version && typeof version.document.name === "string" && version.document.name) || (listed && listed.name) || chosen || "the Workflow";

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
    const revision_id = typed.trim();
    if (!revision_id) return;
    const ticket = begin("Reading that revision…");
    const answer = await request_workflow_version(workflow_id, revision_id);
    const ok = answer && answer.status === "ready";
    if (!settle(ticket, workflow_id, ok ? answer.version : null)) return;
    if (!intent.current.mounted) return;
    if (ok) {
      setTyped("");
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
    setTyped("");
    setChosen(value);
  };
  const options = [
    ...(chosen && library.status === "ready" && !listed ? [{ value: chosen, label: `${safe_text(chosen)} (not in the library now)` }] : []),
    ...library.rows.map((row) => {
      const count = Number.isSafeInteger(row.published_revisions) ? row.published_revisions : 0;
      return { value: row.id, label: `${safe_text(row.name || row.id)} · ${count === 0 ? "never published" : `${count} published`}` };
    }),
  ];
  const working = pinState.status === "working";
  const pin_here = pin && pin.workflow_id === chosen;

  return (
    <div data-testid={testid} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={LABEL}>Workflow</span>
      <span data-testid={`${testid}-picker`}>
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
        <span style={problem_style(isDark)}>
          The library could not be read: {refusal_text(library.error, "the store refused")}.{" "}
          <Button label="Try again" onClick={reloadLibrary} style={{ fontSize: 10.5, paddingVertical: 1, paddingHorizontal: 6 }} />
        </span>
      )}
      {record(stored) && !pin && (
        <span data-testid={`${testid}-stored-invalid`} style={problem_style(isDark)}>
          Stored: <span style={MONO}>{safe_text(JSON.stringify(stored))}</span>. Kept as it is until you pin a revision.
        </span>
      )}
      {stored !== undefined && !record(stored) && (
        <span data-testid={`${testid}-stored-invalid`} style={problem_style(isDark)}>
          Stored: <span style={MONO}>{safe_text(JSON.stringify(stored))}</span>, which is not a reference. Kept as it is until you pin a revision.
        </span>
      )}
      {pin && (
        <span data-testid={`${testid}-pinned`} style={NOTE}>
          {version
            ? <>Pinned: revision <b>{version.ordinal}</b> of <b>{safe_text(name)}</b> · <span style={MONO}>{safe_text(pin.revision_id)}</span></>
            : state && state.status === "loading"
              ? <>Reading <span style={MONO}>{safe_text(pin.revision_id)}</span>…</>
              : <>Pinned: <span style={MONO}>{safe_text(pin.workflow_id)} · {safe_text(pin.revision_id)}</span></>}
        </span>
      )}
      {pin && state && (state.status === "refused" || state.status === "unavailable") && (
        <span style={{ ...ROW, ...problem_style(isDark) }}>
          {state.error && state.error.code === "resource_missing"
            ? `No published revision “${safe_text(pin.revision_id)}” of “${safe_text(pin.workflow_id)}” exists; the run refuses it.`
            : `The pinned revision could not be read: ${refusal_text(state, "the store refused")}.`}
          <Button label="Read it again" onClick={() => request_workflow_version(pin.workflow_id, pin.revision_id)} style={SMALL} />
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
          <span style={NOTE}>Publishing writes {safe_text(listed ? listed.name || chosen : chosen)}: it stores a new revision only if the draft changed since its last one, and pins the revision it answers with.</span>
          <div style={ROW}>
            <Input value={typed} placeholder="or a revision id, e.g. rev-2-…" set_value={setTyped} style={{ ...FIELD, ...MONO }} />
            <Button label="Pin" ariaLabel="Pin this revision" disabled={working || !typed.trim()} onClick={pinTyped} style={SMALL} />
          </div>
        </>
      )}
      {pinState.message && pinState.status !== "idle" && (
        <span data-testid={`${testid}-pin-state`} style={pinState.status === "refused" ? problem_style(isDark) : NOTE}>{pinState.message}</span>
      )}
    </div>
  );
}
