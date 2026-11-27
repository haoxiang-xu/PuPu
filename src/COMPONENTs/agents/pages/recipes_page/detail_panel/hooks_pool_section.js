import { agentMessage, renderAgentMessage } from "../agents_i18n";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import React, { useEffect, useRef, useState } from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import Input from "./panel_input";
import Select from "./panel_select";
import { api } from "../../../../../SERVICEs/api";
import usePendingText from "./pending_text";
import useListIdentities from "./list_identity";
import HookWorkflowSource, { useHookWorkflowCapability } from "./hook_workflow_source";
import PanelHelp from "./panel_help";
import ToolPicker, { TOOL_KEY, tool_value, useToolLibrary } from "./tool_picker";
import { RowSwitch } from "./workflow_parameters_section";
import { safe_text } from "../document_values";
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
import { Block } from "./process_timeline";
import { addButtonStyle, CONTROL_RADIUS, fillStrong, hairline, muted, note, problem as problemOf, Region, text as textColor } from "./panel_style";

/* A Hooks Pool (#357, #484): the hooks one Agent runs around its tool calls.
 * Every rule is the fixed runtime's (see `hooks_pool_config`):
 *
 *   - each hook is an id, an order, an event (before or after the tool call),
 *     a tool matcher (every tool, one tool's exact name, or — where the host
 *     says the runtime reads one — a set of names), one Workflow, whether it
 *     always asks for approval and — only where the host's Hook contract says
 *     the runtime reads it — whether it is on. It fails closed;
 *   - the run calls every hook that is on of every pool attached to the
 *     Agent, by (order, id). The list draws this pool's hooks in that order,
 *     so top to bottom IS the run order: dragging a hook (or Move earlier /
 *     later) writes its `order` — and, only if needed, its own pool's other
 *     orders — never the position in the stored list;
 *   - a hook is one line (its id, when and which tools, what is wrong, and its
 *     switch); opened, one region of label / control rows;
 *   - a new hook carries its id, the order that puts it last, and Always ask
 *     off; every other key is the author's choice. A stored value the runtime
 *     refuses is shown as stored, with what is wrong. */

const MONO = { fontFamily: "ui-monospace, Menlo, monospace" };
const ROW = { display: "flex", alignItems: "center", gap: 6 };
const FIELD = { width: "100%", fontSize: 12, paddingVertical: 4, paddingHorizontal: 6 };
const ELLIPSIS = { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const small = (isDark) => ({ ...addButtonStyle(isDark), alignSelf: "auto" });
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const has = (value, key) => record(value) && Object.prototype.hasOwnProperty.call(value, key);
/* "Every tool", offered first in the tool picker. */
const EVERY = `*${TOOL_KEY}every`;
const raw = (value) => {
  try {
    const text = JSON.stringify(value);
    return text === undefined ? String(value) : text;
  } catch (_error) {
    return "(unreadable)";
  }
};

/* The Hook contract of the runtime this host runs, read once per panel. Until
   it answers, and when it cannot, nothing about on/off is guessed. */
function useHookCapability() {
  const [state, setState] = useState({ status: "loading" });
  useEffect(() => {
    let live = true;
    const read = api?.unchain?.getSkeletonHookCapabilities;
    if (typeof read !== "function") {
      setState({ status: "unavailable", reason: agentMessage("agents.hooks.no_hook_contract") });
      return undefined;
    }
    read().then(
      (value) => { if (live) setState({ status: "ready", contract: value.hook_entry }); },
      (error) => { if (live) setState({ status: "unavailable", reason: error?.code || error?.message ? safe_text(error?.code || error?.message) : agentMessage("agents.hooks.host_no_answer") }); },
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
      setState({ status: "unavailable", reason: agentMessage("agents.hooks.no_tool_set_contract") });
      return undefined;
    }
    read().then(
      (value) => { if (live) setState({ status: "ready", contract: value.tool_matcher }); },
      (error) => { if (live) setState({ status: "unavailable", reason: error?.code || error?.message ? safe_text(error?.code || error?.message) : agentMessage("agents.hooks.host_no_answer") }); },
    );
    return () => { live = false; };
  }, []);
  return state;
}

function IdInput({ entry, editable, isDark, testid, about, onWrite }) {
  const { t } = useTranslation();
  const stored = has(entry, "id") && typeof entry.id === "string" ? entry.id : "";
  const pending = usePendingText(stored, about);
  const text = pending.text !== null ? pending.text : stored;
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-end" }}>
      <Input
        value={text}
        disabled={!editable}
        placeholder={has(entry, "id") && typeof entry.id !== "string" ? t("agents.hooks.stored_placeholder", { value: raw(entry.id) }) : t("agents.hooks.hook_id_placeholder")}
        set_value={(next) => {
          if (next.trim() === "") {
            pending.hold(next);
            return;
          }
          pending.release();
          onWrite(next);
        }}
        style={{ ...FIELD, width: 170, ...MONO }}
      />
      {pending.text !== null && <span data-testid={`${testid}-problem`} style={problemOf(isDark)}>{t("agents.hooks.id_pending")}</span>}
    </span>
  );
}

/* One tool of a hook's matcher, removable. */
function ToolChip({ label, isDark, editable, removeLabel, onRemove, testid }) {
  return (
    <span data-testid={testid} style={{ display: "inline-flex", alignItems: "center", gap: 2, height: 22, padding: "0 2px 0 8px",
      borderRadius: CONTROL_RADIUS, background: fillStrong(isDark), fontSize: 11.5, color: textColor(isDark), ...MONO, maxWidth: "100%" }}>
      <span style={ELLIPSIS}>{label}</span>
      <Button prefix_icon="close" ariaLabel={removeLabel} disabled={!editable} onClick={onRemove}
        style={{ width: 18, height: 18, borderRadius: CONTROL_RADIUS, backgroundColor: "transparent", color: muted(isDark), opacity: 0.75,
          iconOnlyPaddingVertical: 0, iconOnlyPaddingHorizontal: 0, content: { icon: { width: 10, height: 10 } } }} />
    </span>
  );
}

/* Which calls the hook sees: every tool, or the tools picked (one, or — on a
   runtime that reads one — a set). The tools are picked in the Tool Call's
   explorer; a set is its chips. Removing the last tool writes nothing — it
   never quietly becomes "every tool"; Every tool is chosen in the picker. */
function ToolsControl({ entry, library, toolSetCapability, editable, isDark, testid, set }) {
  const { t } = useTranslation();
  const sets_ok = tool_set_supported(toolSetCapability);
  const kind = tool_matcher_kind(entry);
  const [held, setHeld] = useState(null);
  useEffect(() => { setHeld(null); }, [entry.tool_name]);
  /* A set is shown as its chips only when it is one the runtime takes:
     some names, each a tool name, none twice. Anything else is shown as
     stored, and the first pick replaces it. */
  const stored_set = Array.isArray(entry.tool_name) ? entry.tool_name : null;
  const clean_set = Boolean(stored_set) && stored_set.length > 0 && stored_set.every((name) => tool_name_ok(name)) && new Set(stored_set).size === stored_set.length;
  const stored = kind === "one" && tool_name_ok(entry.tool_name) ? [entry.tool_name]
    : clean_set && sets_ok ? stored_set
      : [];
  const names = held !== null ? held : stored;
  const every = held === null && entry.tool_name === null;
  const value_of = (name) => tool_value(library, name) || `${TOOL_KEY}${name}`;
  const unlisted = names.filter((name) => !tool_value(library, name)).map((name) => ({ value: `${TOOL_KEY}${name}`, label: t("agents.hooks.tool_unlisted", { name: safe_text(name) }) }));
  const pinned = [{ value: EVERY, label: t("agents.hooks.every_tool"), icon: "tool" }, ...unlisted];
  const pick = (value) => {
    if (value === EVERY) {
      setHeld(null);
      if (entry.tool_name !== null) set("tool_name", null);
      return;
    }
    const name = String(value).split(TOOL_KEY)[1];
    if (!name) return;
    /* Where the runtime reads a set, picks are a set — one tool is a set of
       one; elsewhere a pick is the one tool's exact name. */
    if (!sets_ok) {
      setHeld(null);
      if (entry.tool_name !== name) set("tool_name", name);
      return;
    }
    if (names.includes(name)) return;
    setHeld(null);
    set("tool_name", [...names, name]);
  };
  const remove = (name) => {
    const rest = names.filter((item) => item !== name);
    if (rest.length === 0) {
      setHeld([]);
      return;
    }
    setHeld(null);
    set("tool_name", rest.length === 1 && !Array.isArray(entry.tool_name) ? rest[0] : rest);
  };
  const title = (name) => {
    const found = (library.rows || []).flatMap((kit) => kit.tools).find((item) => item.name === name);
    return found ? found.title || name : library.status === "ready" ? t("agents.hooks.tool_unlisted", { name: safe_text(name) }) : name;
  };
  const show_chips = sets_ok && names.length > 0;
  return (
    <div data-testid={`${testid}-tool`} style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flex: "0 1 200px", minWidth: 0, maxWidth: "100%" }}>
      {show_chips && (
        <span data-testid={`${testid}-tool-set-names`} style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 4, minWidth: 0 }}>
          {names.map((name) => (
            <ToolChip key={name} label={title(name)} isDark={isDark} editable={editable} testid={`${testid}-tool-chip-${name}`}
              removeLabel={t("agents.hooks.remove_tool", { name: safe_text(name) })} onRemove={() => remove(name)} />
          ))}
        </span>
      )}
      <span data-testid={`${testid}-tool-picker`} style={{ display: "inline-flex", width: "100%", minWidth: 0 }}>
        <ToolPicker library={library} isDark={isDark} editable={editable} pinned={pinned}
          value={show_chips ? null : every ? EVERY : names.length === 1 ? value_of(names[0]) : null}
          placeholder={library.status === "loading" ? t("agents.execution.tool.reading_library") : show_chips ? t("agents.hooks.add_tool") : t("agents.hooks.pick_tools")}
          onPick={pick} />
      </span>
      {held !== null && held.length === 0 && (
        <span data-testid={`${testid}-tool-set-held`} style={problemOf(isDark)}>{t("agents.hooks.set_pending")}</span>
      )}
      {/* What is stored and not taken as it is: shown as stored; why is said
          with the hook's other problems. */}
      {has(entry, "tool_name") && entry.tool_name !== null && typeof entry.tool_name !== "string" && !(clean_set && sets_ok) && (
        <span data-testid={`${testid}-tool-stored`} style={problemOf(isDark)}>
          {t(sets_ok ? "agents.hooks.stored_set" : "agents.hooks.stored_single", { value: "{value}" }).split(/(\{value\})/g).map((part, index) => ({ __proto__: null, "{value}": (<span key={index} style={MONO}>{safe_text(raw(entry.tool_name))}</span>) }[part] ?? part))}
        </span>
      )}
    </div>
  );
}

/* One row of an open hook: what it is on the left, its control on the right. */
function HookRow({ label, isDark, testid, children, help, stack }) {
  return (
    <div data-testid={testid} style={{ borderTop: `1px solid ${hairline(isDark)}`, padding: "5px 6px 5px 10px",
      display: "flex", flexDirection: stack ? "column" : "row", alignItems: stack ? "stretch" : "center", gap: stack ? 6 : 8, minWidth: 0 }}>
      {stack ? (
        <span style={{ ...ROW, minHeight: 26, fontSize: 12.5, color: isDark ? "#c9c9cf" : "#3a3a40" }}>{label}{help}</span>
      ) : (
        <span style={{ flex: "1 0 auto", ...ROW, minWidth: 0, fontSize: 12.5, lineHeight: "18px", color: isDark ? "#c9c9cf" : "#3a3a40", minHeight: 30 }}>{label}{help}</span>
      )}
      {children}
    </div>
  );
}

function HookEditor({ entry, index, rowId, nodeId, parentId, siblings, scopeDuplicates, library, capability, toolSetCapability, workflowCapability, managedSources, onOpenEmbedded, editable, isDark, write, remove, move, lastOrder }) {
  const { t } = useTranslation();
  const set = (key, value) => write({ ...entry, [key]: value });
  const pin = hook_pin(entry);
  const version = pin ? cached_workflow_version(pin.workflow_id, pin.revision_id) : null;
  const own = hook_embedded(entry);
  const shape = record(own) ? hook_workflow_shape(own) : version ? hook_workflow_shape(version.document) : null;
  const event_ok = HOOK_EVENTS.includes(entry.event);
  const problems = hook_entry_problems(entry, { siblings, scope_duplicates: scopeDuplicates, capability, toolSetCapability, workflowCapability }, t);
  const supported = enable_supported(capability);
  /* `enabled` is the switch's once the contract is known; before that, and
     on a runtime without it, a stored value is shown as stored. */
  const extras = Object.keys(entry).filter((key) => !HOOK_KEYS.includes(key) && !(supported && key === "enabled"));
  const testid = `hook-${index}`;
  const SMALL = small(isDark);

  return (
    <div data-testid={`${testid}-editor`} style={{ display: "flex", flexDirection: "column", minWidth: 0, margin: "4px -6px -6px -10px" }}>
      <HookRow label={t("agents.hooks.id")} isDark={isDark} testid={`${testid}-id-row`}>
        <IdInput entry={entry} editable={editable} isDark={isDark} testid={`${testid}-id`} about={`${rowId}:id`} onWrite={(value) => set("id", value)} />
      </HookRow>
      <HookRow label={t("agents.hooks.when")} isDark={isDark} testid={`${testid}-when`}>
        <span data-testid={`${testid}-event`}>
          <Select
            options={[
              ...(has(entry, "event") && !event_ok ? [{ value: "\u0000stored", label: t("agents.hooks.stored_placeholder", { value: safe_text(raw(entry.event)) }) }] : []),
              ...HOOK_EVENTS.map((event) => ({ value: event, label: t(event === "before_tool_call" ? "agents.hooks.event_before" : "agents.hooks.event_after") })),
            ]}
            value={event_ok ? entry.event : has(entry, "event") ? "\u0000stored" : null}
            set_value={(value) => {
              if (HOOK_EVENTS.includes(value) && value !== entry.event) set("event", value);
            }}
            filterable={false}
            placeholder={t("agents.hooks.choose_event")}
            disabled={!editable}
            style={FIELD}
          />
        </span>
      </HookRow>
      <HookRow label={t("agents.hooks.tools")} isDark={isDark} testid={`${testid}-tools`}
        help={<PanelHelp label={t("agents.hooks.tools")}>{t("agents.hooks.named_tool_note")}</PanelHelp>}>
        <ToolsControl entry={entry} library={library} toolSetCapability={toolSetCapability} editable={editable} isDark={isDark} testid={testid} set={set} />
      </HookRow>
      <HookRow label={t("agents.hooks.always_ask")} isDark={isDark} testid={`${testid}-approval`}
        help={<PanelHelp label={t("agents.hooks.always_ask")}>{t("agents.hooks.approval_note")}</PanelHelp>}>
        <RowSwitch on={entry.force_approval === true} label={t("agents.hooks.always_ask")} disabled={!editable}
          testid={`${testid}-approval-switch`} onFlip={(next) => set("force_approval", next)} />
      </HookRow>
      {has(entry, "force_approval") && typeof entry.force_approval !== "boolean" && (
        <span style={{ ...problemOf(isDark), padding: "0 10px 6px" }}>{t("agents.hooks.stored_approval", { value: "{value}" }).split(/(\{value\})/g).map((part, at) => ({ __proto__: null, "{value}": (<span key={at} style={MONO}>{safe_text(raw(entry.force_approval))}</span>) }[part] ?? part))}</span>
      )}
      <HookRow label={t("agents.hook_source.title")} isDark={isDark} testid={`${testid}-contract`} stack
        help={<PanelHelp label={t("agents.hooks.contract")}>
          {event_ok ? (
            <>
              <span>{t("agents.hooks.start_given", { keys: "{keys}" }).split(/(\{keys\})/g).map((part, at) => ({ __proto__: null, "{keys}": (<span key={at} style={MONO}>{EVENT_INPUT_KEYS[entry.event].join(t("agents.schema.fields.list_separator"))}</span>) }[part] ?? part))}</span>{" "}
              <span>
                {t("agents.hooks.end_decisions", { decisions: DECISION_SHAPES[entry.event].map((item, at) => `${t(({ __proto__: null, before_tool_call: ["agents.hooks.decision_continue", "agents.hooks.decision_arguments", "agents.hooks.decision_block"], after_tool_call: ["agents.hooks.decision_continue", "agents.hooks.decision_replace"] })[entry.event][at])} — ${item.keys.join(t("agents.schema.fields.list_separator"))}`).join(t("agents.execution.kernel.list_separator")) })}
                {entry.event === "before_tool_call" ? t("agents.hooks.before_bad_decision") : t("agents.hooks.after_bad_decision")}
              </span>{" "}
              {shape && shape.readable && (
                <span data-testid={`${testid}-exports`}>{t(record(own) ? "agents.hooks.exports_own" : "agents.hooks.exports_pinned", { exports: "{exports}" }).split(/(\{exports\})/g).map((part, at) => ({ __proto__: null, "{exports}": (<span key={at} style={MONO}>{shape.exports.join(t("agents.schema.fields.list_separator")) || t("agents.hooks.nothing")}</span>) }[part] ?? part))}</span>
              )}
            </>
          ) : t("agents.hooks.choose_event_contract")}
        </PanelHelp>}>
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
      </HookRow>
      <div style={{ borderTop: `1px solid ${hairline(isDark)}`, padding: "6px 6px 8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
        {extras.map((key) => (
          <div key={key} data-testid={`${testid}-extra-${key}`} style={{ ...ROW, justifyContent: "space-between" }}>
            <span style={problemOf(isDark)}>{key === "enabled" ? t("agents.hooks.stored_enabled_extra", { key: "{key}", value: "{value}" }).split(/(\{key\}|\{value\})/g).map((part, at) => ({ __proto__: null, "{key}": (<span key={at} style={MONO}>{safe_text(key)}</span>), "{value}": (<span key={at} style={MONO}>{safe_text(raw(entry[key]))}</span>) }[part] ?? part)) : t("agents.hooks.stored_unknown", { key: "{key}", value: "{value}" }).split(/(\{key\}|\{value\})/g).map((part, at) => ({ __proto__: null, "{key}": (<span key={at} style={MONO}>{safe_text(key)}</span>), "{value}": (<span key={at} style={MONO}>{safe_text(raw(entry[key]))}</span>) }[part] ?? part))}</span>
            <Button
              label={t("agents.execution.tool.remove")}
              ariaLabel={t("agents.hooks.remove_setting", { key: key })}
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
            {problems.map((problem, at) => <span key={`${problem.code}-${at}`} style={problemOf(isDark)}>{problem.message}</span>)}
          </div>
        )}
        {/* A stored order the run cannot place: the list is the run order, so
            the fix is a place in it — last. */}
        {problems.some((problem) => problem.code === "order_missing" || problem.code === "order_invalid") && (
          <span>
            <Button label={t("agents.hooks.place_last")} disabled={!editable} onClick={() => set("order", lastOrder)} style={SMALL} />
          </span>
        )}
        <span style={{ ...ROW, flexWrap: "wrap" }}>
          {move}
          <Button label={t("agents.hooks.remove_hook")} ariaLabel={t("agents.hooks.remove_hook_named", { id: safe_text(raw(entry.id)) })} disabled={!editable} onClick={remove} style={{ ...SMALL, opacity: 0.8, marginLeft: "auto" }} />
        </span>
      </div>
    </div>
  );
}

/* The six dots a row is dragged by. */
function Grip({ isDark, active }) {
  const dot = { width: 2.5, height: 2.5, borderRadius: 999, background: muted(isDark) };
  return (
    <span aria-hidden="true" style={{ display: "grid", gridTemplateColumns: "2.5px 2.5px", gap: 2, padding: "2px 1px", flexShrink: 0,
      opacity: active ? 0.75 : 0.25, cursor: active ? "grab" : "default" }}>
      {[0, 1, 2, 3, 4, 5].map((at) => <span key={at} style={dot} />)}
    </span>
  );
}

export default function HooksPoolSection({ document, node, isDark, onChange, managedSources, onOpenEmbeddedHook }) {
  const { t } = useTranslation();
  const list = hooks_list(node);
  const entries = Array.isArray(list) ? list : [];
  const [library] = useToolLibrary();
  const capability = useHookCapability();
  const toolSetCapability = useToolSetCapability();
  const workflowCapability = useHookWorkflowCapability();
  const [moveProblem, setMoveProblem] = useState(null);
  const [dragging, setDragging] = useState(null);
  useWorkflowVersions(entries.map((entry) => hook_pin(entry)).filter(Boolean));
  const unique = Array.isArray(document && document.nodes) && document.nodes.filter((item) => item && item.id === node.id).length === 1;
  const editable = unique && document.kind === "agent" && document.schema_version === 1 && typeof onChange === "function";
  /* Pins answer later than the click; they write against the document as it
     is then. */
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
  const problems = pool_problems(node, document, t);
  const supported = enable_supported(capability);

  /* The run order on the Agent this pool is attached to: this pool's hooks
     are drawn in it, each hook a stored order cannot place (yet) after them. */
  const scope_agent = agents[0] || null;
  const scope = scope_agent ? hook_scope_entries(document, scope_agent) : [];
  const placed = scope.filter((item) => item.pool_id === node.id).map((item) => item.index);
  const drawn = [...placed, ...entries.map((_entry, index) => index).filter((index) => !placed.includes(index))];
  const others = scope.some((item) => item.pool_id !== node.id);
  const move = (index, position) => {
    if (!scope_agent) return;
    const result = move_hook(latest.current.document, node.id, scope_agent, index, position, agentMessage);
    setMoveProblem(result.ok ? null : { agent_id: scope_agent, message: result.problem.message });
    if (result.ok) commit(result.document);
  };
  /* Where a hook lands, counted in the scope without it. */
  const landing = (index, target) => {
    const rest = scope.filter((item) => !(item.pool_id === node.id && item.index === index));
    return target === null ? rest.length : rest.findIndex((item) => item === target);
  };
  const scope_item = (index) => scope.find((item) => item.pool_id === node.id && item.index === index) || null;
  /* A new hook goes last: the next order after every hook the Agent runs. */
  const next_order = () => {
    const orders = [
      ...scope.map((item) => item.order),
      ...entries.filter((entry) => record(entry) && Number.isSafeInteger(entry.order) && typeof entry.order === "number").map((entry) => entry.order),
    ];
    return Math.min(MAX_ORDER, orders.length ? Math.max(...orders) + 1 : 1);
  };

  const summary = (entry) => {
    const when = entry.event === "before_tool_call" ? t("agents.hooks.before_detail") : entry.event === "after_tool_call" ? t("agents.hooks.after_detail") : "?";
    const tool = !has(entry, "tool_name") ? "?" : entry.tool_name === null ? t("agents.hooks.every_tool_detail") : typeof entry.tool_name === "string" ? entry.tool_name
      : Array.isArray(entry.tool_name) && entry.tool_name.length > 0 && entry.tool_name.every((name) => typeof name === "string") ? entry.tool_name.join(t("agents.schema.fields.list_separator")) : "?";
    return `${when} · ${tool}`;
  };

  const NOTE = note(isDark);
  const SMALL = small(isDark);

  return (
    <section data-testid="hooks-pool-section" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!editable && (
        <div style={problemOf(isDark)}>{!unique ? t("agents.toolkit.duplicate_ids") : t("agents.execution.read_only.stored")}</div>
      )}
      {!Array.isArray(list) && (
        <div data-testid="hooks-pool-stored-invalid" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={problemOf(isDark)}>{t("agents.hooks.stored_hooks", { value: "{value}" }).split(/(\{value\})/g).map((part, index) => ({ __proto__: null, "{value}": (<span key={index} style={MONO}>{safe_text(raw(list))}</span>) }[part] ?? part))}</span>
          <span>
            <Button label={t("agents.hooks.new_list")} ariaLabel={t("agents.hooks.replace_list")} disabled={!editable} onClick={() => commit(with_hooks(latest.current.document, node.id, []))} style={SMALL} />
          </span>
        </div>
      )}
      <Block section="hooks-pool-hooks" title={t("agents.hooks.title")} isDark={isDark}
        help={<span>{t("agents.hooks.order_explanation")}</span>}
        aside={Array.isArray(list) ? (
            <Button
              label={t("agents.hooks.add_hook")}
              disabled={!editable}
              onClick={() => {
                /* Free across every pool on the same Agent, which is the
                   scope the run's admission refuses a repeat in (R-HP-02). */
                const taken = scope_hook_ids(latest.current.document, node.id);
                rows.added();
                commit(with_hooks(latest.current.document, node.id, [...entries, { id: free_hook_id(taken), order: next_order(), force_approval: false }]));
                setOpenLast(true);
              }}
              style={addButtonStyle(isDark)}
            />
          ) : undefined}>
        <Region isDark={isDark}>{drawn.map((index) => {
          const entry = entries[index];
          const rowId = rows.ids[index];
          const item = scope_item(index);
          const position = item ? scope.indexOf(item) : -1;
          const can_drag = Boolean(item) && editable;
          const count = record(entry) ? hook_entry_problems(entry, { siblings: entries, scope_duplicates: scopeDuplicates, capability, toolSetCapability, workflowCapability }, t).length : 0;
          const opened = record(entry) && open_index === index;
          const runs = record(entry) && hook_runs(entry);
          return (
            <div key={rowId} data-testid={`hook-row-${index}`} data-hook-id={record(entry) && typeof entry.id === "string" ? entry.id : ""}
              draggable={can_drag && !opened}
              onDragStart={can_drag ? (event) => {
                setDragging({ index });
                if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
              } : undefined}
              onDragEnd={() => setDragging(null)}
              onDragOver={editable && dragging && item ? (event) => event.preventDefault() : undefined}
              onDrop={editable && dragging && item ? (event) => {
                event.preventDefault();
                const from = dragging.index;
                setDragging(null);
                /* Dropped back on itself: nothing moves, nothing is written. */
                if (from === index) return;
                move(from, landing(from, item));
              } : undefined}
              style={{ display: "flex", flexDirection: "column", padding: "6px 6px 6px 10px", minWidth: 0 }}>
              <div style={{ ...ROW, gap: 6, minHeight: 28, minWidth: 0 }}>
                <Grip isDark={isDark} active={can_drag} />
                <span style={{ ...MONO, fontSize: 12, fontWeight: 500, color: textColor(isDark), flex: "0 1 auto", ...ELLIPSIS, opacity: runs || !record(entry) ? 1 : 0.55 }}>
                  {record(entry) ? safe_text(typeof entry.id === "string" && entry.id ? entry.id : t("agents.hooks.no_id")) : safe_text(raw(entry))}
                </span>
                <span style={{ ...NOTE, ...ELLIPSIS, flex: "1 1 0" }}>{record(entry) ? safe_text(summary(entry)) : t("agents.hooks.no_entry")}</span>
                {count > 0 && <span data-testid={`hook-row-${index}-to-fix`} style={{ ...problemOf(isDark), flexShrink: 0 }}>{t("agents.hooks.to_fix", { count })}</span>}
                {record(entry) && supported && (
                  <RowSwitch on={has(entry, "enabled") ? entry.enabled === true : true} label={t("agents.hooks.runs_named", { id: safe_text(raw(entry.id)) })}
                    disabled={!editable} testid={`hook-${index}-runs`}
                    onFlip={(next) => {
                      /* A missing setting already runs: turning it on writes nothing.
                         A stored value that is not on or off is replaced by the
                         one chosen. */
                      if (next && !has(entry, "enabled")) return;
                      const now = latest.current.document;
                      const current = now.nodes.find((candidate) => candidate && candidate.id === node.id);
                      const now_list = hooks_list(current);
                      if (!Array.isArray(now_list) || index >= now_list.length) return;
                      commit(with_hook_enabled(now, node.id, index, next));
                    }} />
                )}
                {record(entry) ? (
                  <Button prefix_icon={opened ? "arrow_up" : "arrow_down"} ariaLabel={t(opened ? "agents.hooks.close_hook" : "agents.hooks.edit_hook", { index: index + 1 })}
                    onClick={() => setOpen(opened ? null : rowId)}
                    style={{ flexShrink: 0, width: 22, height: 22, borderRadius: CONTROL_RADIUS, backgroundColor: "transparent", color: muted(isDark),
                      iconOnlyPaddingVertical: 0, iconOnlyPaddingHorizontal: 0, content: { icon: { width: 12, height: 12 } } }} />
                ) : (
                  <Button
                    label={t("agents.execution.tool.remove")}
                    ariaLabel={t("agents.hooks.remove_entry", { index: index + 1 })}
                    disabled={!editable}
                    onClick={() => {
                      rows.removed(index);
                      commit(remove_hook(latest.current.document, node.id, index));
                    }}
                    style={SMALL}
                  />
                )}
              </div>
              {!record(entry) && <span style={problemOf(isDark)}>{hook_entry_problems(entry, {}, t)[0].message}</span>}
              {opened && (
                <HookEditor
                  entry={entry}
                  index={index}
                  rowId={rowId}
                  siblings={entries}
                  scopeDuplicates={scopeDuplicates}
                  library={library}
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
                    const current = now.nodes.find((candidate) => candidate && candidate.id === node.id);
                    const now_list = hooks_list(current);
                    /* Against the list as it is now: an answer may land after
                       another edit to this pool. */
                    if (!Array.isArray(now_list) || index >= now_list.length) return;
                    commit(with_hook(now, node.id, index, next));
                  }}
                  lastOrder={next_order()}
                  remove={() => {
                    setOpen(null);
                    rows.removed(index);
                    commit(remove_hook(latest.current.document, node.id, index));
                  }}
                  move={item ? (
                    <>
                      <Button label="↑" ariaLabel={t("agents.hooks.move_earlier", { value1: safe_text(item.id), value2: safe_text(scope_agent) })} disabled={!editable || position === 0} onClick={() => move(index, position - 1)} style={SMALL} />
                      <Button label="↓" ariaLabel={t("agents.hooks.move_later", { value1: safe_text(item.id), value2: safe_text(scope_agent) })} disabled={!editable || position === scope.length - 1} onClick={() => move(index, position + 1)} style={SMALL} />
                    </>
                  ) : null}
                />
              )}
            </div>
          );
        })}</Region>
        {/* Below the last hook: dropping here moves a hook to the end. */}
        {scope_agent && placed.length > 0 && editable && (
          <div
            data-testid={`hooks-run-end-${scope_agent}`}
            onDragOver={dragging ? (event) => event.preventDefault() : undefined}
            onDrop={dragging ? (event) => {
              event.preventDefault();
              const from = dragging.index;
              setDragging(null);
              move(from, landing(from, null));
            } : undefined}
            style={{ height: 8, marginTop: -8 }}
          />
        )}
        {/* Run order, said once: the list is it; another pool on the same
            Agent, or a pool on several Agents, is named. */}
        <div data-testid="hooks-pool-order" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {agents.length === 0 && <span style={NOTE}>{t("agents.hooks.not_attached")}</span>}
          {agents.length > 0 && entries.length > 1 && !others && agents.length === 1 && <span style={NOTE}>{t("agents.hooks.list_is_order")}</span>}
          {(others || agents.length > 1) && agents.map((agent_id) => {
            const order = kernel_hook_order(document, agent_id);
            return (
              <span key={agent_id} data-testid={`hooks-pool-order-${agent_id}`} style={NOTE}>
                {t("agents.hooks.scope_order", { agent: "{agent}", order: "{order}" }).split(/(\{agent\}|\{order\})/g).map((part, at) => ({ __proto__: null, "{agent}": (<span key={at} style={MONO}>{safe_text(agent_id)}</span>), "{order}": order.length ? order.map((hook) => `${safe_text(hook.id)}${hook.pool_id !== node.id ? ` (${safe_text(hook.pool_id)})` : ""}`).join(" → ") : t("agents.hooks.none_yet") }[part] ?? part))}
              </span>
            );
          })}
          {moveProblem && (
            <span data-testid={`hooks-run-problem-${moveProblem.agent_id}`} style={problemOf(isDark)}>{renderAgentMessage(moveProblem.message, t)}</span>
          )}
        </div>
      </Block>

      {pool_extras.map((key) => (
        <div key={key} data-testid={`hooks-pool-extra-${key}`} style={{ ...ROW, justifyContent: "space-between" }}>
          <span style={problemOf(isDark)}>{t("agents.hooks.pool_stored_unknown", { key: "{key}", value: "{value}" }).split(/(\{key\}|\{value\})/g).map((part, index) => ({ __proto__: null, "{key}": (<span key={index} style={MONO}>{safe_text(key)}</span>), "{value}": (<span key={index} style={MONO}>{safe_text(raw(node.config[key]))}</span>) }[part] ?? part))}</span>
          <Button
            label={t("agents.execution.tool.remove")}
            ariaLabel={t("agents.hooks.remove_pool_setting", { value1: key })}
            disabled={!editable}
            onClick={() => commit(without_pool_setting(latest.current.document, node.id, key))}
            style={SMALL}
          />
        </div>
      ))}
      {problems.length > 0 && (
        <div data-testid="hooks-pool-problems" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {problems.map((problem, at) => <span key={`${problem.code}-${at}`} style={problemOf(isDark)}>{problem.message}</span>)}
        </div>
      )}
    </section>
  );
}
