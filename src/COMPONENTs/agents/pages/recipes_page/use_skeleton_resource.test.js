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
