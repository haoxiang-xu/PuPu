/** @jest-environment jsdom */

// T1(B 批):store GC 最小间隔门槛。
// 归因证据:流式期间周期性 setChatMessages 每次都触发整库 GC(clone+normalize+LRU,
// 实测 ~40ms/次),同一 chat 反复 GC 结果不变、纯重复劳动。
// 契约:门槛内的重复 mutation 不再各自触发 GC;门槛到期(trailing)恰好跑一次;
// GC 语义(LRU 淘汰/normalize 结果)不变;冷启动后的首次 GC 不延迟。
//
// 注:jest modern fake timers 会 fake queueMicrotask,persist/emit 的微任务合并
// 不会自然 flush —— 测试里统一用导出的 flushStoreEmitSync() 强制落地。

describe("chat_storage store GC throttle (min interval)", () => {
  let bridgeWrite;
  let idleQueue;

  const setupIpcBridge = () => {
    bridgeWrite = jest.fn();
    window.chatStorageAPI = {
      bootstrap: () => null,
      write: bridgeWrite,
    };
  };

  const drainIdle = () => {
    const q = idleQueue.splice(0);
    q.forEach((cb) => cb());
  };

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    window.localStorage.clear();
    delete window.chatStorageAPI;
    setupIpcBridge();
    idleQueue = [];
    window.requestIdleCallback = (cb) => {
      idleQueue.push(cb);
      return idleQueue.length;
    };
    window.cancelIdleCallback = () => {};
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    delete window.chatStorageAPI;
    delete window.requestIdleCallback;
    delete window.cancelIdleCallback;
  });

  const setup = () => {
    const store = require("./chat_storage_store");
    store.getChatsStore();
    const gcEvents = [];
    store.subscribeChatsStore((_, event) => {
      if (event?.type === "store_gc") {
        gcEvents.push(event);
      }
    });
    return { store, gcEvents };
  };

  test("门槛内的周期性 setChatMessages 只触发一次即时 GC,到期后恰好补跑一次", () => {
    const { store, gcEvents } = setup();
    const { chatId } = store.createChatInSelectedContext(
      { title: "stream" },
      { source: "test" },
    );
    store.flushStoreEmitSync();

    // 首次 mutation:距上次 GC 无限远 → GC 立即(idle)跑,行为与现状一致
    store.setChatMessages(chatId, [{ id: "m-0", role: "user", content: "hi" }], {
      source: "test",
    });
    drainIdle();
    store.flushStoreEmitSync();
    expect(gcEvents.length).toBe(1);

    // 模拟流式:每 2s 一次 setChatMessages,共 5 次(全部落在 30s 门槛内)
    for (let i = 1; i <= 5; i += 1) {
      jest.advanceTimersByTime(2000);
      store.setChatMessages(
        chatId,
        Array.from({ length: i + 1 }, (_, k) => ({
          id: `m-${k}`,
          role: k % 2 ? "assistant" : "user",
          content: `msg ${k}`,
        })),
        { source: "test" },
      );
      drainIdle();
      store.flushStoreEmitSync();
    }

    // 门槛内不重复 GC(现状:每次 drain 都跑一次 → 这里会是 6)
    expect(gcEvents.length).toBe(1);

    // 门槛到期:trailing 恰好补跑一次(不多不少)
    jest.advanceTimersByTime(30_000);
    drainIdle();
    store.flushStoreEmitSync();
    expect(gcEvents.length).toBe(2);

    // 到期后无 pending mutation → 不再自发跑
    jest.advanceTimersByTime(60_000);
    drainIdle();
    store.flushStoreEmitSync();
    expect(gcEvents.length).toBe(2);
  });

  test("冷启动后的首次 GC 不延迟(单次 mutation 行为与现状一致)", () => {
    const { store, gcEvents } = setup();
    const { chatId } = store.createChatInSelectedContext(
      { title: "single" },
      { source: "test" },
    );
    store.flushStoreEmitSync();

    store.setChatMessages(chatId, [{ id: "m-0", role: "user", content: "x" }], {
      source: "test",
    });
    drainIdle();
    store.flushStoreEmitSync();

    expect(gcEvents.length).toBe(1);
  });

  test("GC 语义不变:超限的非激活 chat 在 GC 跑时仍被 LRU 淘汰", () => {
    const { store } = setup();
    const { chatId: bigChatId } = store.createChatInSelectedContext(
      { title: "big" },
      { source: "test" },
    );
    // 单条消息文本被 sanitize 截到 MAX_TEXT_CHARS(100k),用 50 条 ×100k ≈ 5MB
    // 超过 TARGET_TOTAL_BYTES(4.2MB)
    store.setChatMessages(
      bigChatId,
      Array.from({ length: 50 }, (_, k) => ({
        id: `m-big-${k}`,
        role: k % 2 ? "assistant" : "user",
        content: "x".repeat(100000),
      })),
      { source: "test" },
    );
    // 切到另一个 chat,让 bigChat 变成"非激活、最久未用"
    const { chatId: activeChatId } = store.createChatInSelectedContext(
      { title: "active" },
      { source: "test" },
    );
    store.flushStoreEmitSync();

    store.setChatMessages(
      activeChatId,
      [{ id: "m-a", role: "user", content: "hello" }],
      { source: "test" },
    );
    drainIdle();
    store.flushStoreEmitSync();

    const snapshot = store.getChatsStore();
    expect(snapshot.chatsById[bigChatId]).toBeUndefined(); // LRU 淘汰生效
    expect(snapshot.chatsById[activeChatId]).toBeDefined();
  });
});
