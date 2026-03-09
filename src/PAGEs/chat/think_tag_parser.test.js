import { createThinkTagParser } from "./think_tag_parser";

describe("createThinkTagParser", () => {
  let contentChunks;
  let thinkingChunks;
  let thinkEndCount;
  let parser;

  const buildParser = () =>
    createThinkTagParser({
      onContent: (t) => contentChunks.push(t),
      onThinking: (t) => thinkingChunks.push(t),
      onThinkEnd: () => {
        thinkEndCount += 1;
      },
    });

  beforeEach(() => {
    contentChunks = [];
    thinkingChunks = [];
    thinkEndCount = 0;
    parser = buildParser();
  });

  const content = () => contentChunks.join("");
  const thinking = () => thinkingChunks.join("");

  it("passes through plain text with no tags", () => {
    parser.feed("Hello world");
    parser.flush();
    expect(content()).toBe("Hello world");
    expect(thinking()).toBe("");
  });

  it("routes <think> content to onThinking", () => {
    parser.feed("<think>I need to reason</think>The answer is 42");
    parser.flush();
    expect(thinking()).toBe("I need to reason");
    expect(content()).toBe("The answer is 42");
    expect(thinkEndCount).toBe(1);
  });

  it("handles tags split across multiple tokens", () => {
    parser.feed("<thi");
    parser.feed("nk>");
    parser.feed("reasoning here");
    parser.feed("</th");
    parser.feed("ink>");
    parser.feed("answer");
    parser.flush();
    expect(thinking()).toBe("reasoning here");
    expect(content()).toBe("answer");
    expect(thinkEndCount).toBe(1);
  });

  it("handles single-character token stream", () => {
    const text = "<think>abc</think>xyz";
    for (const ch of text) {
      parser.feed(ch);
    }
    parser.flush();
    expect(thinking()).toBe("abc");
    expect(content()).toBe("xyz");
  });

  it("handles multiple <think> blocks", () => {
    parser.feed("<think>first</think>mid<think>second</think>end");
    parser.flush();
    expect(thinking()).toBe("firstsecond");
    expect(content()).toBe("midend");
    expect(thinkEndCount).toBe(2);
  });

  it("flushes unclosed <think> as thinking on flush()", () => {
    parser.feed("<think>unclosed reasoning");
    parser.flush();
    expect(thinking()).toBe("unclosed reasoning");
    expect(content()).toBe("");
  });

  it("handles < that is NOT part of a think tag", () => {
    parser.feed("a < b and c > d");
    parser.flush();
    expect(content()).toBe("a < b and c > d");
    expect(thinking()).toBe("");
  });

  it("handles <th followed by non-think characters", () => {
    parser.feed("<th>not a tag");
    parser.flush();
    expect(content()).toBe("<th>not a tag");
    expect(thinking()).toBe("");
  });

  it("handles partial tag at end without flush", () => {
    parser.feed("hello<thi");
    // Without flush, the partial tag is held in buffer
    expect(content()).toBe("hello");
    // After flush, the pending buffer is emitted as content
    parser.flush();
    expect(content()).toBe("hello<thi");
  });

  it("handles </think> outside of any <think> as plain content", () => {
    // When not inside a think block, </think> prefix won't match
    // because isPrefixOfExpectedTag checks for <think> when outside.
    parser.feed("</think>");
    parser.flush();
    expect(content()).toBe("</think>");
    expect(thinking()).toBe("");
  });

  it("empty feed does nothing", () => {
    parser.feed("");
    parser.feed(null);
    parser.feed(undefined);
    parser.flush();
    expect(content()).toBe("");
    expect(thinking()).toBe("");
  });

  it("reset() clears state", () => {
    parser.feed("<think>partial");
    parser.reset();
    parser.feed("clean text");
    parser.flush();
    expect(content()).toBe("clean text");
  });

  it("isInsideThink() tracks state correctly", () => {
    expect(parser.isInsideThink()).toBe(false);
    parser.feed("<think>");
    expect(parser.isInsideThink()).toBe(true);
    parser.feed("reasoning");
    expect(parser.isInsideThink()).toBe(true);
    parser.feed("</think>");
    expect(parser.isInsideThink()).toBe(false);
  });

  it("handles <think> immediately followed by </think>", () => {
    parser.feed("<think></think>content");
    parser.flush();
    expect(thinking()).toBe("");
    expect(content()).toBe("content");
    expect(thinkEndCount).toBe(1);
  });

  it("handles angle bracket inside thinking that is not a close tag", () => {
    parser.feed("<think>a < b means something</think>done");
    parser.flush();
    expect(thinking()).toBe("a < b means something");
    expect(content()).toBe("done");
  });
});
