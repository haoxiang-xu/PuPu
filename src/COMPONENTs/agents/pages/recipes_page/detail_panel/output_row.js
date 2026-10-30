import React from "react";
import Select from "../../../../../BUILTIN_COMPONENTs/select/select";
import Input from "../../../../../BUILTIN_COMPONENTs/input/input";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import PathEditor from "./path_editor";
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

const CAPTION = { fontSize: 10.5, color: "#86868b", lineHeight: 1.45 };
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
const WHOLE_INPUT = "Everything it was given";
const WHOLE_RESULT = "The whole result";
const OTHER_LABEL = "A field it does not list\u2026";
const UNNAMED_LABEL = "(the field with no name)";

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
function RootPicker({ roots, wholeLabel, open, choice, path, onPath }) {
  const rest = Array.isArray(path) ? path.slice(1) : [];
  return (
    <Select
      options={[
        { value: WHOLE, label: wholeLabel },
        ...roots.map((name) => ({
          value: name,
          label: name === "" ? UNNAMED_LABEL : name,
        })),
        ...(open ? [{ value: OTHER, label: OTHER_LABEL }] : []),
      ]}
      value={choice}
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
        fontSize: 11.5,
        paddingVertical: 4,
        paddingHorizontal: 6,
        borderRadius: 5,
        gap: 4,
      }}
    />
  );
}

const START_RESULT_CAPTION =
  "A Start's result is what the run was called with, so this reads from the run's own inputs.";

const END_INPUT_CAPTION =
  "An End exports the graph's result, and it can only export what it was given — so these read from the inputs above.";

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
      ? START_RESULT_CAPTION
      : nodeType === "end"
        ? END_INPUT_CAPTION
        : KIND_CAPTION[kinds[0]];

  return (
    <div
      data-testid={`output-row-${index}`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "8px 10px",
        borderRadius: 7,
        background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Input
          value={(mapping && mapping.name) || ""}
          set_value={(next) => onChange({ ...mapping, name: next })}
          placeholder="name"
          style={{
            width: 120,
            flexShrink: 0,
            fontSize: 11.5,
            ...MONO,
            paddingVertical: 4,
            paddingHorizontal: 6,
            borderRadius: 5,
          }}
        />
        <span aria-hidden="true" style={{ ...CAPTION, flexShrink: 0 }}>
          ←
        </span>
        {kinds.length > 1 ? (
          <Select
            options={kinds.map((value) => ({ value, label: KIND_LABEL[value] }))}
            value={kind}
            set_value={set_kind}
            filterable={false}
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 11.5,
              paddingVertical: 4,
              paddingHorizontal: 6,
              borderRadius: 5,
              gap: 4,
            }}
          />
        ) : (
          <span
            data-testid={`output-row-${index}-fixed-kind`}
            style={{ ...CAPTION, flex: 1, minWidth: 0 }}
          >
            {single_kind_caption}
          </span>
        )}
        <Button
          prefix_icon="close"
          ariaLabel={`Remove ${(mapping && mapping.name) || "output"}`}
          onClick={onRemove}
          style={{
            flexShrink: 0,
            paddingVertical: 4,
            paddingHorizontal: 4,
            borderRadius: 4,
            content: { icon: { width: 11, height: 11 } },
          }}
        />
      </div>

      {editable && kinds.length > 1 && (
        <span style={CAPTION}>{KIND_CAPTION[kind]}</span>
      )}

      {editable && roots !== null && (
        <>
          <RootPicker
            roots={roots}
            wholeLabel={kind === "input" ? WHOLE_INPUT : WHOLE_RESULT}
            open={open}
            choice={choice}
            path={path}
            onPath={(next) => set_source({ path: next })}
          />
          {open && resultRoots.reason && (
            <span data-testid={`output-row-${index}-result-open`} style={CAPTION}>
              {resultRoots.reason}
            </span>
          )}
          {/* The whole object has no inside to reach into, so there are no
              deeper steps to offer. A typed first step is rendered as a step
              rather than hidden behind the picker, which is the only way an
              unlisted field can be said at all. */}
          {path.length > 0 && (
            <PathEditor
              path={path}
              testid={`output-row-${index}`}
              identity={identity}
              onChange={(next) => set_source({ path: next })}
              addLabel="+ Go deeper"
              leading={typed_root ? null : <span />}
            />
          )}
          {kind === "input" && inputNames.length === 0 && (
            <span data-testid={`output-row-${index}-no-inputs`} style={CAPTION}>
              This node reads nothing yet, so everything it was given is an
              empty object. Add an input above to export one by name.
            </span>
          )}
        </>
      )}

      {editable && roots === null && (
        <>
          <PathEditor
            path={path}
            testid={`output-row-${index}`}
            identity={identity}
            onChange={(next) => set_source({ path: next })}
          />
          {resultRoots && resultRoots.reason && (
            <span data-testid={`output-row-${index}-result-unknown`} style={CAPTION}>
              {resultRoots.reason}
            </span>
          )}
        </>
      )}

      {!editable && (
        <div
          data-testid={`output-row-${index}-unreadable`}
          style={{ display: "flex", flexDirection: "column", gap: 4 }}
        >
          <span style={CAPTION}>
            This source is not a shape the editor can take apart, so it is left
            exactly as it is. Remove the row to replace it.
          </span>
          <span
            style={{
              ...MONO,
              fontSize: 10.5,
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
            fontSize: 10.5,
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
