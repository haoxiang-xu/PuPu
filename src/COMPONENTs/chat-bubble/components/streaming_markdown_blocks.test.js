import {
  createStreamingMarkdownAccumulator,
  splitStreamingMarkdown,
} from "./streaming_markdown_blocks";

const joinStable = (snapshot) =>
  snapshot.stableBlocks.map((block) => block.markdown).join("");

const expectRoundTrip = (text) => {
  const snapshot = splitStreamingMarkdown(text);
  expect(`${joinStable(snapshot)}${snapshot.liveText}`).toBe(text);
};

describe("splitStreamingMarkdown", () => {
  test("keeps a long single paragraph as live text", () => {
    const text = "a".repeat(5000);
    const snapshot = splitStreamingMarkdown(text);

    expect(snapshot.stableBlocks).toEqual([]);
    expect(snapshot.liveText).toBe(text);
    expect(snapshot.liveKind).toBe("text");
    expectRoundTrip(text);
  });

  test("promotes a paragraph only after a blank line", () => {
    const text = "First paragraph.\n\nSecond paragraph";
    const snapshot = splitStreamingMarkdown(text);

    expect(joinStable(snapshot)).toBe("First paragraph.\n\n");
    expect(snapshot.liveText).toBe("Second paragraph");
    expectRoundTrip(text);
  });

  test("keeps an unclosed code fence live and promotes it after the closing fence newline", () => {
    const partial = "```js\nconsole.log(1)\n```";
    const partialSnapshot = splitStreamingMarkdown(partial);
    expect(partialSnapshot.stableBlocks).toEqual([]);
    expect(partialSnapshot.liveText).toBe(partial);
    expect(partialSnapshot.liveKind).toBe("code");
    expectRoundTrip(partial);

    const closed = `${partial}\nNext paragraph`;
    const closedSnapshot = splitStreamingMarkdown(closed);
    expect(joinStable(closedSnapshot)).toBe(`${partial}\n`);
    expect(closedSnapshot.liveText).toBe("Next paragraph");
    expect(closedSnapshot.liveKind).toBe("text");
    expectRoundTrip(closed);
  });

  test("keeps lists and quotes live until an empty line", () => {
    const list = "- one\n- two\nstill growing";
    expect(splitStreamingMarkdown(list).stableBlocks).toEqual([]);
    expectRoundTrip(list);

    const quoted = "> one\n> two\n\nnext";
    const quoteSnapshot = splitStreamingMarkdown(quoted);
    expect(joinStable(quoteSnapshot)).toBe("> one\n> two\n\n");
    expect(quoteSnapshot.liveText).toBe("next");
    expectRoundTrip(quoted);
  });
});

describe("createStreamingMarkdownAccumulator", () => {
  test("keeps old stable block identities while appending a new live tail", () => {
    const accumulator = createStreamingMarkdownAccumulator();
    accumulator.append("First paragraph.\n\nSecond");
    const first = accumulator.getSnapshot();
    expect(joinStable(first)).toBe("First paragraph.\n\n");
    expect(first.liveText).toBe("Second");

    accumulator.append(" paragraph");
    const second = accumulator.getSnapshot();
    expect(second.stableBlocks[0]).toBe(first.stableBlocks[0]);
    expect(second.liveText).toBe("Second paragraph");
  });

  test("promotes live text when a safe boundary arrives", () => {
    const accumulator = createStreamingMarkdownAccumulator();
    accumulator.append("First");
    expect(accumulator.getSnapshot().stableBlocks).toEqual([]);

    accumulator.append("\n\nSecond");
    const snapshot = accumulator.getSnapshot();
    expect(joinStable(snapshot)).toBe("First\n\n");
    expect(snapshot.liveText).toBe("Second");
    expect(`${joinStable(snapshot)}${snapshot.liveText}`).toBe(
      "First\n\nSecond",
    );
  });
});
