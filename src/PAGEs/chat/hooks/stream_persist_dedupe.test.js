// T3(B 批):done 边沿双写合并。
// 归因证据:onDone 里 finalizeStreamPersist 同步整库写一次 final messages;
// ~250ms 后 chat.js 的消息持久化 effect(delay = streaming?250:0)对
// session.messages(=== 同一数组引用,经 flushSync/setMessages)再整库写一次
// (实测 47ms 长任务)。同一份数据写两次 → 用引用标记去重,fail-open:
// 引用不匹配(如 subagent 链路换了数组)则照常落盘,最坏退回现行为。

import {
  clearStreamFinalizedPersist,
  consumeStreamFinalizedPersist,
  markStreamFinalizedPersist,
} from "./stream_persist_dedupe";

describe("stream_persist_dedupe (done 边沿双写合并)", () => {
  afterEach(() => {
    clearStreamFinalizedPersist();
  });

  test("mark 后,相同 chatId + 相同数组引用的 consume 命中一次", () => {
    const messages = [{ id: "m-1", role: "assistant", content: "final" }];
    markStreamFinalizedPersist("chat-a", messages);

    expect(consumeStreamFinalizedPersist("chat-a", messages)).toBe(true);
    // 一次性:重复 consume 不再命中(后续真实变更必须照常落盘)
    expect(consumeStreamFinalizedPersist("chat-a", messages)).toBe(false);
  });

  test("chatId 不同不命中(fail-open)", () => {
    const messages = [{ id: "m-1" }];
    markStreamFinalizedPersist("chat-a", messages);
    expect(consumeStreamFinalizedPersist("chat-b", messages)).toBe(false);
    // 未被消费,原 mark 仍在
    expect(consumeStreamFinalizedPersist("chat-a", messages)).toBe(true);
  });

  test("数组引用不同不命中,即使内容相同(fail-open)", () => {
    const messages = [{ id: "m-1" }];
    markStreamFinalizedPersist("chat-a", messages);
    expect(consumeStreamFinalizedPersist("chat-a", [{ id: "m-1" }])).toBe(false);
  });

  test("未 mark 时 consume 永不命中", () => {
    expect(consumeStreamFinalizedPersist("chat-a", [])).toBe(false);
  });

  test("新 mark 覆盖旧 mark(每次 finalize 只保护最近一次)", () => {
    const first = [{ id: "m-1" }];
    const second = [{ id: "m-2" }];
    markStreamFinalizedPersist("chat-a", first);
    markStreamFinalizedPersist("chat-a", second);
    expect(consumeStreamFinalizedPersist("chat-a", first)).toBe(false);
    expect(consumeStreamFinalizedPersist("chat-a", second)).toBe(true);
  });
});
