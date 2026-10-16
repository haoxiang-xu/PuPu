import { renderHook, act } from "@testing-library/react";
import useSkeletonResource from "./use_skeleton_resource";
import { SESSION_STATUS } from "./skeleton_resource_session";
import {
  EDIT_CONFLICT_ERROR,
  PREFLIGHT_REFUSED_ERROR,
  RESOURCE_RESULT_KEYS,
} from "./skeleton_resource_capture";
import { api } from "../../../../SERVICEs/api";

jest.mock("../../../../SERVICEs/api", () => ({ api: { unchain: {} } }));

const result = (overrides) => {
  const base = {};
  RESOURCE_RESULT_KEYS.forEach((key) => {
    base[key] = key === "diagnostics" ? [] : null;
  });
  return { ...base, id: "life", kind: "workflow", name: "life", ...overrides };
};

const doc = (tag) => ({
  schema_version: 1,
  kind: "workflow",
  id: "life",
  name: "life",
  nodes: [],
  edges: [],
  description: tag,
});

beforeEach(() => {
  Object.keys(api.unchain).forEach((key) => delete api.unchain[key]);
});

const open = async () => {
  const hook = renderHook(() => useSkeletonResource());
  await act(async () => {
    await hook.result.current.load("life");
  });
  return hook;
};

describe("a build with no store behind it", () => {
  test("loading says unavailable rather than looking empty", async () => {
    const hook = await open();
    expect(hook.result.current.session.status).toBe(SESSION_STATUS.UNAVAILABLE);
  });

  test("saving into nothing does not pretend to have saved", async () => {
    api.unchain.getSkeletonResource = jest.fn().mockResolvedValue(result({ document: doc("a"), edit_token: "t1" }));
    const hook = await open();
    act(() => hook.result.current.edit(doc("b")));
    await act(async () => {
      await hook.result.current.save();
    });
    expect(hook.result.current.session.dirty).toBe(true);
    expect(hook.result.current.session.error.code).toBe("bridge_unavailable");
  });
});

describe("the ordinary round trip", () => {
  test("load, edit, save: the token moves and the draft is clean", async () => {
    api.unchain.getSkeletonResource = jest.fn().mockResolvedValue(result({ document: doc("a"), edit_token: "t1" }));
    api.unchain.saveSkeletonResource = jest.fn().mockResolvedValue(result({ document: doc("b"), edit_token: "t2" }));

    const hook = await open();
    expect(hook.result.current.session).toMatchObject({ status: SESSION_STATUS.READY, edit_token: "t1" });

    act(() => hook.result.current.edit(doc("b")));
    expect(hook.result.current.session.dirty).toBe(true);

    await act(async () => {
      await hook.result.current.save();
    });
    /* The save is sent at the token the edit was based on, not at whatever is
     * newest — that is the whole point of the compare-and-set. */
    expect(api.unchain.saveSkeletonResource).toHaveBeenCalledWith({
      document: doc("b"),
      expected_edit_token: "t1",
    });
    expect(hook.result.current.session).toMatchObject({ edit_token: "t2", dirty: false });
  });

  test("a second save uses the token the first one returned", async () => {
    api.unchain.getSkeletonResource = jest.fn().mockResolvedValue(result({ document: doc("a"), edit_token: "t1" }));
    api.unchain.saveSkeletonResource = jest
      .fn()
      .mockResolvedValueOnce(result({ document: doc("b"), edit_token: "t2" }))
      .mockResolvedValueOnce(result({ document: doc("c"), edit_token: "t3" }));

    const hook = await open();
    act(() => hook.result.current.edit(doc("b")));
    await act(async () => {
      await hook.result.current.save();
    });
    act(() => hook.result.current.edit(doc("c")));
    await act(async () => {
      await hook.result.current.save();
    });
    expect(api.unchain.saveSkeletonResource.mock.calls[1][0].expected_edit_token).toBe("t2");
    expect(hook.result.current.session.edit_token).toBe("t3");
  });
});

describe("someone else saved first", () => {
  const conflicted = async () => {
    api.unchain.getSkeletonResource = jest
      .fn()
      .mockResolvedValueOnce(result({ document: doc("mine"), edit_token: "t1" }))
      .mockResolvedValue(result({ document: doc("theirs"), edit_token: "t9" }));
    api.unchain.saveSkeletonResource = jest.fn().mockResolvedValue({ error: EDIT_CONFLICT_ERROR });
    const hook = await open();
    act(() => hook.result.current.edit(doc("mine-edited")));
    await act(async () => {
      await hook.result.current.save();
    });
    return hook;
  };

  test("the refusal keeps the editor on the author's own work", async () => {
    const hook = await conflicted();
    expect(hook.result.current.session.document).toEqual(doc("mine-edited"));
    expect(hook.result.current.session.conflict.error.code).toBe("edit_conflict");
    expect(hook.result.current.session.error).toBeNull();
  });

  test("nothing retries on its own", async () => {
    /* The retry that would succeed is the one that overwrites the other edit,
     * so it is never taken without being asked for. */
    const hook = await conflicted();
    expect(api.unchain.saveSkeletonResource).toHaveBeenCalledTimes(1);
  });

  test("taking theirs re-reads and shows theirs", async () => {
    const hook = await conflicted();
    await act(async () => {
      await hook.result.current.takeTheirs();
    });
    expect(hook.result.current.session).toMatchObject({
      document: doc("theirs"),
      edit_token: "t9",
      dirty: false,
      conflict: null,
    });
  });

  test("keeping mine re-bases onto their token and can then save", async () => {
    const hook = await conflicted();
    await act(async () => {
      await hook.result.current.keepMine();
    });
    expect(hook.result.current.session).toMatchObject({
      document: doc("mine-edited"),
      edit_token: "t9",
      dirty: true,
      conflict: null,
    });
    await act(async () => {
      await hook.result.current.save();
    });
    expect(api.unchain.saveSkeletonResource.mock.calls[1][0].expected_edit_token).toBe("t9");
  });
});

describe("preflight", () => {
  test("a refusal is carried as one problem", async () => {
    api.unchain.getSkeletonResource = jest.fn().mockResolvedValue(result({ document: doc("a"), edit_token: "t1" }));
    api.unchain.preflightSkeletonResource = jest.fn().mockResolvedValue({ error: PREFLIGHT_REFUSED_ERROR });
    const hook = await open();
    await act(async () => {
      await hook.result.current.preflight();
    });
    expect(hook.result.current.session.preflight).toMatchObject({
      ok: false,
      error: { code: "end_count" },
    });
  });

  test("passing carries the digest it passed on", async () => {
    api.unchain.getSkeletonResource = jest.fn().mockResolvedValue(result({ document: doc("a"), edit_token: "t1" }));
    api.unchain.preflightSkeletonResource = jest
      .fn()
      .mockResolvedValue({ ok: true, definition_digest: "sha256:abc" });
    const hook = await open();
    await act(async () => {
      await hook.result.current.preflight();
    });
    expect(hook.result.current.session.preflight).toEqual({ ok: true, definition_digest: "sha256:abc" });
  });
});

describe("a preflight reply that arrives late", () => {
  /* Checked version A, then edited to a dirty B, then A's answer lands. The
   * answer describes a document that is no longer on screen, so it must not
   * become B's verdict — the author would read "Ready to run" about work the
   * store has never seen. A disabled button does not prevent this: the request
   * was legitimate when it was made. */
  const open_with = async (preflightImpl) => {
    api.unchain.getSkeletonResource = jest
      .fn()
      .mockResolvedValue(result({ document: doc("A"), edit_token: "t1" }));
    api.unchain.preflightSkeletonResource = jest.fn().mockImplementation(preflightImpl);
    return open();
  };

  test("an answer for the version that was checked does not label the one on screen", async () => {
    let release;
    const hook = await open_with(
      () => new Promise((resolve) => { release = () => resolve({ ok: true, definition_digest: "sha256:A" }); }),
    );

    let pending;
    act(() => {
      pending = hook.result.current.preflight();
    });
    /* The author keeps working while it is in flight. */
    act(() => hook.result.current.edit(doc("B")));
    expect(hook.result.current.session.dirty).toBe(true);

    await act(async () => {
      release();
      await pending;
    });

    expect(hook.result.current.session.preflight).toBeNull();
    expect(hook.result.current.session.document).toEqual(doc("B"));
  });

  test("a late refusal is discarded too, not pinned on the new draft", async () => {
    let release;
    const hook = await open_with(
      () => new Promise((resolve) => { release = () => resolve({ error: PREFLIGHT_REFUSED_ERROR }); }),
    );
    let pending;
    act(() => {
      pending = hook.result.current.preflight();
    });
    act(() => hook.result.current.edit(doc("B")));
    await act(async () => {
      release();
      await pending;
    });
    expect(hook.result.current.session.preflight).toBeNull();
  });

  test("an answer that arrives while nothing changed is kept", async () => {
    const hook = await open_with(async () => ({ ok: true, definition_digest: "sha256:A" }));
    await act(async () => {
      await hook.result.current.preflight();
    });
    expect(hook.result.current.session.preflight).toEqual({
      ok: true,
      definition_digest: "sha256:A",
    });
  });

  test("an answer for a resource the author has left is discarded", async () => {
    let release;
    const hook = await open_with(
      () => new Promise((resolve) => { release = () => resolve({ ok: true, definition_digest: "sha256:A" }); }),
    );
    let pending;
    act(() => {
      pending = hook.result.current.preflight();
    });
    api.unchain.getSkeletonResource = jest
      .fn()
      .mockResolvedValue(result({ id: "other", document: doc("Z"), edit_token: "z1" }));
    await act(async () => {
      await hook.result.current.load("other");
    });
    await act(async () => {
      release();
      await pending;
    });
    expect(hook.result.current.session.preflight).toBeNull();
    expect(hook.result.current.session.resource_id).toBe("other");
  });

  test("the session refuses to start one on a dirty draft at all", async () => {
    /* The limit belongs in the session, not only on the button: anything else
     * that calls preflight would otherwise ask about the stored version while
     * the author looks at an edited one. */
    const hook = await open_with(async () => ({ ok: true, definition_digest: "sha256:A" }));
    act(() => hook.result.current.edit(doc("B")));
    await act(async () => {
      await hook.result.current.preflight();
    });
    expect(api.unchain.preflightSkeletonResource).not.toHaveBeenCalled();
    expect(hook.result.current.session.preflight).toBeNull();
  });
});

describe("a save that lands after the author kept typing", () => {
  /* The save stored the document it was handed. Anything added while it was in
   * flight was never sent, so replacing the editor with the echoed document
   * deletes it — and calling the result "Saved" says the opposite of what
   * happened. */
  const open_and_save = async () => {
    let release;
    api.unchain.getSkeletonResource = jest
      .fn()
      .mockResolvedValue(result({ document: doc("A"), edit_token: "t1" }));
    api.unchain.saveSkeletonResource = jest.fn().mockImplementation(
      () => new Promise((resolve) => {
        release = () => resolve(result({ document: doc("B"), edit_token: "t2" }));
      }),
    );
    const hook = await open();
    act(() => hook.result.current.edit(doc("B")));
    let pending;
    act(() => {
      pending = hook.result.current.save();
    });
    /* Still typing while it is in flight. */
    act(() => hook.result.current.edit(doc("C")));
    await act(async () => {
      release();
      await pending;
    });
    return hook;
  };

  test("the newer edit is still there", async () => {
    const hook = await open_and_save();
    expect(hook.result.current.session.document).toEqual(doc("C"));
  });

  test("it does not claim to be saved", async () => {
    const hook = await open_and_save();
    expect(hook.result.current.session.dirty).toBe(true);
    expect(hook.result.current.session.saving).toBe(false);
  });

  test("the token still moves, because the save really happened", async () => {
    /* The next save must compare against what the store now holds, or it
     * would be refused as stale for no reason. */
    const hook = await open_and_save();
    expect(hook.result.current.session.edit_token).toBe("t2");
  });

  test("a save with nothing typed after it is clean, as before", async () => {
    api.unchain.getSkeletonResource = jest
      .fn()
      .mockResolvedValue(result({ document: doc("A"), edit_token: "t1" }));
    api.unchain.saveSkeletonResource = jest
      .fn()
      .mockResolvedValue(result({ document: doc("B"), edit_token: "t2" }));
    const hook = await open();
    act(() => hook.result.current.edit(doc("B")));
    await act(async () => {
      await hook.result.current.save();
    });
    expect(hook.result.current.session).toMatchObject({ dirty: false, edit_token: "t2" });
  });
});

describe("a reply that arrives after the author moved to another resource", () => {
  /* The session now belongs to B. Applying A's answer gives B's identity with
   * A's document and A's token — and the next save would write A's content
   * over B at a token that is not B's. */
  test("a load for the resource that was left is discarded", async () => {
    let release;
    api.unchain.getSkeletonResource = jest
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => {
        release = () => resolve(result({ id: "A", document: doc("A"), edit_token: "ta" }));
      }))
      .mockResolvedValue(result({ id: "B", document: doc("B"), edit_token: "tb" }));

    const hook = renderHook(() => useSkeletonResource());
    let first;
    act(() => {
      first = hook.result.current.load("A");
    });
    await act(async () => {
      await hook.result.current.load("B");
    });
    await act(async () => {
      release();
      await first;
    });

    expect(hook.result.current.session.resource_id).toBe("B");
    expect(hook.result.current.session.document).toEqual(doc("B"));
    expect(hook.result.current.session.edit_token).toBe("tb");
  });

  test("a save for the resource that was left cannot touch the new one", async () => {
    let release;
    api.unchain.getSkeletonResource = jest
      .fn()
      .mockResolvedValueOnce(result({ id: "A", document: doc("A"), edit_token: "ta" }))
      .mockResolvedValue(result({ id: "B", document: doc("B"), edit_token: "tb" }));
    api.unchain.saveSkeletonResource = jest.fn().mockImplementation(
      () => new Promise((resolve) => {
        release = () => resolve(result({ id: "A", document: doc("A2"), edit_token: "ta2" }));
      }),
    );

    const hook = renderHook(() => useSkeletonResource());
    await act(async () => {
      await hook.result.current.load("A");
    });
    act(() => hook.result.current.edit(doc("A2")));
    let pending;
    act(() => {
      pending = hook.result.current.save();
    });
    await act(async () => {
      await hook.result.current.load("B");
    });
    await act(async () => {
      release();
      await pending;
    });

    expect(hook.result.current.session.resource_id).toBe("B");
    expect(hook.result.current.session.edit_token).toBe("tb");
    expect(hook.result.current.session.document).toEqual(doc("B"));
    expect(hook.result.current.session.saving).toBe(false);
  });

  test("a refusal for the resource that was left does not land on the new one", async () => {
    let release;
    api.unchain.getSkeletonResource = jest
      .fn()
      .mockResolvedValueOnce(result({ id: "A", document: doc("A"), edit_token: "ta" }))
      .mockResolvedValue(result({ id: "B", document: doc("B"), edit_token: "tb" }));
    api.unchain.saveSkeletonResource = jest.fn().mockImplementation(
      () => new Promise((resolve) => {
        release = () => resolve({ error: EDIT_CONFLICT_ERROR });
      }),
    );

    const hook = renderHook(() => useSkeletonResource());
    await act(async () => {
      await hook.result.current.load("A");
    });
    act(() => hook.result.current.edit(doc("A2")));
    let pending;
    act(() => {
      pending = hook.result.current.save();
    });
    await act(async () => {
      await hook.result.current.load("B");
    });
    await act(async () => {
      release();
      await pending;
    });

    expect(hook.result.current.session.conflict).toBeNull();
    expect(hook.result.current.session.resource_id).toBe("B");
  });
});

describe("a conflict choice that lands after the author moved on", () => {
  /* Resolving a conflict re-reads the resource. That read is an answer about
   * A, and by the time it arrives the author may be editing B — applying it
   * then replaces B's document with A's and calls it saved. */
  const conflicted_then_left = async (choice) => {
    let release;
    api.unchain.getSkeletonResource = jest
      .fn()
      .mockResolvedValueOnce(result({ id: "A", document: doc("A"), edit_token: "ta" }))
      .mockImplementationOnce(() => new Promise((resolve) => {
        release = () => resolve(result({ id: "A", document: doc("A-theirs"), edit_token: "ta9" }));
      }))
      .mockResolvedValue(result({ id: "B", document: doc("B"), edit_token: "tb" }));
    api.unchain.saveSkeletonResource = jest.fn().mockResolvedValue({ error: EDIT_CONFLICT_ERROR });

    const hook = renderHook(() => useSkeletonResource());
    await act(async () => {
      await hook.result.current.load("A");
    });
    act(() => hook.result.current.edit(doc("A-mine")));
    await act(async () => {
      await hook.result.current.save();
    });
    expect(hook.result.current.session.conflict).not.toBeNull();

    let pending;
    act(() => {
      pending = choice === "mine" ? hook.result.current.keepMine() : hook.result.current.takeTheirs();
    });
    /* Off to another Agent, and typing in it. */
    await act(async () => {
      await hook.result.current.load("B");
    });
    act(() => hook.result.current.edit(doc("B-edited")));
    await act(async () => {
      release();
      await pending;
    });
    return hook;
  };

  test("taking theirs cannot replace the Agent now open", async () => {
    const hook = await conflicted_then_left("theirs");
    expect(hook.result.current.session.resource_id).toBe("B");
    expect(hook.result.current.session.document).toEqual(doc("B-edited"));
    expect(hook.result.current.session.edit_token).toBe("tb");
  });

  test("and it cannot claim the new draft is saved", async () => {
    const hook = await conflicted_then_left("theirs");
    expect(hook.result.current.session.dirty).toBe(true);
  });

  test("keeping mine cannot re-base the Agent now open onto another's token", async () => {
    const hook = await conflicted_then_left("mine");
    expect(hook.result.current.session.resource_id).toBe("B");
    expect(hook.result.current.session.edit_token).toBe("tb");
    expect(hook.result.current.session.document).toEqual(doc("B-edited"));
  });
});

describe("reopening the same Agent is a different sitting", () => {
  /* A → B → A. The resource id is the same again, so an answer still in
   * flight from the first visit passes a check that only compares ids, and it
   * can roll the token back or raise a conflict that never happened. */
  const reopened = async (makeSave) => {
    let release;
    api.unchain.getSkeletonResource = jest
      .fn()
      .mockImplementation(async (id) =>
        id === "B"
          ? result({ id: "B", document: doc("B"), edit_token: "tb" })
          : result({ id: "A", document: doc("A"), edit_token: "ta2" }),
      );
    api.unchain.saveSkeletonResource = jest.fn().mockImplementation(
      () => new Promise((resolve) => { release = () => resolve(makeSave()); }),
    );

    const hook = renderHook(() => useSkeletonResource());
    await act(async () => {
      await hook.result.current.load("A");
    });
    act(() => hook.result.current.edit(doc("A-edited")));
    let pending;
    act(() => {
      pending = hook.result.current.save();
    });
    await act(async () => {
      await hook.result.current.load("B");
    });
    await act(async () => {
      await hook.result.current.load("A");
    });
    await act(async () => {
      release();
      await pending;
    });
    return hook;
  };

  test("an old save cannot roll the token back", async () => {
    const hook = await reopened(() => result({ id: "A", document: doc("A-old"), edit_token: "ta1" }));
    expect(hook.result.current.session.edit_token).toBe("ta2");
    expect(hook.result.current.session.document).toEqual(doc("A"));
  });

  test("an old refusal cannot raise a conflict that is not happening", async () => {
    const hook = await reopened(() => ({ error: EDIT_CONFLICT_ERROR }));
    expect(hook.result.current.session.conflict).toBeNull();
  });
});

describe("still typing after choosing to take theirs", () => {
  /* Same Agent, same sitting, so the open-session check passes. The choice was
   * made about a document that has since changed: applying it deletes what was
   * typed after it, and calls the result saved. Typing after choosing is newer
   * intent than the choice. */
  const choose_then_type = async () => {
    let release;
    api.unchain.getSkeletonResource = jest
      .fn()
      .mockResolvedValueOnce(result({ document: doc("mine"), edit_token: "t1" }))
      .mockImplementationOnce(() => new Promise((resolve) => {
        release = () => resolve(result({ document: doc("theirs"), edit_token: "t9" }));
      }));
    api.unchain.saveSkeletonResource = jest.fn().mockResolvedValue({ error: EDIT_CONFLICT_ERROR });

    const hook = await open();
    act(() => hook.result.current.edit(doc("mine-edited")));
    await act(async () => {
      await hook.result.current.save();
    });
    expect(hook.result.current.session.conflict).not.toBeNull();

    let pending;
    act(() => {
      pending = hook.result.current.takeTheirs();
    });
    /* Keeps working while the re-read is in flight. */
    act(() => hook.result.current.edit(doc("mine-plus-more")));
    await act(async () => {
      release();
      await pending;
    });
    return hook;
  };

  test("what was typed after the choice is not deleted", async () => {
    const hook = await choose_then_type();
    expect(hook.result.current.session.document).toEqual(doc("mine-plus-more"));
  });

  test("it is not called saved", async () => {
    const hook = await choose_then_type();
    expect(hook.result.current.session.dirty).toBe(true);
  });

  test("the conflict stays, so the author can choose again", async () => {
    /* Silently doing nothing would look like a broken button. */
    const hook = await choose_then_type();
    expect(hook.result.current.session.conflict).not.toBeNull();
    expect(hook.result.current.session.conflict.stale_choice).toBe(true);
  });

  test("the token is not taken either", async () => {
    const hook = await choose_then_type();
    expect(hook.result.current.session.edit_token).toBe("t1");
  });

  test("taking theirs with nothing typed after still works", async () => {
    api.unchain.getSkeletonResource = jest
      .fn()
      .mockResolvedValueOnce(result({ document: doc("mine"), edit_token: "t1" }))
      .mockResolvedValue(result({ document: doc("theirs"), edit_token: "t9" }));
    api.unchain.saveSkeletonResource = jest.fn().mockResolvedValue({ error: EDIT_CONFLICT_ERROR });
    const hook = await open();
    act(() => hook.result.current.edit(doc("mine-edited")));
    await act(async () => {
      await hook.result.current.save();
    });
    await act(async () => {
      await hook.result.current.takeTheirs();
    });
    expect(hook.result.current.session).toMatchObject({
      document: doc("theirs"),
      edit_token: "t9",
      dirty: false,
      conflict: null,
    });
  });

  test("keeping mine after typing more keeps the newer document", async () => {
    /* The opposite choice does not have this problem: the newer typing is the
     * same intent as keeping it. */
    let release;
    api.unchain.getSkeletonResource = jest
      .fn()
      .mockResolvedValueOnce(result({ document: doc("mine"), edit_token: "t1" }))
      .mockImplementationOnce(() => new Promise((resolve) => {
        release = () => resolve(result({ document: doc("theirs"), edit_token: "t9" }));
      }));
    api.unchain.saveSkeletonResource = jest.fn().mockResolvedValue({ error: EDIT_CONFLICT_ERROR });
    const hook = await open();
    act(() => hook.result.current.edit(doc("mine-edited")));
    await act(async () => {
      await hook.result.current.save();
    });
    let pending;
    act(() => {
      pending = hook.result.current.keepMine();
    });
    act(() => hook.result.current.edit(doc("mine-plus-more")));
    await act(async () => {
      release();
      await pending;
    });
    expect(hook.result.current.session.document).toEqual(doc("mine-plus-more"));
    expect(hook.result.current.session.edit_token).toBe("t9");
    expect(hook.result.current.session.conflict).toBeNull();
  });
});

describe("converting a legacy Subagent Pool", () => {
  /* The store performs it and saves it, so what comes back is the stored
     version at a new token — and the session has to take it as exactly that,
     with nothing of the author's left waiting to be written. */
  const legacy_document = {
    schema_version: 1,
    kind: "agent",
    id: "life",
    name: "life",
    nodes: [{ id: "pool", type: "subagent_pool", config: { legacy_fields: { subagents: [] } } }],
    edges: [],
  };

  test("the stored resource comes back as loaded, at the new token", async () => {
    api.unchain.getSkeletonResource = jest.fn(async () =>
      result({ document: legacy_document, edit_token: "edit-1" }),
    );
    const hook = await open();
    api.unchain.convertSkeletonLegacyPools = jest.fn(async () =>
      result({
        document: { ...legacy_document, nodes: [{ id: "pool", type: "subagent_pool", config: { subagents: [] } }] },
        edit_token: "edit-2",
      }),
    );
    await act(async () => {
      await hook.result.current.convertLegacyPools();
    });
    expect(api.unchain.convertSkeletonLegacyPools).toHaveBeenCalledWith(
      "life", "edit-1", null,
    );
    expect(hook.result.current.session.edit_token).toBe("edit-2");
    expect(hook.result.current.session.dirty).toBe(false);
    expect(hook.result.current.session.document.nodes[0].config).toEqual({ subagents: [] });
  });

  test("a dirty draft is not converted, because the write is against the stored one", async () => {
    /* The conversion rewrites what the store holds and bumps the token. Doing
       that under unsaved work would leave the author unable to save it. */
    api.unchain.getSkeletonResource = jest.fn(async () =>
      result({ document: legacy_document, edit_token: "edit-1" }),
    );
    const hook = await open();
    act(() => {
      hook.result.current.edit({ ...legacy_document, description: "typed" });
    });
    api.unchain.convertSkeletonLegacyPools = jest.fn();
    await act(async () => {
      await hook.result.current.convertLegacyPools();
    });
    expect(api.unchain.convertSkeletonLegacyPools).not.toHaveBeenCalled();
    expect(hook.result.current.session.dirty).toBe(true);
  });

  test("a token that went stale raises the same conflict a save would", async () => {
    api.unchain.getSkeletonResource = jest.fn(async () =>
      result({ document: legacy_document, edit_token: "edit-1" }),
    );
    const hook = await open();
    api.unchain.convertSkeletonLegacyPools = jest.fn(async () => {
      throw Object.assign(new Error("resource changed in another editor"), {
        code: "edit_conflict",
        path: ["expected_edit_token"],
        status: 409,
      });
    });
    await act(async () => {
      await hook.result.current.convertLegacyPools();
    });
    expect(hook.result.current.session.conflict).toBeTruthy();
  });

  test("a build that cannot reach the store leaves the session alone", async () => {
    api.unchain.getSkeletonResource = jest.fn(async () =>
      result({ document: legacy_document, edit_token: "edit-1" }),
    );
    const hook = await open();
    const before = hook.result.current.session.document;
    await act(async () => {
      await hook.result.current.convertLegacyPools();
    });
    expect(hook.result.current.session.document).toBe(before);
    expect(hook.result.current.session.error).toBeTruthy();
  });
});

describe("a conversion that is already in flight", () => {
  /* It writes the stored resource and moves its token on, so a second request
     is answered about a version that no longer exists — and the first one's
     success then arrives as an edit conflict that never happened. */
  const legacy_document = {
    schema_version: 1,
    kind: "agent",
    id: "life",
    name: "life",
    nodes: [{ id: "pool", type: "subagent_pool", config: { legacy_fields: { subagents: [] } } }],
    edges: [],
  };

  const opened = async () => {
    api.unchain.getSkeletonResource = jest.fn(async () =>
      result({ document: legacy_document, edit_token: "edit-1" }),
    );
    return open();
  };

  test("is not started a second time", async () => {
    let settle = null;
    api.unchain.convertSkeletonLegacyPools = jest.fn(
      () => new Promise((resolve) => {
        settle = () => resolve(result({ document: legacy_document, edit_token: "edit-2" }));
      }),
    );
    const hook = await opened();
    let first = null;
    act(() => {
      first = hook.result.current.convertLegacyPools();
    });
    expect(hook.result.current.session.converting).toBe(true);
    await act(async () => {
      await hook.result.current.convertLegacyPools();
    });
    expect(api.unchain.convertSkeletonLegacyPools).toHaveBeenCalledTimes(1);
    await act(async () => {
      settle();
      await first;
    });
    expect(hook.result.current.session.converting).toBe(false);
    expect(hook.result.current.session.edit_token).toBe("edit-2");
  });

  test("a refusal that outlived its question raises no conflict", async () => {
    /* The author typed while it was in flight. The answer is about the
       version that was asked about, not this one, so it settles the flag and
       says nothing else — a phantom conflict would send them to a resolution
       screen for an edit nobody made. */
    let fail = null;
    api.unchain.convertSkeletonLegacyPools = jest.fn(
      () => new Promise((_, reject) => {
        fail = () => reject(Object.assign(new Error("resource changed in another editor"), {
          code: "edit_conflict", path: ["expected_edit_token"], status: 409,
        }));
      }),
    );
    const hook = await opened();
    let pending = null;
    act(() => {
      pending = hook.result.current.convertLegacyPools();
    });
    act(() => {
      hook.result.current.edit({ ...legacy_document, description: "typed" });
    });
    await act(async () => {
      fail();
      await pending;
    });
    expect(hook.result.current.session.conflict).toBeFalsy();
    expect(hook.result.current.session.converting).toBe(false);
    expect(hook.result.current.session.dirty).toBe(true);
  });
});

describe("a conversion answer belongs to one sitting", () => {
  /* Settling the flag and applying the document are two decisions, and last
     round I made them one: the answer cleared `converting` whatever it was an
     answer to. So a reply still in flight from the resource the author left
     cleared the flag on the one they are converting now, and that one could
     be submitted again before it finished. */
  const legacy_document = (id) => ({
    schema_version: 1,
    kind: "agent",
    id,
    name: id,
    nodes: [{ id: "pool", type: "subagent_pool", config: { legacy_fields: { subagents: [] } } }],
    edges: [],
  });

  const open_both = async () => {
    api.unchain.getSkeletonResource = jest.fn(async (resource_id) =>
      result({ id: resource_id, document: legacy_document(resource_id), edit_token: `${resource_id}-1` }),
    );
    const hook = renderHook(() => useSkeletonResource());
    await act(async () => {
      await hook.result.current.load("first");
    });
    return hook;
  };

  /* Every request held open and settled by hand, in call order — two of them
     can be for the same resource, so the resource id is not a key. */
  const pending_conversions = () => {
    const settle = [];
    api.unchain.convertSkeletonLegacyPools = jest.fn(
      (resource_id) =>
        new Promise((resolve, reject) => {
          settle.push({
            resource_id,
            ok: () =>
              resolve(
                result({
                  id: resource_id,
                  document: { ...legacy_document(resource_id), description: "converted" },
                  edit_token: `${resource_id}-2`,
                }),
              ),
            fail: () =>
              reject(
                Object.assign(new Error("resource changed in another editor"), {
                  code: "edit_conflict",
                  path: ["expected_edit_token"],
                  status: 409,
                }),
              ),
          });
        }),
    );
    return settle;
  };

  const start_both = async (hook) => {
    const settle = pending_conversions();
    let first = null;
    act(() => {
      first = hook.result.current.convertLegacyPools();
    });
    await act(async () => {
      await hook.result.current.load("second");
    });
    let second = null;
    act(() => {
      second = hook.result.current.convertLegacyPools();
    });
    expect(hook.result.current.session.resource_id).toBe("second");
    expect(hook.result.current.session.converting).toBe(true);
    return { settle, first, second };
  };

  test("a late success from the resource left behind clears nothing here", async () => {
    const hook = await open_both();
    const { settle, first } = await start_both(hook);
    await act(async () => {
      settle[0].ok();
      await first;
    });
    expect(hook.result.current.session.resource_id).toBe("second");
    expect(hook.result.current.session.converting).toBe(true);
    expect(hook.result.current.session.document.description).toBeUndefined();
  });

  test("and neither does a late refusal", async () => {
    const hook = await open_both();
    const { settle, first } = await start_both(hook);
    await act(async () => {
      settle[0].fail();
      await first.catch(() => {});
    });
    expect(hook.result.current.session.converting).toBe(true);
    expect(hook.result.current.session.conflict).toBeFalsy();
  });

  test("the one that belongs here still settles it", async () => {
    const hook = await open_both();
    const { settle, second } = await start_both(hook);
    await act(async () => {
      settle[1].ok();
      await second;
    });
    expect(hook.result.current.session.converting).toBe(false);
    expect(hook.result.current.session.edit_token).toBe("second-2");
    expect(hook.result.current.session.document.description).toBe("converted");
  });

  test("the same resource opened again is a different sitting", async () => {
    /* `A → B → A` puts the same id back, which is why a sitting has its own
       identity: an answer from the first visit must not settle the second. */
    const hook = await open_both();
    const settle = pending_conversions();
    let first = null;
    act(() => {
      first = hook.result.current.convertLegacyPools();
    });
    await act(async () => {
      await hook.result.current.load("first");
    });
    let again = null;
    act(() => {
      again = hook.result.current.convertLegacyPools();
    });
    expect(hook.result.current.session.converting).toBe(true);

    /* The first visit's answer arrives. Same resource id, different sitting. */
    await act(async () => {
      settle[0].ok();
      await first;
    });
    expect(hook.result.current.session.converting).toBe(true);
    expect(hook.result.current.session.document.description).toBeUndefined();

    /* This sitting's own answer settles it. */
    await act(async () => {
      settle[1].ok();
      await again;
    });
    expect(hook.result.current.session.converting).toBe(false);
    expect(hook.result.current.session.document.description).toBe("converted");
  });
});

describe("a conflict resolved while a conversion is in flight", () => {
  /* The sitting identifies the pending conversion because there can only be
     one — a second is refused while the first is in flight. Taking the other
     version is the one thing in a sitting that rebuilds the session from the
     stored document, and it was dropping that mark: the request did not stop
     existing because the document on screen was replaced. With the mark gone
     the conversion could be submitted again, and the first answer then
     settled the second one's flag. */
  const legacy_document = (tag) => ({
    schema_version: 1,
    kind: "agent",
    id: "life",
    name: "life",
    nodes: [{ id: "pool", type: "subagent_pool", config: { legacy_fields: { subagents: [] } } }],
    edges: [],
    description: tag,
  });

  /* Held open and settled by hand, in call order. */
  const pending_conversions = () => {
    const settle = [];
    api.unchain.convertSkeletonLegacyPools = jest.fn(
      () =>
        new Promise((resolve, reject) => {
          settle.push({
            ok: () =>
              resolve(
                result({
                  document: legacy_document("converted"),
                  edit_token: "edit-2",
                }),
              ),
            fail: () =>
              reject(
                Object.assign(new Error("resource changed in another editor"), {
                  code: "edit_conflict",
                  path: ["expected_edit_token"],
                  status: 409,
                }),
              ),
          });
        }),
    );
    return settle;
  };

  /* Convert, type, save into someone else's newer version, take theirs. */
  const took_theirs_mid_conversion = async () => {
    api.unchain.getSkeletonResource = jest
      .fn()
      .mockResolvedValueOnce(result({ document: legacy_document("mine"), edit_token: "edit-1" }))
      .mockResolvedValue(result({ document: legacy_document("theirs"), edit_token: "edit-9" }));
    api.unchain.saveSkeletonResource = jest
      .fn()
      .mockResolvedValue({ error: EDIT_CONFLICT_ERROR });
    const hook = await open();
    const settle = pending_conversions();
    let pending = null;
    act(() => {
      pending = hook.result.current.convertLegacyPools();
    });
    act(() => hook.result.current.edit(legacy_document("typed")));
    await act(async () => {
      await hook.result.current.save();
    });
    expect(hook.result.current.session.conflict).toBeTruthy();
    await act(async () => {
      await hook.result.current.takeTheirs();
    });
    expect(hook.result.current.session.document).toEqual(legacy_document("theirs"));
    return { hook, settle, pending };
  };

  test("the reload keeps the request still in flight marked", async () => {
    const { hook, settle, pending } = await took_theirs_mid_conversion();
    expect(hook.result.current.session.converting).toBe(true);
    await act(async () => {
      settle[0].ok();
      await pending;
    });
  });

  test("so it cannot be submitted a second time", async () => {
    const { hook, settle, pending } = await took_theirs_mid_conversion();
    /* Not awaited: the second request would be held open like the first, and
       waiting for it would report this as a timeout instead of as the extra
       submission it is. The store is called before the first await, so the
       count is already final here. */
    act(() => {
      hook.result.current.convertLegacyPools();
    });
    expect(api.unchain.convertSkeletonLegacyPools).toHaveBeenCalledTimes(1);
    await act(async () => {
      settle[0].ok();
      await pending;
    });
  });

  test("its own answer still settles it, and leaves the chosen version alone", async () => {
    /* The mark has to be settleable by the answer it belongs to, or the
       author is left unable to Run or Publish for the rest of the sitting.
       The document is not applied: they chose this version after the request
       was made. */
    const { hook, settle, pending } = await took_theirs_mid_conversion();
    await act(async () => {
      settle[0].ok();
      await pending;
    });
    expect(hook.result.current.session.converting).toBe(false);
    expect(hook.result.current.session.document).toEqual(legacy_document("theirs"));
    expect(hook.result.current.session.edit_token).toBe("edit-9");
  });

  test("and so does a refusal, without a second conflict screen", async () => {
    const { hook, settle, pending } = await took_theirs_mid_conversion();
    await act(async () => {
      settle[0].fail();
      await pending.catch(() => {});
    });
    expect(hook.result.current.session.converting).toBe(false);
    expect(hook.result.current.session.conflict).toBeFalsy();
  });
});

describe("the Kernel the store is handed for legacy data", () => {
  /* Both calls that touch legacy data refuse to act without a Kernel
     configuration the caller chose, and nothing was supplying one. What goes
     over is the Kernel the author configured on this Agent's Agent node; the
     rules are measured in `legacy_conversion` and its capture, and what is
     asserted here is only that each call is given it. */
  const KERNEL = {
    schema_version: 1,
    profile: {
      id: "openai:gpt-4.1",
      provider: "openai",
      model: "gpt-4.1",
      protocol: "openai-responses",
      endpoint: "https://api.openai.com/v1",
      credential_ref: "openai",
      context_window: 128000,
      output_limit: 4096,
      capabilities: { json_schema: true, images: true, files: true },
    },
    prompt: "You are the parent.",
    max_iterations: 6,
    output_tokens: 2048,
    history: "root",
    overflow: "error",
    json_schema: { type: "object", properties: { a: { type: "string" } }, required: ["a"], additionalProperties: false },
  };

  const INLINE = {
    kind: "inline",
    name: "Shortener",
    prompt_format: "skeleton",
    template: { prompt: "Be brief." },
  };

  const agent_document = (agent_config, pool_entries) => ({
    schema_version: 1,
    kind: "agent",
    id: "life",
    name: "life",
    nodes: [
      { id: "k", type: "agent", config: agent_config },
      ...(pool_entries
        ? [{ id: "pool", type: "subagent_pool", config: { legacy_fields: { subagents: pool_entries } } }]
        : []),
    ],
    edges: [],
  });

  const opened = async (document) => {
    api.unchain.getSkeletonResource = jest.fn(async () =>
      result({ document, edit_token: "edit-1" }),
    );
    return open();
  };

  test("the conversion gets it with the prompt and the schema dropped", async () => {
    const hook = await opened(agent_document({ kernel: KERNEL }, [INLINE]));
    api.unchain.convertSkeletonLegacyPools = jest.fn(async () =>
      result({ document: agent_document({ kernel: KERNEL }), edit_token: "edit-2" }),
    );
    await act(async () => {
      await hook.result.current.convertLegacyPools();
    });
    /* The entry's own legacy prompt replaces the first, and the second is
       this Agent's output contract rather than the subagent's. */
    expect(api.unchain.convertSkeletonLegacyPools).toHaveBeenCalledWith(
      "life",
      "edit-1",
      { ...KERNEL, prompt: "", json_schema: null },
    );
  });

  test("a conversion the store would refuse is not sent", async () => {
    /* No Kernel is configured, so there is nothing to hand over. Asking
       anyway would be a round trip that writes nothing and comes back with a
       refusal about a panel the author is not looking at. */
    const hook = await opened(agent_document({}, [INLINE]));
    api.unchain.convertSkeletonLegacyPools = jest.fn();
    await act(async () => {
      await hook.result.current.convertLegacyPools();
    });
    expect(api.unchain.convertSkeletonLegacyPools).not.toHaveBeenCalled();
    expect(hook.result.current.session.converting).toBe(false);
    expect(hook.result.current.session.error).toBeNull();
  });

  test("an entry declaring another model is not sent either", async () => {
    /* In either legacy format: both are converted through the same template
       IR, so both carry the model the entry declares. */
    for (const prompt_format of ["skeleton", "soul"]) {
      const hook = await opened(
        agent_document({ kernel: KERNEL }, [
          {
            ...INLINE,
            prompt_format,
            template: { prompt: "Be brief.", model: "anthropic:claude-x" },
          },
        ]),
      );
      api.unchain.convertSkeletonLegacyPools = jest.fn();
      await act(async () => {
        await hook.result.current.convertLegacyPools();
      });
      expect(api.unchain.convertSkeletonLegacyPools).not.toHaveBeenCalled();
    }
  });

  test("a migrated Agent is checked with the Kernel, not without one", async () => {
    /* Measured: `preflight` on an Agent whose node holds `legacy_recipe` and
       has no Kernel of its own answers `legacy_profile_required` at
       `legacy_kernel`, so "Check it can run" could not succeed on a migrated
       Agent at all. It goes over as configured and unprojected, because
       whatever takes it as a fallback — a node here, or a node of a legacy
       Agent this one references, which is not visible from here — is built
       out of it. */
    const hook = await opened(
      agent_document({ legacy_recipe: { name: "life" }, kernel: KERNEL }),
    );
    api.unchain.preflightSkeletonResource = jest.fn(async () => ({
      ok: true,
      definition_digest: "sha256:abc",
    }));
    await act(async () => {
      await hook.result.current.preflight();
    });
    expect(api.unchain.preflightSkeletonResource).toHaveBeenCalledWith("life", KERNEL);
  });

  test("a modern Agent's check is the request it always was", async () => {
    const hook = await opened(agent_document({ kernel: KERNEL }));
    api.unchain.preflightSkeletonResource = jest.fn(async () => ({
      ok: true,
      definition_digest: "sha256:abc",
    }));
    await act(async () => {
      await hook.result.current.preflight();
    });
    expect(api.unchain.preflightSkeletonResource).toHaveBeenCalledWith("life", null);
  });

  test("a migrated Agent whose nodes all have a Kernel is checked without one", async () => {
    /* Measured: a fully configured migrated graph is prepared with no
       fallback at all, each node on its own Kernel — so two Kernel Loops
       naming different models are no longer a reason the check cannot be
       made. There is just no single Kernel to hand over, and nothing in a
       graph like this asks for one. */
    const other = {
      ...KERNEL,
      profile: { ...KERNEL.profile, id: "x", provider: "anthropic", model: "claude-x", protocol: "anthropic", endpoint: "https://api.anthropic.com/v1/messages" },
    };
    const document = agent_document({ legacy_recipe: { name: "life" }, kernel: KERNEL });
    const hook = await opened({
      ...document,
      nodes: [...document.nodes, { id: "k2", type: "agent", config: { kernel: other } }],
    });
    api.unchain.preflightSkeletonResource = jest.fn(async () => ({
      ok: true,
      definition_digest: "sha256:abc",
    }));
    await act(async () => {
      await hook.result.current.preflight();
    });
    expect(api.unchain.preflightSkeletonResource).toHaveBeenCalledWith("life", null);
    expect(hook.result.current.session.preflight.ok).toBe(true);
  });

  test("a migrated Agent with no Kernel yet is still checked, and the store says why", async () => {
    /* Not withheld: the store's own refusal names what is missing, and a
       check that silently did nothing would be worse than one that answers
       `legacy_profile_required`. */
    const hook = await opened(agent_document({ legacy_recipe: { name: "life" } }));
    api.unchain.preflightSkeletonResource = jest.fn(async () => ({
      error: { code: "legacy_profile_required", message: "migrated Agent requires an explicit Kernel configuration", path: ["legacy_kernel"] },
    }));
    await act(async () => {
      await hook.result.current.preflight();
    });
    expect(api.unchain.preflightSkeletonResource).toHaveBeenCalledWith("life", null);
    expect(hook.result.current.session.preflight.ok).toBe(false);
  });
});
