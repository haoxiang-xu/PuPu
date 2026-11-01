import React, { useEffect, useRef, useState } from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import Input from "../../../../../BUILTIN_COMPONENTs/input/input";
import SegmentedControl from "../../../../toolkit/components/segmented_control";
import { api } from "../../../../../SERVICEs/api";
import WorkflowPinControl from "./workflow_pin_control";
import { safe_text } from "../document_values";
import { embedded_supported, hook_embedded } from "../hooks_pool_config";
import { new_workflow_document } from "../skeleton_graph_edits";
import { save_draft } from "../skeleton_resources";

/* Which Workflow one hook runs (#357): a pinned published revision, or — only
 * where the host's Hook Workflow contract says the runtime reads it — a
 * Workflow of the hook's own, stored inside this Agent.
 *
 *   - Nothing is written until the author chooses: picking "Its own Workflow"
 *     writes a Start→End Workflow in place of the reference (one undo away),
 *     and switching back only shows the pin control; the pin is what writes.
 *   - Its own Workflow is edited on the canvas, opened from here, and saved
 *     with this Agent. Its Code text belongs to this Agent, at its full
 *     address, like any embedded graph's.
 *   - "Save as a Workflow" is an explicit, separate copy into the library: a
 *     new draft resource under an id the author names. It is not published
 *     and the hook keeps running its own copy; nothing is replaced. */

const LABEL = { fontSize: 11, fontWeight: 600, color: "#86868b", textTransform: "uppercase", letterSpacing: 0.4 };
const NOTE = { fontSize: 10.5, color: "#86868b", lineHeight: 1.45 };
const MONO = { fontFamily: "ui-monospace, Menlo, monospace" };
const ROW = { display: "flex", alignItems: "center", gap: 6 };
const FIELD = { width: "100%", fontSize: 11.5, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 5 };
const SMALL = { fontSize: 10.5, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 5 };
const problem_style = (isDark) => ({ fontSize: 10.5, lineHeight: 1.45, color: isDark ? "rgba(255,140,140,0.95)" : "rgba(176,32,32,0.95)" });
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const RESOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

/* The host's Hook Workflow contract, read once per panel; until it answers,
   and when it cannot, a Workflow of the hook's own is not offered. */
export function useHookWorkflowCapability() {
  const [state, setState] = useState({ status: "loading" });
  useEffect(() => {
    let live = true;
    const read = api?.unchain?.getSkeletonHookWorkflowCapabilities;
    if (typeof read !== "function") {
      setState({ status: "unavailable", reason: "this app has no Hook Workflow contract read" });
      return undefined;
    }
    read().then(
      (value) => { if (live) setState({ status: "ready", contract: value.workflow_source }); },
      (error) => { if (live) setState({ status: "unavailable", reason: safe_text(error?.code || error?.message || "the host did not answer") }); },
    );
    return () => { live = false; };
  }, []);
  return state;
}

/* A Start→End Workflow for a hook that has none of its own yet, under an id
   that is not the Agent's (the run refuses a body repeating its parent's). */
export function seed_hook_workflow(entry, parent_id) {
  const base = `${typeof entry.id === "string" ? entry.id : "hook"}-workflow`.replace(/[^A-Za-z0-9._:-]/g, "-").replace(/^[^A-Za-z0-9]+/, "");
  const id = RESOURCE_ID.test(base) && base !== parent_id ? base : parent_id === "hook-workflow" ? "hook-workflow-1" : "hook-workflow";
  const made = new_workflow_document({ id, name: `${typeof entry.id === "string" && entry.id ? entry.id : "Hook"} Workflow` });
  return made.ok ? made.document : null;
}

export default function HookWorkflowSource({ entry, index, nodeId, parentId, pin, editable, isDark, testid, capability, managedSources, onWrite, onOpen }) {
  const body = hook_embedded(entry);
  const stored_own = record(entry.workflow) && Object.prototype.hasOwnProperty.call(entry.workflow, "kind");
  const offered = embedded_supported(capability);
  /* Showing the pin control writes nothing, so it is held here until a pin
     is chosen. */
  const [showPin, setShowPin] = useState(false);
  useEffect(() => {
    if (!stored_own) setShowPin(false);
  }, [stored_own]);
  const mode = stored_own && !showPin ? "own" : "pinned";

  const [saveAs, setSaveAs] = useState(null);
  const [saveState, setSaveState] = useState({ status: "idle", message: null });
  const intent = useRef({ ticket: 0, pending: null, mounted: true });
  useEffect(() => () => {
    intent.current.mounted = false;
    intent.current.pending = null;
  }, []);
  const startSaveAs = (values) => {
    intent.current.pending = null;
    setSaveState({ status: "idle", message: null });
    setSaveAs(values);
  };
  const saveAsWorkflow = async () => {
    const id = saveAs ? saveAs.id.trim() : "";
    const name = saveAs ? saveAs.name.trim() : "";
    if (!record(body) || !RESOURCE_ID.test(id) || !name) return;
    if (id === parentId) {
      setSaveState({ status: "refused", message: `“${safe_text(id)}” is this Agent's own id.` });
      return;
    }
    const mine = ++intent.current.ticket;
    intent.current.pending = mine;
    setSaveState({ status: "saving", message: null });
    /* A copy of the graph as it is now, under its new identity; its Code
       text is this Agent's, carried at the copy's own addresses. */
    const result = await save_draft({ ...JSON.parse(JSON.stringify(body)), id, name }, null, managedSources || {});
    if (!intent.current.mounted || intent.current.pending !== mine) return;
    intent.current.pending = null;
    if (result.ok) {
      setSaveAs(null);
      setSaveState({ status: "done", message: `Saved a copy as the Workflow “${safe_text(id)}” (a draft). This hook still runs its own; to run that Workflow instead, publish it and pin it here.` });
    } else {
      const error = result.error || {};
      setSaveState({ status: "refused", message: `Nothing was saved: ${safe_text(error.message || error.code || "the store refused")}${error.code ? ` (${safe_text(error.code)})` : ""}.` });
    }
  };

  return (
    <div data-testid={`${testid}-source`} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={LABEL}>Workflow</span>
      {offered && (
        <span style={{ opacity: editable ? 1 : 0.5, pointerEvents: editable ? "auto" : "none" }}>
          <SegmentedControl
            size="compact"
            isDark={isDark}
            buttonFontWeight={500}
            sections={[{ key: "pinned", label: "A pinned Workflow" }, { key: "own", label: "Its own Workflow" }]}
            selected={!stored_own && !Object.prototype.hasOwnProperty.call(entry, "workflow") ? null : mode}
            onChange={(next) => {
              if (!editable) return;
              if (next === "pinned") {
                setShowPin(true);
                return;
              }
              setShowPin(false);
              if (stored_own) return;
              const seed = seed_hook_workflow(entry, parentId);
              if (seed) onWrite({ kind: "embedded", document: seed });
            }}
          />
        </span>
      )}
      {!offered && (
        <span data-testid={`${testid}-source-note`} style={NOTE}>
          {capability.status === "loading"
            ? "Checking whether this runtime takes a Workflow of the hook's own…"
            : `A Workflow of the hook's own is not offered: this runtime has not confirmed it reads one${capability.reason ? ` (${safe_text(capability.reason)})` : ""}.`}
        </span>
      )}

      {mode === "pinned" && (
        <>
          {stored_own && (
            <span data-testid={`${testid}-replaces-own`} style={NOTE}>Pinning a revision replaces this hook's own Workflow; Undo brings it back.</span>
          )}
          <WorkflowPinControl
            pin={pin}
            stored={!stored_own && Object.prototype.hasOwnProperty.call(entry, "workflow") ? entry.workflow : undefined}
            editable={editable}
            isDark={isDark}
            testid={`${testid}-workflow`}
            onPin={(workflow_id, revision_id) => onWrite({ workflow_id, revision_id })}
          />
        </>
      )}

      {mode === "own" && (
        <div data-testid={`${testid}-own`} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {record(body) ? (
            <span style={NOTE}>
              <b>{safe_text(body.name || body.id)}</b> · <span style={MONO}>{safe_text(body.id)}</span> · {Array.isArray(body.nodes) ? body.nodes.length : 0} steps. Saved with this Agent.
            </span>
          ) : (
            <span style={problem_style(isDark)}>The stored Workflow is not one this editor can open.</span>
          )}
          <div style={ROW}>
            <Button
              label="Open its Workflow"
              ariaLabel={`Open the Workflow of hook ${safe_text(entry.id)}`}
              disabled={!offered || !record(body) || typeof onOpen !== "function"}
              onClick={() => onOpen({ pool_node_id: nodeId, entry_id: entry.id, entry_index: index })}
              style={{ ...SMALL, color: "#4a5bd8" }}
            />
            {!saveAs && (
              <Button
                label="Save as a Workflow…"
                disabled={!record(body)}
                onClick={() => startSaveAs({ id: "", name: record(body) && typeof body.name === "string" ? body.name : "" })}
                style={SMALL}
              />
            )}
          </div>
          {saveAs && (
            <div data-testid={`${testid}-save-as`} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <Input value={saveAs.id} placeholder="new Workflow id, e.g. redact-paths" set_value={(next) => startSaveAs({ ...saveAs, id: next })} style={{ ...FIELD, ...MONO }} />
              <Input value={saveAs.name} placeholder="its name" set_value={(next) => startSaveAs({ ...saveAs, name: next })} style={FIELD} />
              <span style={NOTE}>A separate draft in the library, under this id. It is not published, and this hook keeps its own copy.</span>
              <div style={ROW}>
                <Button
                  label={saveState.status === "saving" ? "Saving…" : "Save the copy"}
                  disabled={saveState.status === "saving" || !RESOURCE_ID.test(saveAs.id.trim()) || !saveAs.name.trim()}
                  onClick={saveAsWorkflow}
                  style={SMALL}
                />
                <Button label="Cancel" onClick={() => startSaveAs(null)} style={{ ...SMALL, opacity: 0.75 }} />
              </div>
            </div>
          )}
          {saveState.message && (
            <span data-testid={`${testid}-save-as-state`} style={saveState.status === "refused" ? problem_style(isDark) : NOTE}>{saveState.message}</span>
          )}
        </div>
      )}
    </div>
  );
}
