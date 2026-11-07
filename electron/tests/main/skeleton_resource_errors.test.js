const { readSkeletonResourceResponse } = require("../../main/services/unchain/skeleton_resource_response");
const { unwrapSkeletonResourceResponse, createSkeletonResourceReply } = require("../../shared/skeleton_resource_transport");

const response = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });
const conflict = { code: "edit_conflict", path: ["expected_edit_token"], message: "Resource has changed; reload before saving." };

describe("Skeleton resource error transport", () => {
  test("HTTP refusal preserves the canonical error and status", async () => {
    const error = await readSkeletonResourceResponse(response(409, { error: conflict })).catch((value) => value);
    expect(error).toBeInstanceOf(Error);
    expect({ code: error.code, path: error.path, message: error.message, status: error.status }).toEqual({ ...conflict, status: 409 });
  });

  test("serializes a refusal as data and reconstructs its fields after IPC", async () => {
    const error = Object.assign(new Error(conflict.message), conflict, { status: 409 });
    const reply = await createSkeletonResourceReply(async () => { throw error; });
    expect(reply).toEqual({ schema: "pupu.skeleton-resource-response.v1", ok: false, error: { ...conflict, status: 409 } });
    let received;
    try { unwrapSkeletonResourceResponse(JSON.parse(JSON.stringify(reply))); } catch (value) { received = value; }
    expect({ code: received.code, path: received.path, message: received.message, status: received.status }).toEqual({ ...conflict, status: 409 });
  });

  test("successful results keep the public bridge shape", async () => {
    const data = { document: { id: "agent" }, edit_token: "edit-1" };
    const reply = await createSkeletonResourceReply(async () => data);
    expect(reply).toEqual({ schema: "pupu.skeleton-resource-response.v1", ok: true, data });
    expect(unwrapSkeletonResourceResponse(reply)).toEqual(data);
  });

  test.each([
    { ...conflict, extra: true },
    { ...conflict, path: "expected_edit_token" },
    { ...conflict, path: [{}] },
    { ...conflict, path: [-1] },
    { ...conflict, code: 409 },
    { ...conflict, message: null },
  ])("rejects malformed HTTP error fields %#", async (error) => {
    await expect(readSkeletonResourceResponse(response(409, { error }))).rejects.toMatchObject({ code: "skeleton_resource_protocol_error", path: [], status: 409 });
  });

  test("rejects an unknown HTTP envelope field", async () => {
    await expect(readSkeletonResourceResponse(response(409, { error: conflict, unexpected: true }))).rejects.toMatchObject({ code: "skeleton_resource_protocol_error" });
  });

  test.each([
    { schema: "pupu.skeleton-resource-response.v0", ok: true, data: {} },
    { schema: "pupu.skeleton-resource-response.v1", ok: true, data: {}, error: conflict },
    { schema: "pupu.skeleton-resource-response.v1", ok: false, error: { ...conflict, status: 409, extra: true } },
    { schema: "pupu.skeleton-resource-response.v1", ok: false, error: { ...conflict, status: "409" } },
    { schema: "pupu.skeleton-resource-response.v1", ok: false, error: { ...conflict, status: 200 } },
    { schema: "pupu.skeleton-resource-response.v1", ok: false, error: { ...conflict, status: 409, path: [{}] } },
    { schema: "pupu.skeleton-resource-response.v1", ok: false, error: { ...conflict, status: 409, path: Array(1) } },
    { resources: [] },
  ])("rejects wrong-version or malformed IPC replies %#", (reply) => {
    expect(() => unwrapSkeletonResourceResponse(reply)).toThrow("Invalid Skeleton resource IPC response");
    try { unwrapSkeletonResourceResponse(reply); } catch (error) { expect(error.code).toBe("skeleton_resource_protocol_error"); }
  });

  test("local transport failures survive without inventing an HTTP status", async () => {
    const reply = await createSkeletonResourceReply(async () => { throw new Error("Sidecar is not ready"); });
    expect(reply.error).toEqual({ code: "skeleton_resource_failed", path: [], message: "Sidecar is not ready", status: null });
  });
});
