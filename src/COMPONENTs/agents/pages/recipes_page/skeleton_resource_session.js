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

import { empty_sources, merged_sources, referenced_shas } from "./managed_code_sources";

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

/* Changes when the author was handed another document TO LOOK AT, and only
 * then: this resource opened or re-opened, or the other editor's version
 * taken. `version` cannot answer it and `edit_token` cannot either — the first
 * changes on every keystroke that lands, which is exactly when a control
 * holding unstored text must keep it, and the second changes when the author's
 * own version is re-based onto a newer token, which replaces nothing.
 *
 * It exists because a control cannot tell "the same number in a different
 * document" from "the same number". Measured: a refused reservation typed into
 * an Agent, a save refused for staleness, the other version taken — and the
 * refused number was still sitting in the box on a page that now said Saved,
 * because the value it was held against came back by coincidence.
 *
 * What it must NOT count is the answer to a request the author made EARLIER.
 * It counted a save's own echo for one round, on the reasoning that a page
 * saying Saved should not show text the store does not hold — and that was
 * wrong twice over. Local text that was never stored does not call `edit`, so
 * `typed_since` cannot see it; and the echo then arrived while the author was
 * typing in the box, refilled it under the caret, and made their next
 * keystroke append to the refilled number instead of replacing it: 4096
 * cleared, the echo landing, then `5` typed read as 40965. Taking the other
 * version is a decision to throw this draft away; the reply to one's own Save
 * is not permission to erase what was typed after clicking it. A conversion's
 * answer is the same shape of reply and is excluded for the same reason.
 *
 * The box is not lying meanwhile: a refused number says beside itself that it
 * was not stored and names the value that is.
 *
 * Monotonic like `version`, never reset: reopening a resource is another thing
 * to have been handed. */
function next_document_revision(session) {
  return ((session && session.document_revision) || 0) + 1;
}

export function empty_session() {
  return {
    version: 0,
    open_id: 0,
    document_revision: 0,
    status: SESSION_STATUS.EMPTY,
    resource_id: null,
    document: null,
    /* The token the open document was loaded or last saved at. A save sends
       this, never the one that came back from someone else's write. */
    edit_token: null,
    /* The Code text this sitting can reach, keyed by its digest (#357 G1).
       A Code node names its text by the digest in its source path, so the
       table is about bytes, not about nodes: which node a text belongs to is
       read from the document when Save is built. It holds what the store
       handed over and what the author typed, and lets a text go once no
       document the author can still reach names it. */
    sources: empty_sources(),
    dirty: false,
    /* A write the store performs on the stored document rather than one the
       author composed. Kept apart from `saving` so the save bar never claims
       a save is happening, and so nothing else that asks about the stored
       version runs while it is being rewritten. */
    converting: false,
    saving: false,
    diagnostics: [],
    /* Which version of this draft the diagnostics above are about.
     *
     * They are the store's answer about a document it was given, and every
     * path in them addresses that document BY POSITION — `document.nodes.5`,
     * or an embedded child at `…subagents.0.source.document.nodes.1`. The
     * editor then places each one by walking the document on screen, so a
     * list that outlived its own document does not merely go out of date: it
     * lands on whatever now occupies those positions. Measured on the real
     * store: a pool whose first entry had a bad reference, the author deletes
     * that entry without saving, and the survivor — a child the store calls
     * healthy, with `diagnostics: []` and a passing preflight for the exact
     * document the editor would send — showed the deleted sibling's error on
     * its own binding row.
     *
     * So they carry the version they were checked against, and the editor
     * only places them while it still equals the one on screen. Nothing is
     * remapped by id: a draft may hold two nodes with one id, and guessing
     * which of them a path meant is the same mistake with more steps. */
    diagnostics_version: 0,
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
/* Whether the diagnostics on hand describe the document on screen.
 *
 * `false` is not "nothing is wrong" and not "something is": it is "this draft
 * has not been checked", which is a third state the editor has to say out
 * loud, because an empty problem area otherwise reads as an all-clear. */
export function diagnostics_are_current(session) {
  if (!session) return false;
  return ((session.diagnostics_version) || 0) === ((session.version) || 0);
}

export function session_token(session) {
  return {
    open_id: (session && session.open_id) || 0,
    resource_id: (session && session.resource_id) || null,
    version: (session && session.version) || 0,
  };
}

/* The same resource opened a second time is a different sitting.
 *
 * Exported because the reducer is not the only place that has to ask. A read
 * issued for a drill-in is adopted by REPLACING the session — there is no
 * clause here it passes through — so the hook asks this question itself,
 * about the sitting the read was issued from, at the moment of the swap. */
export function same_open(session, issued) {
  if (!issued) return false;
  const now = session_token(session);
  return now.open_id === issued.open_id && now.resource_id === issued.resource_id;
}

export function loading(session, resource_id) {
  return {
    ...empty_session(),
    version: next_version(session),
    open_id: next_open_id(session),
    document_revision: next_document_revision(session),
    status: SESSION_STATUS.LOADING,
    resource_id,
  };
}

/* A new, locally composed Agent has an identity but no stored version yet.
 * It is a new sitting just like an open, so replies from an earlier visit
 * (even to this same id) cannot reach it. It has NOT been diagnosed: an empty
 * list here is deliberately unchecked until its first successful save. */
export function draft_created(session, document) {
  return {
    ...empty_session(),
    version: next_version(session),
    open_id: next_open_id(session),
    document_revision: next_document_revision(session),
    status: SESSION_STATUS.READY,
    resource_id: document.id,
    document,
    dirty: true,
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
  const version = next_version(session);
  return {
    ...empty_session(),
    version,
    open_id: (session && session.open_id) || 0,
    /* A load is the author being handed a document to look at, and
       `conflict_discarded` is one, so it is counted from here.
       `conversion_succeeded` is a load too and must NOT be counted, so it
       puts this back — see the note above. */
    document_revision: next_document_revision(session),
    status: SESSION_STATUS.READY,
    resource_id: (data && data.id) || session.resource_id,
    document: (data && data.document) || null,
    edit_token: (data && data.edit_token) || null,
    /* The text of THIS document, as the store holds it — never carried over
       from what the sitting held before: a load is somebody's version, and
       the author's typed text belongs to the document it was typed into. */
    sources: merged_sources(data && data.managed_sources),
    diagnostics: (data && data.diagnostics) || [],
    /* A load hands over a document and the store's answer about that same
       document, so this is the one place they are current by construction. */
    diagnostics_version: version,
  };
}

/* Putting back a sitting that was stashed while another graph was open.
 *
 * Drilling into a referenced Agent opens another resource in this same editor,
 * and coming back restores the one that was left instead of re-reading it:
 * going back is navigation, not a save, so unsaved edits have to survive it.
 *
 * What must NOT survive is the sitting's identity. The counters are monotonic
 * for exactly this case — `A → B → A` puts the same resource id back, and a
 * load or a save still in flight from the first visit would then pass
 * `same_open` and be applied to a document it is not an answer about, rolling
 * the token back or raising a conflict nobody caused. So a restored frame is a
 * new sitting, numbered with values that have never been used.
 *
 * `document_revision` moves with them: the author is being handed a document
 * to look at, and a control holding text this document does not hold has to
 * let go of it.
 *
 * `saving` and `converting` do NOT come back, and that is the same rule from
 * the other side. A frame is only ever taken while nothing is in flight — the
 * hook refuses the swap otherwise — and the reason is this: the renumbering
 * above makes the restored sitting one that no earlier answer can reach, so a
 * write marked pending in a frame is one nothing is left to settle. Carried
 * through, it was a disabled "Saving…" for the rest of the session, with the
 * write itself long since stored. Measured on the real store: the save had
 * landed and moved the token, and the editor could neither save nor drill
 * again. */
export function restored(session, saved) {
  const version = next_version(session);
  return {
    ...saved,
    version,
    open_id: next_open_id(session),
    document_revision: next_document_revision(session),
    saving: false,
    converting: false,
    /* The frame's diagnostics are about the frame's document, and both come
       back together — so a frame that was checked is still checked, at its new
       number, and one that had been edited stays unchecked. Renumbering is
       about which answers in flight may reach this sitting; it is not a
       check. */
    diagnostics_version: diagnostics_are_current(saved)
      ? version
      : (saved && saved.diagnostics_version) || 0,
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
   exists, and leaving it on screen would read as a verdict on this one.
   The diagnostics are kept and NOT renumbered, which is the whole of the
   rule: they still describe the version they were checked against, the
   version number moves, and `diagnostics_are_current` is false from here
   until the store answers about this draft. */
export function edited(session, document, { coalesce = false, sources = null } = {}) {
  const history = history_of(session);
  const next_history = {
    past: coalesce ? history.past : bounded([...history.past, session.document]),
    future: [],
  };
  /* Text typed in this edit joins the table; text no reachable document
     names any more — not on screen, not one undo away, not held by a
     conflict — is let go, so a long session of typing does not keep every
     intermediate copy. */
  const reachable = referenced_shas([
    document,
    ...next_history.past,
    ...(session && session.conflict ? [session.conflict.document] : []),
  ]);
  return {
    ...session,
    version: next_version(session),
    document,
    sources: merged_sources(session && session.sources, sources, reachable),
    dirty: true,
    preflight: null,
    /* One step back per gesture. A later edit in the same gesture folds into
       the step the first one recorded, which is what the hook's `coalesce`
       says. Either way an edit drops what was undone. */
    history: next_history,
  };
}

/* ── Undo and redo ────────────────────────────────────────────────────────
 *
 * Part of the sitting, so they go wherever the sitting goes: a drill frame
 * stashes the whole session and `restored` brings it back with its history.
 * A document the store hands over (`loaded`, and `conflict_discarded`, which
 * is a load) is built from `empty_session`, which has none: there is nothing
 * to step back to in somebody else's version.
 *
 * Stepping is an edit like any other — the draft is unsaved, the last check is
 * gone, the diagnostics stop being current — with two differences.
 * `document_revision` does NOT move: it counts documents handed over, and a
 * drill step taken by position stays valid across the author's own edits.
 * `history_epoch` DOES move, so a control holding text it was typing can let
 * go of it: the document under it was replaced, not typed into.
 *
 * Bounded at the legacy canvas's own limit. Not offered while a save is in
 * flight, while a conflict waits for a choice, or while the store is
 * rewriting the stored document. */
const HISTORY_LIMIT = 50;
const NO_HISTORY = Object.freeze({ past: Object.freeze([]), future: Object.freeze([]) });

function bounded(list) {
  return list.length > HISTORY_LIMIT ? list.slice(list.length - HISTORY_LIMIT) : list;
}

function history_of(session) {
  const history = session && session.history;
  return history && Array.isArray(history.past) && Array.isArray(history.future)
    ? history
    : NO_HISTORY;
}

function can_step(session) {
  return Boolean(
    session &&
      session.status === SESSION_STATUS.READY &&
      session.document &&
      !session.saving &&
      !session.converting &&
      !session.conflict,
  );
}

export function can_undo(session) {
  return can_step(session) && history_of(session).past.length > 0;
}

export function can_redo(session) {
  return can_step(session) && history_of(session).future.length > 0;
}

function stepped(session, document, history) {
  return {
    ...session,
    version: next_version(session),
    document,
    dirty: true,
    preflight: null,
    history,
    history_epoch: ((session && session.history_epoch) || 0) + 1,
  };
}

export function undone(session) {
  if (!can_undo(session)) return session;
  const { past, future } = history_of(session);
  return stepped(session, past[past.length - 1], {
    past: past.slice(0, -1),
    future: [...future, session.document],
  });
}

export function redone(session) {
  if (!can_redo(session)) return session;
  const { past, future } = history_of(session);
  return stepped(session, future[future.length - 1], {
    past: bounded([...past, session.document]),
    future: future.slice(0, -1),
  });
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
  const version = next_version(session);
  return {
    ...session,
    version,
    saving: false,
    dirty: typed_since,
    conflict: null,
    error: null,
    document: typed_since
      ? session.document
      : (data && data.document) || session.document,
    edit_token: (data && data.edit_token) || session.edit_token,
    /* The store's text for what it stored, joined to what the author has
       typed since: both are reachable — one is the stored version, the other
       is on screen. */
    sources: merged_sources(session && session.sources, data && data.managed_sources),
    /* They describe what the store now holds, which is what they always
       describe. */
    diagnostics: (data && data.diagnostics) || [],
    /* Which is the document on screen only when nothing was typed while the
       write was in flight. When something was, the echo is an answer about
       the version that was sent and the author is looking at a newer one, so
       it is no more current than the list before it — the same reason the
       echoed document itself is not applied. */
    diagnostics_version: typed_since
      ? (session && session.diagnostics_version) || 0
      : version,
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
  /* A request already made is still in flight: it did not stop existing
     because the document on screen was replaced. `loaded` rebuilds the
     session from the stored document, and this is the only place inside a
     sitting that calls it — dropping the mark here is what let the conversion
     be submitted a second time, after which the first answer settled the
     second one's flag. */
  return {
    ...loaded(session, data),
    status: SESSION_STATUS.READY,
    converting: session.converting,
  };
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
    /* Deliberately NOT renumbered. Keeping one's own version re-bases this
       document onto the other editor's token; the list that comes back with
       that token is the store's answer about THEIR document, and the one
       before it was about an earlier draft of this one. Neither describes
       what is on screen, so neither may be placed on it. */
    diagnostics_version: (session && session.diagnostics_version) || 0,
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
 * is refused while the first is in flight, so the sitting identifies it. That
 * holds only as long as nothing inside a sitting forgets the request —
 * `conflict_discarded` carries it, for the reason written there. */
function answers_conversion(session, issued) {
  return Boolean(session && session.converting) && same_open(session, issued);
}

/* The flag is settled because THIS conversion finished. The document is
   applied only if nothing has moved since — `loaded`'s own question — so an
   answer that outlived the author's typing stops the spinner and leaves their
   work alone. */
export function conversion_succeeded(session, data, issued) {
  if (!answers_conversion(session, issued)) return session;
  return {
    ...loaded(session, data, issued),
    /* A reply to a request the author made earlier, like a save's echo: it
       replaces the stored document, and it may land while they are typing
       something this document does not hold. Erasing that is how a cleared
       number became 40965. */
    document_revision: session.document_revision,
    converting: false,
  };
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
