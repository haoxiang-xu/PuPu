const EventEmitter = require("events");
const { CHANNELS } = require("../../shared/channels");
const { createBridge } = require("../../main/services/test-api/bridge");

const makeFakeWebContents = () => {
  const sent = [];
  return {
    send: (channel, payload) => sent.push({ channel, payload }),
    sent,
  };
};

describe("test-api/bridge", () => {
  test("invoke sends INVOKE then resolves on matching RESULT", async () => {
    const wc = makeFakeWebContents();
    const ipcMain = new EventEmitter();
    const bridge = createBridge({ ipcMain, channels: CHANNELS.TEST_BRIDGE });
    bridge.attach(wc);

    const promise = bridge.invoke("createChat", { title: "x" }, { timeout: 1000 });
    expect(wc.sent).toHaveLength(1);
    expect(wc.sent[0].channel).toBe(CHANNELS.TEST_BRIDGE.INVOKE);
    const { requestId } = wc.sent[0].payload;

    ipcMain.emit(
      CHANNELS.TEST_BRIDGE.RESULT,
      {},
      { requestId, ok: true, data: { chat_id: "c1" } },
    );
    await expect(promise).resolves.toEqual({ chat_id: "c1" });
  });

  test("invoke rejects on RESULT with ok:false", async () => {
    const wc = makeFakeWebContents();
    const ipcMain = new EventEmitter();
    const bridge = createBridge({ ipcMain, channels: CHANNELS.TEST_BRIDGE });
    bridge.attach(wc);
    const promise = bridge.invoke("foo", {}, { timeout: 1000 });
    const { requestId } = wc.sent[0].payload;
    ipcMain.emit(
      CHANNELS.TEST_BRIDGE.RESULT,
      {},
      { requestId, ok: false, error: { code: "no_handler", message: "x" } },
    );
    await expect(promise).rejects.toMatchObject({ code: "no_handler" });
  });

  test("invoke rejects with ipc_timeout when no result", async () => {
    const wc = makeFakeWebContents();
    const ipcMain = new EventEmitter();
    const bridge = createBridge({ ipcMain, channels: CHANNELS.TEST_BRIDGE });
    bridge.attach(wc);
    await expect(
      bridge.invoke("foo", {}, { timeout: 50 }),
    ).rejects.toMatchObject({ code: "ipc_timeout" });
  });

  test("ready handshake exposes isReady() and onReady()", () => {
    const wc = makeFakeWebContents();
    const ipcMain = new EventEmitter();
    const bridge = createBridge({ ipcMain, channels: CHANNELS.TEST_BRIDGE });
    bridge.attach(wc);
    expect(bridge.isReady()).toBe(false);
    let fired = false;
    bridge.onReady(() => {
      fired = true;
    });
    ipcMain.emit(CHANNELS.TEST_BRIDGE.READY, {});
    expect(bridge.isReady()).toBe(true);
    expect(fired).toBe(true);
  });
});
