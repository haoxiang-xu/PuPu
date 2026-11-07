import { useRef } from "react";

/* An identity per item in a list the document addresses by position.
 *
 * A path's steps and a schema's fields are both ordered, and a pool's entries
 * are ordered too. Where the document names an item — a field by its key, an
 * entry by its id — that name is what state beside the item is held against,
 * and `usePendingText` does that. This is for the rest: a list whose items the
 * document cannot name, or cannot name uniquely, because the draft it
 * accepted holds two that answer alike.
 *
 * Then "which item is this" still has to have an answer, and position is not
 * one. Removing the first of two items that match on everything leaves a
 * successor in the same place answering the same way, and state keyed to
 * either follows the wrong item. So the identity is minted here, lives
 * exactly as long as the item does, and is spent as the item's React key —
 * which ties any state inside the item to the item rather than to a place in
 * a list.
 *
 * Only the list knows that an edit *moved* its items rather than changed one,
 * so only the list can carry the identities across such an edit: a removal
 * drops that item's and keeps the rest, an insertion adds one.
 *
 * And only the editor knows which writes are its own. That is what `source`
 * is for: the list the ids were minted for. A list arriving that the editor
 * did not announce is a version from somewhere else — a reload, a conflict
 * resolved the other way, the other editor's version taken — and then there
 * is nothing to carry, even when the count is the same and every value the
 * panel could compare is the same. Two entries the document cannot tell apart
 * can be reordered by such a version, and the identities must not survive it.
 *
 * A caller that passes no `source` keeps the older behaviour, where the count
 * is the only evidence of a structural change. That is enough wherever the
 * document's own names are unique — a schema's fields, a path's steps — since
 * the value or the name then voids the held text on its own.
 *
 * `owner` is whatever the whole list belongs to — a node, a row — because
 * when that changes these are different items even if they look identical. */

let minted = 0;

export function mint_identities(count) {
  return Array.from({ length: count }, () => `item-${(minted += 1)}`);
}

export default function useListIdentities(owner, count, source) {
  const held = useRef(null);
  const current = held.current;
  const same_owner = current !== null && current.owner === owner;
  /* Either the list is the one these ids were minted for, or it is the one
     the editor announced it was about to write. Anything else is a version
     this editor did not make. */
  const mine =
    same_owner &&
    (Object.is(current.source, source) || Object.is(current.announced, source));
  held.current =
    mine && current.ids.length === count
      ? { owner, source, ids: current.ids, announced: null }
      : { owner, source, ids: mint_identities(count), announced: null };
  const ids = held.current.ids;
  /* Each of these is called in the same tick as the edit is reported, so the
     render that follows sees a list and a count that already match and keeps
     these. They read the ref rather than this render's ids, so the order they
     are called in does not matter. */
  return {
    ids,
    removed: (index) => {
      held.current = {
        ...held.current,
        ids: held.current.ids.filter((_, position) => position !== index),
      };
    },
    added: (howMany = 1) => {
      held.current = {
        ...held.current,
        ids: [...held.current.ids, ...mint_identities(howMany)],
      };
    },
    /* The list this editor is about to write. Announced rather than inferred:
       a replacement from outside can be identical in everything the panel is
       able to compare, so the only thing that separates the two is which one
       of them this editor caused. */
    carrying: (next) => {
      held.current = { ...held.current, announced: next };
    },
  };
}
