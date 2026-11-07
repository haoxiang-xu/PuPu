import usePendingText from "./pending_text";

/* A name box whose document cannot hold two of the same name.
 *
 * A schema's fields are keyed by name in `properties`; a pool's entries are
 * checked for a duplicate `name` and refused (`subagent_config.py:68-69`). In
 * both the author has to be able to type a name that is already taken — they
 * are halfway through moving it, or they mistyped — and the document must not
 * be given it: writing it anyway deleted the other declaration and moved its
 * marker across, then saved that.
 *
 * So the rule is one implementation and the wording stays with each caller,
 * because "another field is already called X" and "another subagent is
 * already called X" are different sentences about the same refusal.
 *
 * `about` is what the name belongs to where the document names it — an
 * entry's own id — so held text dies when a different thing arrives under the
 * control rather than being redrawn over its equal name. See
 * `usePendingText`, which is where the two rules about unstored text live. */
export default function useTakenName(stored, taken, about) {
  const pending = usePendingText(stored, about);
  const names = Array.isArray(taken) ? taken : [];
  return {
    /* What the box shows: the author's text while it is unstored, else the
       document's own value. */
    shown: pending.text !== null ? pending.text : stored,
    /* Non-null exactly when something is on screen that was not stored. */
    held: pending.text,
    /* Whether what is held is still colliding. Freeing the name by renaming
       the OTHER thing stops the collision without storing anything, so this
       and `held` are separate questions and the caller answers both. */
    taken: pending.text !== null && names.includes(pending.text),
    /* The name to store, or `null` when it was held instead. `""` is a name
       and is not that answer. */
    type: (next) => {
      if (next !== stored && names.includes(next)) {
        pending.hold(next);
        return null;
      }
      pending.release();
      return next;
    },
  };
}
