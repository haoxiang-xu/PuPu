import { agentMessage, renderAgentMessage, agentProblemMessage } from "../agents_i18n";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import React, { useEffect, useRef, useState } from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import Input from "./panel_input";
import SegmentedControl from "../../../../toolkit/components/segmented_control";
import { api } from "../../../../../SERVICEs/api";
import WorkflowPinControl from "./workflow_pin_control";
import { safe_text } from "../document_values";
import { embedded_supported, hook_embedded } from "../hooks_pool_config";
import { new_workflow_document } from "../skeleton_graph_edits";
import { save_draft } from "../skeleton_resources";
import { Block } from "./process_timeline";
import { addButtonStyle, note, problem } from "./panel_style";

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

const MONO = { fontFamily: "ui-monospace, Menlo, monospace" };
const ROW = { display: "flex", alignItems: "center", gap: 6 };
const FIELD = { width: "100%", fontSize: 12, paddingVertical: 4, paddingHorizontal: 6 };
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
      setState({ status: "unavailable", reason: agentMessage("agents.hook_source.no_contract") });
      return undefined;
    }
    read().then(
      (value) => { if (live) setState({ status: "ready", contract: value.workflow_source }); },
      (error) => { if (live) setState({ status: "unavailable", reason: error?.code || error?.message ? safe_text(error?.code || error?.message) : agentMessage("agents.hook_source.host_no_answer") }); },
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
  if (!made.ok) return null;
  // Hook callers own event/call/tool/arguments/result. The ordinary function
  // factory's empty, closed signature would reject that fixed event payload.
  const { input_schema: _signature, ...document } = made.document;
  return document;
}

export default function HookWorkflowSource({ entry, index, nodeId, parentId, pin, editable, isDark, testid, capability, managedSources, onWrite, onOpen }) {
  const { t } = useTranslation();
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
      setSaveState({ status: "refused", message: agentMessage("agents.hook_source.same_parent_id", { value1: safe_text(id) }) });
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
      setSaveState({ status: "done", message: agentMessage("agents.hook_source.copy_saved", { value1: safe_text(id) }) });
    } else {
      const error = result.error || {};
      const message = error.message
        ? typeof error.message === "string" ? agentProblemMessage(error, agentMessage) : safe_text(error.message)
        : agentMessage("agents.execution.code.store_refused");
      /* The store's code is for developers; the panel shows the message. */
      if (error.code) console.warn("[hook-source] copy refused:", error.code);
      setSaveState({ status: "refused", message: error.code ? agentMessage("agents.hook_source.copy_refused_code", { message, code: safe_text(error.code) }) : agentMessage("agents.hook_source.copy_refused", { message }) });
    }
  };

  const NOTE = note(isDark);
  /* The small text actions, centred with what sits beside them. */
  const SMALL = { ...addButtonStyle(isDark), alignSelf: "auto" };

  return (
    <div data-testid={`${testid}-source`}>
    <Block section={`${testid}-source`} title={t("agents.hook_source.title")} isDark={isDark}>
      {offered && (
        <span style={{ opacity: editable ? 1 : 0.5, pointerEvents: editable ? "auto" : "none" }}>
          <SegmentedControl
            size="compact"
            isDark={isDark}
            buttonFontWeight={500}
            sections={[{ key: "pinned", label: t("agents.hook_source.pinned") }, { key: "own", label: t("agents.hook_source.own") }]}
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
            ? t("agents.hook_source.checking_contract")
            : capability.reason ? t("agents.hook_source.unconfirmed_reason", { reason: renderAgentMessage(capability.reason, t) }) : t("agents.hook_source.unconfirmed")}
        </span>
      )}

      {mode === "pinned" && (
        <>
          {stored_own && (
            <span data-testid={`${testid}-replaces-own`} style={NOTE}>{t("agents.hook_source.pin_replaces_embedded")}</span>
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
              {t("agents.hook_source.own_summary", { name: "{name}", id: "{id}", count: "{count}" }).split(/(\{name\}|\{id\}|\{count\})/g).map((part, index) => ({ __proto__: null, "{name}": (<b key={index}>{safe_text(body.name || body.id)}</b>), "{id}": (<span key={index} style={MONO}>{safe_text(body.id)}</span>), "{count}": Array.isArray(body.nodes) ? body.nodes.length : 0 }[part] ?? part))}
            </span>
          ) : (
            <span style={problem(isDark)}>{t("agents.hook_source.unreadable")}</span>
          )}
          <div style={{ ...ROW, flexWrap: "wrap" }}>
            <Button
              label={t("agents.hook_source.open")}
              ariaLabel={t("agents.hook_source.open_hook", { value1: safe_text(entry.id) })}
              disabled={!offered || !record(body) || typeof onOpen !== "function"}
              onClick={() => onOpen({ pool_node_id: nodeId, entry_id: entry.id, entry_index: index })}
              style={{ ...SMALL, color: "var(--pupu-text-muted)", flexShrink: 0 }}
            />
            {!saveAs && (
              <Button
                label={t("agents.hook_source.save_as")}
                disabled={!record(body)}
                onClick={() => startSaveAs({ id: "", name: record(body) && typeof body.name === "string" ? body.name : "" })}
                style={{ ...SMALL, flexShrink: 0 }}
              />
            )}
          </div>
          {saveAs && (
            <div data-testid={`${testid}-save-as`} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <Input value={saveAs.id} placeholder={t("agents.hook_source.id_placeholder")} set_value={(next) => startSaveAs({ ...saveAs, id: next })} style={{ ...FIELD, ...MONO }} />
              <Input value={saveAs.name} placeholder={t("agents.hook_source.name_placeholder")} set_value={(next) => startSaveAs({ ...saveAs, name: next })} style={FIELD} />
              <span style={NOTE}>{t("agents.hook_source.copy_note")}</span>
              <div style={ROW}>
                <Button
                  label={saveState.status === "saving" ? t("agents.hook_source.saving") : t("agents.hook_source.save_copy")}
                  disabled={saveState.status === "saving" || !RESOURCE_ID.test(saveAs.id.trim()) || !saveAs.name.trim()}
                  onClick={saveAsWorkflow}
                  style={SMALL}
                />
                <Button label={t("agents.explorer.cancel")} onClick={() => startSaveAs(null)} style={{ ...SMALL, opacity: 0.75 }} />
              </div>
            </div>
          )}
          {saveState.message && (
            <span data-testid={`${testid}-save-as-state`} style={saveState.status === "refused" ? problem(isDark) : NOTE}>{renderAgentMessage(saveState.message, t)}</span>
          )}
        </div>
      )}
    </Block>
    </div>
  );
}
