import React from "react";
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
 * An empty path is not an error. It reads the whole value. */

const CAPTION = { fontSize: 10.5, color: "#86868b", lineHeight: 1.45 };
const MONO = { fontFamily: "ui-monospace, Menlo, monospace" };

export function path_segment_kind(segment) {
  return typeof segment === "number" ? "index" : "key";
}

/* An index box holds digits only, so the stored segment is a number and never
   the string that looks like one. An emptied box is 0 rather than NaN. */
function to_index(text) {
  const digits = String(text).replace(/[^0-9]/g, "");
  return digits === "" ? 0 : Math.min(Number(digits), Number.MAX_SAFE_INTEGER);
}

export default function PathEditor({
  path,
  testid,
  onChange,
  leading,
  addLabel = "+ Add a step",
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

      {steps.map((segment, i) => {
        const kind = path_segment_kind(segment);
        return (
          <div
            key={i}
            data-testid={`${testid}-step-${i}`}
            style={{ display: "flex", alignItems: "center", gap: 4 }}
          >
            <Button
              label={kind === "index" ? "[n]" : ".key"}
              ariaLabel={
                kind === "index"
                  ? `Step ${i + 1} reads a list position; switch to a field name`
                  : `Step ${i + 1} reads a field name; switch to a list position`
              }
              onClick={() => replace(i, kind === "index" ? "" : 0)}
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
              value={String(segment)}
              set_value={(next) =>
                replace(i, kind === "index" ? to_index(next) : next)
              }
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
              ariaLabel={`Remove step ${i + 1}`}
              onClick={() =>
                onChange(segments.filter((_, j) => j !== i + offset))
              }
              style={{
                flexShrink: 0,
                paddingVertical: 4,
                paddingHorizontal: 4,
                borderRadius: 4,
                content: { icon: { width: 11, height: 11 } },
              }}
            />
          </div>
        );
      })}

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
