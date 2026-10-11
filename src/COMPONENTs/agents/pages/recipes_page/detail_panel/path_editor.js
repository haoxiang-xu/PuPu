import React from "react";
import usePendingText from "./pending_text";
import useListIdentities from "./list_identity";
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
 * exactly that spelling: no sign, no point, no exponent, no spaces. An empty
 * box is not zero — zero is a real address and not what emptying one means.
 *
 * This box redraws itself from the document after an accepted keystroke and a
 * bound box deliberately does not, because an integer has no partial
 * spelling: the only difference between an accepted text and the number it
 * means is leading zeros, which carry nothing. `0.` is a different matter —
 * it means zero and the author is not finished — and redrawing that box cost
 * the point, which is how typing `0.5` wrote `5`. See `bound_from_text`. */
const INDEX_TEXT = /^[0-9]+$/;

export function index_from_text(text) {
  const raw = String(text);
  if (!INDEX_TEXT.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}


/* A step holds what is being typed, so a refused position can stay visible
   without being written to the document. The rules for text the document
   deliberately does not hold are in `usePendingText`, which this was the first
   of three places to need and the first to get wrong twice.
 *
 * What that cannot answer is whether this is still the same step. A position
 * cannot say it and neither can a value: removing the first step of `[0, 0]`
 * leaves a successor at the same position holding the same number, and it is
 * not the same step. Only the editor below knows an edit moved things, so the
 * identity is kept there and spent as this component's key. */
function Step({ segment, index, testid, onReplace, onRemove }) {
  const kind = path_segment_kind(segment);
  const pending = usePendingText(segment);
  const refused = kind === "index" && pending.text !== null;

  function type_index(next) {
    const value = index_from_text(next);
    if (value === null) {
      pending.hold(next);
      return;
    }
    pending.release();
    onReplace(value);
  }

  function flip() {
    pending.release();
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
          value={pending.text !== null ? pending.text : String(segment)}
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
          {/* What the document holds, said out loud: a keystroke before this
              one may well have been stored — `1` is a position even though
              `1-` is not — so "this was not stored" alone leaves the author
              guessing which of the two the path now reads. */}
          {`A list position is a whole number, 0 or more. This was not stored — step ${
            index + 1
          } is still ${segment}.`}
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
  /* Who this whole editor belongs to — a node, a row. When that changes these
     are different steps even if they look identical, so the ids are reminted.
     Defaulted to the testid so a lone editor still has one rather than
     silently sharing `undefined`. */
  identity = testid,
}) {
  const segments = Array.isArray(path) ? path : [];
  /* `leading` renders segment 0 itself — the input side picks it from a list
     rather than typing it — so the steps below it start one later. */
  const offset = leading ? 1 : 0;
  const steps = segments.slice(offset);

  const rows = useListIdentities(identity, steps.length);

  function replace(index, segment) {
    /* The step keeps its id: its value changed, it did not move. */
    onChange(segments.map((old, i) => (i === index + offset ? segment : old)));
  }

  function remove(index) {
    rows.removed(index);
    onChange(segments.filter((_, i) => i !== index + offset));
  }

  function add() {
    rows.added();
    onChange([...segments, ""]);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {leading}

      {steps.map((segment, i) => (
        <Step
          key={rows.ids[i]}
          segment={segment}
          index={i}
          testid={testid}
          onReplace={(next) => replace(i, next)}
          onRemove={() => remove(i)}
        />
      ))}

      <Button
        label={addLabel}
        onClick={add}
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
