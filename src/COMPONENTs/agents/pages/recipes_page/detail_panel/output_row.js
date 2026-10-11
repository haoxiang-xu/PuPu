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
 * inputs, because `output_problem` refuses a path that opens on anything else.
 * On the result side it is picked too wherever the runtime admits a closed
 * shape — an Agent's `{message, context}`, a Tool Call's `{result, ok, error}`,
 * a Skill Read's `{content, name}`. An earlier round of this row claimed a
 * result's shape is knowable only after it has run, and that was wrong for
 * most node types; where it is genuinely true the reason differs per type and
 * is shown instead of being left implicit. See `skeleton_result_roots`.
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

const WHOLE = "\u0000whole";
const WHOLE_INPUT = "Everything it was given";
const WHOLE_RESULT = "The whole result";

/* The first step, where the runtime admits a closed set of them. The whole
   object sits in the same list rather than beside it, because choosing between
   "the value" and "a field of the value" is one choice, and separating them is
   what made the empty path a dead end. */
function RootPicker({ roots, wholeLabel, path, onPath }) {
  /* A root the inventory does not hold — a loaded `result: ["typo"]`, or a
     list position where a name belongs — selects nothing. Showing it as chosen
     would have the control vouch for an address that does not exist; the row's
     problem says what is actually wrong. */
  const first = path[0];
  const value =
    path.length === 0
      ? WHOLE
      : typeof first === "string" && roots.includes(first)
        ? first
        : "";
  return (
    <Select
      options={[
        { value: WHOLE, label: wholeLabel },
        ...roots.map((name) => ({ value: name, label: name })),
      ]}
      value={value}
      set_value={(next) =>
        onPath(next === WHOLE ? [] : [next, ...path.slice(1)])
      }
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
  /* Null means the first step is typed rather than picked: only a result whose
     shape the runtime does not admit as closed. */
  const roots =
    kind === "input"
      ? inputNames
      : resultRoots && resultRoots.known
        ? resultRoots.roots
        : null;

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
            path={path}
            onPath={(next) => set_source({ path: next })}
          />
          {/* The whole object has no inside to reach into, so there are no
              deeper steps to offer. */}
          {path.length > 0 && (
            <PathEditor
              path={path}
              testid={`output-row-${index}`}
              onChange={(next) => set_source({ path: next })}
              addLabel="+ Go deeper"
              leading={<span />}
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
