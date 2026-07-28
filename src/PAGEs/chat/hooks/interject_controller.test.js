import {
  buildInterjectionRecord,
  createQueuedTurnBuffer,
  mergeQueuedTurnTexts,
  parseInterjectPrefix,
} from "./interject_controller";

describe("parseInterjectPrefix", () => {
  test("bare text with no prefix routes to auto", () => {
    expect(parseInterjectPrefix("just a plain message")).toEqual({
      channel: "auto",
      body: "just a plain message",
    });
  });

  test("empty string routes to empty", () => {
    expect(parseInterjectPrefix("")).toEqual({ channel: "empty", body: "" });
  });

  test("whitespace-only string routes to empty", () => {
    expect(parseInterjectPrefix("   \n\t ")).toEqual({
      channel: "empty",
      body: "",
    });
  });

  test("non-string input routes to empty", () => {
    expect(parseInterjectPrefix(undefined)).toEqual({
      channel: "empty",
      body: "",
    });
    expect(parseInterjectPrefix(null)).toEqual({ channel: "empty", body: "" });
  });

  test("/btw with a body routes to btw and strips the prefix", () => {
    expect(parseInterjectPrefix("/btw how's it going?")).toEqual({
      channel: "btw",
      body: "how's it going?",
    });
  });

  test("/fyi with a body routes to fyi and strips the prefix", () => {
    expect(parseInterjectPrefix("/fyi also check the staging env")).toEqual({
      channel: "fyi",
      body: "also check the staging env",
    });
  });

  test("/queue with a body routes to queue and strips the prefix", () => {
    expect(parseInterjectPrefix("/queue add tests too")).toEqual({
      channel: "queue",
      body: "add tests too",
    });
  });

  test("bare /btw with no body routes to empty", () => {
    expect(parseInterjectPrefix("/btw")).toEqual({ channel: "empty", body: "" });
  });

  test("bare /fyi with no body routes to empty", () => {
    expect(parseInterjectPrefix("/fyi")).toEqual({ channel: "empty", body: "" });
  });

  test("bare /queue with no body routes to empty", () => {
    expect(parseInterjectPrefix("/queue")).toEqual({
      channel: "empty",
      body: "",
    });
  });

  test("/btw followed by only whitespace routes to empty", () => {
    expect(parseInterjectPrefix("/btw    ")).toEqual({
      channel: "empty",
      body: "",
    });
  });

  test("prefix-like text without trailing space or exact match is not a prefix", () => {
    // "/btwhatever" doesn't equal "/btw" and doesn't start with "/btw " —
    // it should fall through to auto, not be misparsed as a btw prefix.
    expect(parseInterjectPrefix("/btwhatever")).toEqual({
      channel: "auto",
      body: "/btwhatever",
    });
  });

  test("leading/trailing whitespace around a prefixed message is trimmed", () => {
    expect(parseInterjectPrefix("  /fyi   trim me   ")).toEqual({
      channel: "fyi",
      body: "trim me",
    });
  });
});

describe("mergeQueuedTurnTexts", () => {
  test("empty array returns empty string", () => {
    expect(mergeQueuedTurnTexts([])).toBe("");
  });

  test("non-array input returns empty string", () => {
    expect(mergeQueuedTurnTexts(undefined)).toBe("");
    expect(mergeQueuedTurnTexts(null)).toBe("");
  });

  test("all-blank entries are filtered out, yielding empty string", () => {
    expect(mergeQueuedTurnTexts(["", "   ", "\n"])).toBe("");
  });

  test("single text is returned verbatim (no header, no numbering)", () => {
    expect(mergeQueuedTurnTexts(["add tests too"])).toBe("add tests too");
  });

  test("single text is trimmed", () => {
    expect(mergeQueuedTurnTexts(["  add tests too  "])).toBe("add tests too");
  });

  test("multiple texts get the exact unchain merge header and numbered list", () => {
    const merged = mergeQueuedTurnTexts([
      "also add GitHub Actions to the comparison",
      "give a final recommendation",
    ]);
    expect(merged).toBe(
      "The user sent several follow-up requests while the previous task was " +
        "running. Address all of them, in order:\n" +
        "1. also add GitHub Actions to the comparison\n" +
        "2. give a final recommendation",
    );
  });

  test("blank entries interleaved with real ones are filtered before numbering", () => {
    const merged = mergeQueuedTurnTexts(["first", "", "  ", "second"]);
    expect(merged).toBe(
      "The user sent several follow-up requests while the previous task was " +
        "running. Address all of them, in order:\n" +
        "1. first\n" +
        "2. second",
    );
  });
});

describe("createQueuedTurnBuffer", () => {
  test("starts empty", () => {
    const buffer = createQueuedTurnBuffer();
    expect(buffer.size()).toBe(0);
    expect(buffer.list()).toEqual([]);
    expect(buffer.drainMerged()).toBeNull();
  });

  test("push returns a stable id and appends a queued item", () => {
    const buffer = createQueuedTurnBuffer();
    const id = buffer.push("do this next");
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
    expect(buffer.size()).toBe(1);
    expect(buffer.list()).toEqual([{ id, text: "do this next", status: "queued" }]);
  });

  test("push assigns distinct ids to distinct entries", () => {
    const buffer = createQueuedTurnBuffer();
    const id1 = buffer.push("first");
    const id2 = buffer.push("second");
    expect(id1).not.toBe(id2);
    expect(buffer.size()).toBe(2);
  });

  test("push fails closed at the durable 64-item capacity", () => {
    const buffer = createQueuedTurnBuffer();
    for (let index = 0; index < 64; index += 1) {
      expect(buffer.push(`item-${index}`)).not.toBeNull();
    }
    expect(buffer.push("overflow")).toBeNull();
    expect(buffer.size()).toBe(64);
    expect(buffer.list().some((item) => item.text === "overflow")).toBe(false);
  });

  test("remove drops the matching entry only", () => {
    const buffer = createQueuedTurnBuffer();
    const id1 = buffer.push("first");
    const id2 = buffer.push("second");
    buffer.remove(id1);
    expect(buffer.size()).toBe(1);
    expect(buffer.list()).toEqual([{ id: id2, text: "second", status: "queued" }]);
  });

  test("remove with an unknown id is a no-op", () => {
    const buffer = createQueuedTurnBuffer();
    buffer.push("first");
    buffer.remove("not-a-real-id");
    expect(buffer.size()).toBe(1);
  });

  test("drainMerged returns null for an empty queue and does not throw", () => {
    const buffer = createQueuedTurnBuffer();
    expect(buffer.drainMerged()).toBeNull();
    expect(buffer.size()).toBe(0);
  });

  test("drainMerged returns the single text verbatim and clears the queue", () => {
    const buffer = createQueuedTurnBuffer();
    buffer.push("only one");
    expect(buffer.drainMerged()).toBe("only one");
    expect(buffer.size()).toBe(0);
    expect(buffer.list()).toEqual([]);
  });

  test("drainMerged merges multiple queued texts in push order and clears the queue", () => {
    const buffer = createQueuedTurnBuffer();
    buffer.push("first thing");
    buffer.push("second thing");
    const merged = buffer.drainMerged();
    expect(merged).toBe(
      "The user sent several follow-up requests while the previous task was " +
        "running. Address all of them, in order:\n" +
        "1. first thing\n" +
        "2. second thing",
    );
    expect(buffer.size()).toBe(0);
  });

  test("markRelayed flips status on all current items without removing them", () => {
    const buffer = createQueuedTurnBuffer();
    const id1 = buffer.push("first");
    const id2 = buffer.push("second");
    buffer.markRelayed();
    expect(buffer.size()).toBe(2);
    expect(buffer.list()).toEqual([
      { id: id1, text: "first", status: "relayed" },
      { id: id2, text: "second", status: "relayed" },
    ]);
  });

  test("list() returns a snapshot copy, not a live reference", () => {
    const buffer = createQueuedTurnBuffer();
    buffer.push("first");
    const snapshot = buffer.list();
    buffer.push("second");
    expect(snapshot).toHaveLength(1);
    expect(buffer.list()).toHaveLength(2);
  });

  test("hydrates only valid items and returns detached snapshots", () => {
    const buffer = createQueuedTurnBuffer([
      { id: " queue-1 ", text: "first", status: "queued" },
      { id: "queue-1", text: "replacement", status: "relayed" },
      { id: "queue-2", text: "", status: "queued" },
      { id: "queue-3", text: "third", status: "sending" },
    ]);

    expect(buffer.snapshot()).toEqual([
      { id: "queue-1", text: "replacement", status: "relayed" },
    ]);
    const hydrated = buffer.hydrate([
      { id: "queue-4", text: "fourth", status: "queued" },
    ]);
    hydrated[0].text = "mutated";
    expect(buffer.list()).toEqual([
      { id: "queue-4", text: "fourth", status: "queued" },
    ]);
  });
});

describe("buildInterjectionRecord", () => {
  test("builds a fyi record with an id, no answer key", () => {
    const record = buildInterjectionRecord({
      type: "fyi",
      text: "heads up",
      origin: "user",
      ts: 12345,
    });
    expect(typeof record.id).toBe("string");
    expect(record.id.length).toBeGreaterThan(0);
    expect(record).toEqual({
      id: record.id,
      type: "fyi",
      text: "heads up",
      origin: "user",
      ts: 12345,
    });
    expect(record).not.toHaveProperty("answer");
  });

  test("builds a btw record including the answer", () => {
    const record = buildInterjectionRecord({
      type: "btw",
      text: "how's it going?",
      origin: "user",
      answer: "on step 3 of 5",
      ts: 6789,
    });
    expect(record).toEqual({
      id: record.id,
      type: "btw",
      text: "how's it going?",
      origin: "user",
      answer: "on step 3 of 5",
      ts: 6789,
    });
  });

  test("two records built back-to-back have distinct ids", () => {
    const record1 = buildInterjectionRecord({
      type: "fyi",
      text: "one",
      origin: "user",
      ts: 1,
    });
    const record2 = buildInterjectionRecord({
      type: "fyi",
      text: "two",
      origin: "user",
      ts: 2,
    });
    expect(record1.id).not.toBe(record2.id);
  });

  test("ts is passed through verbatim, not generated internally", () => {
    const record = buildInterjectionRecord({
      type: "fyi",
      text: "x",
      origin: "system",
      ts: 42,
    });
    expect(record.ts).toBe(42);
  });
});
