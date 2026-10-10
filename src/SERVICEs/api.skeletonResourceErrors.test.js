import { api } from "./api";

const refusal = { code: "edit_conflict", path: ["expected_edit_token"], message: "Reload before saving.", status: 409 };

describe("Skeleton errors after the isolated preload world", () => {
  const previous = window.unchainAPI;
  afterEach(() => { window.unchainAPI = previous; });

  test("rebuilds a plain refusal as an Error in the renderer", async () => {
    window.unchainAPI = { saveSkeletonResource: async () => { throw { ...refusal }; } };
    let error;
    try { await api.unchain.saveSkeletonResource({}); } catch (value) { error = value; }
    expect(error).toBeInstanceOf(Error);
    expect({ code: error.code, path: error.path, message: error.message, status: error.status }).toEqual(refusal);
  });

  test.each([
    { ...refusal, extra: true },
    { ...refusal, path: [{}] },
    { ...refusal, path: Array(1) },
    { ...refusal, status: 200 },
    { ...refusal, code: 409 },
    new Error("a stripped legacy refusal"),
  ])("rejects malformed bridge refusals %#", async (refused) => {
    window.unchainAPI = { saveSkeletonResource: async () => { throw refused; } };
    await expect(api.unchain.saveSkeletonResource({})).rejects.toMatchObject({ code: "skeleton_resource_protocol_error" });
  });

  test("preserves a local failure without inventing an HTTP status", async () => {
    window.unchainAPI = { getSkeletonResource: async () => { throw { code: "skeleton_resource_failed", path: [], message: "Sidecar unavailable", status: null }; } };
    await expect(api.unchain.getSkeletonResource("agent")).rejects.toMatchObject({ code: "skeleton_resource_failed", path: [], status: null });
  });
});
