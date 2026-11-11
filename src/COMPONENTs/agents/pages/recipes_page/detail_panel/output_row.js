import VariableSettings, { VariableSettingRow } from "./variable_settings";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import React, { useId, useState } from "react";
import Select from "./panel_select";
import Input from "./panel_input";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import PathEditor from "./path_editor";
import PanelHelp from "./panel_help";
import { output_mapping_is_editable } from "../skeleton_io";

/* One exported value: `[name] ← [this node's inputs | its result] [path]`.
 *
 * The name is the author's own, like an input's: downstream rows reach this
 * value by it, and `map_outputs` answers with `{name: value}`. So it is typed.
 *
 * Which side it comes from is picked only where both sides exist. At the ends
 * of a graph one of them is always the empty object, and a row pointing into
 * it is refused rather than left empty — so there the side is stated instead
 * of offered, and the author cannot compose the refusal.
 *
 * On the input side the first step is picked from this node's own declared
 * inputs, because `output_problem` refuses a path that opens on anything else,
 * which makes that list closed. On the result side it is picked too wherever
 * the runtime says what the producer holds — an Agent's `{message, context}`,
 * a Tool Call's `{result, ok, error}`, a Skill Read's `{content, name}`, plus
 * whatever an Agent's output schema declares at its own root.
 *
 * Offering a list and closing it are separate questions, and two rounds of
 * this row got one or the other wrong. The first claimed a result's shape is
 * knowable only after it has run, which is false for most node types. The
 * second read an Agent's schema and spoke as if its fields were the whole of
 * them, which is false whenever the schema does not say so — JSON Schema's
 * default is open, and the runtime publishes a field the schema never named.
 * So the list is offered either way, and where it is not closed the row gains
 * an entry for a field it does not list and the reason it may not be
 * complete. Where the producer is genuinely unknowable the reason differs per
 * type and is shown instead of left implicit. See `skeleton_result_roots`.
 *
 * Either side can also export the whole object. `map_outputs` reads an empty
 * path as the value itself, the store accepts it with no diagnostic, and it
 * was previously inexpressible here: the picker showed "Select..." and offered
 * only named fields, so a legal source could neither be understood nor
 * returned to once left. */

const CAPTION = { fontSize: 11.5, color: "#86868b", lineHeight: 1.45 };
const MONO = { fontFamily: "ui-monospace, Menlo, monospace" };

const KIND_LABEL = {
  input: "What this node was given",
  result: "What this node produced",
};

const KIND_CAPTION = {
  input: "Read from the inputs above, after they resolve.",
  result: "Read from the node's own result once it has run.",
};

/* Sentinels, so a real field name can never collide with a control's own
   meaning. `""` is a legal property name — `validate_output_schema` reserves
   only `message` and `context` — and it used to be this picker's "nothing
   selected" value, which made the one field it could not describe the one the
   schema was allowed to declare. */
const WHOLE = "\u0000whole";
const OTHER = "\u0000other";
const NONE = "\u0000none";

/* The two sides phrase the same structural idea differently on purpose, and
   this was briefly changed to "The whole inputs object" for symmetry before
   being changed back. The reason it reads this way: the rest of this panel
   does not name the wire's data structures at the author, and "object" is the
   only word in that version that carries no meaning for them. Reviewers have
   asked for both spellings — one probe set requires the word "whole", a later
   control pins this exact string — so they cannot both be satisfied and
   neither is the requirement. The behaviour is: an empty path is a choice in
   the same list as the fields, and selecting it stores exactly `[]`. */





/* Which option the stored path already is. Derived, never remembered: a
   remembered choice is a second account of the document, and the two come
   apart the moment anything else changes it. */
export function root_choice(path, roots, open) {
  if (!Array.isArray(path) || path.length === 0) return WHOLE;
  const first = path[0];
  if (typeof first === "string" && roots.includes(first)) return first;
  if (open && typeof first === "string") return OTHER;
  return NONE;
}

/* Whether this row types its first step rather than picking it. `""` counts,
   because an empty box and the field whose name is empty are the same thing on
   screen, and leaving it un-typeable would make that field's own list entry a
   dead end again. */
export function root_is_typed(choice) {
  return choice === OTHER || choice === "";
}

/* The first step, where the runtime admits a list of them. The whole object
   sits in the same list rather than beside it, because choosing between "the
   value" and "a field of the value" is one choice, and separating them is what
   made the empty path a dead end.
   Where the list is not closed it gains one more entry, because a schema that
   does not close itself can carry a field it never named and the runtime
   publishes it. */
function RootPicker({ roots, wholeLabel, open, choice, path, onPath, prefix, summary }) {
  const { t } = useTranslation();
  const rest = Array.isArray(path) ? path.slice(1) : [];
  return (
    <Select
      options={[
        { value: WHOLE, label: wholeLabel, trigger_label: prefix },
        ...roots.map((name) => ({
          value: name,
          label: name === "" ? t("agents.io.the_field_with_no_name") : name,
          trigger_label: choice === name ? summary : `${prefix}.${name}`,
        })),
        ...(open ? [{ value: OTHER, label: t("agents.io.a_field_it_does_not_list"), trigger_label: summary }] : []),
      ]}
      value={choice}
      placeholder={summary}
      trigger_wrapper_style={{ width: "100%", minWidth: 0 }}
      set_value={(next) => {
        if (next === WHOLE) return onPath([]);
        /* Nothing is guessed for it: an unlisted field starts empty and the
           box below is where it is said. */
        if (next === OTHER) return onPath(["", ...rest]);
        return onPath([next, ...rest]);
      }}
      filterable={roots.length > 8}
      style={{
        width: "100%",
        boxSizing: "border-box",
        minWidth: 0,
        fontSize: 12,
        paddingVertical: 4,
        paddingHorizontal: 6,
        borderRadius: 8,
        gap: 4,
      }}
    />
  );
}





export default function OutputRow({
  mapping,
  index,
  identity,
  nodeType,
  kinds,
  inputNames,
  resultRoots,
  problems,
  isDark,
  onChange,
  onRemove,
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const settingsId = useId();
  const source = (mapping && mapping.source) || {};
  const kind = source.kind;
  /* A source the controls cannot take apart is shown rather than edited, for
     the same reason an unreadable expression is: every control here would
     rewrite it. */
  const editable = output_mapping_is_editable(mapping);
  const path = Array.isArray(source.path) ? source.path : [];
  const rowProblems = problems || [];
  /* Null means there is no list at all and the whole path is typed: only a
     result whose producer this editor cannot know. */
  const roots =
    kind === "input"
      ? inputNames
      : resultRoots && resultRoots.known
        ? resultRoots.roots
        : null;
  /* An input's list is closed by the validator — `output_problem` refuses a
     path that opens on anything but a declared input of this node. A result's
     list is closed only where the producer's shape says so. */
  const open = kind === "result" && Boolean(resultRoots) && !resultRoots.closed;
  const choice = roots === null ? NONE : root_choice(path, roots, open);
  const typed_root = roots !== null && root_is_typed(choice);

  function set_source(next) {
    onChange({ ...mapping, source: { ...source, ...next } });
  }

  function set_kind(next) {
    if (next === kind) return;
    /* The path belonged to the other side's shape; carrying it over would
       produce a row that looks configured and reads nothing. */
    set_source({ kind: next, path: [] });
  }

  const single_kind_caption =
    nodeType === "start"
      ? t("agents.io.start_result_caption")
      : nodeType === "end"
        ? t("agents.io.end_input_caption")
        : kinds[0] === "input" ? t("agents.io.read_from_the_inputs_above_after_they_resolve")
          : kinds[0] === "result" ? t("agents.io.read_from_the_node_s_own_result_once_it_has_run") : KIND_CAPTION[kinds[0]];

  const prefix = kind === "input" ? t("agents.workflow.inputs") : t("agents.execution.code.result");
  const sourceLabel = editable ? path.reduce((label, segment) => {
    if (typeof segment === "number") return `${label}[${segment}]`;
    return /^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(segment)
      ? `${label}.${segment}` : `${label}[${JSON.stringify(segment)}]`;
  }, prefix) : "—";

  return (
    <div data-testid={`output-row-${index}`} style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div data-testid={`output-row-${index}-header`}
        style={{ display: "grid", gridTemplateColumns: "minmax(48px, 0.85fr) 10px minmax(0, 1.4fr) 24px", alignItems: "center", gap: 4 }}>
        <Input value={(mapping && mapping.name) || ""}
          set_value={(next) => onChange({ ...mapping, name: next })}
          placeholder={t("agents.io.name_placeholder")}
          style={{ width: "100%", minWidth: 0, fontSize: 12, ...MONO, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 8 }} />
        <span aria-hidden="true" style={CAPTION}>←</span>
        <div data-testid={`output-row-${index}-source`} title={sourceLabel} style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
          {editable && roots !== null ? (
            <RootPicker roots={roots} wholeLabel={kind === "input" ? t("agents.io.everything_it_was_given") : t("agents.io.the_whole_result")}
              open={open} choice={choice} path={path} prefix={prefix} summary={sourceLabel}
              onPath={(next) => set_source({ path: next })} />
          ) : (
            <Button label={sourceLabel} onClick={() => setExpanded(true)}
              style={{ minWidth: 0, maxWidth: "100%", fontSize: 12, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 8 }} />
          )}
          {editable && roots !== null && open && resultRoots.reason && <PanelHelp label={t("agents.execution.code.result")}>
            <span data-testid={`output-row-${index}-result-open`}>{resultRoots.reason}</span>
          </PanelHelp>}
        </div>
        <Button prefix_icon="more" ariaLabel={`${mapping?.name || t("agents.io.output_variables")} · ${t("chat.attach.more")}`}
          dom_props={{ "aria-expanded": expanded, "aria-controls": settingsId }}
          onClick={() => setExpanded(!expanded)}
          style={{ width: 24, height: 24, iconOnlyPaddingVertical: 0, iconOnlyPaddingHorizontal: 0, borderRadius: 8, color: "#86868b", content: { icon: { width: 15, height: 15 } } }} />
      </div>
      {/* Preserve path-editor identity and refused text while settings are closed. */}
      <VariableSettings id={settingsId} testid={`output-row-${index}-settings`} expanded={expanded} isDark={isDark}
        footer={(
          <Button prefix_icon="delete" label={mapping?.name ? t("agents.io.remove_output", { name: mapping.name }) : t("agents.io.remove_output_unnamed")}
          ariaLabel={mapping?.name ? t("agents.io.remove_output", { name: mapping.name }) : t("agents.io.remove_output_unnamed")}
          onClick={onRemove} style={{ alignSelf: "flex-start", fontSize: 11.5, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 8 }} />
        )}>

        <VariableSettingRow label={t("model_providers.custom.import_source")}>
        {kinds.length > 1 ? (
          <Select options={kinds.map((value) => ({ value, label: value === "input" ? t("agents.workflow.inputs")
            : value === "result" ? t("agents.execution.code.result") : KIND_LABEL[value] }))}
            value={kind} set_value={set_kind} filterable={false} trigger_wrapper_style={{ width: "100%", minWidth: 0 }}
            style={{ width: "100%", boxSizing: "border-box", justifyContent: "flex-start", minWidth: 0, fontSize: 12, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 8, gap: 4 }} />
        ) : (
          <span data-testid={`output-row-${index}-fixed-kind`} title={single_kind_caption} style={CAPTION}>{prefix}</span>
        )}
        {editable && roots === null && resultRoots?.reason && <PanelHelp label={t("agents.execution.code.result")}>
          <span data-testid={`output-row-${index}-result-unknown`}>{resultRoots.reason}</span>
        </PanelHelp>}
        </VariableSettingRow>
        {editable && roots !== null && <>
          {/* The whole object has no inside to reach into, so there are no
              deeper steps to offer. A typed first step is rendered as a step
              rather than hidden behind the picker, which is the only way an
              unlisted field can be said at all. */}
          {path.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
            <span style={CAPTION}>{t("memory_inspect.tree_field_path")}</span>
            <PathEditor
              path={path}
              testid={`output-row-${index}`}
              identity={identity}
              onChange={(next) => set_source({ path: next })}
              addLabel={t("agents.io.go_deeper")}
              leading={typed_root ? null : <span />}
            />
            </div>
          )}
          {kind === "input" && inputNames.length === 0 && (
            <span data-testid={`output-row-${index}-no-inputs`} style={CAPTION}>
              {t("agents.io.no_inputs_to_export")}
            </span>
          )}
        </>}
      {editable && roots === null && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <span style={CAPTION}>{t("memory_inspect.tree_field_path")}</span>
          <PathEditor
            path={path}
            testid={`output-row-${index}`}
            identity={identity}
            onChange={(next) => set_source({ path: next })}
          />
        </div>
      )}

      </VariableSettings>
      {!editable && (
        <div
          data-testid={`output-row-${index}-unreadable`}
          style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}
        >
          <span style={CAPTION}>
            {t("agents.io.unreadable_output")}
          </span>
          <span
            style={{
              ...MONO,
              fontSize: 11.5,
              lineHeight: 1.45,
              wordBreak: "break-all",
              color: isDark ? "#c9c9d1" : "#55555d",
            }}
          >
            {JSON.stringify(source)}
          </span>
        </div>
      )}

      {rowProblems.map((problem, i) => (
        <span
          key={i}
          data-testid={`output-row-${index}-problem-${i}`}
          style={{
            marginTop: 6,
            fontSize: 11.5,
            lineHeight: 1.45,
            color: isDark ? "rgba(255,140,140,0.95)" : "rgba(176,32,32,0.95)",
          }}
        >
          {problem.message}
        </span>
      ))}
    </div>
  );
}
