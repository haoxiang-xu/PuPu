import { agentEnglishText, agentMessage, renderAgentMessage } from "../agents_i18n";
import AddButton from "./add_button";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import SegmentedButton from "../../../../../BUILTIN_COMPONENTs/input/segmented_button";
import useReducedMotion from "../../../../../BUILTIN_COMPONENTs/mini_react/use_reduced_motion";
import { SemiSwitch } from "../../../../../BUILTIN_COMPONENTs/input/switch";
import Icon from "../../../../../BUILTIN_COMPONENTs/icon/icon";
import TextField from "../../../../../BUILTIN_COMPONENTs/input/textfield";
import useTakenName from "./taken_name";
import useListIdentities from "./list_identity";
import {
  node_legacy_pool_entries,
  node_pool_is_legacy,
  node_subagents,
  with_node_subagents,
} from "../skeleton_document";
import {
  SUBAGENT_MODES,
  SUBAGENT_OUTPUT_MODES,
  free_entry_id,
  free_entry_name,
  introduces_collision,
  new_subagent_entry,
  shared_entry_id_rows,
  subagent_pool_problems,
} from "../subagent_pool_config";
import {
  CONVERSION_KERNEL_ABSENT,
  CONVERSION_KERNEL_AMBIGUOUS,
  CONVERSION_KERNEL_REFUSED,
  CONVERSION_MODEL_MISMATCH,
  CONVERSION_OWNER_REQUIRED,
  legacy_conversion_plan,
  legacy_entry_label,
  plan_for_pool,
} from "../legacy_conversion";
import { can_drill } from "../skeleton_drill";
import {
  entry_agent_id,
  entry_source_label,
  subagent_candidates,
  why_not_a_subagent,
  why_not_this_reference,
} from "../skeleton_subagent_eligibility";
import { is_unavailable, list_resources } from "../skeleton_resources";
import { identity_of, safe_text } from "../document_values";
import { new_embedded_entry } from "../new_embedded_entry";
import { Block, ProblemCount } from "./process_timeline";
import { subscribeSkeletonLibraryRefresh } from "../../../../../SERVICEs/skeleton_library_refresh";
import PanelHelp from "./panel_help";
import AgentAvatar from "../../../agent_avatar";
import PanelInput from "./panel_input";
import { fieldFill, fillStrong, hairline, muted as mutedOf, note as noteStyle, PANEL_SWITCH, problem as problemOf, Region, removeButtonStyle, SettingRow, text, textFieldFill } from "./panel_style";

/* The Subagent Pool: which Agents this one may call, and how.
 *
 * The pool holds Agents and never Workflows. That is not a label this panel
 * chooses — an entry's `source` is either a reference to a resource whose
 * stored kind is `agent`, or a whole embedded Agent document, and the store
 * refuses anything else at Run (`_resolve_subagent_closure`: `wrong_kind`,
 * `resource_missing`, `resource_archived`, `recursive_reference`). The picker
 * refuses the same things before the author can compose them, through the one
 * gate in `skeleton_subagent_eligibility`.
 *
 * It manages entries and how they are used. It does not edit a subagent's
 * contents: a subagent is a complete Agent graph, and a graph is edited on the
 * canvas by drilling into it. So there is no prompt box here, no model, no
 * tools of its own — everything on a row is about *this* parent's use of that
 * Agent.
 *
 * Two things this panel says that nothing else will. A pool's configuration is
 * invisible to every boundary the author meets while editing: the format check
 * accepts any of it, the draft diagnostics say nothing about it, and so does
 * the structural execution gate — the refusal comes from `prepare_agent_graph`
 * when Run is pressed. And an empty pool is not an incomplete draft the
 * runtime tolerates; it is refused outright. Both are in
 * `subagent_pool_admission_capture`. */


const MONO = { fontFamily: "ui-monospace, Menlo, monospace" };

/* An entry's strip, folded or open: its icon sits as far from the strip's
   top, bottom and left edges (and the way out as far from its right), the
   same inset on every side. */
const STRIP_HEIGHT = 36;
const STRIP_AVATAR = 22;
export const SUBAGENT_STRIP = Object.freeze({
  height: STRIP_HEIGHT,
  avatar: STRIP_AVATAR,
  inset: (STRIP_HEIGHT - STRIP_AVATAR) / 2,
});
/* A setting row inside an entry's surface: its own padding, no background. */
const ROW_PADDING = Object.freeze({ padding: "6px 10px 6px 11px", minWidth: 0 });
const ROW_COLUMN = Object.freeze({ ...ROW_PADDING, display: "flex", flexDirection: "column" });
/* The right-hand column of a setting row, one width for every control so they
   start and end on the same two edges. */
const CONTROL = Object.freeze({ width: "62%", flexShrink: 0, minWidth: 0, display: "flex", justifyContent: "flex-end" });
/* A subagent's mark in the list: the Agent's own icon with no tile, in the
   row's own text colour, exactly as in the Agents explorer. The icon is
   changed only from the Explorer. */
function SubagentAvatar({ size, testid, presentation }) {
  return <AgentAvatar variant="glyph" presentation={presentation} size={size} glyphScale={0.75} testid={testid} />;
}

/* Where a subagent's presentation is read: a referenced Agent's stored
   summary, or the embedded graph's own document. */
function entry_presentation(entry, referenced) {
  if (referenced && is_object(referenced.presentation)) return referenced.presentation;
  const source = is_object(entry) ? entry.source : null;
  if (is_object(source) && source.kind === "embedded" && is_object(source.document) &&
    is_object(source.document.presentation)) {
    return source.document.presentation;
  }
  return null;
}







/* Which entries this statement is about, and where they are.
 *
 * Naming the other pool matters: the entries on screen can all be fine and
 * the button still withheld, because the store converts every pool in the
 * Agent in one write. Without the name that reads as the panel refusing for
 * no reason. */
function inline_subject(pool_ids, node_id) {
  const elsewhere = pool_ids.filter((id) => id !== node_id);
  const here = pool_ids.includes(node_id);
  const others =
    elsewhere.length === 1
      ? `another pool (${elsewhere[0]})`
      : `other pools (${elsewhere.join(", ")})`;
  if (here && elsewhere.length > 0) {
    return `Some of these entries, and entries in ${others},`;
  }
  if (!here) return `Entries in ${others}`;
  return "Some of these entries";
}

/* A stored value with nothing invisible left in it.
 *
 * A declared model is compared by the runtime after `str.strip()`, so one
 * padded with U+FEFF keeps it and matches nothing — and a message saying
 * `gpt-4.1 is not gpt-4.1` is worse than no message. Everything that cannot
 * be seen is written as its escape instead. Belongs beside `safe_text` if a
 * second caller ever wants it. */
const INVISIBLE = new RegExp(
  "[\\u0000-\\u001f\\u007f-\\u00a0\\u1680\\u2000-\\u200f" +
    "\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]",
  "g",
);

function visible(text) {
  return safe_text(text).replace(
    INVISIBLE,
    (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

/* Which Agent nodes a pool is attached to, named because that is where the
   author changes the answer. */
function owners_label(owners) {
  const named = owners.map(visible).join(", ");
  return owners.length === 1
    ? `the Agent node this pool is attached to (${named})`
    : `the Agent nodes this pool is attached to (${named})`;
}

/* What converting would do, said before it is pressed.
 *
 * The model is named because the author is about to create Agents with it,
 * and because the runtime will not let them be created with any other one:
 * an entry that declares a model is compared against it and a difference
 * writes nothing. It is named per pool, because that is how the runtime
 * resolves it — the Kernel configured on the node a pool is attached to — and
 * two pools attached to differently configured nodes are converted onto two
 * models in the same write. The schema is named because it is the one thing
 * the conversion deliberately does not carry over: the owner's Kernel is
 * copied with its prompt and output schema cleared, so a subagent is not
 * given this Agent's output contract. */
function conversion_caption(plan, node_id, t = agentEnglishText) {
  if (t !== agentEnglishText) {
    const here = plan_for_pool(plan, node_id);
    const others = plan.pools.filter((id) => id !== node_id);
    const declared = plan.entries.filter((entry) => entry.pool_id === node_id && entry.declared !== null);
    return t(`agents.subagents.convert_${plan.pools.includes(node_id) ? others.length === 0 ? "here" : others.length === 1 ? "here_else_one" : "here_else_many" : others.length === 1 ? "else_one" : "else_many"}${here && here.chosen ? here.owners.length === 1 ? "_owner_one" : "_owner_many" : ""}`, {
      pools: others.join(t("agents.schema.fields.list_separator")),
      model: here && here.chosen ? visible(here.chosen) : "",
      owners: here && here.chosen ? here.owners.map(visible).join(t("agents.schema.fields.list_separator")) : "",
      kept: declared.length === 0 ? "" : declared.length === 1 ? t("agents.subagents.convert_declared_one") : t("agents.subagents.convert_declared_other", { count: declared.length }),
      elsewhere: others.length === 0 ? "" : t(others.length === 1 ? "agents.subagents.convert_elsewhere_one" : "agents.subagents.convert_elsewhere_many", { pools: others.map(visible).join(t("agents.schema.fields.list_separator")) }),
    });
  }
  const subject = inline_subject(plan.pools, node_id);
  const here = plan_for_pool(plan, node_id);
  const named =
    here && here.chosen
      ? ` — on ${visible(here.chosen)}, the model configured on ${owners_label(here.owners)}`
      : "";
  const others = plan.pools.filter((id) => id !== node_id);
  const elsewhere =
    others.length === 0
      ? ""
      : ` Entries in ${others.length === 1 ? `the other pool (${visible(others[0])})` : `the other pools (${others.map(visible).join(", ")})`} are built on the model configured where ${others.length === 1 ? "it is" : "they are"} attached.`;
  const declared = plan.entries.filter(
    (entry) => entry.pool_id === node_id && entry.declared !== null,
  );
  const kept =
    declared.length === 0
      ? ""
      : ` ${declared.length === 1 ? "One of them declares" : `${declared.length} of them declare`} that model already.`;
  return `${subject} carry a prompt rather than naming an Agent, so converting builds an Agent for each${named}. Their prompts, tools, delegation modes and memory come with them; this Agent's JSON output schema does not, because it is this Agent's contract and not theirs.${kept}${elsewhere}`;
}

/* Why the conversion is not offered, and what to do about it. Each case is a
   refusal the store would answer with, asked here so the author is not told
   by a write that changed nothing.
 *
 * Every one of them is about a pool, because that is where the runtime
 * resolves the model — and the write covers all of them, so the pool the
 * author is looking at can be fine and the button still withheld. Which pool
 * is named either way. */
function refusal_caption(plan, node_id, t = agentEnglishText) {
  if (t !== agentEnglishText) {
    const refusal = plan.refusal;
    const here = refusal.pool_id === node_id;
    const atomic = here ? "" : t("agents.subagents.convert_atomic_note");
    if (refusal.code === CONVERSION_OWNER_REQUIRED) {
      return t(here ? "agents.subagents.convert_refused_owner_required_here" : "agents.subagents.convert_refused_owner_required_else", { pool_id: visible(refusal.pool_id), atomic });
    }
    if (refusal.code === CONVERSION_KERNEL_ABSENT) {
      return t(here ? "agents.subagents.convert_refused_kernel_absent_here" : "agents.subagents.convert_refused_kernel_absent_else", { pool_id: visible(refusal.pool_id), node: visible(refusal.node_id), atomic });
    }
    if (refusal.code === CONVERSION_KERNEL_REFUSED) {
      return t("agents.subagents.convert_kernel_refused", { node: visible(refusal.node_id), code: refusal.problem.code, where: refusal.problem.where, atomic });
    }
    if (refusal.code === CONVERSION_KERNEL_AMBIGUOUS) {
      return t(here ? "agents.subagents.convert_refused_kernel_ambiguous_here" : "agents.subagents.convert_refused_kernel_ambiguous_else", { pool_id: visible(refusal.pool_id), nodes: refusal.nodes.map(visible).join(t("agents.schema.fields.list_separator")), atomic });
    }
    if (refusal.code === CONVERSION_MODEL_MISMATCH) {
      return t(here ? "agents.subagents.convert_model_mismatch_here" : "agents.subagents.convert_model_mismatch_else", {
        declarations: refusal.entries.map((entry) => t("agents.subagents.convert_declares", { name: visible(entry.name), model: visible(entry.declared) })).join(t("agents.execution.kernel.list_separator")),
        pool_id: visible(refusal.pool_id), model: visible(refusal.chosen), atomic,
      });
    }
    return t("agents.subagents.conversion_unavailable");
  }
  const refusal = plan.refusal;
  const here = refusal.pool_id === node_id;
  const pool = here ? "This pool" : `The pool ${visible(refusal.pool_id)}`;
  const one_write = here
    ? ""
    : " Converting is one write covering every pool in this Agent, so it is not offered while any of them cannot be built.";
  if (refusal.code === CONVERSION_OWNER_REQUIRED) {
    return `${pool} is not attached to an Agent node, and the Agents it builds run on the model configured where it is attached. Attach it to this Agent's Agent node and save, then convert.${one_write}`;
  }
  if (refusal.code === CONVERSION_KERNEL_ABSENT) {
    return `${pool} is attached to ${visible(refusal.node_id)}, which has no model configured yet. Converting builds an Agent for each of its entries on that node's model, and another node's is not used in its place — choose one there and save, then convert.${one_write}`;
  }
  if (refusal.code === CONVERSION_KERNEL_REFUSED) {
    return `The model configured on ${visible(refusal.node_id)} is not one the runtime would accept yet — ${refusal.problem.code} at ${refusal.problem.where}. Converting would be refused for that reason and nothing would be written, so finish it on that node first.${one_write}`;
  }
  if (refusal.code === CONVERSION_KERNEL_AMBIGUOUS) {
    return `${pool} is attached to more than one Agent node and they are configured differently (${refusal.nodes.map(visible).join(", ")}). The subagents it builds are built once, so make those Kernels agree — their own prompts and JSON output schemas are not inherited and need not match — or attach the pool to one of them.${one_write}`;
  }
  if (refusal.code === CONVERSION_MODEL_MISMATCH) {
    const named = refusal.entries
      .map((entry) => `${visible(entry.name)} declares ${visible(entry.declared)}`)
      .join("; ");
    return `Converting does not move a subagent onto a different model: the runtime compares what the entry declares against the model its own pool is built on and writes nothing if they differ. ${named} — and ${here ? "this pool" : `the pool ${visible(refusal.pool_id)}`} is built on ${visible(refusal.chosen)}. Set that model where the pool is attached, or the entry to that model, before converting.${one_write}`;
  }
  /* Unreached: every refusal this module produces is named above. Said rather
     than defaulted, because a silent fall-through would read as the
     conversion being available. */
  return "Converting is not available for this Agent, and the reason is not one this panel can state.";
}













const MODE_NAME = Object.freeze({
  __proto__: null,
  delegate: "agents.subagents.mode_name_delegate",
  handoff: "agents.subagents.mode_name_handoff",
  worker: "agents.subagents.mode_name_worker",
});

const MODE_ABOUT = Object.freeze({
  __proto__: null,
  delegate: "agents.subagents.mode_about_delegate",
  handoff: "agents.subagents.mode_about_handoff",
  worker: "agents.subagents.mode_about_worker",
});

const OUTPUT_MODE_SHORT = Object.freeze({
  __proto__: null,
  summary: "agents.subagents.output_short_summary",
  last_message: "agents.subagents.output_short_last_message",
  full_trace: "agents.subagents.output_short_full_trace",
});

/* Memory is one question — does the child keep any of its own? — so it is one
   switch over the wire's two tokens. */
const MEMORY_NONE = "ephemeral";
const MEMORY_OWN = "scoped_persistent";

const ACCENT = "var(--pupu-accent, #4a5bd8)";
const EASE = "cubic-bezier(0.2, 0, 0, 1)";

const is_object = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/* Reading a stored value — as text, or as a key, or as an identity — is
   `document_values`' subject, and it is imported rather than restated: the
   mode this panel used as a key threw on the lookup itself, and three other
   readers in this page were sitting on the same copy of the rule. */

/* What to call a resource from the library. Its name is a column of the
   store's own table, but it still arrives over IPC without its shape being
   checked, and `${resource.name}` on an object is the same throw as a stored
   tool name. The id is always a non-empty string — the gate requires it
   before anything is offered — so it is the fallback. */
function resource_label(resource) {
  return typeof resource.name === "string" && resource.name
    ? resource.name
    : resource.id;
}

/* What to call a legacy entry is `legacy_conversion`'s `legacy_entry_label`,
   imported rather than restated: the conversion's own refusal names the entry
   it is about, and two spellings of one entry's name is how a message stops
   matching the row it points at. */

/* Which problems belong to this row, by the path the mirror reports — the
   same addressing the runtime uses, so a row never shows another row's. */
function problems_at(problems, prefix) {
  return problems.filter(
    (problem) => problem.where === prefix || problem.where.startsWith(`${prefix}.`),
  );
}

function tools_text(entry, t = agentEnglishText, bare = false) {
  const allowed = entry.allowed_tools;
  const disabled = Array.isArray(entry.disabled_tools) ? entry.disabled_tools : [];
  /* `null` is "every tool" and `[]` is "no tool" — the wire's own
     distinction. An absent key is neither: the entry does not say, and
     reading it as "every tool" would state something the document does not,
     over a draft the runtime refuses for the missing field. */
  const names = (list) => list.map(safe_text).join(t("agents.schema.fields.list_separator"));
  const allowed_text =
    allowed === null
      ? t("agents.subagents.tools_all")
      : allowed === undefined
        ? t("agents.subagents.tools_unspecified")
        : Array.isArray(allowed)
          ? allowed.length === 0
            ? t("agents.subagents.tools_none")
            : names(allowed)
          : t("agents.subagents.tools_unreadable");
  if (disabled.length > 0) {
    const sentence = t("agents.subagents.tools_except", { value1: allowed_text, value2: names(disabled) });
    /* Beside a "Tools" label the sentence's own "Tools:" lead is said twice. */
    const lead = t("agents.subagents.tools_label", { tools: "" });
    return bare && lead && sentence.startsWith(lead) ? sentence.slice(lead.length) : sentence;
  }
  return bare ? allowed_text : t("agents.subagents.tools_label", { tools: allowed_text });
}

/* Every entry can be removed, whatever shape it is in. The row that said
   "remove it and add the Agent again" offered no way to do that, which left
   the author on a page that named the repair and withheld it. A name that is
   not a string cannot be in the label either. */
function remove_label(entry, index, t = agentEnglishText) {
  return is_object(entry) && typeof entry.name === "string" && entry.name
    ? t("agents.subagents.remove_named", { value1: entry.name })
    : t("agents.subagents.remove_entry", { value1: index + 1 });
}

/* One way of calling it: whether it is allowed, what it is called and what
   it means, on one line. The meaning used to live in a tooltip, which is
   where nobody reads it before choosing. */
function ModeRow({ mode, on, onToggle, isDark }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      aria-label={t(on ? "agents.subagents.mode_disallow" : "agents.subagents.mode_allow", { mode })}
      aria-pressed={on}
      onClick={onToggle}
      style={{
        font: "inherit", display: "flex", alignItems: "baseline", gap: 8, width: "100%", minHeight: 26,
        boxSizing: "border-box", padding: 4, margin: 0, border: "none", borderRadius: 6,
        background: "transparent", cursor: "pointer", textAlign: "left", color: text(isDark),
      }}
    >
      <span
        aria-hidden="true"
        style={{
          alignSelf: "center", width: 14, height: 14, borderRadius: 4, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: on ? ACCENT : fillStrong(isDark), transition: "background 160ms ease",
        }}
      >
        {on && <Icon src="check" color="#ffffff" style={{ width: 10, height: 10 }} />}
      </span>
      <span style={{ flexShrink: 0, minWidth: 56, fontSize: 12.5, lineHeight: "18px", opacity: on ? 1 : 0.55 }}>
        {t(MODE_NAME[mode])}
      </span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, lineHeight: "16px", color: mutedOf(isDark), opacity: on ? 1 : 0.55 }}>
        {t(MODE_ABOUT[mode])}
      </span>
    </button>
  );
}

const SEGMENT_BUTTON = Object.freeze({ height: 22, padding: "0 7px", fontWeight: 400, flex: "1 1 auto", justifyContent: "center" });

function EntryRow({
  entry,
  index,
  /* This row's own identity, minted by the list and spent as its React key.
     It is what held text is held against — see below. */
  identity,
  owner_id,
  taken,
  library,
  isDark,
  problems,
  /* Whether another entry in this pool claims this one's id. The store runs
     neither of them until one is changed, and removing one is how an embedded
     Agent's graph used to be lost. */
  shared_id,
  /* Folded, a row is two lines: what it is called, how it may be called and
     what it is for. Its settings are in the body, which stays mounted while
     folded so held text and half-typed values survive. */
  expanded,
  onToggle,
  /* A row that was just added opens with the caret in its description. */
  focusDescription,
  reducedMotion,
  onChange,
  onRemove,
  onRepairId,
  onOpen,
}) {
  const { t } = useTranslation();
  /* Held text belongs to this ROW, which is what the list's own identity
     names.
     It used to be held against the resource, the pool and the entry's id,
     because the document names an entry by its id — and that was wrong in
     exactly the case this pool is built around: two entries can share one id,
     so the id does not name a row, which is why `useListIdentities` exists
     here at all. Worse, the author's own repair changes that id: typing a
     name the pool already has, having it refused and held, then giving the
     row a free id silently threw the typing away and took the refusal
     message with it.
     The minted identity answers both halves. It lives exactly as long as the
     row does and survives the edits this editor makes — including that
     repair, which the list announces — and it is re-minted when the list
     arrives from somewhere else, a reload or another editor's version taken,
     which is when held text must die. The pool and the resource are in it
     already: the list mints per owner. */
  const name = useTakenName(entry.name, taken, identity);
  const description_box = useRef(null);
  useEffect(() => {
    if (focusDescription && description_box.current) description_box.current.focus();
  }, [focusDescription]);
  const agent_id = entry_agent_id(entry);
  const referenced =
    library.status === "ready" && agent_id !== null
      ? library.items.find((item) => item && item.id === agent_id) || null
      : null;
  const missing = library.status === "ready" && agent_id !== null && referenced === null;
  const presentation = entry_presentation(entry, referenced);
  /* The gate, asked of a reference that is already stored. It was asked only
     of one being added, so an entry written by hand, converted from a legacy
     definition or saved by another build pointed at a Workflow and the row
     said "Referenced" with nothing else — while the store refuses it at Run.
     The id-only half is asked even when the library cannot be read. */
  const refused =
    agent_id === null
      ? null
      : why_not_this_reference(agent_id, { owner_id }, t) ||
        (referenced === null ? null : why_not_a_subagent(referenced, { owner_id }, t));
  const name_editable = typeof entry.name === "string";
  const description_editable =
    typeof entry.description === "string" || entry.description === undefined;
  const modes = Array.isArray(entry.allowed_modes) ? entry.allowed_modes : [];

  function set(patch) {
    onChange({ ...entry, ...patch });
  }

  function toggle_mode(mode) {
    /* Written in the wire's own order rather than the order they were
       clicked, so two pools that allow the same modes are the same document. */
    const next = modes.includes(mode)
      ? modes.filter((held) => held !== mode)
      : SUBAGENT_MODES.filter((known) => known === mode || modes.includes(known));
    set({ allowed_modes: next });
  }

  const muted = mutedOf(isDark);
  const show_resource = referenced !== null
    ? resource_label(referenced) !== entry.name
    : agent_id !== null;
  /* How many things are wrong with it, counted on the strip: a broken entry
     must not look like a healthy one while it is folded. What they are is
     said in the body. A shared id is always one of the problems as well. */
  const trouble_count = Math.max(
    problems.length + (refused !== null || missing ? 1 : 0),
    shared_id === true ? 1 : 0,
  );
  const memory_own = entry.memory_policy === MEMORY_OWN;
  const set_memory = () => set({ memory_policy: memory_own ? MEMORY_NONE : MEMORY_OWN });
  const parallel_on = entry.parallel_safe === true;
  const set_parallel = () => set({ parallel_safe: !parallel_on });
  const description_text = typeof entry.description === "string" ? entry.description : "";
  /* "Every tool" is what an entry says by default, and a row that only ever
     says the default is noise. Anything else — a restriction, a missing key,
     an unreadable list — is shown. */
  const tools_default =
    entry.allowed_tools === null &&
    (!Array.isArray(entry.disabled_tools) || entry.disabled_tools.length === 0);
  const note = noteStyle(isDark);
  const problem_style = problemOf(isDark);
  const segmented_style = { display: "flex", flex: "1 1 auto", minWidth: 0, fontSize: 11.5, padding: 2, gap: 2, ...fieldFill(isDark) };
  const toggle_label = t("agents.subagents.toggle_named", {
    name: typeof entry.name === "string" && entry.name ? entry.name : String(index + 1),
  });
  const has_notice = name.held !== null || (shared_id === true && typeof onRepairId === "function") || refused !== null || (missing && refused === null);

  return (
    <div
      data-testid={`subagent-entry-${index}`}
      style={{ display: "flex", flexDirection: "column", minWidth: 0 }}
    >
      {/* The strip, the same in both states: the icon, the name, a count of
          what is wrong and the fold arrow are one toggle; the way into its
          graph and the way out sit on the right, both icons. Everything else
          is in the body. */}
      <div
        data-testid={`subagent-entry-${index}-strip`}
        style={{ display: "flex", alignItems: "center", gap: 6, height: SUBAGENT_STRIP.height, boxSizing: "border-box",
          padding: `0 ${SUBAGENT_STRIP.inset}px`, minWidth: 0 }}
      >
        <button
          type="button"
          aria-label={toggle_label}
          aria-expanded={expanded}
          data-testid={`subagent-entry-${index}-toggle`}
          onClick={onToggle}
          style={{ font: "inherit", flex: 1, minWidth: 0, alignSelf: "stretch", display: "flex", alignItems: "center", gap: 8,
            padding: 0, border: "none", background: "none", color: text(isDark), cursor: "pointer", textAlign: "left" }}
        >
          <SubagentAvatar testid={`subagent-entry-${index}-icon`} size={SUBAGENT_STRIP.avatar} presentation={presentation} />
          <span
            data-testid={`subagent-entry-${index}-name`}
            style={{ flex: "0 1 auto", minWidth: 0, fontSize: 12.5, fontWeight: 500, lineHeight: "18px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {name_editable ? name.shown : safe_text(entry.name)}
          </span>
          <ProblemCount count={trouble_count} section={`subagent-entry-${index}`} isDark={isDark} />
          <Icon src="arrow_down" color={muted} style={{ width: 11, height: 11, flexShrink: 0, opacity: 0.8, pointerEvents: "none",
            transform: expanded ? "rotate(180deg)" : "none", transition: reducedMotion ? "none" : "transform 200ms cubic-bezier(0.32,0.72,0,1)" }} />
        </button>
        {/* A subagent is a complete Agent graph, so its contents are not
            edited here: this opens it on the canvas, with a breadcrumb back.
            A row whose source the store would refuse at Run offers no such
            control — there is no graph to open. */}
        {typeof onOpen === "function" &&
          can_drill(entry) &&
          refused === null &&
          !missing && (
          <Button
            prefix_icon="external_link"
            ariaLabel={typeof entry.name === "string" && entry.name ? t("agents.subagents.open_named", { name: entry.name }) : t("agents.subagents.open_entry", { index: index + 1 })}
            title={t("agents.subagents.open")}
            onClick={onOpen}
            style={removeButtonStyle(isDark)}
          />
        )}
        <Button prefix_icon="close" ariaLabel={remove_label(entry, index, t)} onClick={onRemove} style={removeButtonStyle(isDark)} />
      </div>

      {/* How this Agent uses it. Opens in place, inside the same surface, one
          setting per row with the hairline between them. Stays mounted while
          folded so held text and half-typed values survive. */}
      <div
        aria-hidden={!expanded}
        inert={!expanded}
        data-testid={`subagent-entry-${index}-body`}
        style={{ display: "grid", gridTemplateRows: expanded ? "1fr" : "0fr", opacity: expanded ? 1 : 0,
          visibility: expanded ? "visible" : "hidden", minWidth: 0,
          transition: reducedMotion ? "none"
            : `grid-template-rows 200ms ${EASE}, opacity 160ms ease, visibility 0s ${expanded ? "0s" : "200ms"}` }}
      >
        <div style={{ minHeight: 0, overflow: "hidden" }}>
          {/* The line under the strip is inside the fold, so a folded entry is
              the strip alone. */}
          <div style={{ borderTop: `1px solid ${hairline(isDark)}`, minWidth: 0 }}>
          <Region isDark={isDark} testid={`subagent-entry-${index}-settings`} style={{ background: "transparent", borderRadius: 0 }}>
            {has_notice && (
              <div key="notices" style={{ ...ROW_COLUMN, gap: 6 }}>
                {name.held !== null && (
                  <span data-testid={`subagent-entry-${index}-name-taken`} style={problem_style}>
                    {name.taken
                      ? name.held ? t("agents.subagents.name_taken", { name: name.held }) : t("agents.subagents.name_taken_empty")
                      : t("agents.subagents.name_free_retry")}
                  </span>
                )}

                {/* Two entries under one id: the store runs neither of them.
                    This gives the row an id of its own and changes nothing
                    else. */}
                {shared_id === true && typeof onRepairId === "function" && (
                  <div
                    data-testid={`subagent-entry-${index}-shared-id`}
                    style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}
                  >
                    <span style={{ ...problem_style, flex: 1, minWidth: 0 }}>
                      {t("agents.subagents.shared_id", { value1: entry.id })}
                    </span>
                    <Button
                      label={t("agents.subagents.repair_id")}
                      ariaLabel={typeof entry.name === "string" && entry.name ? t("agents.subagents.repair_named", { name: entry.name }) : t("agents.subagents.repair_entry", { index: index + 1 })}
                      onClick={onRepairId}
                      style={{ flexShrink: 0, fontSize: 11.5, paddingVertical: 3, paddingHorizontal: 7, borderRadius: 5, color: text(isDark) }}
                    />
                  </div>
                )}

                {refused !== null && (
                  <span data-testid={`subagent-entry-${index}-refused`} style={problem_style}>
                    {refused}
                  </span>
                )}

                {missing && refused === null && (
                  <span data-testid={`subagent-entry-${index}-missing`} style={problem_style}>
                    {t("agents.subagents.reference_missing", { value1: agent_id })}
                  </span>
                )}
              </div>
            )}

            {/* The name box stays mounted while folded, so text that was
                typed and not stored is still there when the row opens again.
                A name the box cannot hold is shown rather than edited, for the
                reason an unreadable source is: putting it in the control
                would either ask the value to be a string or quietly replace
                it. */}
            <div key="name" style={ROW_PADDING}>
              <SettingRow isDark={isDark} label={t("agents.subagents.field_name")}>
                <div style={CONTROL}>
                  {name_editable ? (
                    <PanelInput
                      value={name.shown}
                      set_value={(next) => {
                        const stored = name.type(next);
                        if (stored !== null) set({ name: stored });
                      }}
                      placeholder={t("agents.subagents.name_placeholder")}
                      style={{ width: "100%", fontSize: 12.5, height: 28, paddingVertical: 0, paddingHorizontal: 8, color: text(isDark) }}
                    />
                  ) : (
                    <span
                      data-testid={`subagent-entry-${index}-name-unreadable`}
                      style={{ ...note, ...MONO }}
                    >
                      {safe_text(entry.name)}
                    </span>
                  )}
                </div>
              </SettingRow>
            </div>

            {/* The description is what the calling Agent reads to decide when
                to use this one, so it comes first and has room. */}
            <div key="when" style={{ ...ROW_COLUMN, gap: 4 }}>
              <span style={note}>{t("agents.subagents.when_label")}</span>
              {description_editable ? (
                /* The panel's own multi-line field, the Agent's Prompt box:
                   it grows to eight rows and then scrolls with the app's own
                   scrollbar. */
                <div data-testid={`subagent-entry-${index}-description`} style={{ minWidth: 0 }}>
                  <TextField
                    textarea_ref={description_box}
                    aria_label={t("agents.subagents.when_label")}
                    value={description_text}
                    set_value={(next) => set({ description: next })}
                    placeholder={t("agents.subagents.description_placeholder")}
                    min_rows={3}
                    max_display_rows={8}
                    style={{ fontSize: 12.5, lineHeight: 1.55, borderRadius: 8, ...textFieldFill(isDark) }}
                  />
                </div>
              ) : (
                <span
                  data-testid={`subagent-entry-${index}-description-unreadable`}
                  style={{ ...note, ...MONO }}
                >
                  {safe_text(entry.description)}
                </span>
              )}
            </div>

            <div key="modes" style={{ ...ROW_COLUMN, gap: 4 }}>
              <span style={note}>{t("agents.subagents.field_mode")}</span>
              <div style={{ display: "flex", flexDirection: "column", margin: "0 -4px" }}>
                {SUBAGENT_MODES.map((mode) => (
                  <ModeRow
                    key={mode}
                    mode={mode}
                    on={modes.includes(mode)}
                    isDark={isDark}
                    onToggle={() => toggle_mode(mode)}
                  />
                ))}
              </div>
            </div>

            <div key="reads" style={ROW_PADDING}>
              <SettingRow isDark={isDark} label={t("agents.subagents.field_reads")}>
                <div style={CONTROL}>
                  <SegmentedButton
                    options={SUBAGENT_OUTPUT_MODES.map((value) => ({ value, label: OUTPUT_MODE_SHORT[value] ? t(OUTPUT_MODE_SHORT[value]) : value }))}
                    value={typeof entry.output_mode === "string" ? entry.output_mode : null}
                    on_change={(next) => set({ output_mode: next })}
                    style={segmented_style}
                    button_style={SEGMENT_BUTTON}
                  />
                </div>
              </SettingRow>
            </div>

            <div key="memory" style={ROW_PADDING}>
              <SettingRow isDark={isDark} label={<span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                {t("agents.subagents.own_memory")}
                <PanelHelp label={t("agents.subagents.own_memory")}>{memory_own ? t("agents.subagents.memory_scoped") : t("agents.subagents.memory_ephemeral")}</PanelHelp>
              </span>}>
                {/* On is the child's own scope, off is no memory: the wire's
                    two tokens, nothing in between. */}
                <span
                  role="switch"
                  aria-checked={memory_own}
                  aria-label={t("agents.subagents.own_memory")}
                  tabIndex={0}
                  data-testid={`subagent-entry-${index}-memory`}
                  onClick={(event) => { if (event.target === event.currentTarget) set_memory(); }}
                  onKeyDown={(event) => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); set_memory(); } }}
                  style={{ display: "inline-flex", flexShrink: 0, cursor: "pointer" }}
                >
                  {/* The switch stops its click from bubbling, so it commits
                      the change itself; the outer span answers the keyboard
                      and an assistive click on itself. */}
                  <SemiSwitch on={memory_own} set_on={set_memory} style={PANEL_SWITCH} />
                </span>
              </SettingRow>
            </div>

            <div key="parallel" style={ROW_PADDING}>
              {/* The same row as Own memory: what it means behind the info,
                  and a switch the keyboard and assistive tech can work. */}
              <SettingRow isDark={isDark} label={<span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                {t("agents.subagents.field_parallel")}
                <PanelHelp label={t("agents.subagents.field_parallel")}>{parallel_on ? t("agents.subagents.parallel_note") : t("agents.subagents.serial_note")}</PanelHelp>
              </span>}>
                <span
                  role="switch"
                  aria-checked={parallel_on}
                  aria-label={t("agents.subagents.field_parallel")}
                  tabIndex={0}
                  data-testid={`subagent-entry-${index}-parallel`}
                  onClick={(event) => { if (event.target === event.currentTarget) set_parallel(); }}
                  onKeyDown={(event) => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); set_parallel(); } }}
                  style={{ display: "inline-flex", flexShrink: 0, cursor: "pointer" }}
                >
                  <SemiSwitch on={parallel_on} set_on={set_parallel} style={PANEL_SWITCH} />
                </span>
              </SettingRow>
            </div>

            {/* "Every tool" is what an entry says by default, and a row that
                only ever says the default is noise. */}
            {!tools_default && (
              <div key="tools" style={ROW_PADDING}>
                <SettingRow isDark={isDark} label={t("agents.subagents.field_tools")}>
                  <span
                    data-testid={`subagent-entry-${index}-tools`}
                    title={t("agents.subagents.tool_restrictions_note")}
                    style={{ ...CONTROL, display: "block", fontSize: 12, color: muted, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {tools_text(entry, t, true)}
                  </span>
                </SettingRow>
              </div>
            )}

            {problems.length > 0 && (
              <div key="problems" style={{ ...ROW_COLUMN, gap: 4 }}>
                {problems.map((problem, position) => (
                  <span
                    key={position}
                    data-testid={`subagent-entry-${index}-problem-${position}`}
                    style={problem_style}
                  >
                    {`${problem.message} (${problem.where})`}
                  </span>
                ))}
              </div>
            )}

            {/* Where it comes from. */}
            <div key="source" style={ROW_PADDING}>
              <span data-testid={`subagent-entry-${index}-source`} style={{ ...note, display: "block", lineHeight: "18px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", overflowWrap: "normal" }}>
                {`${entry_source_label(entry, t)}${
                  show_resource
                    ? ` · ${referenced !== null ? resource_label(referenced) : agent_id}`
                    : ""
                }`}
              </span>
            </div>
          </Region>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SubagentPoolSection({
  document,
  rootDocument = document,
  revision,
  node,
  isDark,
  onChange,
  /* Converting a legacy pool is a write to the stored resource, not an edit of
     the document on screen, so the page that owns the resource session
     performs it and this only asks. Absent where there is no session — the
     legacy recipe page, or a panel rendered without one. */
  onConvertLegacy,
  canConvertLegacy,
  convertingLegacy,
  /* Opening a subagent's own graph is the page's business — it owns the drill
     stack and the resource session. This only asks, naming the pool and the
     entry. */
  onOpenSubagent,
  /* Whether the graph on screen is itself an embedded subagent. Converting is
     a write to the whole resource, so it is offered from the Agent that owns
     this graph rather than from inside it. */
  embedded,
  /* An entry that has just been given an id of its own. The document write is
     this panel's, like every other pool edit; what the page does with it is
     navigation — a step, a frame or a layout key that named the old id. */
  onEntryIdRepaired,
}) {
  const { t } = useTranslation();
  /* The library is read when the panel mounts and again whenever the store
     announces a change, for two jobs: offering Agents to
     reference, and saying that an entry's reference is no longer there. A
     build that cannot reach the store says so rather than looking like an
     account with no Agents in it. */
  const [library, setLibrary] = useState({
    status: "loading",
    items: [],
    error: null,
    reading: true,
  });
  const [creationError, setCreationError] = useState(null);
  const creationScope = identity_of([document.id, node.id, revision]);
  useEffect(() => { setCreationError(null); }, [creationScope]);
  const alive = useRef(true);
  /* Which read is the current one. `alive` only knows about unmounting, so an
     older request that answered late replaced a newer library — and then
     offered an Agent the newer answer had excluded. A reply is applied only
     while it is still the latest question asked. */
  const asked = useRef(0);

  const read_library = useCallback(() => {
    const ticket = asked.current + 1;
    asked.current = ticket;
    /* Ordering the replies was not enough. While a newer read is in flight the
       previous answer is no longer the current one, and leaving it on screen
       left an Agent the newer read would exclude one click from being
       referenced. The picker says it is reading instead. */
    setLibrary((previous) => ({ ...previous, reading: true }));
    return Promise.resolve(list_resources(false)).then((answer) => {
      if (!alive.current || ticket !== asked.current) return;
      if (answer && answer.ok) {
        const data = answer.data || {};
        setLibrary({
          status: "ready",
          items: Array.isArray(data.resources) ? data.resources : [],
          error: null,
          reading: false,
        });
        return;
      }
      setLibrary({
        status: is_unavailable(answer) ? "unavailable" : "failed",
        items: [],
        error: (answer && answer.error) || null,
        reading: false,
      });
    }).catch((error) => {
      /* The facade answers rather than throwing, which is its whole subject —
         but a read that threw anyway would leave this reading for ever, and a
         picker that says nothing while waiting for nothing is worse than one
         that says it failed. */
      if (!alive.current || ticket !== asked.current) return;
      setLibrary({ status: "failed", items: [], error, reading: false });
    });
  }, []);

  useEffect(() => {
    alive.current = true;
    read_library();
    /* The library is on screen for as long as the panel is, so it is read
       again whenever the store says it may have changed — a save here or in
       another window — rather than on the way into a picker that no longer
       has to be opened. */
    const unsubscribe = subscribeSkeletonLibraryRefresh(() => { read_library(); });
    return () => {
      alive.current = false;
      unsubscribe();
    };
  }, [read_library]);

  const legacy = node_pool_is_legacy(node);
  const legacy_entries = legacy ? node_legacy_pool_entries(node) : [];
  /* Asked about the whole Agent, because the conversion is one write over all
     of it: an inline entry in another pool decides what this button may do,
     and so does the Kernel configured on a node that is not this one. The
     same plan is computed again by the hook that performs the write — this
     one is what the panel says, that one is what is sent. */
  const plan = legacy ? legacy_conversion_plan(document) : null;
  const held = node_subagents(node);
  const entries = Array.isArray(held) ? held : [];
  /* The owner is the resource being edited, which is the document's own id:
     referencing it would be an Agent calling itself, and an entry id means
     nothing outside the pool it sits in. */
  const owner_id = (document && document.id) || null;

  /* An identity per row, minted here and spent as the row's React key.
   *
   * The document names an entry — `id` is unique in a valid pool — and that
   * is what held text is held *against*. But a draft the store accepts can
   * hold two entries with one id and one name, told apart only by their
   * descriptions, and then the document names nothing: position is not an
   * identity once a row is removed, the stored value is not one either, and
   * the editor's own text was drawn over the survivor. So the list carries an
   * identity across its own edits, which only the list can do — see
   * `mint_identities`. The duplicate guard is NOT the answer to this; it was
   * loosened on purpose so a duplicate draft stays repairable.
   *
   * The entry list itself is handed over as well, because carrying an
   * identity across the editor's own edit and carrying it across somebody
   * else's version are not the same thing. Taking the other editor's version
   * can reorder two entries the document cannot tell apart while the count
   * stays the same, and then nothing the panel is able to compare has changed
   * — so the ids are kept only for a list this editor announced it was
   * writing. */
  const rows = useListIdentities(
    identity_of([owner_id, node.id]),
    entries.length,
    held,
  );

  /* A legacy pool is not in this wire at all, so the wire's rules would
     describe it wrongly — `legacy_fields` would read as an unknown field and
     the missing `subagents` as a missing one, for a document the store
     expands on its own. */
  const problems = legacy ? [] : subagent_pool_problems(node.config, ["config"], t);
  /* What is taken, read only from entries that state it. A broken entry does
     not occupy the empty name — that would make the one name the wire allows
     unusable because of a value nobody can see. */
  const names = entries.map((entry) =>
    is_object(entry) && typeof entry.name === "string" ? entry.name : null,
  );
  const ids = entries
    .filter((entry) => is_object(entry) && typeof entry.id === "string")
    .map((entry) => entry.id);

  /* The rows the pool cannot tell apart by id, which is who gets the repair. */
  const shared_ids = legacy ? [] : shared_entry_id_rows(entries);

  const offered = subagent_candidates(library.items, { owner_id });
  const reducedMotion = useReducedMotion();
  const [search, setSearch] = useState("");
  /* Which row is open: one at a time, so the pool reads as a roster. Every
     row starts folded — a pool of one and a row with something wrong with it
     too, whose folded strip already counts what is wrong — and only the
     author opens one. Named by the row's minted identity, so it follows the
     row through this editor's own edits and lets go when the list arrives
     from somewhere else. */
  const [openRow, setOpenRow] = useState(null);
  /* The one exception: the row the author has just added opens, once, with
     the caret in its description, because it is there to be filled in. Its
     identity does not exist until the list has rendered with it. */
  const [focusRow, setFocusRow] = useState(null);
  const opening_added = useRef(false);
  const last_identity = rows.ids[entries.length - 1];
  useEffect(() => {
    if (!opening_added.current) return;
    opening_added.current = false;
    setOpenRow(last_identity);
    setFocusRow(last_identity);
  }, [last_identity]);
  const withheld = library.items.length - offered.length;

  const query = search.trim().toLowerCase();
  const matching = query
    ? offered.filter((resource) => resource_label(resource).toLowerCase().includes(query))
    : offered;

  function set_entries(next) {
    /* The composer is never handed a collision it did not already have. The
       name box is what tells the author; this is the belt at the boundary, and
       the rule itself lives with the pool's other rules. */
    if (introduces_collision(entries, next)) return;
    /* This list is about to be the document's. Anything else that arrives is
       a version from somewhere else, and the row identities do not survive
       it. */
    rows.carrying(next);
    onChange(with_node_subagents(document, node.id, next));
  }

  /* The identities are told in the same tick as the edit is reported, so the
     render that follows sees a count that already matches and keeps them.
     Only these two edits move rows, and neither can be refused: a removal
     cannot introduce a collision, and an added entry takes a name and an id
     nothing is using. A write that IS refused — a rename onto a taken name —
     never reaches here, so no identity is spent on an edit that did not
     happen. */
  function remove_entry(index) {
    rows.removed(index);
    set_entries(entries.filter((_, position) => position !== index));
  }

  /* Give this one row an id of its own.
   *
   * The store runs a pool whose entry ids are unique — `duplicate_name` at
   * the second entry's `id` — and a draft holding two is saved and read back
   * verbatim. Until now the only repair was removing one of them, which for
   * an embedded entry destroys an Agent graph; the comment on
   * `introduces_collision` says exactly that. This writes one field.
   *
   * Only `id`, and only on this row: the embedded graph, the name, the
   * description, every policy, whatever bad values the entry holds and
   * anything typed and not yet saved are the same objects afterwards. It is
   * an ordinary edit — the draft goes dirty and the author saves it at the
   * token they loaded, like any other.
   *
   * The id itself is `free_entry_id`, which is what an added entry already
   * uses: unique in this pool, which is the only place an entry id means
   * anything — measured, the same id in two different pools of one document
   * runs.
   *
   * What it does NOT claim is that the Agent will now run. Repairing the id
   * is one refusal fewer; two entries whose embedded graphs carry one
   * document id are still `dependency_conflict` at Run, and the row says so
   * when the store says it. */
  function repair_entry_id(index) {
    const entry = entries[index];
    if (!is_object(entry)) return;
    const next_id = free_entry_id(ids);
    set_entries(
      entries.map((old, position) =>
        position === index ? { ...old, id: next_id } : old,
      ),
    );
    if (typeof onEntryIdRepaired === "function") {
      /* The document this write produced goes with the report: what the page
         does about it is the drawings, and both keys it has to move are
         computed from the pool before and after. */
      onEntryIdRepaired({
        pool_node_id: node.id,
        entry_index: index,
        previous_id: entry.id,
        next_id,
        document: with_node_subagents(
          document,
          node.id,
          entries.map((old, position) =>
            position === index ? { ...old, id: next_id } : old,
          ),
        ),
      });
    }
  }

  function add(resource) {
    setSearch("");
    opening_added.current = true;
    rows.added();
    set_entries([
      ...entries,
      new_subagent_entry({
        id: free_entry_id(ids),
        name: free_entry_name(
          names.filter((name) => name !== null),
          resource.name,
        ),
        agent_id: resource.id,
      }),
    ]);
  }

  const canCreateEmbedded = !legacy && Array.isArray(held) && document.kind === "agent" &&
    document.schema_version === 1 && typeof onChange === "function" &&
    Array.isArray(document.nodes) && document.nodes.filter((candidate) => is_object(candidate) && candidate.id === node.id).length === 1;

  function create_embedded() {
    if (!canCreateEmbedded) return;
    const created = new_embedded_entry({ rootDocument, entries }, agentMessage);
    if (!created.ok) {
      setCreationError({ scope: creationScope, message: created.problem });
      return;
    }
    setCreationError(null);
    setSearch("");
    opening_added.current = true;
    rows.added();
    set_entries([...entries, created.entry]);
    /* Opening is a separate action: this render's navigation callback still
       describes the document before the new row existed. */
  }

  const note = noteStyle(isDark);
  const problem_style = problemOf(isDark);

  return (
    <div
      data-testid="skeleton-subagent-pool"
      style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}
    >
      {/* The panel's one caption, with what is wrong counted beside it, what
          the panel is for behind the info and how many entries there are on
          the right. */}
      <Block
        section="subagents"
        title={t("agents.subagents.title")}
        help={<span data-testid="subagent-pool-title" title={t("agents.subagents.intro")}>{t("agents.subagents.intro")}</span>}
        problems={problems}
        aside={legacy ? undefined : String(entries.length)}
        isDark={isDark}
      >
      {!legacy && !canCreateEmbedded && <span style={problem_style}>{t("agents.subagents.embedded_unavailable")}</span>}
      {!legacy && creationError?.scope === creationScope && <span role="alert" style={problem_style}>{renderAgentMessage(creationError.message, t)}</span>}

      {legacy && (
        <span data-testid="subagent-pool-legacy" style={note}>
          {t("agents.subagents.legacy_note")}
        </span>
      )}

      {legacy && plan.refusal && (
        <span data-testid="subagent-pool-legacy-needs-kernel" style={note}>
          {refusal_caption(plan, node.id, t)}
        </span>
      )}

      {legacy && !plan.refusal && plan.required && (
        <span data-testid="subagent-pool-legacy-kernel-chosen" style={note}>
          {conversion_caption(plan, node.id, t)}
        </span>
      )}

      {legacy &&
        !plan.refusal &&
        (typeof onConvertLegacy !== "function" ? (
          <span data-testid="subagent-pool-legacy-unreachable" style={note}>
            {t("agents.subagents.conversion_unreachable")}
          </span>
        ) : convertingLegacy ? (
          <span data-testid="subagent-pool-legacy-converting" style={note}>
            {t("agents.subagents.converting")}
          </span>
        ) : embedded ? (
          <span data-testid="subagent-pool-legacy-embedded" style={note}>
            {t("agents.subagents.embedded_conversion_owner")}
          </span>
        ) : canConvertLegacy === false ? (
          <span data-testid="subagent-pool-legacy-save-first" style={note}>
            {t("agents.subagents.save_before_convert")}
          </span>
        ) : (
          <Button
            label={t("agents.subagents.convert")}
            onClick={onConvertLegacy}
            style={{
              alignSelf: "flex-start",
              fontSize: 12,
              paddingVertical: 6,
              paddingHorizontal: 10,
              color: text(isDark),
              ...fieldFill(isDark),
            }}
          />
        ))}

      {legacy &&
        legacy_entries.map((raw, index) => (
          <span
            key={index}
            data-testid={`subagent-legacy-entry-${index}`}
            style={{ ...note, ...MONO }}
          >
            {/* `legacy_fields` is the old node's keys copied verbatim
                (`legacy.py:147`) and nothing has ever asked their shapes, so
                a name here can be any JSON at all — including an object,
                which React refuses as a child and which `${}` refuses to make
                text. */}
            {legacy_entry_label(raw)}
          </span>
        ))}

      {!legacy && entries.length === 0 && (
        <span data-testid="subagent-pool-empty" style={note}>
          {t("agents.subagents.empty")}
        </span>
      )}

      {/* One surface per subagent, a little apart, so each reads as its own
          block; folded, it is its strip alone. */}
      {!legacy && entries.length > 0 && (
        <div data-testid="subagent-pool-entries" style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
        {entries.map((entry, index) =>
          is_object(entry) ? (
            <Region key={rows.ids[index]} isDark={isDark} testid={`subagent-entry-${index}-region`}>
            <EntryRow
              entry={entry}
              index={index}
              identity={rows.ids[index]}
              owner_id={owner_id}
              taken={names.filter(
                (name, position) => position !== index && name !== null,
              )}
              library={library}
              isDark={isDark}
              problems={problems_at(problems, `config.subagents[${index}]`)}
              shared_id={shared_ids.includes(index)}
              expanded={openRow === rows.ids[index]}
              onToggle={() => {
                setFocusRow(null);
                setOpenRow(openRow === rows.ids[index] ? null : rows.ids[index]);
              }}
              focusDescription={focusRow === rows.ids[index]}
              reducedMotion={reducedMotion}
              onRepairId={() => repair_entry_id(index)}
              onOpen={
                typeof onOpenSubagent === "function"
                  ? () =>
                      onOpenSubagent({
                        pool_node_id: node.id,
                        entry_id: entry.id,
                        /* Which row it is, as well as what it names: a draft
                           the store accepts can hold two entries with one id,
                           and this row is one particular graph. */
                        entry_index: index,
                        reason: null,
                      })
                  : undefined
              }
              onChange={(next) =>
                set_entries(entries.map((old, position) => (position === index ? next : old)))
              }
              onRemove={() => remove_entry(index)}
            />
            </Region>
          ) : (
            /* A draft can hold anything the format check takes, and a `config`
               object is all that layer asks of a pool. The problems are
               reported here rather than at the section, because they are about
               this position in the list and a reader looking for them will
               look where the entry should have been. */
            <Region key={rows.ids[index]} isDark={isDark} testid={`subagent-entry-${index}-region`}>
              <div
                key="strip"
                style={{ display: "flex", alignItems: "center", gap: 6, height: SUBAGENT_STRIP.height, boxSizing: "border-box",
                  padding: `0 ${SUBAGENT_STRIP.inset}px 0 11px`, minWidth: 0 }}
              >
                <span
                  data-testid={`subagent-entry-${index}-unreadable`}
                  style={{ ...problem_style, flex: 1, minWidth: 0 }}
                >{t("agents.subagents.entry_unreadable")}</span>
                <Button
                  prefix_icon="close"
                  ariaLabel={remove_label(entry, index)}
                  onClick={() => remove_entry(index)}
                  style={removeButtonStyle(isDark)}
                />
              </div>
              {problems_at(problems, `config.subagents[${index}]`).length > 0 && (
                <div key="problems" style={{ ...ROW_COLUMN, gap: 4 }}>
                  {problems_at(problems, `config.subagents[${index}]`).map(
                    (problem, position) => (
                      <span
                        key={position}
                        data-testid={`subagent-entry-${index}-problem-${position}`}
                        style={problem_style}
                      >
                        {`${problem.message} (${problem.where})`}
                      </span>
                    ),
                  )}
                </div>
              )}
            </Region>
          ),
        )}
        </div>
      )}

      {/* The one add control, directly under the last subagent, the same as
          the Toolkit Pool's: an Agent that lives only inside this pool. The
          stored Agents are offered in the library below. */}
      {!legacy && (
        <AddButton
          /* Just "+ Add", as the Toolkit Pool's; what it adds is said to
             assistive tech and in the hover note. */
          label={t("agents.legacy_tools.add")}
          ariaLabel={t("agents.subagents.new_embedded")}
          title={t("agents.subagents.embedded_note")}
          disabled={!canCreateEmbedded}
          onClick={create_embedded}
          isDark={isDark}
        />
      )}

      {/* The pool's own problems. An entry's are shown on the entry, so this
          is everything addressed above them: a missing `subagents`, a pool
          holding nothing, an unknown field on the config itself.
       *
       * Not gated on the shape again. A legacy pool has no problems to show
       * because none were computed for it, and a second guard here would be a
       * condition that cannot be false — the unreachable-UI shape that has
       * already cost this panel one round, where a notice claimed something
       * no reader could ever see. */}
      {problems
          .filter((problem) => !problem.where.startsWith("config.subagents["))
          .map((problem, index) => (
            <span
              key={index}
              data-testid={`subagent-pool-problem-${index}`}
              style={problem_style}
            >
              {`${problem.message} (${problem.where})`}
            </span>
          ))}
      </Block>

      {/* What can be referenced, always in view under the pool the way the
          Toolkit Pool keeps its installed library under its own: the stored
          Agents, searchable, each with its own Add. */}
      {!legacy && (
        <Block section="subagent-library" title={t("agents.subagents.library_title")} isDark={isDark}>
          {library.reading && (
            <span data-testid="subagent-library-reading" style={note}>{t("agents.subagents.library_reading")}</span>
          )}

          {!library.reading && library.status === "unavailable" && (
            <span data-testid="subagent-library-unavailable" style={note}>
              {t("agents.subagents.library_unreachable")}
            </span>
          )}

          {!library.reading && library.status === "failed" && (
            <span data-testid="subagent-library-failed" style={problem_style}>
              {t("agents.subagents.library_failed", { message: (library.error && library.error.message) || t("agents.subagents.store_refused") })}
            </span>
          )}

          {!library.reading && library.status === "ready" && (
            <div
              data-testid="subagent-picker"
              style={{ display: "flex", flexDirection: "column", gap: 8 }}
            >
              {offered.length === 0 && (
                <span data-testid="subagent-picker-empty" style={note}>{t("agents.subagents.library_empty")}</span>
              )}
              {offered.length > 0 && (
                <PanelInput
                  prefix_icon="search"
                  placeholder={t("agents.subagents.search")}
                  value={search}
                  set_value={setSearch}
                  style={{ width: "100%", fontSize: 12.5, height: 32, paddingVertical: 0, paddingHorizontal: 10 }}
                />
              )}
              {/* The library's rows are the Toolkit library's: the mark, the
                  name, and Add on the right. */}
              <Region isDark={isDark}>{matching.map((resource) => (
                <div key={resource.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 5px 7px 10px", minWidth: 0 }}>
                  <SubagentAvatar size={20} presentation={resource.presentation} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: text(isDark), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {resource_label(resource)}
                  </span>
                  <Button
                    prefix_icon="add"
                    label={t("agents.legacy_tools.add")}
                    ariaLabel={t("agents.subagents.reference", { value1: resource_label(resource) })}
                    onClick={() => add(resource)}
                    style={{ flexShrink: 0, fontSize: 11.5, paddingVertical: 4, paddingHorizontal: 7, borderRadius: 6, gap: 3, color: text(isDark), content: { icon: { width: 11, height: 11 } } }}
                  />
                </div>
              ))}</Region>
              {offered.length > 0 && matching.length === 0 && (
                <span data-testid="subagent-picker-no-match" style={note}>{t("agents.subagents.no_match", { search: search.trim() })}</span>
              )}
              {withheld > 0 && (
                <span data-testid="subagent-picker-withheld" style={note}>
                  {t(withheld === 1 ? "agents.subagents.withheld_one" : "agents.subagents.withheld_other", { count: withheld })}
                </span>
              )}
            </div>
          )}
        </Block>
      )}
    </div>
  );
}
