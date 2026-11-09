import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Modal from "../../../../../BUILTIN_COMPONENTs/modal/modal";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import Input from "../../../../../BUILTIN_COMPONENTs/input/input";
import Select from "../../../../../BUILTIN_COMPONENTs/select/select";
import { api } from "../../../../../SERVICEs/api";
import KernelSection from "../detail_panel/kernel_section";
import { kernel_is_configured } from "../kernel_config";
import { node_kernel } from "../skeleton_document";
import { read_toolkit_catalog } from "../toolkit_pool_config";
import { list_resources, load_resource } from "../skeleton_resources";
import { subagent_candidates } from "../skeleton_subagent_eligibility";
import { safe_text } from "../document_values";
import { OBSERVATIONS, PHASES, createLegacyUpgradeController } from "./legacy_upgrade_controller";
import { POLICIES, REFERENCE_SCOPES, describe_path, legacy_toolkit_row } from "./legacy_upgrade_plan";

/* The explicit upgrade of one legacy Agent (#473 CP2), in the Builder's own
 * language: a read-only inventory, the rows that need the author's decision
 * on the existing Kernel/toolkit controls, the host's real preview with its
 * problems, one explicit Upgrade, and a reopen of what the store saved.
 * Nothing is written before Upgrade; closing writes nothing; a result the
 * host did not confirm is said to be unconfirmed and left for the author. */

const LABEL = { fontSize: 11, fontWeight: 600, color: "var(--pupu-text-muted)", textTransform: "uppercase", letterSpacing: 0.4 };
const NOTE = { fontSize: 11, color: "var(--pupu-text-muted)", lineHeight: 1.5 };
const MONO = { fontFamily: "ui-monospace, Menlo, monospace" };
const ROW = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };
const SMALL = { fontSize: 11, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6 };
const HAIRLINE = (isDark) => ({ height: 1, background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)" });
const problem_style = (isDark) => ({ fontSize: 11, lineHeight: 1.5, color: isDark ? "rgba(255,140,140,0.95)" : "rgba(176,32,32,0.95)" });
const card = (isDark) => ({ display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", borderRadius: 8, border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)" });

const default_services = () => ({
  capabilities: () => api.unchain.getSkeletonLegacyUpgradeCapabilities(),
  inspect: (request) => api.unchain.inspectSkeletonLegacyUpgrade(request),
  preview: (request) => api.unchain.previewSkeletonLegacyUpgrade(request),
  apply: (request) => api.unchain.applySkeletonLegacyUpgrade(request),
  read: (resource_id) => load_resource(resource_id),
  configured: kernel_is_configured,
});

const CODE_WORDS = {
  edit_conflict: "The stored Agent changed since it was read. Read it again before choosing anything else.",
  upgrade_preview_stale: "The preview no longer matches the stored Agent or its dependencies. Preview again.",
  upgrade_manifest_stale: "The runtime changed since the inventory was read. Read the Agent again.",
  legacy_upgrade_already_applied: "This Agent was already upgraded. Reopen it to see the native graph.",
  legacy_dependency_upgrade_required: "A referenced Agent must be upgraded first.",
  unauthorized: "The host refused the request as unauthorized.",
};

const refusal_words = (refusal) => (refusal && CODE_WORDS[refusal.code]) || (refusal && refusal.message) || "The host refused.";

export default function LegacyUpgradeWizard({ open, resource, onClose, onUpgraded, onReopen, isDark, services }) {
  const controller = useRef(null);
  if (controller.current === null) controller.current = createLegacyUpgradeController(services || default_services());
  const [state, setState] = useState(() => controller.current.current());
  useEffect(() => controller.current.subscribe(setState), []);
  useEffect(() => {
    if (open && resource && resource.id) controller.current.open(resource);
    else controller.current.close();
  }, [open, resource && resource.id, resource && resource.edit_token]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => controller.current.close(), []);

  const close = useCallback(() => { controller.current.close(); onClose(); }, [onClose]);
  const acknowledged = state.phase === PHASES.ACKNOWLEDGED;
  useEffect(() => {
    if (acknowledged && typeof onUpgraded === "function") onUpgraded(state.apply.saved);
  }, [acknowledged]); // eslint-disable-line react-hooks/exhaustive-deps

  const built = useMemo(() => controller.current.choices(), [state.slots, state.answers]); // eslint-disable-line react-hooks/exhaustive-deps
  const document = state.resource ? state.resource.document : null;
  const busy = [PHASES.LOADING, PHASES.PREVIEWING, PHASES.APPLYING, PHASES.READING].includes(state.phase);
  const can_preview = [PHASES.READY, PHASES.PREVIEWED].includes(state.phase) && built.ok && !state.problems.some((problem) => problem.blocking);
  const can_apply = state.phase === PHASES.PREVIEWED && state.preview && state.preview.generation === state.generation;

  return (
    <Modal open={open} onClose={close} ariaLabel="Upgrade legacy Agent" style={{ width: 560, maxWidth: "calc(100vw - 32px)", maxHeight: "84vh", overflowY: "auto", padding: "22px 24px 20px", backgroundColor: "var(--pupu-surface)" }}>
      <div data-testid="legacy-upgrade-wizard" data-phase={state.phase} style={{ display: "flex", flexDirection: "column", gap: 14, color: isDark ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.85)" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Upgrade legacy Agent</span>
          <span style={{ ...NOTE, ...MONO }}>{safe_text(state.resource ? state.resource.name || state.resource.id : "")}</span>
        </div>
        <span style={NOTE}>
          Reading and cancelling write nothing. The host converts what it can on its own; what needs your decision is listed below, and the preview is the exact graph it will save. Nothing is saved until you press Upgrade.
        </span>

        <InventorySection state={state} document={document} isDark={isDark} />

        {state.slots.length > 0 && [PHASES.READY, PHASES.PREVIEWING, PHASES.PREVIEWED, PHASES.PREWRITE_REFUSED].includes(state.phase) && (
          <>
            <div style={HAIRLINE(isDark)} />
            <span style={LABEL}>Your choices</span>
            {state.slots.map((slot) => (
              <SlotEditor key={slot.key} slot={slot} answer={state.answers[slot.key]} document={document} resourceId={state.resource ? state.resource.id : null}
                missing={built.missing.includes(slot.key)} disabled={[PHASES.LOADING, PHASES.APPLYING, PHASES.READING, PHASES.PREWRITE_REFUSED].includes(state.phase)} isDark={isDark}
                onAnswer={(value) => controller.current.answer(slot.key, value)} />
            ))}
          </>
        )}

        {state.problems.length > 0 && (
          <div data-testid="legacy-upgrade-problems" role="alert" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {state.problems.map((problem, index) => (
              <span key={index} style={problem_style(isDark)}>
                {problem.blocking ? "Cannot upgrade as it stands: " : "The host asks for more: "}
                <span style={MONO}>{safe_text(problem.code)}</span>
                {problem.path && problem.path.length > 0 ? ` at ${describe_path(document, problem.path)}` : ""}
                {problem.message ? ` — ${safe_text(problem.message)}` : ""}
              </span>
            ))}
          </div>
        )}

        {[PHASES.READY, PHASES.PREVIEWING, PHASES.PREVIEWED].includes(state.phase) && (
          <>
            <div style={HAIRLINE(isDark)} />
            <div style={ROW}>
              <span style={LABEL}>Preview</span>
              <Button label={state.phase === PHASES.PREVIEWING ? "Previewing…" : state.preview ? "Preview again" : "Preview"} disabled={!can_preview || busy} onClick={() => controller.current.preview()} style={SMALL} />
              {!built.ok && state.phase !== PHASES.PREVIEWING && <span style={NOTE}>{`${built.missing.length} ${built.missing.length === 1 ? "choice" : "choices"} still ${built.missing.length === 1 ? "needs" : "need"} an answer.`}</span>}
            </div>
            {state.preview && <PreviewSummary preview={state.preview} isDark={isDark} />}
          </>
        )}

        <div style={HAIRLINE(isDark)} />
        <OutcomeSection state={state} isDark={isDark} controller={controller.current} onReopen={onReopen} onClose={close} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span style={NOTE}>{state.phase === PHASES.UNCONFIRMED ? "Your choices are kept exactly as sent." : "Closing writes nothing."}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <Button label={acknowledged ? "Close" : "Cancel"} onClick={close} style={SMALL} />
            <Button label={state.phase === PHASES.APPLYING ? "Upgrading…" : "Upgrade"} disabled={!can_apply || busy} onClick={() => controller.current.apply()} dom_props={{ "data-testid": "legacy-upgrade-apply" }} style={{ ...SMALL, color: can_apply ? (isDark ? "#60a5fa" : "#4a5bd8") : undefined }} />
          </div>
        </div>
      </div>
    </Modal>
  );
}

function InventorySection({ state, document, isDark }) {
  const inventory = state.inventory;
  return (
    <div data-testid="legacy-upgrade-inventory" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={LABEL}>Inventory</span>
      {state.phase === PHASES.LOADING && <span style={NOTE}>Reading the stored Agent…</span>}
      {state.phase === PHASES.UNAVAILABLE && (
        <span data-testid="legacy-upgrade-unavailable" style={problem_style(isDark)}>
          The upgrade host is not available here: {safe_text((state.error && (state.error.message || state.error.code)) || "no answer")}
        </span>
      )}
      {inventory && inventory.state === "native_draft" && <span data-testid="legacy-upgrade-native" style={NOTE}>No upgrade decisions are needed. Preview the graph, then explicitly upgrade it.</span>}
      {inventory && (
        <>
          <span style={NOTE}>
            {`State ${safe_text(inventory.state)} · ${inventory.requirements.length} ${inventory.requirements.length === 1 ? "item" : "items"} · source `}
            <span style={MONO}>{safe_text(inventory.source_identity)}</span>
          </span>
          {state.info.length > 0 && (
            <ul data-testid="legacy-upgrade-info" style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 2 }}>
              {state.info.map((row, index) => (
                <li key={index} style={NOTE}>
                  <span style={MONO}>{safe_text(row.code)}</span> · {describe_path(document, row.path)} — {safe_text(row.message)}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function SlotEditor(props) {
  const { slot } = props;
  if (slot.kind === "kernel") return <KernelChoice {...props} />;
  if (slot.kind === "toolkit") return <ToolkitChoice {...props} />;
  if (slot.kind === "reference") return <ReferenceChoice {...props} />;
  return <AcknowledgeChoice {...props} />;
}

function SlotHeader({ slot, document, missing, isDark }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 12, fontWeight: 600 }}>
        {{ kernel: "Kernel", toolkit: "Toolkit", reference: "Subagent reference", acknowledge: "Review" }[slot.kind]} · {describe_path(document, slot.address)}
        {missing && <span style={{ ...problem_style(isDark), marginLeft: 6 }}>needs an answer</span>}
      </span>
      {slot.requirements.map((row, index) => (
        <span key={index} style={NOTE}><span style={MONO}>{safe_text(row.code)}</span> — {safe_text(row.message)}</span>
      ))}
    </div>
  );
}

/* The existing Kernel control, hosting one Agent node of its own. The Kernel
   it writes is the whole answer; the two policies and the acceptance beside
   it are the host's words for what happens to the legacy model and prompt. */
function KernelChoice({ slot, answer, document, missing, disabled, isDark, onAnswer }) {
  const kernel = answer && answer.kernel ? answer.kernel : null;
  const host = useMemo(() => ({ schema_version: 1, kind: "agent", id: "legacy-upgrade-choice", name: "choice", nodes: [{ id: "kernel", type: "agent", config: kernel ? { kernel } : {} }], edges: [] }), [kernel]);
  const current = { model_policy: "preserve", prompt_policy: "preserve", accept_projection: false, ...(answer || {}) };
  const write = (patch) => onAnswer({ ...current, kernel, ...patch });
  return (
    <div data-testid={`legacy-upgrade-slot-${slot.kind}`} style={card(isDark)}>
      <SlotHeader slot={slot} document={document} missing={missing} isDark={isDark} />
      <div style={{ pointerEvents: disabled ? "none" : "auto", opacity: disabled ? 0.6 : 1 }}>
        <KernelSection document={host} node={host.nodes[0]} revision={0} isDark={isDark} onChange={(next) => write({ kernel: node_kernel(next.nodes[0]) })} />
      </div>
      <div style={ROW}>
        <span style={NOTE}>Legacy model</span>
        <Select options={POLICIES.map((value) => ({ value, label: value === "preserve" ? "Preserve the legacy model" : "Replace with this Kernel's model" }))} value={current.model_policy} set_value={(value) => write({ model_policy: value })} filterable={false} disabled={disabled} style={{ width: 232, fontSize: 11.5, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 5 }} />
      </div>
      <div style={ROW}>
        <span style={NOTE}>Legacy prompt</span>
        <Select options={POLICIES.map((value) => ({ value, label: value === "preserve" ? "Preserve the legacy prompt" : "Replace with the built-in prompt" }))} value={current.prompt_policy} set_value={(value) => write({ prompt_policy: value })} filterable={false} disabled={disabled} style={{ width: 232, fontSize: 11.5, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 5 }} />
      </div>
      <label style={{ ...ROW, fontSize: 11.5 }}>
        <input type="checkbox" aria-label="Accept this Kernel projection" checked={current.accept_projection === true} disabled={disabled} onChange={(event) => write({ accept_projection: event.target.checked })} />
        I accept this Kernel as the projection of the legacy definition.
      </label>
    </div>
  );
}

function ToolkitChoice({ slot, answer, document, resourceId, missing, disabled, isDark, onAnswer }) {
  const legacy = useMemo(() => legacy_toolkit_row(document, slot.address), [document, slot.address]);
  const current = { toolkit_id: legacy.id, enabled_tools: legacy.allowlist_valid ? legacy.enabled_tools : null, discard_unsupported: false, ...(answer || {}) };
  const [catalog, setCatalog] = useState({ status: "loading", rows: [] });
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const rows = read_toolkit_catalog(await api.unchain.listToolModalCatalog({ strict: true }));
        if (live) setCatalog({ status: "ready", rows });
      } catch (_error) {
        if (live) setCatalog({ status: "error", rows: [] });
      }
    })();
    return () => { live = false; };
  }, [resourceId]);
  const installed = catalog.rows.find((row) => row.toolkitId === current.toolkit_id) || null;
  const names = installed ? installed.tools.map((tool) => tool.name) : [];
  const shownNames = [...names, ...(Array.isArray(current.enabled_tools)
    ? current.enabled_tools.filter((name) => !names.includes(name)) : [])];
  const write = (patch) => onAnswer({ ...current, ...patch });
  const toggle = (name) => {
    const selected = current.enabled_tools === null ? names : current.enabled_tools;
    write({ enabled_tools: selected.includes(name)
      ? selected.filter((item) => item !== name) : [...selected, name] });
  };
  return (
    <div data-testid={`legacy-upgrade-slot-${slot.kind}`} style={card(isDark)}>
      <SlotHeader slot={slot} document={document} missing={missing} isDark={isDark} />
      <div style={ROW}>
        <span style={NOTE}>Toolkit</span>
        <Input value={current.toolkit_id} set_value={(value) => write({ toolkit_id: value })} placeholder="toolkit id" style={{ width: 200, fontSize: 11.5, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 5 }} />
        {catalog.status === "ready" && !installed && <span style={NOTE}>not installed here; the id is kept as written</span>}
      </div>
      <div style={ROW}>
        <Button label="All tools" onClick={() => write({ enabled_tools: null })} disabled={disabled} style={{ ...SMALL, color: current.enabled_tools === null ? (isDark ? "#60a5fa" : "#4a5bd8") : undefined }} />
        <Button label="Choose tools" onClick={() => write({ enabled_tools: Array.isArray(current.enabled_tools) ? current.enabled_tools : [] })} disabled={disabled} style={{ ...SMALL, color: Array.isArray(current.enabled_tools) ? (isDark ? "#60a5fa" : "#4a5bd8") : undefined }} />
        <span style={NOTE}>{current.enabled_tools === null ? "every tool of the toolkit (null)" : `${current.enabled_tools.length} named ${current.enabled_tools.length === 1 ? "tool" : "tools"}`}</span>
      </div>
      {Array.isArray(current.enabled_tools) && shownNames.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {shownNames.map((name) => (
            <label key={name} style={{ ...ROW, fontSize: 11.5 }}>
              <input type="checkbox" aria-label={name} checked={current.enabled_tools.includes(name)} disabled={disabled} onChange={() => toggle(name)} />
              <span style={MONO}>{name}</span>
              {!names.includes(name) && <span style={NOTE}>not in the current tool list; kept as written</span>}
            </label>
          ))}
        </div>
      )}
      {Array.isArray(current.enabled_tools) && names.length === 0 && (
        <span style={NOTE}>No installed tool list to pick from; the named tools are kept as written: {current.enabled_tools.length === 0 ? "none" : current.enabled_tools.join(", ")}</span>
      )}
      {legacy.unsupported.length > 0 && (
        <label style={{ ...ROW, fontSize: 11.5 }}>
          <input type="checkbox" aria-label="Discard unsupported toolkit settings" checked={current.discard_unsupported === true} disabled={disabled} onChange={(event) => write({ discard_unsupported: event.target.checked })} />
          Discard the legacy settings the host cannot carry: <span style={MONO}>{legacy.unsupported.join(", ")}</span>
        </label>
      )}
    </div>
  );
}

function ReferenceChoice({ slot, answer, document, resourceId, missing, disabled, isDark, onAnswer }) {
  const current = { source_scope: REFERENCE_SCOPES[0], agent_id: "", ...(answer || {}) };
  const [library, setLibrary] = useState({ status: "loading", rows: [] });
  useEffect(() => {
    let live = true;
    list_resources(false).then((result) => {
      if (!live) return;
      setLibrary(result.ok ? { status: "ready", rows: subagent_candidates(result.data && result.data.resources, { owner_id: resourceId }) } : { status: "error", rows: [] });
    });
    return () => { live = false; };
  }, [resourceId]);
  const write = (patch) => onAnswer({ ...current, ...patch });
  return (
    <div data-testid={`legacy-upgrade-slot-${slot.kind}`} style={card(isDark)}>
      <SlotHeader slot={slot} document={document} missing={missing} isDark={isDark} />
      <div style={ROW}>
        <span style={NOTE}>Scope</span>
        <Select options={REFERENCE_SCOPES.map((value) => ({ value, label: value }))} value={current.source_scope} set_value={(value) => write({ source_scope: value })} filterable={false} disabled={disabled} style={{ width: 200, fontSize: 11.5, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 5 }} />
      </div>
      <div style={ROW}>
        <span style={NOTE}>Agent</span>
        <Select options={library.rows.map((row) => ({ value: row.id, label: `${safe_text(row.name)} · ${row.id}` }))} value={current.agent_id || null} set_value={(value) => write({ agent_id: value })} filterable placeholder={library.status === "loading" ? "reading the library…" : "pick the exact Agent"} disabled={disabled} style={{ width: 300, fontSize: 11.5, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 5 }} />
      </div>
    </div>
  );
}

function AcknowledgeChoice({ slot, answer, document, missing, disabled, isDark, onAnswer }) {
  return (
    <div data-testid={`legacy-upgrade-slot-${slot.kind}`} style={card(isDark)}>
      <SlotHeader slot={slot} document={document} missing={missing} isDark={isDark} />
      <label style={{ ...ROW, fontSize: 11.5 }}>
        <input type="checkbox" aria-label={`Acknowledge ${slot.code}`} checked={Boolean(answer && answer.acknowledged)} disabled={disabled} onChange={(event) => onAnswer({ acknowledged: event.target.checked })} />
        {slot.code === "legacy_prompt_review_required" ? "I reviewed this legacy prompt and accept how the host carries it." : "I accept that this legacy setting is not carried into the native graph."}
      </label>
    </div>
  );
}

const model_of = (node) => {
  const kernel = node_kernel(node);
  const profile = kernel && kernel.profile;
  return profile ? `${safe_text(profile.provider)} · ${safe_text(profile.model)}` : "no Kernel";
};

function PreviewSummary({ preview, isDark }) {
  const payload = preview.payload;
  const doc = payload.document;
  return (
    <div data-testid="legacy-upgrade-preview" style={card(isDark)}>
      <span style={NOTE}>
        {`${doc.nodes.length} nodes · ${doc.edges.length} edges · ${payload.subagents.length} ${payload.subagents.length === 1 ? "subagent" : "subagents"} · ${payload.dependencies.length} ${payload.dependencies.length === 1 ? "dependency" : "dependencies"}`}
      </span>
      <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 2 }}>
        {doc.nodes.map((node) => (
          <li key={node.id} style={{ fontSize: 11.5 }}>
            <span style={MONO}>{safe_text(node.id)}</span> · {safe_text(node.type)}
            {node.type === "agent" ? ` · ${model_of(node)}` : ""}
            {node.type === "toolkit_pool" && Array.isArray(node.config.toolkits) ? ` · ${node.config.toolkits.map((row) => `${row.id}${row.enabled_tools === null ? " (all tools)" : ` (${row.enabled_tools.length})`}`).join(", ") || "no toolkits"}${node.config.merge_with_user_selected ? " · merges chat toolkits" : ""}` : ""}
            {node.type === "subagent_pool" && Array.isArray(node.config.subagents) ? ` · ${node.config.subagents.map((row) => safe_text(row.name)).join(", ") || "no subagents"}` : ""}
          </li>
        ))}
      </ul>
      <span style={NOTE}>
        {`Policy: ${payload.source_policy.allowed_modes.join("/")} · ${payload.source_policy.output_mode} · ${payload.source_policy.memory_policy}${payload.source_policy.parallel_safe ? " · parallel-safe" : ""} · tools ${payload.source_policy.allowed_tools === null ? "all" : payload.source_policy.allowed_tools.length}`}
      </span>
      <span style={{ ...NOTE, ...MONO }}>{`projection ${preview.projection_digest.slice(0, 16)}… · definition ${payload.definition_digest.slice(0, 16)}…`}</span>
    </div>
  );
}

function OutcomeSection({ state, isDark, controller, onReopen, onClose }) {
  const apply = state.apply;
  const refusal = apply && apply.refusal;
  if (state.phase === PHASES.ACKNOWLEDGED) {
    return (
      <div data-testid="legacy-upgrade-acknowledged" role="status" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>Upgraded</span>
        <span style={NOTE}>{`The host saved the reviewed graph at token `}<span style={MONO}>{safe_text(apply.saved.edit_token)}</span>{`. Reopening the Agent shows the native graph.`}</span>
      </div>
    );
  }
  if (state.phase === PHASES.PREWRITE_REFUSED || (state.phase === PHASES.READY && refusal && apply.outcome === "prewrite_refused")) {
    const code = refusal ? refusal.code : state.error && state.error.code;
    return (
      <div data-testid="legacy-upgrade-refused" role="alert" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={problem_style(isDark)}>{`Not written: `}<span style={MONO}>{safe_text(code)}</span>{` — ${refusal_words(refusal || state.error)}`}</span>
        <div style={ROW}>
          {["edit_conflict", "upgrade_manifest_stale"].includes(code) && <Button label="Read the stored Agent again" onClick={() => controller.reinspect()} style={SMALL} />}
          {code === "legacy_upgrade_already_applied" && <Button label="Reopen the Agent" onClick={() => { if (typeof onReopen === "function") onReopen(); onClose(); }} style={SMALL} />}
        </div>
      </div>
    );
  }
  if (state.phase === PHASES.UNCONFIRMED || state.phase === PHASES.READING) {
    const observation = state.observation;
    return (
      <div data-testid="legacy-upgrade-unconfirmed" role="alert" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={problem_style(isDark)}>
          {`Unconfirmed: the host did not confirm this upgrade`}{refusal ? ` (${safe_text(refusal.code)})` : ""}{`. It may still be writing what you sent. Nothing is retried on your behalf.`}
        </span>
        {observation && observation.kind === OBSERVATIONS.COMMIT_NOT_OBSERVED && <span style={NOTE}>A read just now still shows the token you started from: the write was not observed yet. It can still land.</span>}
        {observation && observation.kind === OBSERVATIONS.MATCHING && <span style={NOTE}>A read just now shows the reviewed graph at a new token. That is a matching resource, not a receipt for this attempt.</span>}
        {observation && observation.kind === OBSERVATIONS.CONFLICTING && <span style={problem_style(isDark)}>A read just now shows a different graph or token. Your choices are kept; nothing was written over it.</span>}
        {observation && observation.kind === OBSERVATIONS.UNAVAILABLE && <span style={problem_style(isDark)}>The resource could not be read.</span>}
        <div style={ROW}>
          <Button label={state.phase === PHASES.READING ? "Reading…" : "Read the resource"} disabled={state.phase === PHASES.READING} onClick={() => controller.read_resource()} style={SMALL} dom_props={{ "data-testid": "legacy-upgrade-read" }} />
          {observation && observation.kind === OBSERVATIONS.MATCHING && <Button label="Reopen the Agent" onClick={() => { if (typeof onReopen === "function") onReopen(); onClose(); }} style={SMALL} />}
          {observation && [OBSERVATIONS.COMMIT_NOT_OBSERVED, OBSERVATIONS.CONFLICTING].includes(observation.kind) && <Button label="Start over at the stored token" onClick={() => controller.reinspect()} style={SMALL} />}
        </div>
      </div>
    );
  }
  return <span style={NOTE}>Upgrade writes the previewed graph once, against the token this inventory was read at. A conflict or a stale preview is refused by the host before any write.</span>;
}
