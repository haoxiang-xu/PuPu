import {
  SESSION_STATUS,
  can_convert_legacy_pools,
  can_preflight,
  can_save,
  conflict_discarded,
  conflict_message,
  conflict_overridden,
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

  test("a save that echoes the stored document is a replacement", () => {
    /* The page says Saved afterwards, and a page that says Saved may not be
       showing text the store does not hold. */
    const session = edited(base(), doc("mine"));
    const issued = session_token(session);
    const saved = save_succeeded(
      session,
      result({ document: doc("mine"), edit_token: "edit-2" }),
      issued,
    );
    expect(saved.document_revision).toBeGreaterThan(session.document_revision);
  });

  test("a save that leaves newer work alone replaces nothing", () => {
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
