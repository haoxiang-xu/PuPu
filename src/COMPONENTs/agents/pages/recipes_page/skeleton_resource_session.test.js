import {
  SESSION_STATUS,
  can_convert_legacy_pools,
  can_preflight,
  can_save,
  conflict_discarded,
  conflict_message,
  conflict_overridden,
  conversion_started,
  conversion_succeeded,
  diagnostics_are_current,
  edited,
  empty_session,
  is_edit_conflict,
  load_failed,
  loaded,
  loading,
  preflight_message,
  preflight_is_current,
  preflight_passed,
  preflight_refused,
  preflight_token,
  restored,
  same_open,
  save_refused,
  save_started,
  save_succeeded,
  session_token,
} from "./skeleton_resource_session";
import {
  EDIT_CONFLICT_ERROR,
  PREFLIGHT_REFUSED_ERROR,
  RESOURCE_RESULT_KEYS,
} from "./skeleton_resource_capture";

/* The store results below carry the captured key set, so the session is driven
 * by the shape the real store returns rather than a convenient subset. */
const result = (overrides) => {
  const base = {};
  RESOURCE_RESULT_KEYS.forEach((key) => {
    base[key] = key === "diagnostics" ? [] : null;
  });
  return { ...base, id: "life", kind: "workflow", name: "life", ...overrides };
};

const doc = (name) => ({
  schema_version: 1,
  kind: "workflow",
  id: "life",
  name: "life",
  nodes: [{ id: "start", type: "start", config: { execution: { outputs: [] } } }],
  edges: [],
  description: name,
});

const open_at = (token, document) =>
  loaded(loading(empty_session(), "life"), result({ document, edit_token: token }));

describe("opening a resource", () => {
  test("loading clears whatever was open before", () => {
    const stale = { ...empty_session(), document: doc("old"), dirty: true };
    expect(loading(stale, "other")).toMatchObject({
      status: SESSION_STATUS.LOADING,
      resource_id: "other",
      document: null,
      dirty: false,
    });
  });

  test("a loaded resource carries its token and its diagnostics", () => {
    const session = loaded(
      loading(empty_session(), "life"),
      result({ document: doc("a"), edit_token: "t1", diagnostics: [{ code: "x", path: [], message: "m" }] }),
    );
    expect(session).toMatchObject({
      status: SESSION_STATUS.READY,
      resource_id: "life",
      edit_token: "t1",
      dirty: false,
    });
    expect(session.diagnostics).toHaveLength(1);
  });

  test("a build that cannot reach the store says so, distinctly from a failure", () => {
    expect(load_failed(empty_session(), { reason: "unavailable", error: { code: "bridge_unavailable" } }).status)
      .toBe(SESSION_STATUS.UNAVAILABLE);
    expect(load_failed(empty_session(), { reason: "refused", error: { code: "not_found" } }).status)
      .toBe(SESSION_STATUS.LOAD_FAILED);
  });
});

describe("editing and saving at a token", () => {
  test("an edit is dirty and drops the last preflight", () => {
    /* It answered about a document that no longer exists. */
    const base = open_at("t1", doc("a"));
    const ready = preflight_passed(base, { definition_digest: "d" }, preflight_token(base));
    const after = edited(ready, doc("b"));
    expect(after.dirty).toBe(true);
    expect(after.preflight).toBeNull();
  });

  test("a save that lands takes the new token and is clean again", () => {
    const after = save_succeeded(
      save_started(edited(open_at("t1", doc("a")), doc("b"))),
      result({ document: doc("b"), edit_token: "t2" }),
    );
    expect(after).toMatchObject({ edit_token: "t2", dirty: false, saving: false, conflict: null });
  });

  test("saving is offered only for an unsaved, unconflicted, settled resource", () => {
    expect(can_save(open_at("t1", doc("a")))).toBe(false);
    const dirty = edited(open_at("t1", doc("a")), doc("b"));
    expect(can_save(dirty)).toBe(true);
    expect(can_save(save_started(dirty))).toBe(false);
    expect(can_save(save_refused(dirty, { error: EDIT_CONFLICT_ERROR }))).toBe(false);
  });
});

describe("a save refused for staleness", () => {
  const dirty = edited(open_at("t1", doc("mine")), doc("mine-edited"));
  const conflicted = save_refused(dirty, { reason: "refused", error: EDIT_CONFLICT_ERROR });

  test("the captured error really is the conflict the store raises", () => {
    expect(EDIT_CONFLICT_ERROR.code).toBe("edit_conflict");
    expect(EDIT_CONFLICT_ERROR.status).toBe(409);
    expect(EDIT_CONFLICT_ERROR.path).toEqual(["expected_edit_token"]);
    expect(is_edit_conflict({ error: EDIT_CONFLICT_ERROR })).toBe(true);
    expect(is_edit_conflict({ error: { code: "invalid_type" } })).toBe(false);
  });

  test("the user's work is kept, and the editor still shows it", () => {
    /* The store left its own copy untouched too, so nothing is lost on either
     * side while the author decides. */
    expect(conflicted.conflict.document).toEqual(doc("mine-edited"));
    expect(conflicted.document).toEqual(doc("mine-edited"));
    expect(conflicted.dirty).toBe(true);
    expect(conflicted.saving).toBe(false);
  });

  test("it is not reported as an ordinary error to retry", () => {
    /* Retrying at the same token fails the same way; retrying at the new one
     * would overwrite the other edit silently. Neither is a retry. */
    expect(conflicted.error).toBeNull();
    expect(conflict_message(conflicted)).toMatch(/nothing has been overwritten/i);
    expect(conflict_message(open_at("t1", doc("a")))).toBeNull();
  });

  test("taking theirs replaces the editor and clears the conflict", () => {
    const after = conflict_discarded(conflicted, result({ document: doc("theirs"), edit_token: "t9" }));
    expect(after).toMatchObject({ document: doc("theirs"), edit_token: "t9", dirty: false, conflict: null });
  });

  test("keeping mine re-bases onto the newer token and stays unsaved", () => {
    const after = conflict_overridden(conflicted, result({ document: doc("theirs"), edit_token: "t9" }));
    expect(after.document).toEqual(doc("mine-edited"));
    expect(after.edit_token).toBe("t9");
    expect(after.dirty).toBe(true);
    expect(after.conflict).toBeNull();
    /* And now a save is possible again — the choice was explicit. */
    expect(can_save(after)).toBe(true);
  });

  test("an ordinary refusal is an error, not a conflict", () => {
    const after = save_refused(dirty, { reason: "refused", error: { code: "invalid_type", message: "bad" } });
    expect(after.conflict).toBeNull();
    expect(after.error.code).toBe("invalid_type");
  });
});

describe("preflight is the Run gate, and reports one problem", () => {
  test("it is offered only once what is on screen has been saved", () => {
    /* Preflighting the stored version would answer about a document the author
     * is no longer looking at. */
    const ready = open_at("t1", doc("a"));
    expect(can_preflight(ready)).toBe(true);
    expect(can_preflight(edited(ready, doc("b")))).toBe(false);
  });

  test("the captured refusal is the store's first problem, with a 400", () => {
    expect(PREFLIGHT_REFUSED_ERROR.status).toBe(400);
    expect(PREFLIGHT_REFUSED_ERROR.code).toBe("end_count");
  });

  test("a refusal is worded as not ready, never as the only problem", () => {
    const base = open_at("t1", doc("a"));
    const after = preflight_refused(
      base,
      { reason: "refused", error: PREFLIGHT_REFUSED_ERROR },
      preflight_token(base),
    );
    expect(after.preflight.ok).toBe(false);
    const message = preflight_message(after);
    expect(message).toMatch(/not ready to run/i);
    expect(message).toMatch(/one end node/i);
    expect(message).not.toMatch(/\bthe (only|single) problem\b/i);
  });

  test("passing says so and carries the digest it passed on", () => {
    const base = open_at("t1", doc("a"));
    const after = preflight_passed(base, { definition_digest: "sha256:abc" }, preflight_token(base));
    expect(after.preflight).toEqual({ ok: true, definition_digest: "sha256:abc" });
    expect(preflight_message(after)).toMatch(/ready to run/i);
  });

  test("nothing is said before anything was asked", () => {
    expect(preflight_message(open_at("t1", doc("a")))).toBeNull();
  });
});

describe("an answer is a verdict only on what it was asked about", () => {
  const base = () => open_at("t1", doc("a"));

  test("the token names the resource, the save it was at, and the edit version", () => {
    const token = preflight_token(base());
    expect(token).toEqual({ resource_id: "life", edit_token: "t1", version: expect.any(Number) });
  });

  test("an edit makes an outstanding answer stale", () => {
    const started = base();
    const issued = preflight_token(started);
    const after_edit = edited(started, doc("b"));
    expect(preflight_is_current(after_edit, issued)).toBe(false);
    expect(preflight_passed(after_edit, { definition_digest: "d" }, issued).preflight).toBeNull();
  });

  test("a save makes it stale, because the token it was asked at is gone", () => {
    const dirty = edited(base(), doc("b"));
    const issued = preflight_token(dirty);
    const saved = save_succeeded(save_started(dirty), result({ document: doc("b"), edit_token: "t2" }));
    expect(preflight_is_current(saved, issued)).toBe(false);
  });

  test("the version never goes back, so reopening does not make an old answer current again", () => {
    /* Same resource, same token, freshly loaded — still a different thing to
     * have asked about. */
    const first = base();
    const issued = preflight_token(first);
    const reopened = loaded(loading(first, "life"), result({ document: doc("a"), edit_token: "t1" }));
    expect(reopened.version).toBeGreaterThan(first.version);
    expect(preflight_is_current(reopened, issued)).toBe(false);
  });

  test("nothing in flight is current against a session that never asked", () => {
    expect(preflight_is_current(base(), null)).toBe(false);
  });
});

describe("the server may have checked a different version", () => {
  /* Observed against the real store: page opens at edit-1, another window
   * saves, preflight runs against the newer document and returns edit-2. The
   * client-side guard cannot see this — nothing changed on this page while the
   * request was in flight — so the token the server reports is the only
   * evidence that the answer is about someone else's work. */
  const base = () => open_at("edit-1", doc("mine"));

  test("a pass for a newer version is not a pass for what is open", () => {
    const started = base();
    const after = preflight_passed(
      started,
      { ok: true, definition_digest: "sha256:B", edit_token: "edit-2" },
      preflight_token(started),
    );
    expect(after.preflight.ok).toBe(false);
    expect(after.preflight.stale).toBe(true);
    expect(after.preflight.checked_edit_token).toBe("edit-2");
  });

  test("it does not quietly adopt the newer token", () => {
    /* Taking it would let the next save overwrite the other window's work
     * without anyone choosing that. */
    const started = base();
    const after = preflight_passed(
      started,
      { ok: true, edit_token: "edit-2", document: doc("theirs") },
      preflight_token(started),
    );
    expect(after.edit_token).toBe("edit-1");
    expect(after.document).toEqual(doc("mine"));
    expect(after.dirty).toBe(false);
  });

  test("the message says the content moved and asks for a reload", () => {
    const started = base();
    const after = preflight_passed(
      started,
      { ok: true, edit_token: "edit-2" },
      preflight_token(started),
    );
    const message = preflight_message(after);
    expect(message).toMatch(/saved somewhere else/i);
    expect(message).toMatch(/reload/i);
    expect(message).not.toMatch(/ready to run/i);
  });

  test("a pass for the version that is open is still a pass", () => {
    const started = base();
    const after = preflight_passed(
      started,
      { ok: true, definition_digest: "sha256:A", edit_token: "edit-1" },
      preflight_token(started),
    );
    expect(after.preflight).toEqual({ ok: true, definition_digest: "sha256:A" });
    expect(preflight_message(after)).toMatch(/ready to run/i);
  });

  test("an answer carrying no token at all is taken at face value", () => {
    /* Nothing to compare against is not evidence of a mismatch. */
    const started = base();
    const after = preflight_passed(started, { ok: true }, preflight_token(started));
    expect(after.preflight.ok).toBe(true);
  });
});


describe("which document is on screen", () => {
  /* The count exists because a control holding unstored text cannot tell "the
     same value in a different document" from "the same value". Measured: a
     refused reservation typed into an Agent, a save refused for staleness,
     the other version taken — and the refused number was still in the box on
     a page that said Saved, because the stored value came back unchanged.
     What changed was which document it was, and nothing said so. */
  const base = () => open_at("edit-1", doc("one"));

  test("a load is a replacement", () => {
    const first = base();
    expect(first.document_revision).toBeGreaterThan(0);
    const second = loaded(first, result({ document: doc("one"), edit_token: "edit-1" }));
    expect(second.document_revision).not.toBe(first.document_revision);
  });

  test("reopening the same resource counts again", () => {
    const first = base();
    const reopened = loaded(
      loading(first, "life"),
      result({ document: doc("one"), edit_token: "edit-1" }),
    );
    expect(reopened.document_revision).toBeGreaterThan(first.document_revision);
  });

  test("an edit is not a replacement, however many land", () => {
    /* The author's own keystroke replaces the document object; a box that
       discarded its text then could not be typed in at all. */
    let session = base();
    const before = session.document_revision;
    session = edited(session, doc("two"));
    session = edited(session, doc("three"));
    expect(session.document_revision).toBe(before);
  });

  test("taking the other version is a replacement", () => {
    const started = save_started(edited(base(), doc("mine")));
    const refused = save_refused(started, EDIT_CONFLICT_ERROR, null);
    const taken = conflict_discarded(
      refused,
      result({ document: doc("theirs"), edit_token: "edit-2" }),
    );
    expect(taken.document_revision).toBeGreaterThan(refused.document_revision);
    expect(taken.document.description).toBe("theirs");
  });

  test("keeping your own version replaces nothing", () => {
    const started = save_started(edited(base(), doc("mine")));
    const refused = save_refused(started, EDIT_CONFLICT_ERROR, null);
    const kept = conflict_overridden(
      refused,
      result({ document: doc("theirs"), edit_token: "edit-2" }),
    );
    expect(kept.document_revision).toBe(refused.document_revision);
    expect(kept.document.description).toBe("mine");
  });

  /* This counted a save's own echo for one round, and the regression it
     caused is the reason it does not any more. Local text that was never
     stored does not call `edit`, so nothing here can see it — and the echo
     then landed in a box the author was typing in, refilled it under the
     caret, and turned their next keystroke into an append: a cleared 4096,
     the echo, then `5`, read as 40965. The reply to one's own Save is not
     permission to erase what was typed after clicking it. */
  test("a save's own echo is not a replacement", () => {
    const session = edited(base(), doc("mine"));
    const issued = session_token(session);
    const saved = save_succeeded(
      session,
      result({ document: doc("mine"), edit_token: "edit-2" }),
      issued,
    );
    expect(saved.document_revision).toBe(session.document_revision);
    expect(saved.dirty).toBe(false);
    expect(saved.document.description).toBe("mine");
  });

  test("a save that leaves newer work alone replaces nothing either", () => {
    const session = edited(base(), doc("mine"));
    const issued = session_token(session);
    const typed = edited(session, doc("newer"));
    const saved = save_succeeded(
      typed,
      result({ document: doc("mine"), edit_token: "edit-2" }),
      issued,
    );
    expect(saved.document_revision).toBe(typed.document_revision);
    expect(saved.document.description).toBe("newer");
  });

  test("a conversion's answer is not a replacement, for the same reason", () => {
    /* It is a reply to a request made earlier too, and it can land while the
       author is in the middle of a box. The document it carries is still
       adopted — only the count is withheld. */
    const session = conversion_started(base());
    const issued = session_token(session);
    const after = conversion_succeeded(
      session,
      result({ document: doc("converted"), edit_token: "edit-2" }),
      issued,
    );
    expect(after.document_revision).toBe(session.document_revision);
    expect(after.document.description).toBe("converted");
    expect(after.converting).toBe(false);
  });

  test("a refused save replaces nothing, so nothing typed is lost", () => {
    const started = save_started(edited(base(), doc("mine")));
    const refused = save_refused(started, EDIT_CONFLICT_ERROR, null);
    expect(refused.document_revision).toBe(started.document_revision);
  });

  test("it never goes backwards, so no two documents share a count", () => {
    let session = base();
    const seen = [session.document_revision];
    session = edited(session, doc("two"));
    session = loaded(session, result({ document: doc("two"), edit_token: "e2" }));
    seen.push(session.document_revision);
    session = loaded(
      loading(session, "life"),
      result({ document: doc("two"), edit_token: "e3" }),
    );
    seen.push(session.document_revision);
    expect(new Set(seen).size).toBe(seen.length);
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
  });
});

describe("a sitting put back after a drill-in", () => {
  /* Going back up restores the graph that was left rather than re-reading it:
     navigation is not a save, and re-reading would discard edits nobody asked
     to discard. The numbers must not come back with it. */
  const stashed = {
    ...empty_session(),
    version: 4,
    open_id: 2,
    document_revision: 3,
    status: SESSION_STATUS.READY,
    resource_id: "life",
    document: { id: "life", description: "unsaved" },
    edit_token: "t1",
    dirty: true,
  };

  test("the document, the token and the unsaved flag come back", () => {
    const now = { ...empty_session(), version: 9, open_id: 5, document_revision: 7 };
    const back = restored(now, stashed);
    expect(back.resource_id).toBe("life");
    expect(back.document).toBe(stashed.document);
    expect(back.edit_token).toBe("t1");
    expect(back.dirty).toBe(true);
    expect(back.status).toBe(SESSION_STATUS.READY);
  });

  test("the numbers do not: it is a new sitting", () => {
    const now = { ...empty_session(), version: 9, open_id: 5, document_revision: 7 };
    const back = restored(now, stashed);
    expect(back.version).toBe(10);
    expect(back.open_id).toBe(6);
    expect(back.document_revision).toBe(8);
    /* So the sitting it was taken from is not the sitting it came back as. */
    expect(session_token(back)).not.toEqual(session_token(stashed));
  });

  test("a save still in flight from the first visit is dropped rather than applied", () => {
    const issued = session_token(stashed);
    const back = restored({ ...empty_session(), version: 9, open_id: 5 }, stashed);
    const after = save_succeeded(back, { document: { id: "life" }, edit_token: "t2" }, issued);
    expect(after).toBe(back);
  });
});

describe("what a restored sitting may not bring back", () => {
  /* A frame is only ever taken while nothing is being written — the hook
     refuses the swap otherwise — and this is the second half of that rule,
     stated where it can be relied on: a renumbered sitting can never receive
     the answer to a request made by the one it came from, so a `saving` flag
     carried into it is one nothing can ever settle. The editor sat on a
     disabled "Saving…" for the rest of the session, with the save long since
     stored. */
  const writing = {
    ...empty_session(),
    version: 4,
    open_id: 2,
    status: SESSION_STATUS.READY,
    resource_id: "life",
    document: { id: "life" },
    edit_token: "t1",
    dirty: true,
    saving: true,
    converting: true,
  };

  test("a write that was in flight when it was stashed is not pending any more", () => {
    const back = restored({ ...empty_session(), version: 9, open_id: 5 }, writing);
    expect([back.saving, back.converting]).toEqual([false, false]);
    /* Everything the author would lose still comes back. */
    expect([back.document, back.edit_token, back.dirty]).toEqual([
      writing.document,
      "t1",
      true,
    ]);
  });

  test("and the answer to that write still cannot land on it", () => {
    const issued = session_token(writing);
    const back = restored({ ...empty_session(), version: 9, open_id: 5 }, writing);
    expect(save_succeeded(back, { document: { id: "life" }, edit_token: "t2" }, issued)).toBe(
      back,
    );
  });
});

describe("whether an answer is about the sitting that asked", () => {
  /* Asked by the hook as well as by the reducer: a read issued for a drill-in
     is adopted by replacing the session, which is not something a reducer
     clause can guard. A → B → A puts the same resource id back, so the
     question is never "is this the same resource". */
  test("the same resource opened a second time is a different sitting", () => {
    const first = loading(empty_session(), "life");
    const issued = session_token(first);
    const elsewhere = loading(loaded(first, result({ id: "life" })), "other");
    const back = loading(elsewhere, "life");
    expect(same_open(first, issued)).toBe(true);
    expect(same_open(elsewhere, issued)).toBe(false);
    expect(back.resource_id).toBe(issued.resource_id);
    expect(same_open(back, issued)).toBe(false);
  });

  test("an edit is not: the sitting is the same one, with newer work in it", () => {
    const open = loaded(loading(empty_session(), "life"), result({ id: "life" }));
    const issued = session_token(open);
    expect(same_open(edited(open, { id: "life", name: "typed" }), issued)).toBe(true);
  });

  test("nothing is about no question at all", () => {
    expect(same_open(empty_session(), null)).toBe(false);
  });
});

describe("which document the diagnostics are about", () => {
  /* Every path in a diagnostic is a position in the document that was
     checked. The editor places them by walking the document on screen, so a
     list that outlived its own document lands on whatever now occupies those
     positions — which is how a deleted pool entry's error ended up on the
     entry that survived it. The answer carries the version it describes. */

  const ONE = { code: "missing_value", path: ["document", "nodes", 1], message: "x" };
  const stored = (document, diagnostics) => ({
    id: "r1",
    kind: "agent",
    name: "R",
    document,
    edit_token: "edit-1",
    diagnostics,
  });
  const DOC = { id: "r1", name: "R", nodes: [], edges: [] };
  const OTHER = { id: "r1", name: "R", nodes: [{ id: "a1" }], edges: [] };

  const open = (diagnostics = [ONE]) =>
    loaded(loading(empty_session(), "r1"), stored(DOC, diagnostics));

  test("a load is the one place they are current by construction", () => {
    const session = open();
    expect(session.diagnostics).toEqual([ONE]);
    expect(diagnostics_are_current(session)).toBe(true);
    /* Including an empty list: "checked, nothing wrong" is a different
       statement from "not checked", and only one of them is an all-clear. */
    expect(diagnostics_are_current(open([]))).toBe(true);
  });

  test("an edit makes them not about this draft, and keeps them", () => {
    const session = edited(open(), OTHER);
    expect(diagnostics_are_current(session)).toBe(false);
    /* Kept, not dropped: they are still a true answer about the version that
       was checked. What changes is that nothing may be placed by their
       positions. */
    expect(session.diagnostics).toEqual([ONE]);
  });

  test("a save's own echo is current only if nothing was typed meanwhile", () => {
    const session = open([]);
    const issued = session_token(session);
    const saved = save_succeeded(
      save_started(session),
      stored(DOC, [ONE]),
      issued,
    );
    expect([saved.dirty, diagnostics_are_current(saved)]).toEqual([false, true]);

    /* Typing while the write is in flight: the echo answers about the
       document that was sent, and the author is looking at a newer one. The
       echoed document is already refused for that reason; its diagnostics are
       refused with it. */
    const typing = edited(save_started(session), OTHER);
    const late = save_succeeded(typing, stored(DOC, [ONE]), issued);
    expect([late.dirty, diagnostics_are_current(late)]).toEqual([true, false]);
    expect(late.document).toBe(OTHER);
  });

  test("taking the other editor's token leaves this draft unchecked", () => {
    /* Keeping one's own document re-bases it onto their token. The list that
       comes back with that token describes THEIR document; the one before it
       described an earlier draft of this one. */
    const conflicted = save_refused(
      save_started(edited(open(), OTHER)),
      { error: EDIT_CONFLICT_ERROR },
      null,
    );
    const kept = conflict_overridden(conflicted, stored(DOC, [ONE]), null);
    expect(diagnostics_are_current(kept)).toBe(false);

    /* Taking theirs instead is a load, so it is checked again. */
    const taken = conflict_discarded(conflicted, stored(DOC, []), null);
    expect(diagnostics_are_current(taken)).toBe(true);
  });

  test("a restored frame keeps the answer it was put away with", () => {
    /* Renumbering decides which replies may still reach this sitting; it is
       not a check, and it must not turn one into the other. */
    const checked = open([ONE]);
    /* Put away, then another resource opened and edited, so the numbers the
       frame comes back at are ones it never held. */
    const elsewhere = edited(loaded(loading(checked, "other"), stored(OTHER, [])), DOC);
    const back = restored(elsewhere, checked);
    expect(diagnostics_are_current(back)).toBe(true);
    expect(back.version).not.toBe(checked.version);

    const unchecked = edited(checked, OTHER);
    const back_dirty = restored(elsewhere, unchecked);
    expect(diagnostics_are_current(back_dirty)).toBe(false);
  });

  test("an empty session has nothing to be about", () => {
    expect(diagnostics_are_current(null)).toBe(false);
    expect(diagnostics_are_current(loading(empty_session(), "r1"))).toBe(false);
  });

  test("a conversion rewrites the stored document, so its answer is current", () => {
    const session = conversion_started(open([]));
    const issued = session_token(session);
    const converted = conversion_succeeded(session, stored(OTHER, [ONE]), issued);
    expect(converted.document).toBe(OTHER);
    expect(diagnostics_are_current(converted)).toBe(true);
  });
});
