const { CHANNELS } = require("../../shared/channels");
const {
  registerRunBundleStorageHandlers,
} = require("../../main/services/run_bundle_storage/register_handlers");
const {
  buildRunBundleV1,
} = require("../fixtures/run_bundle_v1_fixture.cjs");

const fakeIpcMain = () => {
  const handlers = new Map();
  return {
    handle: jest.fn((channel, handler) => handlers.set(channel, handler)),
    handlers,
  };
};

describe("RunBundle storage IPC handlers", () => {
  test("registers the exact three invoke-only operations", async () => {
    const ipcMain = fakeIpcMain();
    const service = {
      upsertRunBundle: jest.fn(() => ({ ok: true, status: "inserted" })),
      queryRunBundles: jest.fn(() => ({ ok: true, records: [] })),
      clearRunBundles: jest.fn(() => ({ ok: true, cleared: 0 })),
    };
    registerRunBundleStorageHandlers({
      ipcMain,
      runBundleStorageService: service,
    });

    expect([...ipcMain.handlers.keys()].sort()).toEqual(
      Object.values(CHANNELS.RUN_BUNDLE_STORAGE).sort(),
    );
    const bundle = buildRunBundleV1();
    await ipcMain.handlers.get(CHANNELS.RUN_BUNDLE_STORAGE.UPSERT)(null, {
      bundle,
    });
    await ipcMain.handlers.get(CHANNELS.RUN_BUNDLE_STORAGE.QUERY)(null, {
      query: { executionId: "chat-1" },
    });
    await ipcMain.handlers.get(CHANNELS.RUN_BUNDLE_STORAGE.CLEAR)(null, {
      options: { executionId: "chat-1" },
    });

    expect(service.upsertRunBundle).toHaveBeenCalledWith(bundle);
    expect(service.queryRunBundles).toHaveBeenCalledWith({
      executionId: "chat-1",
    });
    expect(service.clearRunBundles).toHaveBeenCalledWith({
      executionId: "chat-1",
    });
  });

  test("rejects missing dependencies", () => {
    expect(() => registerRunBundleStorageHandlers({})).toThrow(
      /missing dependencies/,
    );
  });
});

