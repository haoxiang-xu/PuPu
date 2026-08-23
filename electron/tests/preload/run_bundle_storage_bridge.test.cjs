const { CHANNELS } = require("../../shared/channels");
const {
  createRunBundleStorageBridge,
} = require("../../preload/bridges/run_bundle_storage_bridge");
const {
  buildRunBundleV1,
} = require("../fixtures/run_bundle_v1_fixture.cjs");

describe("RunBundle storage preload bridge", () => {
  test("exposes exactly upsert/query/clear and reconstructs strict payloads", async () => {
    const ipcRenderer = { invoke: jest.fn(() => Promise.resolve({ ok: true })) };
    const api = createRunBundleStorageBridge(ipcRenderer);
    expect(Object.keys(api).sort()).toEqual(["clear", "query", "upsert"]);

    const bundle = buildRunBundleV1();
    await api.upsert(bundle);
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.RUN_BUNDLE_STORAGE.UPSERT,
      { bundle: expect.objectContaining({ bundle_id: bundle.bundle_id }) },
    );
    expect(
      ipcRenderer.invoke.mock.calls[0][1].bundle,
    ).not.toBe(bundle);

    await api.query({ executionId: "chat-1", limit: 10 });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.RUN_BUNDLE_STORAGE.QUERY,
      { query: { executionId: "chat-1", limit: 10 } },
    );

    await api.clear({ executionId: "chat-1" });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.RUN_BUNDLE_STORAGE.CLEAR,
      { options: { executionId: "chat-1" } },
    );
  });

  test("fails closed on unknown bundle/query/clear fields", () => {
    const api = createRunBundleStorageBridge({ invoke: jest.fn() });
    const bundle = buildRunBundleV1();
    expect(() => api.upsert({ ...bundle, raw_prompt: "secret" })).toThrow(
      /unexpected key set/,
    );
    expect(() => api.query({ executionId: "chat-1", endpoint: "evil" })).toThrow(
      /unknown fields/,
    );
    expect(() => api.clear({ executionId: "chat-1", drop: true })).toThrow(
      /unknown fields/,
    );
  });
});

