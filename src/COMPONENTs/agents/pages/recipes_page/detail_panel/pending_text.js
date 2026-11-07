import { useState } from "react";

/* Text a control is showing that the document deliberately does not hold.
 *
 * Three boxes in this panel need it: a path position the wire would refuse, a
 * schema bound it would refuse, and a field name that cannot be written
 * because another field already has it. In each case the author has to see
 * what they typed in order to correct it, and the document must not be given
 * it. Each of the three arrived with its own copy of this, and the first two
 * copies each shipped the same two defects before being fixed — so this is
 * one implementation, and the rules live here rather than being rediscovered.
 *
 * The rules, all learned the hard way:
 *
 * It is held against the value it is showing instead of. A refused edit is
 * not written, so that value changing always came from somewhere else:
 * another node selected, the document replaced by a reload or a conflict
 * resolved the other way. The text was typed against something that is no
 * longer there. `hold` takes that value explicitly for the one caller whose
 * text is *not* a refusal — a bound box keeps the spelling `0.` on screen
 * while the document is given the zero it means, and the value it is held
 * against is therefore the one about to arrive, not the one on screen now.
 *
 * And it is discarded then, not hidden. Comparing the text against the current
 * value on each render reads correctly while they differ and leaves the text
 * alive behind the comparison, so a value that comes back brings the text back
 * with it — over a value it never described, by coincidence. Being void is a
 * fact about the moment the value changed, not about what the value is now.
 *
 * A value alone cannot say the control still belongs to the same thing, so
 * `about` says what the text is about whenever the document names it: a field
 * is called by its name, because `properties` is a map, and a row keyed only
 * by position went on showing one field's refused bound over another field's
 * equal bound after the schema was replaced underneath. Where the document
 * names nothing — a path's steps are addressed by where they are — the
 * identity is minted by the list instead and spent as the React key, which is
 * what `mint_identities` is for. A list cannot be keyed by a name its own box
 * is in the middle of typing, so these two are not the same mechanism and
 * neither replaces the other. */
export default function usePendingText(stored, about) {
  const [pending, setPending] = useState({ about, shown: stored, text: null });
  const void_now =
    !Object.is(pending.about, about) || !Object.is(pending.shown, stored);
  if (void_now) {
    setPending({ about, shown: stored, text: null });
  }
  return {
    /* `null` when there is nothing unstored — the caller shows the value. */
    text: void_now ? null : pending.text,
    hold: (next, against = stored) =>
      setPending({ about, shown: against, text: next }),
    release: () => setPending({ about, shown: stored, text: null }),
  };
}
