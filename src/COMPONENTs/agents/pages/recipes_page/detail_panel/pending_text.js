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
 * The rules, both learned the hard way:
 *
 * It is held together with the value it was offered in place of. That value
 * cannot change by typing into this box — a refused edit is not written — so a
 * change always came from somewhere else: another node selected, the document
 * replaced by a reload or a conflict resolved the other way. The text was
 * typed against something that is no longer there.
 *
 * And it is discarded then, not hidden. Comparing the text against the current
 * value on each render reads correctly while they differ and leaves the text
 * alive behind the comparison, so a value that comes back brings the text back
 * with it — over a value it never described, by coincidence. Being void is a
 * fact about the moment the value changed, not about what the value is now.
 *
 * What this cannot answer is whether the control still belongs to the same
 * thing. A position cannot say it and neither can a value: removing the first
 * of two rows holding the same number leaves a successor that matches on both.
 * Only the list knows an edit moved its items, so the list mints an identity
 * per item and spends it as the React key — see `mint_identities`. */
export default function usePendingText(stored) {
  const [pending, setPending] = useState({ shown: stored, text: null });
  if (!Object.is(pending.shown, stored)) {
    setPending({ shown: stored, text: null });
  }
  const text = Object.is(pending.shown, stored) ? pending.text : null;
  return {
    /* `null` when there is nothing unstored — the caller shows the value. */
    text,
    hold: (next) => setPending({ shown: stored, text: next }),
    release: () => setPending({ shown: stored, text: null }),
  };
}
