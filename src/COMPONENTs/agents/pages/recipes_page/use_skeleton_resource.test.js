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
