import { useRef } from "react";

/* An identity per item in a list the document addresses by position.
 *
 * A path's steps and a schema's fields are both ordered and both anonymous:
 * the wire addresses them by where they are, and the envelopes are closed, so
 * there is no id to carry and none can be added. That is fine until something
 * holds state beside an item — text it is showing that the document does not
 * store — because then "which item is this" has to have an answer, and
 * position is not one. Removing the first of two items holding the same value
 * leaves a successor at the same position with the same value, and state keyed
 * to either follows the wrong item.
 *
 * So the identity is minted here, lives exactly as long as the item does, and
 * is spent as the item's React key — which ties any state inside the item to
 * the item rather than to a place in a list. Only the list knows that an edit
 * *moved* its items rather than changed one, so only the list can carry the
 * identities across such an edit: a removal drops that item's and keeps the
 * rest, an insertion adds one, a replacement keeps them all.
 *
 * A count that no longer matches means the list was replaced from outside the
 * editor, and then there is nothing to carry. `owner` is whatever the whole
 * list belongs to — a node, a row — because when that changes these are
 * different items even if they look identical. */

let minted = 0;

export function mint_identities(count) {
  return Array.from({ length: count }, () => `item-${(minted += 1)}`);
}

export default function useListIdentities(owner, count) {
  const held = useRef({ owner: null, ids: [] });
  if (held.current.owner !== owner || held.current.ids.length !== count) {
    held.current = { owner, ids: mint_identities(count) };
  }
  const ids = held.current.ids;
  return {
    ids,
    /* Called in the same tick as the edit is reported, so the render that
       follows sees a count that already matches and keeps these. */
    removed: (index) => {
      held.current = { owner, ids: ids.filter((_, i) => i !== index) };
    },
    added: (howMany = 1) => {
      held.current = { owner, ids: [...ids, ...mint_identities(howMany)] };
    },
  };
}
