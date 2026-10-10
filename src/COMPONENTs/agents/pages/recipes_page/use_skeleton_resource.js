import { useCallback, useRef, useState } from "react";
import {
  load_resource,
  preflight as preflight_resource,
  save_draft,
} from "./skeleton_resources";
import {
  conflict_discarded,
  conflict_overridden,
  edited,
  empty_session,
  load_failed,
  loaded,
  loading,
  preflight_passed,
  preflight_refused,
  save_refused,
  save_started,
  save_succeeded,
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
      apply((current) => loading(current, resource_id));
      const result = await load_resource(resource_id);
      return apply((current) =>
        result.ok ? loaded(current, result.data) : load_failed(current, result),
      );
    },
    [apply],
  );

  const edit = useCallback(
    (document) => apply((current) => edited(current, document)),
    [apply],
  );

  const save = useCallback(async () => {
    const current = ref.current;
    if (!current.document) return current;
    apply(save_started(current));
    const result = await save_draft(current.document, current.edit_token);
    return apply((latest) =>
      result.ok ? save_succeeded(latest, result.data) : save_refused(latest, result),
    );
  }, [apply]);

  /* Both resolutions re-read first: the newer token is what either one needs. */
  const resolve_conflict = useCallback(
    async (keep) => {
      const current = ref.current;
      if (!current.conflict) return current;
      const result = await load_resource(current.resource_id);
      if (!result.ok) return apply((latest) => load_failed(latest, result));
      return apply((latest) =>
        keep === "mine"
          ? conflict_overridden(latest, result.data)
          : conflict_discarded(latest, result.data),
      );
    },
    [apply],
  );

  const preflight = useCallback(async () => {
    const current = ref.current;
    if (!current.resource_id) return current;
    const result = await preflight_resource(current.resource_id);
    return apply((latest) =>
      result.ok ? preflight_passed(latest, result.data) : preflight_refused(latest, result),
    );
  }, [apply]);

  return {
    session,
    load,
    edit,
    save,
    keepMine: () => resolve_conflict("mine"),
    takeTheirs: () => resolve_conflict("theirs"),
    preflight,
  };
}
