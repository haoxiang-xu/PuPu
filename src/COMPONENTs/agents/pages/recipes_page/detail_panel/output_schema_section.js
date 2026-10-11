import React, { useState } from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import Input from "../../../../../BUILTIN_COMPONENTs/input/input";
import Select from "../../../../../BUILTIN_COMPONENTs/select/select";
import Switch from "../../../../../BUILTIN_COMPONENTs/input/switch";
import { BUILDER_SWITCH_SIZE } from "../builder_switch_size";
import TextField from "../../../../../BUILTIN_COMPONENTs/input/textfield";
import {
  node_kernel,
  node_output_schema,
  with_node_output_schema,
} from "../skeleton_document";
import { output_schema_problems } from "../output_schema";
import usePendingText from "./pending_text";
import useListIdentities from "./list_identity";
import {
  BOUND_LABEL,
  bounds_for,
  colliding_field_names,
  free_field_name,
  FIELD_TYPES,
  ITEM_TYPES,
  fields_hold_schema,
  new_field,
  schema_fields,
  schema_from_fields,
  why_fields_cannot_hold,
} from "../output_schema_fields";

/* JSON Output: what an Agent produces besides its reply.
 *
 * It sits between the inputs and the outputs because that is what it is — the
 * node's result, declared. `message` and `context` are always there; a schema
 * adds its own root fields beside them, and the Output Variables section below
 * offers exactly those as sources. The two halves are one surface: closing the
 * field list here is what lets a row down there say a field cannot exist.
 *
 * Two views, and which one appears is not a preference the editor imposes. The
 * rows hold a flat object of named scalars and arrays of scalars, which is most
 * of what these schemas are; the admitted subset is wider, and a schema using
 * the rest is shown as JSON with the reason, never taken apart and rebuilt into
 * something else. `fields_hold_schema` decides, by composing the rows back and
 * comparing — so the view can never claim to represent a schema it would
 * change.
 *
 * Nothing here decides admission. `validate_output_schema` does, at save, and
 * `output_schema_problems` mirrors it rule by rule so the author reads the
 * refusal while composing instead of after. One rule is not mirrored —
 * `check_schema`, a whole JSON Schema implementation — so a refusal can still
 * arrive from the store, and the section is built to survive one rather than to
 * promise it cannot happen. */

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

const EMPTY_SCHEMA = Object.freeze({ type: "object", properties: {} });

const OFF_CAPTION =
  "This Agent replies in prose. Its result is message and context, and nothing else.";

const NO_KERNEL_CAPTION =
  "This Agent has no model configuration yet, and JSON output is part of it. Set the model first — a schema stored beside nothing would be refused.";

const CLOSED_CAPTION =
  "Only these fields. An output row can then say that a field the schema does not name cannot exist.";

const OPEN_CAPTION =
  "The reply may carry fields this list does not name. They can still be exported, by typing the name on an output row.";

function parse_json(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

function Bound({ field, bound, onChange }) {
  const value = field.bounds ? field.bounds[bound] : undefined;
  const counted = bound !== "minimum" && bound !== "maximum";
  /* Blank is not zero. Zero is a real bound — an empty string, an empty list —
     and clearing a box means "no bound", so the two cannot share a spelling.
     What is refused stays on screen to be corrected and is not stored, which
     is `usePendingText`'s whole subject. */
  const pending = usePendingText(value);
  const shown =
    pending.text !== null ? pending.text : value === undefined ? "" : String(value);

  function type(next) {
    if (next.trim() === "") {
      pending.release();
      onChange(undefined);
      return;
    }
    const parsed = Number(next);
    const usable =
      Number.isFinite(parsed) && (!counted || (Number.isInteger(parsed) && parsed >= 0));
    if (!usable) {
      pending.hold(next);
      return;
    }
    pending.release();
    onChange(parsed);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
        <span style={{ ...CAPTION, flexShrink: 0 }}>{BOUND_LABEL[bound]}</span>
        <Input
          value={shown}
          set_value={type}
          placeholder="—"
          style={{
            width: 44,
            fontSize: 11,
            ...MONO,
            paddingVertical: 3,
            paddingHorizontal: 5,
            borderRadius: 4,
          }}
        />
      </div>
      {pending.text !== null && (
        <span data-testid={`schema-bound-${bound}-refused`} style={REFUSED}>
          {counted
            ? "A count is a whole number, 0 or more. This was not stored."
            : "A bound is a number. This was not stored."}
        </span>
      )}
    </div>
  );
}

/* The name box, which can hold a name the document cannot take.
 *
 * A JSON object has one value per key, so renaming a field to a name another
 * field already has is not a rename the document can represent — and writing
 * it anyway deleted the other field's declaration and moved its `required`
 * marker across, then saved that. So a colliding name is held here, shown,
 * said, and not composed, until the author frees it. */
function FieldName({ field, taken, onChange }) {
  const pending = usePendingText(field.name);
  const shown = pending.text !== null ? pending.text : field.name;
  /* Whatever is held is unstored, and says so — not only while it still
     collides. Freeing the name by renaming the *other* field stopped the
     collision without storing anything, and a message conditional on the
     collision then left this box showing a name the document does not have
     with nothing to say about it. */
  const taken_now = pending.text !== null && taken.includes(pending.text);

  function type(next) {
    if (next !== field.name && taken.includes(next)) {
      pending.hold(next);
      return;
    }
    pending.release();
    onChange(next);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
      <Input
        value={shown}
        set_value={type}
        placeholder="field name"
        style={{
          width: 120,
          fontSize: 11.5,
          ...MONO,
          paddingVertical: 4,
          paddingHorizontal: 6,
          borderRadius: 5,
        }}
      />
      {pending.text !== null && (
        <span data-testid="schema-name-taken" style={REFUSED}>
          {taken_now
            ? pending.text === ""
              ? "Another field already has no name. This was not stored."
              : `Another field is already called ${pending.text}. This was not stored.`
            : "This was not stored. The name is free now — type it again to use it."}
        </span>
      )}
    </div>
  );
}

function FieldRow({ field, index, taken, isDark, onChange, onRemove }) {
  const bounds = bounds_for(field.type);
  return (
    <div
      data-testid={`schema-field-${index}`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "8px 10px",
        borderRadius: 7,
        background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
      }}
    >
      {/* The panel is resizable and there is no global border-box here, so a
          row of fixed-width controls has to be allowed to wrap rather than
          push its own remove button out of reach. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          rowGap: 6,
          flexWrap: "wrap",
        }}
      >
        <FieldName
          field={field}
          taken={taken}
          onChange={(next) => onChange({ ...field, name: next })}
        />
        <Select
          options={FIELD_TYPES.map((value) => ({ value, label: value }))}
          value={field.type}
          set_value={(next) => onChange({ ...field, type: next })}
          filterable={false}
          style={{
            width: 96,
            flexShrink: 0,
            fontSize: 11.5,
            paddingVertical: 4,
            paddingHorizontal: 6,
            borderRadius: 5,
            gap: 4,
          }}
        />
        {field.type === "array" && (
          <Select
            options={ITEM_TYPES.map((value) => ({ value, label: `of ${value}` }))}
            value={field.items_type}
            set_value={(next) => onChange({ ...field, items_type: next })}
            filterable={false}
            style={{
              width: 104,
              flexShrink: 0,
              fontSize: 11.5,
              paddingVertical: 4,
              paddingHorizontal: 6,
              borderRadius: 5,
              gap: 4,
            }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <span style={CAPTION}>required</span>
          <Switch
            on={Boolean(field.required)}
            set_on={(next) => onChange({ ...field, required: Boolean(next) })}
            style={BUILDER_SWITCH_SIZE}
          />
        </div>
        <Button
          prefix_icon="close"
          ariaLabel={`Remove ${field.name || "field"}`}
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

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Input
          value={field.description}
          set_value={(next) => onChange({ ...field, description: next })}
          placeholder="what it holds (optional)"
          style={{
            flex: 1,
            minWidth: 120,
            fontSize: 11,
            paddingVertical: 3,
            paddingHorizontal: 6,
            borderRadius: 5,
          }}
        />
        {bounds.map((bound) => (
          <Bound
            key={bound}
            field={field}
            bound={bound}
            onChange={(value) => {
              const next = { ...(field.bounds || {}) };
              if (value === undefined) delete next[bound];
              else next[bound] = value;
              onChange({ ...field, bounds: next });
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default function OutputSchemaSection({
  document,
  node,
  isDark,
  onChange,
}) {
  const schema = node_output_schema(node);
  const has_kernel = Boolean(node_kernel(node));

  /* The JSON text, and the schema it belongs to. Held together for the reason
     a path step holds its own: text the document does not store has to be
     dropped the moment it stops being about what is on screen — another node
     selected, or this one's schema replaced by a reload or a conflict resolved
     the other way. `of` is the schema this text was derived from or last
     wrote, so a change that did not come from here resets it.
   *
   * Reset, not compared away. Deciding on each render whether the text still
   * matches reads correctly while it does not, and leaves the text alive
   * behind that reading — so a schema that comes back brings the text back
   * with it. The canvas keeps a history, so the same schema object really can
   * return. The state is therefore cleared at the moment it stops applying,
   * which is a fact about that moment and not about what is on screen now. */
  const [editor, setEditor] = useState({
    node_id: node.id,
    as_json: false,
    of: schema,
    text: null,
  });
  if (editor.node_id !== node.id) {
    setEditor({ node_id: node.id, as_json: false, of: schema, text: null });
  } else if (!Object.is(editor.of, schema)) {
    setEditor({ ...editor, of: schema, text: null });
  }
  const text = editor.node_id === node.id ? editor.text : null;

  function store(next_schema, next_text) {
    setEditor((previous) => ({
      ...previous,
      of: next_schema,
      text: next_text === undefined ? previous.text : next_text,
    }));
    onChange(with_node_output_schema(document, node.id, next_schema));
  }

  const on = schema !== null && schema !== undefined;
  const held = on && fields_hold_schema(schema);
  const as_json = on && (!held || editor.as_json);
  const problems = on ? output_schema_problems(schema) : [];
  const { fields, closed, root } = schema_fields(on ? schema : EMPTY_SCHEMA);
  /* A field's identity, because the document gives it none: the rows are
     ordered and anonymous, a name is not an identity while it is being
     renamed, and a position is not one at all once a row is removed. */
  const rows = useListIdentities(node.id, fields.length);

  /* Every hook above this line, unconditionally. An Agent gains its kernel
     config while the panel is open — that is the author setting the model —
     so an early return before a hook would change the hook order on the render
     that happens. The lint caught this; the tests did not, because none of
     them flips it on a mounted section. */
  if (!has_kernel) {
    return (
      <div
        data-testid="skeleton-output-schema"
        style={{ display: "flex", flexDirection: "column", gap: 8 }}
      >
        <span style={SECTION_LABEL}>JSON Output</span>
        <span data-testid="schema-no-kernel" style={CAPTION}>
          {NO_KERNEL_CAPTION}
        </span>
      </div>
    );
  }

  /* The composer cannot be asked to resolve a collision — every resolution is
     a choice about which of the author's two declarations to destroy — so it
     is never handed one. The name box is what tells the author; this is the
     belt at the boundary, for a caller that forgets to. */
  function set_fields(next_fields, next_closed, next_root) {
    if (colliding_field_names(next_fields).length > 0) return;
    store(schema_from_fields(next_fields, next_closed, next_root));
  }

  function type_json(next) {
    /* Typing in the box is asking for the box. Which view appears is decided
       by whether the rows can hold the schema, and typing changes the schema —
       so without this, editing a referenced schema into a plain one replaced
       the box with field rows under the author's cursor. */
    const parsed = parse_json(next);
    if (!parsed.ok) {
      setEditor((previous) => ({ ...previous, as_json: true, text: next }));
      return;
    }
    setEditor((previous) => ({ ...previous, as_json: true }));
    store(parsed.value, next);
  }

  /* `JSON.stringify` throws on a value it cannot encode. A schema read back
     from the store came through `JSON.parse` and cannot be one, but the
     panel's job is to show a draft rather than to be the thing that falls over
     on a shape nobody expected — twice now this editor has gone down inside
     the code that was about to explain the problem. */
  function as_text(value) {
    try {
      const encoded = JSON.stringify(value, null, 2);
      return encoded === undefined ? "" : encoded;
    } catch (error) {
      return "";
    }
  }

  const json_text = text !== null ? text : on ? as_text(schema) : "";
  const parsed_text = text !== null ? parse_json(text) : { ok: true };

  return (
    <div
      data-testid="skeleton-output-schema"
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={SECTION_LABEL}>JSON Output</span>
        <Switch
          on={on}
          set_on={(next) => {
            /* Turning it off stores `null`, which is what the runtime reads as
               "no structured output" — not a missing key, and not an empty
               schema, which would declare an object with no fields. */
            store(next ? EMPTY_SCHEMA : null, null);
          }}
          style={BUILDER_SWITCH_SIZE}
        />
      </div>

      {!on && (
        <span data-testid="schema-off" style={CAPTION}>
          {OFF_CAPTION}
        </span>
      )}

      {on && !held && (
        <span data-testid="schema-not-field-shaped" style={CAPTION}>
          {`This schema is written in a way the fields cannot hold exactly — ${why_fields_cannot_hold(
            schema,
          )}. It is shown as JSON so it stays as it is.`}
        </span>
      )}

      {on && !as_json && (
        <>
          <Input
            value={root.description}
            set_value={(next) =>
              set_fields(fields, closed, { ...root, description: next })
            }
            placeholder="what this output is (optional)"
            style={{
              width: "100%",
              fontSize: 11,
              paddingVertical: 4,
              paddingHorizontal: 6,
              borderRadius: 5,
            }}
          />

          {fields.length === 0 && (
            <span data-testid="schema-no-fields" style={CAPTION}>
              No fields yet. The reply still has to be a JSON object, so add one
              or turn this off.
            </span>
          )}

          {fields.map((field, index) => (
            <FieldRow
              key={rows.ids[index]}
              field={field}
              index={index}
              taken={fields
                .filter((_, i) => i !== index)
                .map((other) => (other && other.name) || "")}
              isDark={isDark}
              onChange={(next) =>
                set_fields(
                  fields.map((old, i) => (i === index ? next : old)),
                  closed,
                  root,
                )
              }
              onRemove={() => {
                rows.removed(index);
                set_fields(
                  fields.filter((_, i) => i !== index),
                  closed,
                  root,
                );
              }}
            />
          ))}

          <Button
            label="+ Add field"
            onClick={() => {
              rows.added();
              set_fields(
                [
                  ...fields,
                  new_field(
                    free_field_name(fields.map((field) => (field && field.name) || "")),
                  ),
                ],
                closed,
                root,
              );
            }}
            style={{
              alignSelf: "flex-start",
              fontSize: 11,
              paddingVertical: 3,
              paddingHorizontal: 8,
              borderRadius: 5,
              color: "#4a5bd8",
            }}
          />

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Switch
              on={closed}
              set_on={(next) => set_fields(fields, Boolean(next), root)}
              style={{ ...BUILDER_SWITCH_SIZE, flexShrink: 0 }}
            />
            <span data-testid="schema-closed-caption" style={CAPTION}>
              {closed ? CLOSED_CAPTION : OPEN_CAPTION}
            </span>
          </div>
        </>
      )}

      {on && as_json && (
        <TextField
          value={json_text}
          set_value={type_json}
          placeholder='{ "type": "object", "properties": {} }'
          min_rows={6}
          max_display_rows={18}
          style={{
            width: "100%",
            fontSize: 11,
            ...MONO,
            borderRadius: 6,
            padding: 8,
          }}
        />
      )}

      {on && as_json && !parsed_text.ok && (
        <span
          data-testid="schema-json-unreadable"
          style={{ ...PROBLEM, color: isDark ? "rgba(255,140,140,0.95)" : "rgba(176,32,32,0.95)" }}
        >
          {`This is not JSON yet, so nothing was stored: ${parsed_text.message}`}
        </span>
      )}

      {problems.map((problem, index) => (
        <span
          key={index}
          data-testid={`schema-problem-${index}`}
          style={{
            ...PROBLEM,
            color: isDark ? "rgba(255,140,140,0.95)" : "rgba(176,32,32,0.95)",
          }}
        >
          {`${problem.message} (${problem.where})`}
        </span>
      ))}

      {on && held && (
        <Button
          label={editor.as_json ? "Edit as fields" : "Edit as JSON"}
          onClick={() =>
            setEditor((previous) => ({
              ...previous,
              as_json: !previous.as_json,
              text: null,
            }))
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
      )}
    </div>
  );
}
