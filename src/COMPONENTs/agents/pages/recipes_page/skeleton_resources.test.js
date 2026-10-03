import {
  diagnose,
  edit_conflict_message,
  is_unavailable,
  preflight,
  save_draft,
} from "./skeleton_resources";
import { api } from "../../../../SERVICEs/api";

jest.mock("../../../../SERVICEs/api", () => ({ api: { unchain: {} } }));

beforeEach(() => {
  Object.keys(api.unchain).forEach((key) => delete api.unchain[key]);
});

describe("a build that cannot reach the store says so", () => {
  test("a missing bridge method is unavailable, not a refusal", () => {
    /* The two must stay apart: "we could not ask" and "it said no" call for
     * different things from the author. */
    return save_draft({ id: "w" }).then((result) => {
      expect(result).toMatchObject({ ok: false, reason: "unavailable" });
      expect(is_unavailable(result)).toBe(true);
      expect(result.error.message).toMatch(/nothing was saved/i);
    });
  });

  test("the bridge throwing bridge_unavailable is the same verdict", async () => {
    api.unchain.saveSkeletonResource = jest.fn().mockRejectedValue(
      Object.assign(new Error("unchainAPI.saveSkeletonResource is unavailable"), {
        code: "bridge_unavailable",
      }),
    );
    expect(is_unavailable(await save_draft({ id: "w" }))).toBe(true);
  });

  test("every call answers, so no caller has to guess", async () => {
    expect(is_unavailable(await diagnose({ id: "w" }))).toBe(true);
    expect(is_unavailable(await preflight("w"))).toBe(true);
  });
});

describe("the payloads are the ones the route accepts", () => {
  test("a save without an edit token omits the field rather than sending null", async () => {
    /* The route's body is closed, and `expected_edit_token: null` on a resource
     * that does not exist yet is a 409 rather than a create. */
    api.unchain.saveSkeletonResource = jest.fn().mockResolvedValue({ ok: true });
    await save_draft({ id: "w" });
    expect(api.unchain.saveSkeletonResource).toHaveBeenCalledWith({ document: { id: "w" } });
  });

  test("a save with an edit token sends it as the compare-and-set", async () => {
    api.unchain.saveSkeletonResource = jest.fn().mockResolvedValue({ ok: true });
    await save_draft({ id: "w" }, "tok-1");
    expect(api.unchain.saveSkeletonResource).toHaveBeenCalledWith({
      document: { id: "w" },
      expected_edit_token: "tok-1",
    });
  });

  test("diagnose sends the document and answers with the list", async () => {
    api.unchain.diagnoseSkeletonResource = jest.fn().mockResolvedValue({
      diagnostics: [{ code: "end_count", path: ["document", "nodes"], message: "needs one end" }],
    });
    const result = await diagnose({ id: "w" });
    expect(api.unchain.diagnoseSkeletonResource).toHaveBeenCalledWith({ id: "w" });
    expect(result.data).toEqual([
      { code: "end_count", path: ["document", "nodes"], message: "needs one end" },
    ]);
  });

  test("preflight sends null rather than undefined for no legacy kernel", async () => {
    api.unchain.preflightSkeletonResource = jest.fn().mockResolvedValue({ ok: true });
    await preflight("w");
    expect(api.unchain.preflightSkeletonResource).toHaveBeenCalledWith("w", null);
  });
});

describe("a refusal is reported as one", () => {
  test("an error body is a refusal, not a success with an error inside", async () => {
    api.unchain.saveSkeletonResource = jest.fn().mockResolvedValue({
      error: { code: "edit_conflict", path: ["expected_edit_token"], message: "stale" },
    });
    const result = await save_draft({ id: "w" }, "old");
    expect(result).toMatchObject({ ok: false, reason: "refused" });
    expect(result.error.code).toBe("edit_conflict");
  });

  test("a thrown store error is a refusal too", async () => {
    api.unchain.diagnoseSkeletonResource = jest.fn().mockRejectedValue(
      Object.assign(new Error("boom"), { code: "skeleton_store_failed" }),
    );
    const result = await diagnose({ id: "w" });
    expect(result).toMatchObject({ ok: false, reason: "refused" });
    expect(result.error.code).toBe("skeleton_store_failed");
  });

  test("an edit conflict is explained in terms of the other edit", () => {
    expect(edit_conflict_message({ code: "edit_conflict" })).toMatch(/changed elsewhere/i);
    expect(edit_conflict_message({ code: "invalid_type" })).toBeNull();
    expect(edit_conflict_message(null)).toBeNull();
  });

  test("a plain answer is passed through", async () => {
    api.unchain.saveSkeletonResource = jest.fn().mockResolvedValue({ ok: true, edit_token: "t2" });
    expect(await save_draft({ id: "w" })).toEqual({
      ok: true,
      data: { ok: true, edit_token: "t2" },
    });
  });
});
