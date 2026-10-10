/* One resource, open for editing.
 *
 * Load, edit, save against the token the edit was based on, reload, preflight.
 * The whole thing is a reducer so the order of events is testable without a
 * browser: the interesting part is not any single call but what happens when
 * they interleave — a save landing after another editor's, a reload while the
 * draft is dirty, a preflight on something that has not been saved.
 *
 * Two shapes from the real store drive the design, both captured rather than
 * assumed (`skeleton_resource_capture.js`):
 *
 *   - A refused save is an error carrying `edit_conflict`, and the stored
 *     document is untouched. So a conflict is NOT a failure to retry: retrying
 *     with the same token fails identically, and retrying with the new one
 *     would overwrite the other edit without anyone seeing it. The only honest
 *     next steps are to look at theirs or to deliberately keep yours.
 *   - A refused preflight is the FIRST problem, not a list, so it is reported
 *     as one problem and never as "the" set. The set comes from diagnose. */

export const SESSION_STATUS = Object.freeze({
  EMPTY: "empty",
  LOADING: "loading",
  READY: "ready",
  UNAVAILABLE: "unavailable",
  LOAD_FAILED: "load_failed",
});

/* Monotonic for the life of the session, never reset — reopening the same
   resource at the same token still counts as a different thing to have asked
   about, so an answer in flight across it is discarded rather than accepted by
   coincidence. */
function next_version(session) {
  return ((session && session.version) || 0) + 1;
}

export function empty_session() {
  return {
    version: 0,
    status: SESSION_STATUS.EMPTY,
    resource_id: null,
    document: null,
    /* The token the open document was loaded or last saved at. A save sends
       this, never the one that came back from someone else's write. */
    edit_token: null,
    dirty: false,
    saving: false,
    diagnostics: [],
    /* Set when a save was refused for staleness. It holds the user's own
       document so nothing is lost while they decide. */
    conflict: null,
    preflight: null,
    error: null,
  };
}

export function loading(session, resource_id) {
  return {
    ...empty_session(),
    version: next_version(session),
    status: SESSION_STATUS.LOADING,
    resource_id,
  };
}

/* `data` is a store result: {id, kind, name, document, edit_token, diagnostics,
   archived, description, draft_digest, source_identity}. */
export function loaded(session, data) {
  return {
    ...empty_session(),
    version: next_version(session),
    status: SESSION_STATUS.READY,
    resource_id: (data && data.id) || session.resource_id,
    document: (data && data.document) || null,
    edit_token: (data && data.edit_token) || null,
    diagnostics: (data && data.diagnostics) || [],
  };
}

export function load_failed(session, result) {
  return {
    ...session,
    status:
      result && result.reason === "unavailable"
        ? SESSION_STATUS.UNAVAILABLE
        : SESSION_STATUS.LOAD_FAILED,
    error: (result && result.error) || null,
  };
}

/* An edit clears the last preflight: it described a document that no longer
   exists, and leaving it on screen would read as a verdict on this one. */
export function edited(session, document) {
  return {
    ...session,
    version: next_version(session),
    document,
    dirty: true,
    preflight: null,
  };
}

export function save_started(session) {
  return { ...session, saving: true, error: null };
}

export function save_succeeded(session, data) {
  return {
    ...session,
    version: next_version(session),
    saving: false,
    dirty: false,
    conflict: null,
    error: null,
    document: (data && data.document) || session.document,
    edit_token: (data && data.edit_token) || session.edit_token,
    diagnostics: (data && data.diagnostics) || [],
  };
}

export function is_edit_conflict(result) {
  return Boolean(
    result && result.error && result.error.code === "edit_conflict",
  );
}

/* A conflict keeps the user's document in `conflict.document` and leaves the
   editor showing it, so nothing is replaced behind their back. `dirty` stays
   true, because it is still unsaved. */
export function save_refused(session, result) {
  if (is_edit_conflict(result)) {
    return {
      ...session,
      saving: false,
      dirty: true,
      error: null,
      conflict: {
        document: session.document,
        edit_token: session.edit_token,
        error: result.error,
      },
    };
  }
  return {
    ...session,
    saving: false,
    error: (result && result.error) || null,
  };
}

/* Taking the other edit: the editor shows theirs, at their token, and the
   user's own version is dropped — which is why it is only ever reached from an
   explicit action, never automatically. */
export function conflict_discarded(session, data) {
  return { ...loaded(session, data), status: SESSION_STATUS.READY };
}

/* Keeping the user's own: their document is re-based onto the newer token so
   the next save goes through. It will replace the other edit, which is what
   they chose, and nothing says otherwise. */
export function conflict_overridden(session, data) {
  return {
    ...session,
    version: next_version(session),
    conflict: null,
    dirty: true,
    saving: false,
    error: null,
    edit_token: (data && data.edit_token) || session.edit_token,
    diagnostics: (data && data.diagnostics) || session.diagnostics,
  };
}

/* What a preflight was asked ABOUT. The answer is only a verdict on this.
 *
 * A check is issued against a saved version; the author keeps working while it
 * is in flight, and the reply can land on a document the store has never seen.
 * Binding it to the resource, the token it was saved at, and the edit version
 * makes a stale answer identifiable instead of plausible. A disabled button
 * cannot do this — the request was legitimate when it was made. */
export function preflight_token(session) {
  return {
    resource_id: (session && session.resource_id) || null,
    edit_token: (session && session.edit_token) || null,
    version: (session && session.version) || 0,
  };
}

export function preflight_is_current(session, issued) {
  if (!issued) return false;
  const now = preflight_token(session);
  return (
    now.resource_id === issued.resource_id &&
    now.edit_token === issued.edit_token &&
    now.version === issued.version
  );
}

export function preflight_passed(session, data, issued) {
  if (!preflight_is_current(session, issued)) return session;
  return {
    ...session,
    preflight: {
      ok: true,
      definition_digest: (data && data.definition_digest) || null,
    },
  };
}

/* One problem, because that is what the store returns — the first it hit. */
export function preflight_refused(session, result, issued) {
  if (!preflight_is_current(session, issued)) return session;
  return {
    ...session,
    preflight: {
      ok: false,
      error: (result && result.error) || null,
      reason: (result && result.reason) || "refused",
    },
  };
}

/* ── What the UI should say ─────────────────────────────────────────────── */

export function conflict_message(session) {
  if (!session || !session.conflict) return null;
  return "This was saved somewhere else after you opened it. Nothing has been overwritten — look at the newer version, or keep yours and replace it.";
}

export function can_save(session) {
  return Boolean(
    session &&
      session.status === SESSION_STATUS.READY &&
      session.dirty &&
      !session.saving &&
      !session.conflict,
  );
}

/* Run and Publish ask the store, and an unsaved edit has not been asked about:
   preflighting the stored version would answer about a document the author is
   no longer looking at. */
export function can_preflight(session) {
  return Boolean(
    session &&
      session.status === SESSION_STATUS.READY &&
      !session.dirty &&
      !session.saving &&
      !session.conflict,
  );
}

export function preflight_message(session) {
  const preflight = session && session.preflight;
  if (!preflight) return null;
  if (preflight.ok) return "Ready to run.";
  const error = preflight.error || {};
  const detail = error.message ? ` — ${error.message}` : "";
  /* Named as the first problem, not the only one: the store stops at the one
     it hits, while `diagnose` lists them all. */
  return `Not ready to run yet${detail}`;
}
