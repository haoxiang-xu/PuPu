import React, { useState } from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import Input from "../../../../../BUILTIN_COMPONENTs/input/input";

/* Where inside a value to read.
 *
 * A segment is a string or a non-negative integer, and the two are not
 * interchangeable: `_read_path` follows a string only into an object and an
 * integer only into an array, so the text "0" never reaches the first element
 * of a list. Deciding the kind from whether the text looks numeric would be
 * both wrong — a key named "0" becomes unreachable — and silent, which is the
 * worse half. So each segment says which it is, and the author can say it.
 *
 * An empty path is not an error. It reads the whole value.
 *
 * A position the wire would refuse is not quietly turned into one it accepts.
 * Stripping non-digits made `-1` into `[1]` and `1.5` into `[15]`: both are
 * valid addresses, neither is the one that was typed, and nothing said so. A
 * wrong address that reads an existing element is worse than a refused one, so
 * what was typed stays on screen, unstored, with the reason. */

const CAPTION = { fontSize: 10.5, color: "#86868b", lineHeight: 1.45 };
const MONO = { fontFamily: "ui-monospace, Menlo, monospace" };

export function path_segment_kind(segment) {
  return typeof segment === "number" ? "index" : "key";
}

/* The wire takes a non-negative integer and nothing else, so this accepts
   exactly that spelling: no sign, no point, no exponent, no spaces. An empty
   box is not zero — zero is a real address and not what emptying one means. */
const INDEX_TEXT = /^[0-9]+$/;

export function index_from_text(text) {
  const raw = String(text);
  if (!INDEX_TEXT.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}


/* A step holds what is being typed, so a refused position can stay visible
   without being written to the document. The draft is dropped the moment the
   text is a position the wire accepts, and whenever the step changes kind.
 *
 * And it is dropped whenever it stops being about this value. The draft lives
 * in local state, because the document deliberately refuses to hold it — and
 * local state in a list is keyed by position, which is not identity. Selecting
 * another node, removing the row above or removing an earlier step all put a
 * different segment under the same key, and the text then described a value it
 * was never typed into: the box read `-1` while the document held `2`. Nothing
 * was written wrongly, which is what made it worse — the field was the only
 * account of the document the author had, and it was lying about it.
 *
 * So the draft records what it was typed against, and is shown only while that
 * is still what is on screen. Dropping a draft is never incorrect; keeping a
 * stale one always is. That asymmetry is why the check is the conjunction of
 * identity and stored value rather than either alone. */
function Step({ segment, index, testid, identity, onReplace, onRemove }) {
  const kind = path_segment_kind(segment);
  const [draft, setDraft] = useState(null);
  const mine =
    draft !== null &&
    draft.identity === identity &&
    Object.is(draft.segment, segment);
  const refused = kind === "index" && mine;

  function type_index(next) {
    const value = index_from_text(next);
    if (value === null) {
      setDraft({ identity, segment, text: next });
      return;
    }
    setDraft(null);
    onReplace(value);
  }

  function flip() {
    setDraft(null);
    onReplace(kind === "index" ? "" : 0);
  }

  return (
    <div
      data-testid={`${testid}-step-${index}`}
      style={{ display: "flex", flexDirection: "column", gap: 3 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <Button
          label={kind === "index" ? "[n]" : ".key"}
          ariaLabel={
            kind === "index"
              ? `Step ${index + 1} reads a list position; switch to a field name`
              : `Step ${index + 1} reads a field name; switch to a list position`
          }
          onClick={flip}
          style={{
            flexShrink: 0,
            fontSize: 10.5,
            ...MONO,
            paddingVertical: 3,
            paddingHorizontal: 6,
            borderRadius: 4,
          }}
        />
        <Input
          value={mine ? draft.text : String(segment)}
          set_value={(next) => (kind === "index" ? type_index(next) : onReplace(next))}
          placeholder={kind === "index" ? "0" : "field"}
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 11.5,
            ...MONO,
            paddingVertical: 4,
            paddingHorizontal: 6,
            borderRadius: 5,
          }}
        />
        <Button
          prefix_icon="close"
          ariaLabel={`Remove step ${index + 1}`}
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
      {refused && (
        <span
          data-testid={`${testid}-step-${index}-refused`}
          style={{ ...CAPTION, color: "rgba(176,32,32,0.95)" }}
        >
          A list position is a whole number, 0 or more. This was not stored.
        </span>
      )}
    </div>
  );
}

export default function PathEditor({
  path,
  testid,
  onChange,
  leading,
  addLabel = "+ Add a step",
  /* Who these steps belong to. A path has no identity of its own — its steps
     are addressed by position — so the caller that does have one says it, and
     a step is `<identity>:<position>`. Defaulted to the testid so a lone
     editor still has one rather than silently sharing `undefined`. */
  identity = testid,
}) {
  const segments = Array.isArray(path) ? path : [];
  /* `leading` renders segment 0 itself — the input side picks it from a list
     rather than typing it — so the steps below it start one later. */
  const offset = leading ? 1 : 0;
  const steps = segments.slice(offset);

  function replace(index, segment) {
    onChange(segments.map((old, i) => (i === index + offset ? segment : old)));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {leading}

      {steps.map((segment, i) => (
        <Step
          key={i}
          segment={segment}
          index={i}
          testid={testid}
          identity={`${identity}:${i + offset}`}
          onReplace={(next) => replace(i, next)}
          onRemove={() => onChange(segments.filter((_, j) => j !== i + offset))}
        />
      ))}

      <Button
        label={addLabel}
        onClick={() => onChange([...segments, ""])}
        style={{
          alignSelf: "flex-start",
          fontSize: 11,
          paddingVertical: 3,
          paddingHorizontal: 8,
          borderRadius: 5,
          color: "#4a5bd8",
        }}
      />

      {steps.length === 0 && !leading && (
        <span data-testid={`${testid}-whole`} style={CAPTION}>
          The whole value is exported as it is.
        </span>
      )}
    </div>
  );
}
