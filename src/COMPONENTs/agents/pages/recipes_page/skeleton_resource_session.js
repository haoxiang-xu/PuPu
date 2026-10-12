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

/* Changes when a resource is opened, and only then. The version alone cannot
   tell one sitting from another: A → B → A puts the same id back, and an
   answer still in flight from the first visit passes a check that compares
   ids. It must not — it can roll the token back, or raise a conflict that is
   not happening. An edit must not change it either, or a save issued before
   the edit would be discarded instead of recognised as "stored, but there is
   newer work". */
function next_open_id(session) {
  return ((session && session.open_id) || 0) + 1;
}

export function empty_session() {
  return {
    version: 0,
    open_id: 0,
    status: SESSION_STATUS.EMPTY,
    resource_id: null,
    document: null,
    /* The token the open document was loaded or last saved at. A save sends
       this, never the one that came back from someone else's write. */
    edit_token: null,
    dirty: false,
    /* A write the store performs on the stored document rather than one the
       author composed. Kept apart from `saving` so the save bar never claims
       a save is happening, and so nothing else that asks about the stored
       version runs while it is being rewritten. */
    converting: false,
    saving: false,
    diagnostics: [],
    /* Set when a save was refused for staleness. It holds the user's own
       document so nothing is lost while they decide. */
    conflict: null,
    preflight: null,
    error: null,
  };
}

/* What a load or a save was issued against. An answer is only about this, and
   the session may have moved on while it was in flight — to another edit, or
   to another resource entirely. Applying it then would give the new resource's
   identity with the old one's document and token, and the next save would
   write that over it. */
export function session_token(session) {
  return {
    open_id: (session && session.open_id) || 0,
    resource_id: (session && session.resource_id) || null,
    version: (session && session.version) || 0,
  };
}

/* The same resource opened a second time is a different sitting. */
function same_open(session, issued) {
  if (!issued) return false;
  const now = session_token(session);
  return now.open_id === issued.open_id && now.resource_id === issued.resource_id;
}

export function loading(session, resource_id) {
  return {
    ...empty_session(),
    version: next_version(session),
    open_id: next_open_id(session),
    status: SESSION_STATUS.LOADING,
    resource_id,
  };
}

/* `data` is a store result: {id, kind, name, document, edit_token, diagnostics,
   archived, description, draft_digest, source_identity}. */
export function loaded(session, data, issued) {
  /* A load answers about the resource that was asked for. Anything else has
     happened since — another load, or a different resource — and this is no
     longer the answer to the open question. */
  if (issued && !(same_open(session, issued) && session.version === issued.version)) {
    return session;
  }
  return {
    ...empty_session(),
    version: next_version(session),
    open_id: (session && session.open_id) || 0,
    status: SESSION_STATUS.READY,
    resource_id: (data && data.id) || session.resource_id,
    document: (data && data.document) || null,
    edit_token: (data && data.edit_token) || null,
    diagnostics: (data && data.diagnostics) || [],
  };
}

export function load_failed(session, result, issued) {
  if (issued && !(same_open(session, issued) && session.version === issued.version)) {
    return session;
  }
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

/* A save stored the document it was handed, and nothing more. Anything typed
   while it was in flight was never sent, so the echoed document must not
   replace what is on screen — that deletes the newer work — and the draft is
   still unsaved, so saying "Saved" would be the opposite of what happened.
   The token moves either way, because the write really did land and the next
   save has to compare against what the store now holds. */
export function save_succeeded(session, data, issued) {
  if (issued && !same_open(session, issued)) return session;
  const typed_since = Boolean(issued) && session.version !== issued.version;
  return {
    ...session,
    version: next_version(session),
    saving: false,
    dirty: typed_since,
    conflict: null,
    error: null,
    document: typed_since
      ? session.document
      : (data && data.document) || session.document,
    edit_token: (data && data.edit_token) || session.edit_token,
    /* They describe what the store now holds, which is what they always
       describe — the same state as saving and then editing. */
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
export function save_refused(session, result, issued) {
  if (issued && !same_open(session, issued)) return session;
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
/* Taking the other edit throws this one away, so it may only throw away the
   document the choice was made about. Typing after choosing is newer intent
   than the choice: applying it then deletes work the author added since, and
   reports it as saved.
   The conflict is kept rather than resolved, and marked, so the button does
   not merely appear to do nothing — the author chooses again, now about what
   is actually on screen.
   `conflict_overridden` needs none of this: keeping this version and then
   adding to it are the same intent. */
export function conflict_discarded(session, data, issued) {
  if (issued && !same_open(session, issued)) return session;
  if (issued && session.version !== issued.version) {
    return {
      ...session,
      conflict: { ...session.conflict, stale_choice: true },
    };
  }
  return { ...loaded(session, data), status: SESSION_STATUS.READY };
}

/* Keeping the user's own: their document is re-based onto the newer token so
   the next save goes through. It will replace the other edit, which is what
   they chose, and nothing says otherwise. */
export function conflict_overridden(session, data, issued) {
  if (issued && !same_open(session, issued)) return session;
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

/* The client-side guard above only sees what changed on THIS page. Another
   window can save between the request and the reply, and the store will have
   checked that newer document — observed: page at edit-1, preflight returns
   edit-2 and the other window's content. The reported token is the only
   evidence, and the answer is not a verdict on what is open.
   Nothing is adopted from it: taking the newer token would let the next save
   overwrite the other window's work without anyone choosing that. */
export function preflight_passed(session, data, issued) {
  if (!preflight_is_current(session, issued)) return session;
  const checked = data && data.edit_token;
  if (checked && session.edit_token && checked !== session.edit_token) {
    return {
      ...session,
      preflight: { ok: false, stale: true, checked_edit_token: checked },
    };
  }
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
  if (session.conflict.stale_choice) {
    return "You changed this draft after choosing, so nothing was replaced. Choose again for what is on screen now — look at the newer version, or keep yours and replace it.";
  }
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
      !session.converting &&
      !session.conflict,
  );
}

/* Converting a legacy Subagent Pool writes the STORED document, so what is on
   screen has to be the stored version — the same condition a preflight needs,
   plus the token the write is made against. A conversion while the draft is
   dirty would bump the token under the author's unsaved work and leave them
   unable to save it.
 *
 * Not while one is already in flight either: the second request is answered
 * about a token the first has already moved on, so its answer is an edit
 * conflict that never happened. That exclusion comes from `can_preflight`,
 * which is where "the stored version is what is on screen, and nothing is
 * writing it" is decided — a second clause here would be one that can never
 * be true. */
export function can_convert_legacy_pools(session) {
  return can_preflight(session) && Boolean(session && session.edit_token);
}

export function conversion_started(session) {
  return { ...session, converting: true, error: null };
}

/* Whether an answer is the one this sitting is waiting for.
 *
 * Settling the flag and applying the answer are two decisions, and treating
 * them as one is how a reply still in flight from the resource the author
 * left cleared the flag on the resource they are converting now — which let
 * that one be submitted again before it had finished. A sitting has its own
 * identity for exactly this reason: `A → B → A` puts the same id back, and
 * `open_id` is what tells the visits apart.
 *
 * There can only ever be one conversion pending per sitting, because a second
 * is refused while the first is in flight, so the sitting identifies it. */
function answers_conversion(session, issued) {
  return Boolean(session && session.converting) && same_open(session, issued);
}

/* The flag is settled because THIS conversion finished. The document is
   applied only if nothing has moved since — `loaded`'s own question — so an
   answer that outlived the author's typing stops the spinner and leaves their
   work alone. */
export function conversion_succeeded(session, data, issued) {
  if (!answers_conversion(session, issued)) return session;
  return { ...loaded(session, data, issued), converting: false };
}

/* The same two decisions. A refusal that outlived its own version says
   nothing beyond settling: a phantom conflict would send the author to a
   resolution screen for an edit nobody made. One that is still current means
   what a refused save means, including the conflict a stale token really does
   raise. */
export function conversion_failed(session, result, issued) {
  if (!answers_conversion(session, issued)) return session;
  const settled = { ...session, converting: false };
  if (!issued || session.version !== issued.version) return settled;
  return save_refused(settled, result, null);
}

export function preflight_message(session) {
  const preflight = session && session.preflight;
  if (!preflight) return null;
  if (preflight.stale) {
    return "This Agent was saved somewhere else, so the check ran against that newer version, not the one open here. Reload before relying on it.";
  }
  if (preflight.ok) return "Ready to run.";
  const error = preflight.error || {};
  const detail = error.message ? ` — ${error.message}` : "";
  /* Named as the first problem, not the only one: the store stops at the one
     it hits, while `diagnose` lists them all. */
  return `Not ready to run yet${detail}`;
}
