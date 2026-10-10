import {
  SESSION_STATUS,
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
