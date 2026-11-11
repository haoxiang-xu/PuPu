import PanelHelp from "./panel_help";
import { agentMessage, renderAgentMessage } from "../agents_i18n";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import Input from "../../../../../BUILTIN_COMPONENTs/input/input";
import Select from "./panel_select";
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

function OrderInput({ entry, editable, isDark, testid, about, onWrite }) {
  const { t } = useTranslation();
  const stored = has(entry, "order") && Number.isSafeInteger(entry.order) && typeof entry.order === "number" ? String(entry.order) : "";
  /* Held against the row's identity, not its position (R-HP-04). */
  const pending = usePendingText(stored, about);
  const text = pending.text !== null ? pending.text : stored;
  const check = (value) => {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return { ok: false, problem: t("agents.hooks.order_integer") };
    const number = Number(trimmed);
    return number <= MAX_ORDER ? { ok: true, value: number } : { ok: false, problem: t("agents.hooks.order_integer") };
  };
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Input
        value={text}
        disabled={!editable}
        placeholder={has(entry, "order") && !stored ? t("agents.hooks.stored_placeholder", { value: raw(entry.order) }) : "0 … 1,000,000"}
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
      {pending.text !== null && <span data-testid={`${testid}-problem`} style={problem_style(isDark)}>{t("agents.hooks.pending_order", { problem: check(pending.text).problem })}</span>}
    </span>
  );
}

function IdInput({ entry, editable, isDark, testid, about, onWrite }) {
  const { t } = useTranslation();
  const stored = has(entry, "id") && typeof entry.id === "string" ? entry.id : "";
  const pending = usePendingText(stored, about);
  const text = pending.text !== null ? pending.text : stored;
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
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
        style={{ ...FIELD, width: 180, ...MONO }}
      />
      {pending.text !== null && <span data-testid={`${testid}-problem`} style={problem_style(isDark)}>{t("agents.hooks.id_pending")}</span>}
    </span>
  );
}

/* The tool library is open-ended: bounded like the Builder's other library
   pickers (Kernel model, Skill Read, Tool Call), so a long list scrolls inside
   instead of opening past the window in a narrow panel (#357). */
const TOOL_LIST = { maxHeight: "min(280px, 40vh)" };

function HookEditor({ entry, index, rowId, nodeId, parentId, siblings, scopeDuplicates, toolNames, capability, toolSetCapability, workflowCapability, managedSources, onOpenEmbedded, editable, isDark, write, writeEnabled, remove }) {
  const { t } = useTranslation();
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
  const problems = hook_entry_problems(entry, { siblings, scope_duplicates: scopeDuplicates, capability, toolSetCapability, workflowCapability }, t);
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
    ...set_value.filter((name) => !toolNames.names.includes(name)).map((name) => ({ value: name, label: t("agents.hooks.tool_unlisted", { name: safe_text(name) }) })),
    ...toolNames.names.map((name) => ({ value: name, label: name })),
  ];
  const supported = enable_supported(capability);
  /* `enabled` is the on/off control's once the contract is known; before
     that, and on a runtime without it, a stored value is shown as stored. */
  const extras = Object.keys(entry).filter((key) => !HOOK_KEYS.includes(key) && !(supported && key === "enabled"));
  const runs = !has(entry, "enabled") || entry.enabled === true ? "on" : entry.enabled === false ? "off" : null;
  const stored_tool = typeof entry.tool_name === "string" ? entry.tool_name : null;
  const tool_options = [
    ...(stored_tool && !toolNames.names.includes(stored_tool) ? [{ value: stored_tool, label: t("agents.hooks.tool_unlisted", { name: safe_text(stored_tool) }) }] : []),
    ...toolNames.names.map((name) => ({ value: name, label: name })),
  ];
  const testid = `hook-${index}`;

  return (
    <div data-testid={`${testid}-editor`} style={{ display: "flex", flexDirection: "column", gap: 10, padding: "8px 10px", borderRadius: 7, background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" }}>
      <div style={ROW}>
        <span style={{ ...NOTE, width: 64, flexShrink: 0 }}>{t("agents.hooks.id")}</span>
        <IdInput entry={entry} editable={editable} isDark={isDark} testid={`${testid}-id`} about={`${rowId}:id`} onWrite={(value) => set("id", value)} />
      </div>
      <div style={ROW}>
        <span style={{ ...NOTE, width: 64, flexShrink: 0 }}>{t("agents.hooks.order")}</span>
        <OrderInput entry={entry} editable={editable} isDark={isDark} testid={`${testid}-order`} about={`${rowId}:order`} onWrite={(value) => set("order", value)} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={LABEL}>{t("agents.hooks.when")}</span>
        <span data-testid={`${testid}-event`}>
          <Select
            options={[
              ...(has(entry, "event") && !event_ok ? [{ value: "\u0000stored", label: t("agents.hooks.stored_placeholder", { value: safe_text(raw(entry.event)) }) }] : []),
              ...HOOK_EVENTS.map((event) => ({ value: event, label: EVENT_LABEL[event] ? t(event === "before_tool_call" ? "agents.hooks.event_before" : "agents.hooks.event_after") : EVENT_LABEL[event] })),
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
      </div>
      <div data-testid={`${testid}-tool`} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={LABEL}>{t("agents.hooks.tool_matcher")}</span>
        <span style={{ opacity: editable ? 1 : 0.5, pointerEvents: editable ? "auto" : "none" }}>
          <SegmentedControl
            size="compact"
            isDark={isDark}
            buttonFontWeight={500}
            sections={[{ key: "every", label: t("agents.hooks.every_tool") }, { key: "one", label: t("agents.hooks.one_tool") }, ...(sets_ok ? [{ key: "set", label: t("agents.hooks.tool_set") }] : [])]}
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
              placeholder={toolNames.status === "loading" ? t("agents.execution.tool.reading_library") : t("agents.hooks.tool_exact_name")}
              disabled={!editable}
              dropdown_style={TOOL_LIST}
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
              multi_label={(count) => t(count === 1 ? "agents.hooks.set_count_one" : "agents.hooks.set_count_other", { count })}
              filterable
              placeholder={toolNames.status === "loading" ? t("agents.execution.tool.reading_library") : t("agents.hooks.pick_tools")}
              disabled={!editable}
              dropdown_style={TOOL_LIST}
              style={FIELD}
            />
          </span>
        )}
        {toolMode === "set" && sets_ok && setHeld !== null && setHeld.length === 0 && (
          <span data-testid={`${testid}-tool-set-held`} style={problem_style(isDark)}>{t("agents.hooks.set_pending")}</span>
        )}
        {toolMode === "set" && sets_ok && set_value.length > 0 && (
          <span data-testid={`${testid}-tool-set-names`} style={NOTE}>
            {t("agents.hooks.set_matches", { names: "{names}" }).split(/(\{names\})/g).map((part, index) => ({ __proto__: null, "{names}": (<span key={index} style={MONO}>{set_value.map((name) => safe_text(name)).join(t("agents.schema.fields.list_separator"))}</span>) }[part] ?? part))}
            {set_value.filter((name) => !toolNames.names.includes(name)).map((name) => t("agents.hooks.tool_unlisted_note", { name: safe_text(name) })).join("")}
            {stored_kind === "one" && setHeld === null ? t("agents.hooks.set_unwritten_note") : ""}
          </span>
        )}
        {has(entry, "tool_name") && entry.tool_name !== null && typeof entry.tool_name !== "string" && !(stored_set_clean && sets_ok) && (
          <span data-testid={`${testid}-tool-stored`} style={problem_style(isDark)}>{sets_ok ? t("agents.hooks.stored_set", { value: "{value}" }).split(/(\{value\})/g).map((part, index) => ({ __proto__: null, "{value}": (<span key={index} style={MONO}>{safe_text(raw(entry.tool_name))}</span>) }[part] ?? part)) : t("agents.hooks.stored_single", { value: "{value}" }).split(/(\{value\})/g).map((part, index) => ({ __proto__: null, "{value}": (<span key={index} style={MONO}>{safe_text(raw(entry.tool_name))}</span>) }[part] ?? part))}</span>
        )}
        {!sets_ok && (
          <span data-testid={`${testid}-tool-set-note`} style={NOTE}>
            {toolSetCapability.status === "loading" ? t("agents.hooks.checking_set") : toolSetCapability.reason ? t("agents.hooks.set_unconfirmed_reason", { reason: renderAgentMessage(toolSetCapability.reason, t) }) : t("agents.hooks.set_unconfirmed")}
          </span>
        )}
        <span style={NOTE}>{t("agents.hooks.named_tool_note")}</span>
      </div>
      <div data-testid={`${testid}-runs`} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={LABEL}>{t("agents.hooks.runs")}</span>
        <span style={{ opacity: editable && supported ? 1 : 0.5, pointerEvents: editable && supported ? "auto" : "none" }}>
          <SegmentedControl
            size="compact"
            isDark={isDark}
            buttonFontWeight={500}
            sections={[{ key: "on", label: t("agents.hooks.on") }, { key: "off", label: t("agents.hooks.off") }]}
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
          <span style={problem_style(isDark)}>{t("agents.hooks.stored_enabled", { value: "{value}" }).split(/(\{value\})/g).map((part, index) => ({ __proto__: null, "{value}": (<span key={index} style={MONO}>{safe_text(raw(entry.enabled))}</span>) }[part] ?? part))}</span>
        )}
        <span data-testid={`${testid}-runs-note`} style={NOTE}>
          {capability.status === "loading"
            ? t("agents.hooks.checking_enabled")
            : !supported
              ? capability.reason ? t("agents.hooks.enabled_unconfirmed_reason", { reason: renderAgentMessage(capability.reason, t) }) : t("agents.hooks.enabled_unconfirmed")
              : !has(entry, "enabled")
                ? t("agents.hooks.enabled_absent_note")
                : t("agents.hooks.disabled_note")}
        </span>
      </div>
      <div data-testid={`${testid}-approval`} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={LABEL}>{t("agents.hooks.approval")}</span>
          <PanelHelp label={t("agents.hooks.approval")}>
            <span style={NOTE}>{t("agents.hooks.approval_note")}</span>
          </PanelHelp>
        </div>
        <span style={{ opacity: editable ? 1 : 0.5, pointerEvents: editable ? "auto" : "none" }}>
          <SegmentedControl
            size="compact"
            isDark={isDark}
            buttonFontWeight={500}
            sections={[{ key: "ask", label: t("agents.hooks.always_ask") }, { key: "decide", label: t("agents.hooks.workflow_decides") }]}
            selected={entry.force_approval === true ? "ask" : entry.force_approval === false ? "decide" : null}
            onChange={(next) => set("force_approval", next === "ask")}
          />
        </span>
        {has(entry, "force_approval") && typeof entry.force_approval !== "boolean" && (
          <span style={problem_style(isDark)}>{t("agents.hooks.stored_approval", { value: "{value}" }).split(/(\{value\})/g).map((part, index) => ({ __proto__: null, "{value}": (<span key={index} style={MONO}>{safe_text(raw(entry.force_approval))}</span>) }[part] ?? part))}</span>
        )}

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
      <div data-testid={`${testid}-contract`} style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={LABEL}>{t("agents.hooks.contract")}</span>
        <PanelHelp label={t("agents.hooks.contract")}>
        {event_ok ? (
          <>
            <span style={NOTE}>{t("agents.hooks.start_given", { keys: "{keys}" }).split(/(\{keys\})/g).map((part, index) => ({ __proto__: null, "{keys}": (<span key={index} style={MONO}>{EVENT_INPUT_KEYS[entry.event].join(t("agents.schema.fields.list_separator"))}</span>) }[part] ?? part))}</span>
            <span style={NOTE}>
              {t("agents.hooks.end_decisions", { decisions: DECISION_SHAPES[entry.event].map((item, index) => `${t(({ __proto__: null, before_tool_call: ["agents.hooks.decision_continue", "agents.hooks.decision_arguments", "agents.hooks.decision_block"], after_tool_call: ["agents.hooks.decision_continue", "agents.hooks.decision_replace"] })[entry.event][index])} — ${item.keys.join(t("agents.schema.fields.list_separator"))}`).join(t("agents.execution.kernel.list_separator")) })}
              {entry.event === "before_tool_call"
                ? t("agents.hooks.before_bad_decision")
                : t("agents.hooks.after_bad_decision")}
            </span>
            {shape && shape.readable && (
              <span data-testid={`${testid}-exports`} style={NOTE}>{record(own) ? t("agents.hooks.exports_own", { exports: "{exports}" }).split(/(\{exports\})/g).map((part, index) => ({ __proto__: null, "{exports}": (<span key={index} style={MONO}>{shape.exports.join(t("agents.schema.fields.list_separator")) || t("agents.hooks.nothing")}</span>) }[part] ?? part)) : t("agents.hooks.exports_pinned", { exports: "{exports}" }).split(/(\{exports\})/g).map((part, index) => ({ __proto__: null, "{exports}": (<span key={index} style={MONO}>{shape.exports.join(t("agents.schema.fields.list_separator")) || t("agents.hooks.nothing")}</span>) }[part] ?? part))}</span>
            )}
          </>
        ) : (
          <span style={NOTE}>{t("agents.hooks.choose_event_contract")}</span>
        )}
        </PanelHelp>
      </div>
      {extras.map((key) => (
        <div key={key} data-testid={`${testid}-extra-${key}`} style={{ ...ROW, justifyContent: "space-between" }}>
          <span style={problem_style(isDark)}>{key === "enabled" ? t("agents.hooks.stored_enabled_extra", { key: "{key}", value: "{value}" }).split(/(\{key\}|\{value\})/g).map((part, index) => ({ __proto__: null, "{key}": (<span key={index} style={MONO}>{safe_text(key)}</span>), "{value}": (<span key={index} style={MONO}>{safe_text(raw(entry[key]))}</span>) }[part] ?? part)) : t("agents.hooks.stored_unknown", { key: "{key}", value: "{value}" }).split(/(\{key\}|\{value\})/g).map((part, index) => ({ __proto__: null, "{key}": (<span key={index} style={MONO}>{safe_text(key)}</span>), "{value}": (<span key={index} style={MONO}>{safe_text(raw(entry[key]))}</span>) }[part] ?? part))}</span>
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
          {problems.map((problem, at) => <span key={`${problem.code}-${at}`} style={problem_style(isDark)}>{problem.message}</span>)}
        </div>
      )}
      <span>
        <Button label={t("agents.hooks.remove_hook")} ariaLabel={t("agents.hooks.remove_hook_named", { id: safe_text(raw(entry.id)) })} disabled={!editable} onClick={remove} style={{ ...SMALL, opacity: 0.8 }} />
      </span>
    </div>
  );
}

export default function HooksPoolSection({ document, node, isDark, onChange, managedSources, onOpenEmbeddedHook }) {
  const { t } = useTranslation();
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
  const problems = pool_problems(node, document, t);

  const row_label = (entry) => {
    if (!record(entry)) return { title: raw(entry), detail: t("agents.hooks.no_entry") };
    const pin = hook_pin(entry);
    const version = pin ? cached_workflow_version(pin.workflow_id, pin.revision_id) : null;
    const when = entry.event === "before_tool_call" ? t("agents.hooks.before_detail") : entry.event === "after_tool_call" ? t("agents.hooks.after_detail") : "?";
    const tool = !has(entry, "tool_name") ? "?" : entry.tool_name === null ? t("agents.hooks.every_tool_detail") : typeof entry.tool_name === "string" ? entry.tool_name
      : Array.isArray(entry.tool_name) && entry.tool_name.length > 0 && entry.tool_name.every((name) => typeof name === "string") ? t("agents.hooks.tool_names", { names: entry.tool_name.join(t("agents.schema.fields.list_separator")) }) : "?";
    const own = hook_embedded(entry);
    const workflow = record(own) ? typeof own.name === "string" && own.name ? t("agents.hooks.own_workflow_named", { name: own.name }) : t("agents.hooks.own_workflow") : version ? t("agents.hooks.workflow_revision", { name: version.document.name || pin.workflow_id, ordinal: version.ordinal }) : pin ? `${pin.workflow_id} · ${pin.revision_id}` : t("agents.hooks.no_workflow");
    return { title: typeof entry.id === "string" && entry.id ? entry.id : t("agents.hooks.no_id"), detail: t("agents.hooks.row_summary", { when, tool, workflow, approval: entry.force_approval === true ? t("agents.hooks.always_asks_suffix") : "", enabled: hook_runs(entry) ? "" : t("agents.hooks.off_suffix") }) };
  };

  return (
    <section data-testid="hooks-pool-section" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {!editable && (
        <div style={problem_style(isDark)}>{!unique ? t("agents.toolkit.duplicate_ids") : t("agents.execution.read_only.stored")}</div>
      )}
      {!Array.isArray(list) && (
        <div data-testid="hooks-pool-stored-invalid" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={problem_style(isDark)}>{t("agents.hooks.stored_hooks", { value: "{value}" }).split(/(\{value\})/g).map((part, index) => ({ __proto__: null, "{value}": (<span key={index} style={MONO}>{safe_text(raw(list))}</span>) }[part] ?? part))}</span>
          <span>
            <Button label={t("agents.hooks.new_list")} ariaLabel={t("agents.hooks.replace_list")} disabled={!editable} onClick={() => commit(with_hooks(latest.current.document, node.id, []))} style={SMALL} />
          </span>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ ...ROW, justifyContent: "space-between" }}>
          <span style={LABEL}>{t("agents.hooks.title")}</span>
          {Array.isArray(list) && (
            <Button
              label={t("agents.hooks.add_hook")}
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
          const count = hook_entry_problems(entry, { siblings: entries, scope_duplicates: scopeDuplicates, capability, toolSetCapability, workflowCapability }, t).length;
          return (
            <div key={rowId} data-testid={`hook-row-${index}`} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ ...ROW, justifyContent: "space-between", flexWrap: "wrap" }}>
                <span style={{ flex: "1 1 160px", minWidth: 0, overflowWrap: "anywhere" }}>
                  <span style={{ ...MONO, fontSize: 11.5 }}>{safe_text(label.title)}</span>
                  <span style={{ ...NOTE, marginLeft: 6 }}>{safe_text(label.detail)}</span>
                  {count > 0 && <span style={{ ...problem_style(isDark), marginLeft: 6 }}>{t("agents.hooks.to_fix", { count })}</span>}
                </span>
                {record(entry) ? (
                  <Button label={open_index === index ? t("agents.import.close") : t("agents.hooks.edit")} ariaLabel={t(open_index === index ? "agents.hooks.close_hook" : "agents.hooks.edit_hook", { index: index + 1 })} onClick={() => setOpen(open_index === index ? null : rowId)} style={{ ...SMALL, flexShrink: 0 }} />
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
              {!record(entry) && <span style={problem_style(isDark)}>{hook_entry_problems(entry, {}, t)[0].message}</span>}
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
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={LABEL}>{t("agents.hooks.run_order")}</span>
          <PanelHelp label={t("agents.hooks.run_order")}>
            <span style={NOTE}>{t("agents.hooks.order_explanation")}</span>
          </PanelHelp>
        </div>
        {agents.length === 0 && <span style={NOTE}>{t("agents.hooks.not_attached")}</span>}
        {agents.map((agent_id) => {
          const order = kernel_hook_order(document, agent_id);
          const scope = hook_scope_entries(document, agent_id);
          const move = (index, position) => {
            const result = move_hook(latest.current.document, node.id, agent_id, index, position, agentMessage);
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
                {t("agents.hooks.scope_order", { agent: "{agent}", order: "{order}" }).split(/(\{agent\}|\{order\})/g).map((part, index) => ({ __proto__: null, "{agent}": (<span key={index} style={MONO}>{safe_text(agent_id)}</span>), "{order}": order.length ? order.map((item) => `${safe_text(item.id)}${item.pool_id !== node.id ? ` (${safe_text(item.pool_id)})` : ""}`).join(" → ") : t("agents.hooks.none_yet") }[part] ?? part))}
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
                        {t("agents.hooks.row_order", { id: "{id}", order: "{order}", pool: "{pool}", enabled: "{enabled}" }).split(/(\{id\}|\{order\}|\{pool\}|\{enabled\})/g).map((part, index) => ({ __proto__: null, "{id}": (<span key={index} style={MONO}>{safe_text(item.id)}</span>), "{order}": item.order, "{pool}": own ? "" : ` · ${safe_text(item.pool_id)}`, "{enabled}": item.runs ? "" : t("agents.hooks.off_not_run") }[part] ?? part))}
                      </span>
                      {own && (
                        <span style={ROW}>
                          <Button label="↑" ariaLabel={t("agents.hooks.move_earlier", { value1: safe_text(item.id), value2: safe_text(agent_id) })} disabled={!editable || position === 0} onClick={() => move(item.index, position - 1)} style={SMALL} />
                          <Button label="↓" ariaLabel={t("agents.hooks.move_later", { value1: safe_text(item.id), value2: safe_text(agent_id) })} disabled={!editable || position === scope.length - 1} onClick={() => move(item.index, position + 1)} style={SMALL} />
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
                <span data-testid={`hooks-run-problem-${agent_id}`} style={problem_style(isDark)}>{renderAgentMessage(moveProblem.message, t)}</span>
              )}
            </div>
          );
        })}

      </div>

      {pool_extras.map((key) => (
        <div key={key} data-testid={`hooks-pool-extra-${key}`} style={{ ...ROW, justifyContent: "space-between" }}>
          <span style={problem_style(isDark)}>{t("agents.hooks.pool_stored_unknown", { key: "{key}", value: "{value}" }).split(/(\{key\}|\{value\})/g).map((part, index) => ({ __proto__: null, "{key}": (<span key={index} style={MONO}>{safe_text(key)}</span>), "{value}": (<span key={index} style={MONO}>{safe_text(raw(node.config[key]))}</span>) }[part] ?? part))}</span>
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
          {problems.map((problem, at) => <span key={`${problem.code}-${at}`} style={problem_style(isDark)}>{problem.message}</span>)}
        </div>
      )}
    </section>
  );
}
