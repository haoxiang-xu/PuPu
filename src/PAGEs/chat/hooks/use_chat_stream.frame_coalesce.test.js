/**
 * Verifies that the scheduler pattern used inside syncStreamMessages
 * coalesces N same-tick updates into 1 downstream call.
 *
 * This is a wiring smoke test that mirrors how use_chat_stream.js uses
 * the scheduler, without mounting the full hook.
 */
import { createStreamFlushScheduler } from "./stream_flush_scheduler";

describe("use_chat_stream frame-path coalesce wiring", () => {
  test("simulated onFrame burst: 10 commits in same tick -> 1 setMessages", async () => {
    const setMessagesCalls = [];
    const scheduler = createStreamFlushScheduler({
      onFlush: (messages) => setMessagesCalls.push(messages),
    });

    for (let i = 0; i < 10; i += 1) {
      const nextMessages = [{ id: "m1", content: `step ${i}` }];
      scheduler.commit(nextMessages);
    }

    expect(setMessagesCalls).toHaveLength(0);

    await Promise.resolve();

    expect(setMessagesCalls).toHaveLength(1);
    expect(setMessagesCalls[0]).toEqual([{ id: "m1", content: "step 9" }]);
  });

  test("commits across 3 ticks -> 3 setMessages (one per tick)", async () => {
    const setMessagesCalls = [];
    const scheduler = createStreamFlushScheduler({
      onFlush: (messages) => setMessagesCalls.push(messages),
    });

    scheduler.commit([{ id: "m1", content: "a" }]);
    await Promise.resolve();
    scheduler.commit([{ id: "m1", content: "ab" }]);
    await Promise.resolve();
    scheduler.commit([{ id: "m1", content: "abc" }]);
    await Promise.resolve();

    expect(setMessagesCalls).toHaveLength(3);
    expect(setMessagesCalls.map((m) => m[0].content)).toEqual([
      "a",
      "ab",
      "abc",
    ]);
  });

  test("terminal flushSync after burst emits last messages synchronously", () => {
    const setMessagesCalls = [];
    const scheduler = createStreamFlushScheduler({
      onFlush: (messages) => setMessagesCalls.push(messages),
    });

    scheduler.commit([{ id: "m1", content: "partial" }]);
    scheduler.commit([{ id: "m1", content: "final" }]);
    scheduler.flushSync();

    expect(setMessagesCalls).toEqual([[{ id: "m1", content: "final" }]]);
  });

  test("onFlush guard: active-check inside onFlush skips stale flush", async () => {
    const setMessagesCalls = [];
    let activeChatId = "c1";
    const targetChatId = "c1";
    const scheduler = createStreamFlushScheduler({
      onFlush: (messages) => {
        if (activeChatId === targetChatId) {
          setMessagesCalls.push(messages);
        }
      },
    });

    scheduler.commit([{ id: "m1", content: "while active" }]);
    activeChatId = "c2";

    await Promise.resolve();

    expect(setMessagesCalls).toHaveLength(0);
  });
});
