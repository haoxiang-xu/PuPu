import { agentEnglishText, agentMessage, renderAgentMessage } from "../agents_i18n";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import Input from "../../../../../BUILTIN_COMPONENTs/input/input";
import Select from "./panel_select";
import Switch from "../../../../../BUILTIN_COMPONENTs/input/switch";
import Icon from "../../../../../BUILTIN_COMPONENTs/icon/icon";
import useTakenName from "./taken_name";
import useListIdentities from "./list_identity";
import {
  node_legacy_pool_entries,
  node_pool_is_legacy,
  node_subagents,
  with_node_subagents,
} from "../skeleton_document";
import {
  SUBAGENT_MEMORY_POLICIES,
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
import { identity_of, own, safe_text } from "../document_values";
import { new_embedded_entry } from "../new_embedded_entry";

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

const SECTION_LABEL = {
  fontSize: 11,
  fontWeight: 600,
  color: "#86868b",
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const CAPTION = { fontSize: 10.5, color: "#86868b", lineHeight: 1.45 };
const MONO = { fontFamily: "ui-monospace, Menlo, monospace" };
const PROBLEM = { fontSize: 10.5, lineHeight: 1.45 };
const REFUSED = { ...PROBLEM, color: "rgba(176,32,32,0.95)" };







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













const MODE_CAPTION = {
  delegate: "delegate — called as a tool, its result comes back here",
  handoff: "handoff — this Agent's turn ends and the subagent answers",
  worker: "worker — runs alongside, this Agent keeps the turn",
};

const OUTPUT_MODE_LABEL = {
  summary: "a summary",
  last_message: "its last message",
  full_trace: "its whole trace",
};

const MEMORY_LABEL = {
  ephemeral: "nothing is kept",
  scoped_persistent: "kept in its own scope",
};

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

function ModeToggle({ mode, on, onToggle, isDark }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      aria-label={t(on ? "agents.subagents.mode_disallow" : "agents.subagents.mode_allow", { mode })}
      aria-pressed={on}
      title={t(`agents.subagents.mode_${mode}`, { mode })}
      onClick={onToggle}
      style={{
        flexShrink: 0,
        fontSize: 10.5,
        fontFamily: "ui-monospace, Menlo, monospace",
        padding: "2px 8px",
        borderRadius: 999,
        border: "none",
        cursor: "pointer",
        color: on ? "#fff" : isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.4)",
        background: on ? "#4a5bd8" : isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.045)",
      }}
    >
      {mode}
    </button>
  );
}

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
  const agent_id = entry_agent_id(entry);
  const referenced =
    library.status === "ready" && agent_id !== null
      ? library.items.find((item) => item && item.id === agent_id) || null
      : null;
  const missing = library.status === "ready" && agent_id !== null && referenced === null;
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

  const muted = isDark ? "#9a9aa3" : "#86868b";
  const hairline = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const field = { fontSize: 11, color: muted, whiteSpace: "nowrap" };
  const select_style = { width: "100%", fontSize: 11.5, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 5, gap: 4 };
  const show_resource = referenced !== null
    ? resource_label(referenced) !== entry.name
    : agent_id !== null;

  return (
    <div
      data-testid={`subagent-entry-${index}`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "8px 10px 10px",
        borderRadius: 8,
        background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.025)",
      }}
    >
      {/* Identity: what it is called, where it comes from, open / remove. */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ width: 22, height: 22, marginTop: 3, borderRadius: 6, flexShrink: 0, background: "linear-gradient(135deg, #6478f6, #4a5bd8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon src="bot" color="#fff" style={{ width: 12, height: 12 }} />
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          {/* A name the box cannot hold is shown rather than edited, for the
              reason an unreadable source is: putting it in the control would
              either ask the value to be a string or quietly replace it. */}
          {name_editable ? (
            <Input
              value={name.shown}
              set_value={(next) => {
                const stored = name.type(next);
                if (stored !== null) set({ name: stored });
              }}
              placeholder={t("agents.subagents.name_placeholder")}
              style={{ width: "100%", fontSize: 12, fontWeight: 500, paddingVertical: 3, paddingHorizontal: 6, borderRadius: 5 }}
            />
          ) : (
            <span
              data-testid={`subagent-entry-${index}-name-unreadable`}
              style={{ ...CAPTION, ...MONO }}
            >
              {safe_text(entry.name)}
            </span>
          )}
          <span data-testid={`subagent-entry-${index}-source`} style={{ ...CAPTION, color: muted, paddingLeft: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {`${entry_source_label(entry, t)}${
              show_resource
                ? ` · ${referenced !== null ? resource_label(referenced) : agent_id}`
                : ""
            }`}
          </span>
        </div>
        {/* A subagent is a complete Agent graph, so its contents are not
            edited here: this opens it on the canvas, with a breadcrumb back.
            A row whose source the store would refuse at Run offers no such
            control — there is no graph to open. */}
        {typeof onOpen === "function" &&
          can_drill(entry) &&
          refused === null &&
          !missing && (
          <Button
            label={t("agents.subagents.open")}
            ariaLabel={typeof entry.name === "string" && entry.name ? t("agents.subagents.open_named", { name: entry.name }) : t("agents.subagents.open_entry", { index: index + 1 })}
            onClick={onOpen}
            style={{ flexShrink: 0, marginTop: 2, fontSize: 11, paddingVertical: 3, paddingHorizontal: 7, borderRadius: 4, color: "#4a5bd8" }}
          />
        )}
        <Button
          prefix_icon="close"
          ariaLabel={remove_label(entry, index, t)}
          onClick={onRemove}
          style={{ flexShrink: 0, marginTop: 2, paddingVertical: 4, paddingHorizontal: 4, borderRadius: 4, content: { icon: { width: 11, height: 11 } } }}
        />
      </div>

      {name.held !== null && (
        <span data-testid={`subagent-entry-${index}-name-taken`} style={REFUSED}>
          {name.taken
            ? name.held ? t("agents.subagents.name_taken", { name: name.held }) : t("agents.subagents.name_taken_empty")
            : t("agents.subagents.name_free_retry")}
        </span>
      )}

      {/* Two entries under one id: the store runs neither of them. This gives
          the row an id of its own and changes nothing else. */}
      {shared_id === true && typeof onRepairId === "function" && (
        <div
          data-testid={`subagent-entry-${index}-shared-id`}
          style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}
        >
          <span style={{ ...REFUSED, flex: 1, minWidth: 0 }}>
            {t("agents.subagents.shared_id", { value1: entry.id })}
          </span>
          <Button
            label={t("agents.subagents.repair_id")}
            ariaLabel={typeof entry.name === "string" && entry.name ? t("agents.subagents.repair_named", { name: entry.name }) : t("agents.subagents.repair_entry", { index: index + 1 })}
            onClick={onRepairId}
            style={{ flexShrink: 0, fontSize: 10.5, paddingVertical: 3, paddingHorizontal: 7, borderRadius: 4, color: "#4a5bd8" }}
          />
        </div>
      )}

      {refused !== null && (
        <span data-testid={`subagent-entry-${index}-refused`} style={REFUSED}>
          {refused}
        </span>
      )}

      {missing && refused === null && (
        <span data-testid={`subagent-entry-${index}-missing`} style={REFUSED}>
          {t("agents.subagents.reference_missing", { value1: agent_id })}
        </span>
      )}

      {description_editable ? (
        <Input
          value={typeof entry.description === "string" ? entry.description : ""}
          set_value={(next) => set({ description: next })}
          placeholder={t("agents.subagents.description_placeholder")}
          style={{ width: "100%", fontSize: 11, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 5 }}
        />
      ) : (
        <span
          data-testid={`subagent-entry-${index}-description-unreadable`}
          style={{ ...CAPTION, ...MONO }}
        >
          {safe_text(entry.description)}
        </span>
      )}

      <div style={{ height: 1, background: hairline }} />

      {/* How this Agent uses it: one label column, one control column. The
          long explanations live in tooltips instead of under every row. */}
      <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", columnGap: 12, rowGap: 7, alignItems: "center" }}>
        <span style={field}>{t("agents.subagents.field_mode")}</span>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {SUBAGENT_MODES.map((mode) => (
            <ModeToggle
              key={mode}
              mode={mode}
              on={modes.includes(mode)}
              isDark={isDark}
              onToggle={() => toggle_mode(mode)}
            />
          ))}
        </div>

        <span style={field}>{t("agents.subagents.field_reads")}</span>
        <Select
          options={SUBAGENT_OUTPUT_MODES.map((value) => ({
            value,
            label: own(OUTPUT_MODE_LABEL, value) !== undefined ? t(({ __proto__: null, summary: "agents.subagents.output_summary", last_message: "agents.subagents.output_last_message", full_trace: "agents.subagents.output_full_trace" })[value]) : OUTPUT_MODE_LABEL[value],
          }))}
          value={entry.output_mode}
          set_value={(next) => set({ output_mode: next })}
          filterable={false}
          style={select_style}
        />

        <span style={field}>{t("agents.subagents.field_memory")}</span>
        <Select
          options={SUBAGENT_MEMORY_POLICIES.map((value) => ({
            value,
            label: own(MEMORY_LABEL, value) !== undefined ? t(({ __proto__: null, ephemeral: "agents.subagents.memory_ephemeral", scoped_persistent: "agents.subagents.memory_scoped" })[value]) : MEMORY_LABEL[value],
          }))}
          value={entry.memory_policy}
          set_value={(next) => set({ memory_policy: next })}
          filterable={false}
          style={select_style}
        />

        <span style={field}>{t("agents.subagents.field_parallel")}</span>
        <div
          data-testid={`subagent-entry-${index}-parallel`}
          title={entry.parallel_safe === true ? t("agents.subagents.parallel_note") : t("agents.subagents.serial_note")}
          style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}
        >
          <Switch
            on={entry.parallel_safe === true}
            set_on={(next) => set({ parallel_safe: Boolean(next) })}
            style={{ width: 40, height: 20, flexShrink: 0 }}
          />
        </div>

        <span style={field}>{t("agents.subagents.field_tools")}</span>
        <span
          data-testid={`subagent-entry-${index}-tools`}
          title={t("agents.subagents.tool_restrictions_note")}
          style={{ fontSize: 11, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {tools_text(entry, t, true)}
        </span>
      </div>

      {problems.map((problem, position) => (
        <span
          key={position}
          data-testid={`subagent-entry-${index}-problem-${position}`}
          style={{
            ...PROBLEM,
            color: isDark ? "rgba(255,140,140,0.95)" : "rgba(176,32,32,0.95)",
          }}
        >
          {`${problem.message} (${problem.where})`}
        </span>
      ))}
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
  /* The library is read once per panel, for two jobs: offering Agents to
     reference, and saying that an entry's reference is no longer there. A
     build that cannot reach the store says so rather than looking like an
     account with no Agents in it. */
  const [library, setLibrary] = useState({
    status: "loading",
    items: [],
    error: null,
    reading: true,
  });
  const [picking, setPicking] = useState(false);
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
    return () => {
      alive.current = false;
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
  const withheld = library.items.length - offered.length;

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
    setPicking(false);
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
    rows.added();
    set_entries([...entries, created.entry]);
    /* Opening is a separate action: this render's navigation callback still
       describes the document before the new row existed. */
  }

  return (
    <div
      data-testid="skeleton-subagent-pool"
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span data-testid="subagent-pool-title" title={t("agents.subagents.intro")} style={SECTION_LABEL}>{t("agents.subagents.title")}</span>
        {!legacy && (
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Button
              label={picking ? t("agents.explorer.cancel") : t("agents.subagents.add_agent")}
              /* Read again on the way in: the library can change from
                 another window, and both an archived Agent being offered and
                 a reference wrongly called missing are worth a request. */
              onClick={() => {
                if (!picking) read_library();
                setPicking(!picking);
              }}
              style={{ fontSize: 11, paddingVertical: 3, paddingHorizontal: 6, borderRadius: 5, color: "#4a5bd8" }}
            />
            <Button
              label={t("agents.subagents.new_embedded_short")}
              ariaLabel={t("agents.subagents.new_embedded")}
              title={t("agents.subagents.embedded_note")}
              disabled={!canCreateEmbedded}
              onClick={create_embedded}
              style={{ fontSize: 11, paddingVertical: 3, paddingHorizontal: 6, borderRadius: 5, color: "#4a5bd8" }}
            />
          </div>
        )}
      </div>

      {!legacy && !canCreateEmbedded && <span style={REFUSED}>{t("agents.subagents.embedded_unavailable")}</span>}
      {!legacy && creationError?.scope === creationScope && <span role="alert" style={REFUSED}>{renderAgentMessage(creationError.message, t)}</span>}

      {legacy && (
        <span data-testid="subagent-pool-legacy" style={CAPTION}>
          {t("agents.subagents.legacy_note")}
        </span>
      )}

      {legacy && plan.refusal && (
        <span data-testid="subagent-pool-legacy-needs-kernel" style={CAPTION}>
          {refusal_caption(plan, node.id, t)}
        </span>
      )}

      {legacy && !plan.refusal && plan.required && (
        <span data-testid="subagent-pool-legacy-kernel-chosen" style={CAPTION}>
          {conversion_caption(plan, node.id, t)}
        </span>
      )}

      {legacy &&
        !plan.refusal &&
        (typeof onConvertLegacy !== "function" ? (
          <span data-testid="subagent-pool-legacy-unreachable" style={CAPTION}>
            {t("agents.subagents.conversion_unreachable")}
          </span>
        ) : convertingLegacy ? (
          <span data-testid="subagent-pool-legacy-converting" style={CAPTION}>
            {t("agents.subagents.converting")}
          </span>
        ) : embedded ? (
          <span data-testid="subagent-pool-legacy-embedded" style={CAPTION}>
            {t("agents.subagents.embedded_conversion_owner")}
          </span>
        ) : canConvertLegacy === false ? (
          <span data-testid="subagent-pool-legacy-save-first" style={CAPTION}>
            {t("agents.subagents.save_before_convert")}
          </span>
        ) : (
          <Button
            label={t("agents.subagents.convert")}
            onClick={onConvertLegacy}
            style={{
              alignSelf: "flex-start",
              fontSize: 11,
              paddingVertical: 3,
              paddingHorizontal: 8,
              borderRadius: 5,
              color: "#4a5bd8",
            }}
          />
        ))}

      {legacy &&
        legacy_entries.map((raw, index) => (
          <span
            key={index}
            data-testid={`subagent-legacy-entry-${index}`}
            style={{ ...CAPTION, ...MONO }}
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
        <span data-testid="subagent-pool-empty" style={CAPTION}>
          {t("agents.subagents.empty")}
        </span>
      )}

      {!legacy &&
        entries.map((entry, index) =>
          is_object(entry) ? (
            <EntryRow
              key={rows.ids[index]}
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
          ) : (
            /* A draft can hold anything the format check takes, and a `config`
               object is all that layer asks of a pool. The problems are
               reported here rather than at the section, because they are about
               this position in the list and a reader looking for them will
               look where the entry should have been. */
            <div
              key={rows.ids[index]}
              style={{ display: "flex", flexDirection: "column", gap: 4 }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  data-testid={`subagent-entry-${index}-unreadable`}
                  style={{ ...REFUSED, flex: 1, minWidth: 0 }}
                >{t("agents.subagents.entry_unreadable")}</span>
                <Button
                  prefix_icon="close"
                  ariaLabel={remove_label(entry, index)}
                  onClick={() => remove_entry(index)}
                  style={{
                    flexShrink: 0,
                    paddingVertical: 4,
                    paddingHorizontal: 4,
                    borderRadius: 4,
                    content: { icon: { width: 11, height: 11 } },
                  }}
                />
              </div>
              {problems_at(problems, `config.subagents[${index}]`).map(
                (problem, position) => (
                  <span
                    key={position}
                    data-testid={`subagent-entry-${index}-problem-${position}`}
                    style={{
                      ...PROBLEM,
                      color: isDark
                        ? "rgba(255,140,140,0.95)"
                        : "rgba(176,32,32,0.95)",
                    }}
                  >
                    {`${problem.message} (${problem.where})`}
                  </span>
                ),
              )}
            </div>
          ),
        )}

      {!legacy && picking && library.reading && (
        <span data-testid="subagent-library-reading" style={CAPTION}>{t("agents.subagents.library_reading")}</span>
      )}

      {!legacy && picking && !library.reading && library.status === "unavailable" && (
        <span data-testid="subagent-library-unavailable" style={CAPTION}>
          {t("agents.subagents.library_unreachable")}
        </span>
      )}

      {!legacy && picking && !library.reading && library.status === "failed" && (
        <span data-testid="subagent-library-failed" style={REFUSED}>
          {t("agents.subagents.library_failed", { message: (library.error && library.error.message) || t("agents.subagents.store_refused") })}
        </span>
      )}

      {!legacy && picking && !library.reading && library.status === "ready" && (
        <div
          data-testid="subagent-picker"
          style={{ display: "flex", flexDirection: "column", gap: 4 }}
        >
          {offered.length === 0 && (
            <span data-testid="subagent-picker-empty" style={CAPTION}>{t("agents.subagents.library_empty")}</span>
          )}
          {offered.map((resource) => (
            <Button
              key={resource.id}
              label={resource_label(resource)}
              ariaLabel={t("agents.subagents.reference", { value1: resource_label(resource) })}
              onClick={() => add(resource)}
              style={{
                alignSelf: "stretch",
                fontSize: 11.5,
                paddingVertical: 4,
                paddingHorizontal: 8,
                borderRadius: 5,
              }}
            />
          ))}
          {withheld > 0 && (
            <span data-testid="subagent-picker-withheld" style={CAPTION}>
              {t(withheld === 1 ? "agents.subagents.withheld_one" : "agents.subagents.withheld_other", { count: withheld })}
            </span>
          )}
        </div>
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
              style={{
                ...PROBLEM,
                color: isDark ? "rgba(255,140,140,0.95)" : "rgba(176,32,32,0.95)",
              }}
            >
              {`${problem.message} (${problem.where})`}
            </span>
          ))}
    </div>
  );
}
