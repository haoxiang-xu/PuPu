import React from "react";
import Select from "../../../../../BUILTIN_COMPONENTs/select/select";
import Input from "../../../../../BUILTIN_COMPONENTs/input/input";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import MissingPolicySelect from "./missing_policy_select";
import {
  expression_is_editable,
  expression_summary,
  first_present_expression,
  literal_expression,
  ref_expression,
} from "../skeleton_io";

/* One input: `[local name] ← [source]`, plus what happens when the source has
 * nothing to give.
 *
 * The name is the author's own — `resolve_inputs` answers with `{name: value}`
 * and the prompt reads it back by that name — so it is typed, not picked. The
 * source is picked, because an expression the runtime cannot evaluate is a
 * refused document rather than an empty value.
 *
 * What an upstream node can supply is what it declares it exports: its own
 * output mappings. Offering anything else would let an author bind to a value
 * no node ever produces. */

const CAPTION = { fontSize: 10.5, color: "#86868b", lineHeight: 1.45 };
const MONO = { fontFamily: "ui-monospace, Menlo, monospace" };

const SOURCE_KINDS = [
  { value: "ref", label: "From a node" },
  { value: "literal", label: "A fixed value" },
  { value: "first_present", label: "First of several" },
];

/* A source that only exists when its branch ran carries the hollow marker
   (Remix `circle`) and says so in words, so the mark is not the only signal. */
function ref_options(sources) {
  return sources.map((source) => ({
    value: `${source.node_id}\u0000${source.name}`,
    label: `${source.node_label} · ${source.name}${source.conditional ? " — only if its branch ran" : ""}`,
    ...(source.conditional ? { icon: "circle" } : {}),
  }));
}

function ref_key(expression) {
  if (!expression || expression.kind !== "ref") return "";
  const [first] = Array.isArray(expression.path) ? expression.path : [];
  return `${expression.node_id}\u0000${first === undefined ? "" : first}`;
}

function ref_from_key(key) {
  const [node_id, name] = String(key).split("\u0000");
  return ref_expression(node_id, name ? [name] : []);
}

/* Exported so the Tool Call panel's argument rows pick a source exactly the
   way an input row does (#352). */
export function RefPicker({ value, sources, onChange, testid }) {
  if (sources.length === 0) {
    return (
      <span data-testid={`${testid}-no-sources`} style={{ ...CAPTION, flex: 1 }}>
        Nothing upstream exports a value yet.
      </span>
    );
  }
  return (
    <Select
      options={ref_options(sources)}
      value={ref_key(value)}
      set_value={(key) => onChange(ref_from_key(key))}
      filterable={sources.length > 8}
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
  );
}

export default function BindingRow({
  binding,
  index,
  sources,
  problems,
  isDark,
  onChange,
  onRemove,
}) {
  const value = binding && binding.value;
  const kind = value && value.kind;
  /* A shape the controls cannot take apart is shown rather than edited: every
     control here would rewrite it into something the author never wrote. */
  const editable = expression_is_editable(value);

  function set_value(next) {
    onChange({ ...binding, value: next });
  }

  function set_kind(next) {
    if (next === kind) return;
    if (next === "ref") {
      const first = sources[0];
      set_value(first ? ref_expression(first.node_id, [first.name]) : ref_expression("", []));
      return;
    }
    if (next === "literal") {
      set_value(literal_expression(""));
      return;
    }
    /* Two is the minimum the runtime accepts, so the row starts with two rather
       than composing something it would reject. */
    const seed =
      kind === "ref" && value ? value : ref_expression(sources[0]?.node_id || "", sources[0] ? [sources[0].name] : []);
    set_value(first_present_expression([seed, { ...seed }]));
  }

  const rowProblems = problems || [];

  return (
    <div
      data-testid={`binding-row-${index}`}
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
          value={(binding && binding.name) || ""}
          set_value={(next) => onChange({ ...binding, name: next })}
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
        <Select
          options={SOURCE_KINDS}
          value={kind}
          set_value={set_kind}
          filterable={false}
          style={{
            width: 132,
            flexShrink: 0,
            fontSize: 11.5,
            paddingVertical: 4,
            paddingHorizontal: 6,
            borderRadius: 5,
            gap: 4,
          }}
        />
        <Button
          prefix_icon="close"
          ariaLabel={`Remove ${(binding && binding.name) || "input"}`}
          onClick={onRemove}
          style={{
            paddingVertical: 4,
            paddingHorizontal: 4,
            borderRadius: 4,
            content: { icon: { width: 11, height: 11 } },
          }}
        />
      </div>

      {editable && kind === "ref" && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <RefPicker
            value={value}
            sources={sources}
            onChange={set_value}
            testid={`binding-row-${index}`}
          />
        </div>
      )}

      {editable && kind === "literal" && (
        <Input
          value={value && typeof value.value === "string" ? value.value : String(value?.value ?? "")}
          set_value={(next) => set_value(literal_expression(next))}
          placeholder="a value written here, not read from the graph"
          style={{
            width: "100%",
            fontSize: 11.5,
            paddingVertical: 4,
            paddingHorizontal: 6,
            borderRadius: 5,
          }}
        />
      )}

      {editable && kind === "first_present" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={CAPTION}>
            The first of these that has a value is used; the policy below applies
            only when none of them does.
          </span>
          {(value.values || []).map((entry, i) => (
            <div
              key={i}
              data-testid={`binding-row-${index}-alt-${i}`}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <RefPicker
                value={entry}
                sources={sources}
                onChange={(next) =>
                  set_value(
                    first_present_expression(
                      value.values.map((old, j) => (j === i ? next : old)),
                    ),
                  )
                }
                testid={`binding-row-${index}-alt-${i}`}
              />
              <Button
                prefix_icon="close"
                ariaLabel={`Remove source ${i + 1}`}
                disabled={(value.values || []).length <= 2}
                onClick={() =>
                  set_value(
                    first_present_expression(value.values.filter((_, j) => j !== i)),
                  )
                }
                style={{
                  paddingVertical: 4,
                  paddingHorizontal: 4,
                  borderRadius: 4,
                  content: { icon: { width: 11, height: 11 } },
                }}
              />
            </div>
          ))}
          <Button
            label="+ Add a source"
            onClick={() =>
              set_value(
                first_present_expression([
                  ...value.values,
                  sources[0]
                    ? ref_expression(sources[0].node_id, [sources[0].name])
                    : ref_expression("", []),
                ]),
              )
            }
            style={{
              alignSelf: "flex-start",
              fontSize: 11,
              paddingVertical: 3,
              paddingHorizontal: 8,
              borderRadius: 5,
              color: "#4a5bd8",
            }}
          />
        </div>
      )}

      {!editable && (
        <div
          data-testid={`binding-row-${index}-unreadable`}
          style={{ display: "flex", flexDirection: "column", gap: 4 }}
        >
          <span style={CAPTION}>
            This source is not a shape the editor can take apart, so it is left
            exactly as it is. Choose a source kind above to replace it.
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
            {expression_summary(value)}
          </span>
        </div>
      )}

      <MissingPolicySelect binding={binding} onChange={onChange} isDark={isDark} />

      {rowProblems.map((problem, i) => (
        <span
          key={i}
          data-testid={`binding-row-${index}-problem-${i}`}
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
