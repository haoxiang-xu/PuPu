const { createLogStore } = require("../../main/services/test-api/logs");

describe("test-api/logs", () => {
  test("ring buffer keeps last N entries per source", () => {
    const store = createLogStore({ capacity: 3 });
    for (let i = 0; i < 5; i++) {
      store.push({ ts: i, level: "log", source: "renderer", msg: `m${i}` });
    }
    expect(store.tail({ source: "renderer", n: 10 })).toEqual([
      { ts: 2, level: "log", source: "renderer", msg: "m2" },
      { ts: 3, level: "log", source: "renderer", msg: "m3" },
      { ts: 4, level: "log", source: "renderer", msg: "m4" },
    ]);
  });

  test("tail filters by since (exclusive)", () => {
    const store = createLogStore({ capacity: 5 });
    store.push({ ts: 100, level: "log", source: "main", msg: "a" });
    store.push({ ts: 200, level: "log", source: "main", msg: "b" });
    expect(store.tail({ source: "main", since: 100 })).toEqual([
      { ts: 200, level: "log", source: "main", msg: "b" },
    ]);
  });

  test("each source has its own buffer", () => {
    const store = createLogStore({ capacity: 2 });
    store.push({ ts: 1, source: "renderer", level: "log", msg: "r" });
    store.push({ ts: 2, source: "main", level: "log", msg: "m" });
    expect(store.tail({ source: "renderer" })).toHaveLength(1);
    expect(store.tail({ source: "main" })).toHaveLength(1);
  });

  test("patchStream intercepts write but still calls original", () => {
    const writes = [];
    const fakeStdout = {
      write: (chunk) => {
        writes.push(String(chunk));
        return true;
      },
    };
    const store = createLogStore({ capacity: 10 });
    const restore = store.patchStream(fakeStdout, "main", "log");
    fakeStdout.write("hello");
    expect(writes).toEqual(["hello"]);
    expect(store.tail({ source: "main" })).toEqual([
      expect.objectContaining({ source: "main", level: "log", msg: "hello" }),
    ]);
    restore();
    fakeStdout.write("after");
    expect(store.tail({ source: "main" })).toHaveLength(1);
  });
});
