import React, { useCallback, useEffect, useRef, useState } from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import Input from "../../../../../BUILTIN_COMPONENTs/input/input";
import Select from "../../../../../BUILTIN_COMPONENTs/select/select";
import SegmentedControl from "../../../../toolkit/components/segmented_control";
import { api } from "../../../../../SERVICEs/api";
import { subscribeToolkitCatalogRefresh } from "../../../../../SERVICEs/toolkit_catalog_refresh";
import usePendingText from "./pending_text";
import useListIdentities from "./list_identity";
import HookWorkflowSource, { useHookWorkflowCapability } from "./hook_workflow_source";
import { safe_text } from "../document_values";
import { read_toolkit_catalog } from "../toolkit_pool_config";
import { cached_workflow_version, useWorkflowVersions } from "../workflow_versions";
import {
  DECISION_SHAPES,
  EVENT_INPUT_KEYS,
  HOOK_EVENTS,
  HOOK_KEYS,
  MAX_ORDER,
  attached_agents,
  enable_supported,
  free_hook_id,
  hook_embedded,
  hook_entry_problems,
  hook_pin,
  hook_runs,
  hook_scope_entries,
  hook_workflow_shape,
  hooks_list,
  kernel_hook_order,
  move_hook,
  pool_problems,
  remove_hook,
  scope_duplicate_ids,
  scope_hook_ids,
  tool_matcher_kind,
  tool_name_ok,
  tool_set_supported,
  with_hook,
  with_hook_enabled,
  with_hooks,
  without_pool_setting,
} from "../hooks_pool_config";

/* A Hooks Pool (#357): the hooks one Agent runs around its tool calls. Every
 * rule is the fixed runtime's (see `hooks_pool_config`):
 *
 *   - each hook is an id, an order, an event (before or after the tool call),
 *     a tool matcher (one tool's exact name, or every tool), one pinned
 *     published Workflow revision, whether it always asks for approval and —
 *     only where the host's Hook contract says the runtime reads it — whether
 *     it is on; there is no name or failure policy — it fails closed
 *     (`hooks_runtime`: a wrong before answer blocks the call; a child that
 *     does not complete, or a wrong after answer, is raised);
 *   - the run calls every hook that is on of every pool attached to the
 *     Agent, by (order, id), and the panel says that order; dragging a hook
 *     there writes its `order` (and, only if needed, its own pool's other
 *     orders), never the position in the stored list;
 *   - the pinned Workflow's End exports ARE the hook's decision, so the
 *     returns are read from it and checked against what the event accepts;
 *   - nothing is written the author did not choose: a new hook carries only
 *     its id, and each control writes its own key. A stored value the runtime
 *     refuses is shown as stored, with what is wrong and how to fix it. */

const LABEL = { fontSize: 11, fontWeight: 600, color: "var(--pupu-text-muted)", textTransform: "uppercase", letterSpacing: 0.4 };
const NOTE = { fontSize: 10.5, color: "var(--pupu-text-muted)", lineHeight: 1.45 };
const MONO = { fontFamily: "ui-monospace, Menlo, monospace" };
const ROW = { display: "flex", alignItems: "center", gap: 6 };
const FIELD = { width: "100%", fontSize: 11.5, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 5 };
const SMALL = { fontSize: 10.5, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 5 };
const problem_style = (isDark) => ({ fontSize: 10.5, lineHeight: 1.45, color: isDark ? "rgba(255,140,140,0.95)" : "rgba(176,32,32,0.95)" });
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const has = (value, key) => record(value) && Object.prototype.hasOwnProperty.call(value, key);
const EVENT_LABEL = { before_tool_call: "Before the tool call", after_tool_call: "After the tool call" };
const raw = (value) => {
  try {
    const text = JSON.stringify(value);
    return text === undefined ? String(value) : text;
  } catch (_error) {
    return "(unreadable)";
  }
};

function Divider({ isDark }) {
  return <div style={{ height: 1, margin: "2px 0", background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)" }} />;
}

/* Tool names from the same library the Toolkit Pool and Tool Call read. */
function useToolNames() {
  const [state, setState] = useState({ status: "loading", names: [] });
  const ticket = useRef(0);
  const read = useCallback(async () => {
    const mine = ++ticket.current;
    try {
      const kits = read_toolkit_catalog(await api.unchain.listToolModalCatalog({ strict: true }));
      const names = [];
      kits.filter((kit) => kit.hidden !== true).forEach((kit) => kit.tools.forEach((tool) => {
        if (tool.hidden !== true && !names.includes(tool.name)) names.push(tool.name);
      }));
      if (mine === ticket.current) setState({ status: "ready", names });
    } catch (_error) {
      if (mine === ticket.current) setState({ status: "error", names: [] });
    }
  }, []);
  useEffect(() => {
    read();
    const off = subscribeToolkitCatalogRefresh(read);
    return () => {
      ticket.current += 1;
      off();
    };
  }, [read]);
  return state;
}

/* The Hook contract of the runtime this host runs, read once per panel. Until
   it answers, and when it cannot, nothing about on/off is guessed. */
function useHookCapability() {
  const [state, setState] = useState({ status: "loading" });
  useEffect(() => {
    let live = true;
    const read = api?.unchain?.getSkeletonHookCapabilities;
    if (typeof read !== "function") {
      setState({ status: "unavailable", reason: "this app has no Hook contract read" });
      return undefined;
    }
    read().then(
      (value) => { if (live) setState({ status: "ready", contract: value.hook_entry }); },
      (error) => { if (live) setState({ status: "unavailable", reason: safe_text(error?.code || error?.message || "the host did not answer") }); },
    );
    return () => { live = false; };
  }, []);
  return state;
}

/* The tool-set extension of the same runtime, read once per panel and kept
   apart from the on/off contract: an older host simply has no set. */
function useToolSetCapability() {
  const [state, setState] = useState({ status: "loading" });
  useEffect(() => {
    let live = true;
    const read = api?.unchain?.getSkeletonHookToolSetCapabilities;
    if (typeof read !== "function") {
      setState({ status: "unavailable", reason: "this app has no tool-set contract read" });
      return undefined;
    }
    read().then(
      (value) => { if (live) setState({ status: "ready", contract: value.tool_matcher }); },
      (error) => { if (live) setState({ status: "unavailable", reason: safe_text(error?.code || error?.message || "the host did not answer") }); },
    );
    return () => { live = false; };
  }, []);
  return state;
}

function OrderInput({ entry, editable, isDark, testid, about, onWrite }) {
  const stored = has(entry, "order") && Number.isSafeInteger(entry.order) && typeof entry.order === "number" ? String(entry.order) : "";
  /* Held against the row's identity, not its position (R-HP-04). */
  const pending = usePendingText(stored, about);
  const text = pending.text !== null ? pending.text : stored;
  const check = (value) => {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return { ok: false, problem: "Enter a whole number from 0 to 1,000,000." };
    const number = Number(trimmed);
    return number <= MAX_ORDER ? { ok: true, value: number } : { ok: false, problem: "Enter a whole number from 0 to 1,000,000." };
  };
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Input
        value={text}
        disabled={!editable}
        placeholder={has(entry, "order") && !stored ? `stored: ${raw(entry.order)}` : "0 … 1,000,000"}
        set_value={(next) => {
          const parsed = check(next);
          if (!parsed.ok) {
            pending.hold(next);
            return;
          }
          pending.release();
          onWrite(parsed.value);
        }}
        style={{ ...FIELD, width: 140, ...MONO }}
      />
      {pending.text !== null && <span data-testid={`${testid}-problem`} style={problem_style(isDark)}>{check(pending.text).problem} Nothing is stored until it is one.</span>}
    </span>
  );
}

function IdInput({ entry, editable, isDark, testid, about, onWrite }) {
  const stored = has(entry, "id") && typeof entry.id === "string" ? entry.id : "";
  const pending = usePendingText(stored, about);
  const text = pending.text !== null ? pending.text : stored;
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Input
        value={text}
        disabled={!editable}
        placeholder={has(entry, "id") && typeof entry.id !== "string" ? `stored: ${raw(entry.id)}` : "hook id"}
        set_value={(next) => {
          if (next.trim() === "") {
            pending.hold(next);
            return;
          }
          pending.release();
          onWrite(next);
        }}
        style={{ ...FIELD, width: 180, ...MONO }}
      />
      {pending.text !== null && <span data-testid={`${testid}-problem`} style={problem_style(isDark)}>A hook needs an id. Nothing is stored until it has one.</span>}
    </span>
  );
}

function HookEditor({ entry, index, rowId, nodeId, parentId, siblings, scopeDuplicates, toolNames, capability, toolSetCapability, workflowCapability, managedSources, onOpenEmbedded, editable, isDark, write, writeEnabled, remove }) {
  const set = (key, value) => write({ ...entry, [key]: value });
  const stored_kind = tool_matcher_kind(entry);
  const sets_ok = tool_set_supported(toolSetCapability);
  const tool_mode = stored_kind === "every" ? "every" : stored_kind === "one" ? "one" : stored_kind === "set" && sets_ok ? "set" : null;
  const [toolMode, setToolMode] = useState(tool_mode);
  useEffect(() => {
    if (tool_mode) setToolMode(tool_mode);
  }, [tool_mode]);
  const pin = hook_pin(entry);
  const version = pin ? cached_workflow_version(pin.workflow_id, pin.revision_id) : null;
  const own = hook_embedded(entry);
  const shape = record(own) ? hook_workflow_shape(own) : version ? hook_workflow_shape(version.document) : null;
  const event_ok = HOOK_EVENTS.includes(entry.event);
  const problems = hook_entry_problems(entry, { siblings, scope_duplicates: scopeDuplicates, capability, toolSetCapability, workflowCapability });
  /* A set held here only while it is empty: removing the last tool writes
     nothing, it never quietly becomes "every tool". */
  const [setHeld, setSetHeld] = useState(null);
  const stored_set = Array.isArray(entry.tool_name) ? entry.tool_name : null;
  const stored_set_clean = stored_set && stored_set.length > 0 && stored_set.every((name) => typeof name === "string") &&
    new Set(stored_set).size === stored_set.length && problems.every((p) => !p.code.startsWith("tool_set_"));
  /* What the set picker starts from: a clean stored set as stored; a valid
     single stored name (the runtime's rule, so "\ufeff" counts and "\x85"
     does not) as a one-name set, shown and not written; anything else, empty,
     so a pick replaces it. */
  const set_value = setHeld !== null ? setHeld : stored_set_clean ? stored_set : stored_kind === "one" && tool_name_ok(entry.tool_name) ? [entry.tool_name] : [];
  const set_options = [
    ...set_value.filter((name) => !toolNames.names.includes(name)).map((name) => ({ value: name, label: `${safe_text(name)} (not in the tool library now)` })),
    ...toolNames.names.map((name) => ({ value: name, label: name })),
  ];
  const supported = enable_supported(capability);
  /* `enabled` is the on/off control's once the contract is known; before
     that, and on a runtime without it, a stored value is shown as stored. */
  const extras = Object.keys(entry).filter((key) => !HOOK_KEYS.includes(key) && !(supported && key === "enabled"));
  const runs = !has(entry, "enabled") || entry.enabled === true ? "on" : entry.enabled === false ? "off" : null;
  const stored_tool = typeof entry.tool_name === "string" ? entry.tool_name : null;
  const tool_options = [
    ...(stored_tool && !toolNames.names.includes(stored_tool) ? [{ value: stored_tool, label: `${safe_text(stored_tool)} (not in the tool library now)` }] : []),
    ...toolNames.names.map((name) => ({ value: name, label: name })),
  ];
  const testid = `hook-${index}`;

  return (
    <div data-testid={`${testid}-editor`} style={{ display: "flex", flexDirection: "column", gap: 10, padding: "8px 10px", borderRadius: 7, background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" }}>
      <div style={ROW}>
        <span style={{ ...NOTE, width: 64, flexShrink: 0 }}>Id</span>
        <IdInput entry={entry} editable={editable} isDark={isDark} testid={`${testid}-id`} about={`${rowId}:id`} onWrite={(value) => set("id", value)} />
      </div>
      <div style={ROW}>
        <span style={{ ...NOTE, width: 64, flexShrink: 0 }}>Order</span>
        <OrderInput entry={entry} editable={editable} isDark={isDark} testid={`${testid}-order`} about={`${rowId}:order`} onWrite={(value) => set("order", value)} />
        <span style={NOTE}>lower runs first; ties by id</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={LABEL}>When</span>
        <span data-testid={`${testid}-event`}>
          <Select
            options={[
              ...(has(entry, "event") && !event_ok ? [{ value: "\u0000stored", label: `stored: ${safe_text(raw(entry.event))}` }] : []),
              ...HOOK_EVENTS.map((event) => ({ value: event, label: EVENT_LABEL[event] })),
            ]}
            value={event_ok ? entry.event : has(entry, "event") ? "\u0000stored" : null}
            set_value={(value) => {
              if (HOOK_EVENTS.includes(value) && value !== entry.event) set("event", value);
            }}
            filterable={false}
            placeholder="choose when it runs"
            disabled={!editable}
            style={FIELD}
          />
        </span>
      </div>
      <div data-testid={`${testid}-tool`} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={LABEL}>Tool calls it sees</span>
        <span style={{ opacity: editable ? 1 : 0.5, pointerEvents: editable ? "auto" : "none" }}>
          <SegmentedControl
            size="compact"
            isDark={isDark}
            buttonFontWeight={500}
            sections={[{ key: "every", label: "Every tool" }, { key: "one", label: "One tool" }, ...(sets_ok ? [{ key: "set", label: "A set of tools" }] : [])]}
            selected={toolMode}
            onChange={(next) => {
              setToolMode(next);
              setSetHeld(null);
              if (next === "every" && entry.tool_name !== null) set("tool_name", null);
            }}
          />
        </span>
        {toolMode === "one" && (
          <span data-testid={`${testid}-tool-picker`}>
            <Select
              options={tool_options}
              value={stored_tool !== null && tool_name_ok(stored_tool) ? stored_tool : null}
              set_value={(value) => {
                if (typeof value === "string" && value && value !== entry.tool_name) set("tool_name", value);
              }}
              filterable
              placeholder={toolNames.status === "loading" ? "reading the tool library…" : "the tool's exact name"}
              disabled={!editable}
              style={FIELD}
            />
          </span>
        )}
        {toolMode === "set" && sets_ok && (
          <span data-testid={`${testid}-tool-set-picker`}>
            <Select
              multi
              options={set_options}
              value={set_value}
              set_value={(next) => {
                if (!Array.isArray(next)) return;
                if (next.length === 0) {
                  setSetHeld([]);
                  return;
                }
                setSetHeld(null);
                if (JSON.stringify(next) !== JSON.stringify(entry.tool_name)) set("tool_name", next);
              }}
              multi_label={(count) => `${count} tool${count === 1 ? "" : "s"}`}
              filterable
              placeholder={toolNames.status === "loading" ? "reading the tool library…" : "pick the tools"}
              disabled={!editable}
              style={FIELD}
            />
          </span>
        )}
        {toolMode === "set" && sets_ok && setHeld !== null && setHeld.length === 0 && (
          <span data-testid={`${testid}-tool-set-held`} style={problem_style(isDark)}>A set needs at least one tool. Nothing is stored until you pick one; choose Every tool to match every call.</span>
        )}
        {toolMode === "set" && sets_ok && set_value.length > 0 && (
          <span data-testid={`${testid}-tool-set-names`} style={NOTE}>
            Matches exactly: <span style={MONO}>{set_value.map((name) => safe_text(name)).join(", ")}</span>.
            {set_value.filter((name) => !toolNames.names.includes(name)).map((name) => ` “${safe_text(name)}” is not in the tool library now; it is kept as stored.`).join("")}
            {stored_kind === "one" && setHeld === null ? " Nothing is stored as a set until you change the picks." : ""}
          </span>
        )}
        {has(entry, "tool_name") && entry.tool_name !== null && typeof entry.tool_name !== "string" && !(stored_set_clean && sets_ok) && (
          <span data-testid={`${testid}-tool-stored`} style={problem_style(isDark)}>Stored: <span style={MONO}>{safe_text(raw(entry.tool_name))}</span>. {sets_ok ? "Choose every tool, one by name or a set to replace it." : "Choose every tool or one by name to replace it."}</span>
        )}
        {!sets_ok && (
          <span data-testid={`${testid}-tool-set-note`} style={NOTE}>
            {toolSetCapability.status === "loading" ? "Checking whether this runtime takes a set of tools…" : `A set of tools is not offered: this runtime has not confirmed it reads one${toolSetCapability.reason ? ` (${safe_text(toolSetCapability.reason)})` : ""}.`}
          </span>
        )}
        <span style={NOTE}>A named tool matches only a call to exactly that name.</span>
      </div>
      <div data-testid={`${testid}-runs`} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={LABEL}>Runs</span>
        <span style={{ opacity: editable && supported ? 1 : 0.5, pointerEvents: editable && supported ? "auto" : "none" }}>
          <SegmentedControl
            size="compact"
            isDark={isDark}
            buttonFontWeight={500}
            sections={[{ key: "on", label: "On" }, { key: "off", label: "Off" }]}
            selected={supported ? runs : null}
            onChange={(next) => {
              if (!editable || !supported) return;
              /* A missing setting already runs: choosing On writes nothing. */
              if (next === "on" && !has(entry, "enabled")) return;
              if ((next === "on") !== entry.enabled || typeof entry.enabled !== "boolean") writeEnabled(next === "on");
            }}
          />
        </span>
        {supported && has(entry, "enabled") && typeof entry.enabled !== "boolean" && (
          <span style={problem_style(isDark)}>Stored: <span style={MONO}>{safe_text(raw(entry.enabled))}</span>. Choose on or off to replace it.</span>
        )}
        <span data-testid={`${testid}-runs-note`} style={NOTE}>
          {capability.status === "loading"
            ? "Checking whether this runtime can turn hooks off…"
            : !supported
              ? `This runtime has not confirmed it can turn hooks off${capability.reason ? ` (${safe_text(capability.reason)})` : ""}; nothing is changed here.`
              : !has(entry, "enabled")
                ? "On: a hook without this setting runs. Nothing is stored until you turn it off."
                : "An off hook stays saved here but is not run and needs no Workflow at run time."}
        </span>
      </div>
      <div data-testid={`${testid}-approval`} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={LABEL}>Approval</span>
        <span style={{ opacity: editable ? 1 : 0.5, pointerEvents: editable ? "auto" : "none" }}>
          <SegmentedControl
            size="compact"
            isDark={isDark}
            buttonFontWeight={500}
            sections={[{ key: "ask", label: "Always ask" }, { key: "decide", label: "Let the Workflow decide" }]}
            selected={entry.force_approval === true ? "ask" : entry.force_approval === false ? "decide" : null}
            onChange={(next) => set("force_approval", next === "ask")}
          />
        </span>
        {has(entry, "force_approval") && typeof entry.force_approval !== "boolean" && (
          <span style={problem_style(isDark)}>Stored: <span style={MONO}>{safe_text(raw(entry.force_approval))}</span>. Choose one to replace it.</span>
        )}
        <span style={NOTE}>Always ask adds an approval to every call this hook sees, whatever its Workflow returns.</span>
      </div>
      <HookWorkflowSource
        entry={entry}
        index={index}
        nodeId={nodeId}
        parentId={parentId}
        pin={pin}
        editable={editable}
        isDark={isDark}
        testid={testid}
        capability={workflowCapability}
        managedSources={managedSources}
        onWrite={(workflow) => set("workflow", workflow)}
        onOpen={onOpenEmbedded}
      />
      <div data-testid={`${testid}-contract`} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={LABEL}>What it is given and returns</span>
        {event_ok ? (
          <>
            <span style={NOTE}>Its Start is given <span style={MONO}>{EVENT_INPUT_KEYS[entry.event].join(", ")}</span>.</span>
            <span style={NOTE}>
              Its End's exports are the decision: {DECISION_SHAPES[entry.event].map((item) => `${item.label} — ${item.keys.join(", ")}`).join("; ")}.
              {entry.event === "before_tool_call"
                ? " Any other answer blocks the tool call (hook_<code>)."
                : " Any other answer is an error for the Agent step (hook_invalid_decision). After a replace, later hooks are given an empty raw_result."}
            </span>
            {shape && shape.readable && (
              <span data-testid={`${testid}-exports`} style={NOTE}>{record(own) ? "Its own Workflow's" : "The pinned revision's"} End exports <span style={MONO}>{shape.exports.join(", ") || "nothing"}</span>.</span>
            )}
          </>
        ) : (
          <span style={NOTE}>Choose when it runs to see what it is given and must return.</span>
        )}
      </div>
      {extras.map((key) => (
        <div key={key} data-testid={`${testid}-extra-${key}`} style={{ ...ROW, justifyContent: "space-between" }}>
          <span style={problem_style(isDark)}><span style={MONO}>{safe_text(key)}</span> · <span style={MONO}>{safe_text(raw(entry[key]))}</span> is stored; {key === "enabled" ? "this runtime has not confirmed it reads it." : "the runtime does not read it."}</span>
          <Button
            label="Remove"
            ariaLabel={`Remove stored setting ${key}`}
            disabled={!editable}
            onClick={() => {
              const next = { ...entry };
              delete next[key];
              write(next);
            }}
            style={SMALL}
          />
        </div>
      ))}
      {problems.length > 0 && (
        <div data-testid={`${testid}-problems`} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {problems.map((problem, at) => <span key={`${problem.code}-${at}`} style={problem_style(isDark)}>{problem.message}</span>)}
        </div>
      )}
      <span>
        <Button label="Remove this hook" ariaLabel={`Remove hook ${safe_text(raw(entry.id))}`} disabled={!editable} onClick={remove} style={{ ...SMALL, opacity: 0.8 }} />
      </span>
    </div>
  );
}

export default function HooksPoolSection({ document, node, isDark, onChange, managedSources, onOpenEmbeddedHook }) {
  const list = hooks_list(node);
  const entries = Array.isArray(list) ? list : [];
  const toolNames = useToolNames();
  const capability = useHookCapability();
  const toolSetCapability = useToolSetCapability();
  const workflowCapability = useHookWorkflowCapability();
  const [moveProblem, setMoveProblem] = useState(null);
  const [dragging, setDragging] = useState(null);
  useWorkflowVersions(entries.map((entry) => hook_pin(entry)).filter(Boolean));
  const unique = Array.isArray(document && document.nodes) && document.nodes.filter((item) => item && item.id === node.id).length === 1;
  const editable = unique && document.kind === "agent" && document.schema_version === 1 && typeof onChange === "function";
  /* Pins answer later than the click; they write against the document as it
     is then (see WorkflowPinControl). */
  const latest = useRef({ document, onChange });
  latest.current = { document, onChange };
  /* One identity per stored row, carried across this editor's own writes and
     dropped for a version from anywhere else (R-HP-04): the open editor and
     any held text belong to the row, not to its position or its editable id. */
  const rows = useListIdentities(node.id, entries.length, list);
  const commit = (next) => {
    if (!editable || next === latest.current.document) return;
    const pool = Array.isArray(next && next.nodes) ? next.nodes.find((item) => item && item.id === node.id) : null;
    rows.carrying(pool ? hooks_list(pool) : undefined);
    latest.current.onChange(next);
  };
  const [open, setOpen] = useState(null);
  /* The row just added opens; its identity exists from the render that
     shows it. */
  const [openLast, setOpenLast] = useState(false);
  const last_id = rows.ids.length ? rows.ids[rows.ids.length - 1] : null;
  useEffect(() => {
    if (openLast && last_id) {
      setOpen(last_id);
      setOpenLast(false);
    }
  }, [openLast, last_id]);
  const open_index = openLast ? entries.length - 1 : open === null ? -1 : rows.ids.indexOf(open);
  const pool_extras = record(node.config) ? Object.keys(node.config).filter((key) => key !== "hooks") : [];
  const scopeDuplicates = scope_duplicate_ids(document, node.id);
  const agents = attached_agents(document, node.id);
  const problems = pool_problems(node, document);

  const row_label = (entry) => {
    if (!record(entry)) return { title: raw(entry), detail: "not an entry" };
    const pin = hook_pin(entry);
    const version = pin ? cached_workflow_version(pin.workflow_id, pin.revision_id) : null;
    const when = entry.event === "before_tool_call" ? "before" : entry.event === "after_tool_call" ? "after" : "?";
    const tool = !has(entry, "tool_name") ? "?" : entry.tool_name === null ? "every tool" : typeof entry.tool_name === "string" ? entry.tool_name
      : Array.isArray(entry.tool_name) && entry.tool_name.length > 0 && entry.tool_name.every((name) => typeof name === "string") ? `tools: ${entry.tool_name.join(", ")}` : "?";
    const own = hook_embedded(entry);
    const workflow = record(own) ? `its own Workflow${typeof own.name === "string" && own.name ? ` · ${own.name}` : ""}` : version ? `${version.document.name || pin.workflow_id} · rev ${version.ordinal}` : pin ? `${pin.workflow_id} · ${pin.revision_id}` : "no Workflow";
    return { title: typeof entry.id === "string" && entry.id ? entry.id : "(no id)", detail: `${when} · ${tool} · ${workflow}${entry.force_approval === true ? " · always asks" : ""}${hook_runs(entry) ? "" : " · off"}` };
  };

  return (
    <section data-testid="hooks-pool-section" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {!editable && (
        <div style={problem_style(isDark)}>{!unique ? "Duplicate node ids prevent editing this pool." : "These stored settings are read-only here."}</div>
      )}
      {!Array.isArray(list) && (
        <div data-testid="hooks-pool-stored-invalid" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={problem_style(isDark)}>Stored hooks: <span style={MONO}>{safe_text(raw(list))}</span></span>
          <span>
            <Button label="Start a new list" ariaLabel="Replace the stored hooks with an empty list" disabled={!editable} onClick={() => commit(with_hooks(latest.current.document, node.id, []))} style={SMALL} />
          </span>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ ...ROW, justifyContent: "space-between" }}>
          <span style={LABEL}>Hooks</span>
          {Array.isArray(list) && (
            <Button
              label="+ Add hook"
              disabled={!editable}
              onClick={() => {
                /* Free across every pool on the same Agent, which is the
                   scope the run's admission refuses a repeat in (R-HP-02). */
                const taken = scope_hook_ids(latest.current.document, node.id);
                rows.added();
                commit(with_hooks(latest.current.document, node.id, [...entries, { id: free_hook_id(taken) }]));
                setOpenLast(true);
              }}
              style={{ fontSize: 11, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 5, color: "var(--pupu-accent)" }}
            />
          )}
        </div>
        {entries.map((entry, index) => {
          const rowId = rows.ids[index];
          const label = row_label(entry);
          const count = hook_entry_problems(entry, { siblings: entries, scope_duplicates: scopeDuplicates, capability, toolSetCapability, workflowCapability }).length;
          return (
            <div key={rowId} data-testid={`hook-row-${index}`} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ ...ROW, justifyContent: "space-between" }}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ ...MONO, fontSize: 11.5 }}>{safe_text(label.title)}</span>
                  <span style={{ ...NOTE, marginLeft: 6 }}>{safe_text(label.detail)}</span>
                  {count > 0 && <span style={{ ...problem_style(isDark), marginLeft: 6 }}>{count} to fix</span>}
                </span>
                {record(entry) ? (
                  <Button label={open_index === index ? "Close" : "Edit"} ariaLabel={`${open_index === index ? "Close" : "Edit"} hook ${index + 1}`} onClick={() => setOpen(open_index === index ? null : rowId)} style={SMALL} />
                ) : (
                  <Button
                    label="Remove"
                    ariaLabel={`Remove stored entry ${index + 1}`}
                    disabled={!editable}
                    onClick={() => {
                      rows.removed(index);
                      commit(remove_hook(latest.current.document, node.id, index));
                    }}
                    style={SMALL}
                  />
                )}
              </div>
              {!record(entry) && <span style={problem_style(isDark)}>{hook_entry_problems(entry)[0].message}</span>}
              {record(entry) && open_index === index && (
                <HookEditor
                  entry={entry}
                  index={index}
                  rowId={rowId}
                  siblings={entries}
                  scopeDuplicates={scopeDuplicates}
                  toolNames={toolNames}
                  nodeId={node.id}
                  parentId={document && document.id}
                  capability={capability}
                  toolSetCapability={toolSetCapability}
                  workflowCapability={workflowCapability}
                  managedSources={managedSources}
                  onOpenEmbedded={onOpenEmbeddedHook}
                  editable={editable}
                  isDark={isDark}
                  write={(next) => {
                    const now = latest.current.document;
                    const current = now.nodes.find((item) => item && item.id === node.id);
                    const now_list = hooks_list(current);
                    /* Against the list as it is now: an answer may land after
                       another edit to this pool. */
                    if (!Array.isArray(now_list) || index >= now_list.length) return;
                    commit(with_hook(now, node.id, index, next));
                  }}
                  writeEnabled={(enabled) => {
                    const now = latest.current.document;
                    const current = now.nodes.find((item) => item && item.id === node.id);
                    const now_list = hooks_list(current);
                    if (!Array.isArray(now_list) || index >= now_list.length) return;
                    commit(with_hook_enabled(now, node.id, index, enabled));
                  }}
                  remove={() => {
                    setOpen(null);
                    rows.removed(index);
                    commit(remove_hook(latest.current.document, node.id, index));
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      <Divider isDark={isDark} />

      <div data-testid="hooks-pool-order" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={LABEL}>Run order</span>
        {agents.length === 0 && <span style={NOTE}>Not attached to an Agent, so nothing runs.</span>}
        {agents.map((agent_id) => {
          const order = kernel_hook_order(document, agent_id);
          const scope = hook_scope_entries(document, agent_id);
          const move = (index, position) => {
            const result = move_hook(latest.current.document, node.id, agent_id, index, position);
            setMoveProblem(result.ok ? null : { agent_id, message: result.problem.message });
            if (result.ok) commit(result.document);
          };
          /* Where a hook lands, counted in the scope without it. */
          const landing = (index, target) => {
            const rest = scope.filter((item) => !(item.pool_id === node.id && item.index === index));
            return target === null ? rest.length : rest.findIndex((item) => item === target);
          };
          return (
            <div key={agent_id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span data-testid={`hooks-pool-order-${agent_id}`} style={NOTE}>
                On <span style={MONO}>{safe_text(agent_id)}</span>, every attached pool's hooks that are on run by order, then id: {order.length ? order.map((item) => `${safe_text(item.id)}${item.pool_id !== node.id ? ` (${safe_text(item.pool_id)})` : ""}`).join(" → ") : "none yet"}.
              </span>
              <div data-testid={`hooks-run-list-${agent_id}`} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {scope.map((item, position) => {
                  const own = item.pool_id === node.id;
                  const can = own && editable;
                  return (
                    <div
                      key={`${item.pool_id}\u0000${item.index}`}
                      data-testid={`hooks-run-row-${agent_id}-${item.pool_id}-${item.id}`}
                      draggable={can}
                      onDragStart={can ? (event) => {
                        setDragging({ agent_id, index: item.index });
                        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
                      } : undefined}
                      onDragEnd={() => setDragging(null)}
                      onDragOver={editable && dragging && dragging.agent_id === agent_id ? (event) => event.preventDefault() : undefined}
                      onDrop={editable && dragging && dragging.agent_id === agent_id ? (event) => {
                        event.preventDefault();
                        const from = dragging.index;
                        setDragging(null);
                        /* Dropped back on itself: nothing moves, nothing is written. */
                        if (own && item.index === from) return;
                        move(from, landing(from, item));
                      } : undefined}
                      style={{ ...ROW, justifyContent: "space-between", padding: "2px 6px", borderRadius: 5, cursor: can ? "grab" : "default", opacity: item.runs ? 1 : 0.55 }}
                    >
                      <span style={{ ...NOTE, minWidth: 0 }}>
                        <span style={MONO}>{safe_text(item.id)}</span> · order {item.order}{own ? "" : ` · ${safe_text(item.pool_id)}`}{item.runs ? "" : " · off, not run"}
                      </span>
                      {own && (
                        <span style={ROW}>
                          <Button label="↑" ariaLabel={`Move ${safe_text(item.id)} earlier on ${safe_text(agent_id)}`} disabled={!editable || position === 0} onClick={() => move(item.index, position - 1)} style={SMALL} />
                          <Button label="↓" ariaLabel={`Move ${safe_text(item.id)} later on ${safe_text(agent_id)}`} disabled={!editable || position === scope.length - 1} onClick={() => move(item.index, position + 1)} style={SMALL} />
                        </span>
                      )}
                    </div>
                  );
                })}
                {scope.length > 0 && (
                  <div
                    data-testid={`hooks-run-end-${agent_id}`}
                    onDragOver={editable && dragging && dragging.agent_id === agent_id ? (event) => event.preventDefault() : undefined}
                    onDrop={editable && dragging && dragging.agent_id === agent_id ? (event) => {
                      event.preventDefault();
                      const from = dragging.index;
                      setDragging(null);
                      move(from, landing(from, null));
                    } : undefined}
                    style={{ height: 10 }}
                  />
                )}
              </div>
              {moveProblem && moveProblem.agent_id === agent_id && (
                <span data-testid={`hooks-run-problem-${agent_id}`} style={problem_style(isDark)}>{moveProblem.message}</span>
              )}
            </div>
          );
        })}
        <span style={NOTE}>Drag one of this pool's hooks, or use its arrows, to change when it runs: that writes its order. Where the pools are attached does not matter. A hook that is on is never skipped. A before hook that answers wrongly blocks the call; a hook whose Workflow does not complete, or an after hook that answers wrongly, is an error for the Agent step.</span>
      </div>

      {pool_extras.map((key) => (
        <div key={key} data-testid={`hooks-pool-extra-${key}`} style={{ ...ROW, justifyContent: "space-between" }}>
          <span style={problem_style(isDark)}><span style={MONO}>{safe_text(key)}</span> · <span style={MONO}>{safe_text(raw(node.config[key]))}</span> is stored on the pool; the runtime does not read it.</span>
          <Button
            label="Remove"
            ariaLabel={`Remove pool setting ${key}`}
            disabled={!editable}
            onClick={() => commit(without_pool_setting(latest.current.document, node.id, key))}
            style={SMALL}
          />
        </div>
      ))}
      {problems.length > 0 && (
        <div data-testid="hooks-pool-problems" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {problems.map((problem, at) => <span key={`${problem.code}-${at}`} style={problem_style(isDark)}>{problem.message}</span>)}
        </div>
      )}
    </section>
  );
}
