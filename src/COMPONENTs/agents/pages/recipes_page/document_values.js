/* Reading a value the document happens to hold.
 *
 * A draft is whatever the author has typed and whatever the store accepted,
 * and the store accepts a great deal: a node's `config` only has to be an
 * object, a pool's contents are not looked at, and a legacy node's fields are
 * copied verbatim with nothing ever asking their shapes. So a value reaching
 * this page can be any JSON at all, and `{"toString": null}` — which the real
 * store saves and reloads — refuses to become a string.
 *
 * Every way of making text out of a value asks it to: `${value}`,
 * `String(value)`, `[...].join(", ")`, React rendering it as a child. So does
 * reading a table with it, because a property key is coerced before the
 * lookup happens — which is the part that was missed when this guard was
 * first written against `__proto__` alone. The reported crash was a tool
 * name; the next one was a mode used as a key, and three more readers were
 * sitting on the same lookup.
 *
 * One implementation, because four copies of this rule is how the defect kept
 * coming back. A malformed value is kept, shown as what it is, and left for
 * the diagnostic beside it to explain. Nothing here rewrites a draft. */

/* A table is read with a string and nothing else. A key that is not a string
   answers nothing rather than being coerced into one — and `__proto__`,
   `toString` and the rest of the prototype answer nothing either, because
   what the table holds is the only thing that counts as an answer. */
export function own(table, key) {
  if (typeof key !== "string") return undefined;
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
}

/* A value, as text, without asking the value for any. */
export function safe_text(value) {
  if (typeof value === "string") return value;
  if (value === null) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "undefined") return "nothing";
  return Array.isArray(value) ? "a list" : "an unreadable value";
}

/* An identity made of several stored names.
 *
 * `a + ":" + b` is not an encoding. A delimiter can appear inside a part —
 * `pool:a` is a legal node id and the real store saves and reloads it — so
 * two different tuples became one string, and state held against one thing
 * was drawn over another. JSON's string form escapes the quotes it delimits
 * with, so encoding the whole tuple at once is injective over strings; the
 * parts go through `safe_text` first, so a part that is not a string cannot
 * throw on the way in. */
export function identity_of(parts) {
  return JSON.stringify((Array.isArray(parts) ? parts : []).map(safe_text));
}
