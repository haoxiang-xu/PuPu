import { useCallback, useRef, useState } from "react";
import {
  convert_legacy_pools as convert_legacy_pools_in_store,
  load_resource,
  preflight as preflight_resource,
  save_draft,
} from "./skeleton_resources";
import { legacy_conversion_plan } from "./legacy_conversion";
import {
  can_convert_legacy_pools,
  conflict_discarded,
  conversion_failed,
  conversion_started,
  conversion_succeeded,
  conflict_overridden,
  edited,
  empty_session,
  load_failed,
  loaded,
  loading,
  restored,
  same_open,
  can_preflight,
  preflight_passed,
  preflight_refused,
  preflight_token,
  save_refused,
  save_started,
  save_succeeded,
  session_token,
} from "./skeleton_resource_session";

/* The open resource, driven by the real store.
 *
 * Every call goes through the adapter, which answers `unavailable` when this
 * build has no such bridge method rather than appearing to do nothing. The
 * reducer decides what each answer means; this hook only sequences them and
 * keeps the latest state where a render can see it.
 *
 * Resolving a conflict re-reads the resource first, because both choices need
 * the newer token: taking theirs needs their document with it, and keeping
 * yours needs your document re-based onto it. Neither is reachable without an
 * explicit action — a save is never retried on the author's behalf, since the
 * retry that would succeed is the one that overwrites someone else's work. */

export default function useSkeletonResource() {
  const [session, setSession] = useState(empty_session);
  /* Reads of the current session from inside an await, where the state
     variable is the one captured when the call started. */
  const ref = useRef(session);
  const apply = useCallback((next) => {
    const value = typeof next === "function" ? next(ref.current) : next;
    ref.current = value;
    setSession(value);
    return value;
  }, []);

  const load = useCallback(
    async (resource_id) => {
      const started = apply((current) => loading(current, resource_id));
      const issued = session_token(started);
      const result = await load_resource(resource_id);
      return apply((current) =>
        result.ok
          ? loaded(current, result.data, issued)
          : load_failed(current, result, issued),
      );
    },
    [apply],
  );

  /* Opening another resource in this editor, for a drill-in into a referenced
     Agent. The read comes first and what is on screen is replaced only if it
     succeeded — and only if the caller's own gate admits what came back. A
     failed read has to leave the author where they are: navigating first and
     failing afterwards is how someone ends up looking at an empty page for a
     graph they never asked for.
     The session that was left is handed back for the drill stack to hold, and
     it is taken at the moment of the swap rather than when the read started —
     the author keeps typing while a read is in flight, and a copy taken
     earlier would lose exactly those keystrokes.

     Everything else here is about the same gap: a read is adopted by
     REPLACING the session, which is the one thing no clause in the reducer
     guards. So the swap asks three questions of the moment it happens in,
     not of the moment it was asked for:

       is this still the sitting the read was issued from? The author may have
       opened another Agent meanwhile, and the answer about this one would
       then replace it — measured on the real page: the abandoned graph's
       breadcrumb over the new graph's content.

       is anything being written? A save started after the read was issued is
       an answer that belongs to the graph on screen now. Navigating would
       stash a sitting with a pending write in it, and the reply can be
       applied to neither graph — the frame came back permanently "Saving…"
       while the store had in fact stored it.

       does the caller still want it? The hook knows which sitting asked; it
       does not know which graph inside it the author is looking at, or which
       row they clicked last. That is the page's answer, and it is asked here
       so that it is asked at the same instant as the other two.

     An edit is NOT one of the questions: typing while the read is in flight
     is exactly what the frame has to carry. */
  const open_another = useCallback(
    async (resource_id, admit, still_wanted) => {
      const issued = session_token(ref.current);
      const result = await load_resource(resource_id);
      if (!result.ok) return { ok: false, result };
      const refused = typeof admit === "function" ? admit(result.data) : null;
      if (refused) return { ok: false, refused };
      let left = null;
      let blocked = null;
      let obsolete = false;
      apply((current) => {
        if (!same_open(current, issued)) {
          obsolete = true;
          return current;
        }
        if (current.saving || current.converting) {
          blocked = current.saving ? "saving" : "converting";
          return current;
        }
        if (typeof still_wanted === "function" && still_wanted() !== true) {
          obsolete = true;
          return current;
        }
        left = current;
        return loaded(loading(current, resource_id), result.data);
      });
      if (blocked) return { ok: false, blocked };
      if (obsolete) return { ok: false, obsolete: true };
      return { ok: true, left };
    },
    [apply],
  );

  /* Coming back up: the stashed sitting, renumbered. */
  const restore = useCallback(
    (saved) => apply((current) => restored(current, saved)),
    [apply],
  );

  const edit = useCallback(
    (document) => apply((current) => edited(current, document)),
    [apply],
  );

  const save = useCallback(async () => {
    const current = ref.current;
    if (!current.document) return current;
    const issued = session_token(current);
    apply(save_started(current));
    const result = await save_draft(current.document, current.edit_token);
    return apply((latest) =>
      result.ok
        ? save_succeeded(latest, result.data, issued)
        : save_refused(latest, result, issued),
    );
  }, [apply]);

  /* Both resolutions re-read first: the newer token is what either one needs. */
  const resolve_conflict = useCallback(
    async (keep) => {
      const current = ref.current;
      if (!current.conflict) return current;
      /* The re-read is an answer about this sitting of this resource. By the
         time it lands the author may be editing a different Agent, and
         applying it there would replace that draft with this one's content. */
      const issued = session_token(current);
      const result = await load_resource(current.resource_id);
      if (!result.ok) return apply((latest) => load_failed(latest, result, issued));
      return apply((latest) =>
        keep === "mine"
          ? conflict_overridden(latest, result.data, issued)
          : conflict_discarded(latest, result.data, issued),
      );
    },
    [apply],
  );

  /* The limit lives here, not only on the button: any other caller would
     otherwise ask the store about the stored version while the author is
     looking at an edited one. The token is taken before the call and checked
     against the session on return, so an answer that outlived what it was
     asked about is dropped rather than shown. */
  const preflight = useCallback(async () => {
    const current = ref.current;
    if (!can_preflight(current)) return current;
    const issued = preflight_token(current);
    /* No Kernel goes over. Every Kernel the store needs is in the document —
       a node's own, or, for a legacy subagent, the one configured on the
       Agent node its pool is attached to — and the request fallback is for
       whatever has none, which is the author's to configure rather than this
       editor's to supply. Measured: with nothing sent, a migrated Agent whose
       Kernel Loop is configured is admitted, and one that is not answers
       `legacy_profile_required` naming what needs it. */
    const result = await preflight_resource(current.resource_id);
    return apply((latest) =>
      result.ok
        ? preflight_passed(latest, result.data, issued)
        : preflight_refused(latest, result, issued),
    );
  }, [apply]);

  /* The store converts a legacy Subagent Pool and saves it, so the answer is
     the resource as it now stands — taken as loaded, because that is what it
     is: the stored version, at a new token, with nothing of the author's
     waiting to be written. A refusal goes through the save path, so a token
     that went stale raises the same conflict a save would and is resolved the
     same way. The limit lives here as well as on the button, for the reason
     `preflight`'s does. */
  const convertLegacyPools = useCallback(async () => {
    const current = ref.current;
    if (!can_convert_legacy_pools(current)) return current;
    /* The plan is read here rather than taken from the caller, for the reason
       the two limits above live here: the panel decided what to say about a
       document it was rendered with, and this is the document the store is
       about to be asked to change. A plan that refuses is not sent — the
       write would be refused, and the panel is already saying why. Nothing
       but the document goes over: each pool's children are built on the
       Kernel configured where that pool is attached. */
    const plan = legacy_conversion_plan(current.document);
    if (plan.refusal) return current;
    const started = apply(conversion_started(current));
    const issued = session_token(started);
    const result = await convert_legacy_pools_in_store(
      current.resource_id,
      current.edit_token,
      null,
    );
    return apply((latest) =>
      result.ok
        ? conversion_succeeded(latest, result.data, issued)
        : conversion_failed(latest, result, issued),
    );
  }, [apply]);

  return {
    session,
    load,
    openAnother: open_another,
    restore,
    edit,
    save,
    keepMine: () => resolve_conflict("mine"),
    takeTheirs: () => resolve_conflict("theirs"),
    preflight,
    convertLegacyPools,
  };
}
