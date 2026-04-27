import { createStreamFlushScheduler } from "./stream_flush_scheduler";

describe("createStreamFlushScheduler", () => {
  test("coalesces N commits in same tick into 1 flush with latest messages", async () => {
    const flushes = [];
    const scheduler = createStreamFlushScheduler({
      onFlush: (messages) => flushes.push(messages),
    });

    scheduler.commit([{ id: "m1", content: "a" }]);
    scheduler.commit([{ id: "m1", content: "ab" }]);
    scheduler.commit([{ id: "m1", content: "abc" }]);

    expect(flushes).toHaveLength(0);

    await Promise.resolve();

    expect(flushes).toHaveLength(1);
    expect(flushes[0]).toEqual([{ id: "m1", content: "abc" }]);
  });

  test("flushSync pre-empts the pending microtask and flushes immediately", async () => {
    const flushes = [];
    const scheduler = createStreamFlushScheduler({
      onFlush: (messages) => flushes.push(messages),
    });

    scheduler.commit([{ id: "m1", content: "hello" }]);
    scheduler.flushSync();

    expect(flushes).toEqual([[{ id: "m1", content: "hello" }]]);

    await Promise.resolve();
    expect(flushes).toHaveLength(1);
  });

  test("flushSync with no pending commit is a no-op", () => {
    const flushes = [];
    const scheduler = createStreamFlushScheduler({
      onFlush: (messages) => flushes.push(messages),
    });

    scheduler.flushSync();
    expect(flushes).toHaveLength(0);
  });

  test("cancel drops the pending microtask", async () => {
    const flushes = [];
    const scheduler = createStreamFlushScheduler({
      onFlush: (messages) => flushes.push(messages),
    });

    scheduler.commit([{ id: "m1" }]);
    scheduler.cancel();

    await Promise.resolve();
    expect(flushes).toHaveLength(0);
  });

  test("commit after flushSync schedules a new microtask", async () => {
    const flushes = [];
    const scheduler = createStreamFlushScheduler({
      onFlush: (messages) => flushes.push(messages),
    });

    scheduler.commit([{ id: "m1", content: "a" }]);
    scheduler.flushSync();
    scheduler.commit([{ id: "m1", content: "b" }]);

    expect(flushes).toHaveLength(1);

    await Promise.resolve();
    expect(flushes).toHaveLength(2);
    expect(flushes[1]).toEqual([{ id: "m1", content: "b" }]);
  });
});
