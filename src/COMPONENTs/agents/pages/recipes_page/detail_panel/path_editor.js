import React, { useRef, useState } from "react";
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
 * It is also discarded when the value beneath it changes without this box
 * doing it — the document replaced under the panel by a conflict resolved the
 * other way, or by a reload landing. The text was typed against a value that
 * is no longer there, and showing it over the new one makes the field
 * misreport what is stored. That is the whole severity of this class: nothing
 * is ever written wrongly, and the field is the author's only account of what
 * was.
 *
 * Discarded, not hidden. Comparing the text against the current value on every
 * render reads correctly while they differ and keeps the text alive behind it,
 * so `[0] → [5] → [0]` brought it back — over a value it had never described,
 * by coincidence. A correction is void once the thing it was correcting is
 * gone, which is a fact about the moment the value changed, not about what the
 * value happens to be now. So the state itself is reset then.
 *
 * What it does *not* do is decide whether this is still the same step. A
 * position cannot answer that and neither can a value: removing the first step
 * of `[0, 0]` leaves a successor at the same position holding the same number,
 * and it is not the same step. Only the editor below knows an edit moved
 * things, so identity is kept there and spent as this component's key. */
function Step({ segment, index, testid, onReplace, onRemove }) {
  const kind = path_segment_kind(segment);
  /* The text is held together with the value it was offered in place of, so
     the two cannot drift apart. The value it was typed against cannot change
     by typing here — a refused position is not written — so a change means it
     came from elsewhere, and the text is dropped rather than compared away. */
  const [pending, setPending] = useState({ shown: segment, text: null });
  if (!Object.is(pending.shown, segment)) {
    setPending({ shown: segment, text: null });
  }
  const text = Object.is(pending.shown, segment) ? pending.text : null;
  const refused = kind === "index" && text !== null;

  function type_index(next) {
    const value = index_from_text(next);
    if (value === null) {
      setPending({ shown: segment, text: next });
      return;
    }
    setPending({ shown: value, text: null });
    onReplace(value);
  }

  function flip() {
    const next = kind === "index" ? "" : 0;
    setPending({ shown: next, text: null });
    onReplace(next);
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
          value={text !== null ? text : String(segment)}
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

/* A step's identity, which the document does not have and cannot be given: the
   wire addresses a path's steps by where they are, and `{name, source}` is
   closed. So it is minted here, lives exactly as long as the step does, and is
   spent as the step's React key — which is what ties a step's own unsent text
   to the step rather than to a place in a list.
   Only this component knows that an edit *moved* a step rather than changed
   one, so only this component can carry the ids across it. */
let minted = 0;
const mint = (count) =>
  Array.from({ length: count }, () => `step-${(minted += 1)}`);

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

  /* Held in a ref rather than state: nothing is rendered from it but the keys,
     and the edits below have to adjust it in the same tick they report the
     edit. A length that no longer matches means the path was replaced from
     outside this editor, and then there is nothing to carry. */
  const ids_ref = useRef({ identity: null, ids: [] });
  if (
    ids_ref.current.identity !== identity ||
    ids_ref.current.ids.length !== steps.length
  ) {
    ids_ref.current = { identity, ids: mint(steps.length) };
  }
  const ids = ids_ref.current.ids;

  function replace(index, segment) {
    /* The step keeps its id: its value changed, it did not move. */
    onChange(segments.map((old, i) => (i === index + offset ? segment : old)));
  }

  function remove(index) {
    ids_ref.current = { identity, ids: ids.filter((_, i) => i !== index) };
    onChange(segments.filter((_, i) => i !== index + offset));
  }

  function add() {
    ids_ref.current = { identity, ids: [...ids, ...mint(1)] };
    onChange([...segments, ""]);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {leading}

      {steps.map((segment, i) => (
        <Step
          key={ids[i]}
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
