const fs = require("fs");
const path = require("path");

const HOOK_PATH = path.join(__dirname, "use_chat_stream.js");

describe("use_chat_stream streaming chunks wiring", () => {
  let source;

  beforeAll(() => {
    source = fs.readFileSync(HOOK_PATH, "utf8");
  });

  test("token flush appends transient streaming chunks instead of growing content", () => {
    expect(source).toMatch(/appendStreamingMessageDelta/);
    expect(source).toMatch(/streaming_message_chunks/);

    const tokenFlush = source.match(
      /const flushBufferedTokenDelta = \(\) => \{[\s\S]*?syncStreamMessages\(nextStreamMessages\);[\s\S]*?\};/,
    );
    expect(tokenFlush).not.toBeNull();
    expect(tokenFlush[0]).toMatch(/appendStreamingMessageDelta\(/);
    expect(tokenFlush[0]).not.toMatch(/content:\s*`\$\{typeof message\.content/);
  });

  test("done finalizes transient chunks into persisted content", () => {
    expect(source).toMatch(/finalizeStreamingMessage/);

    const doneBlock = source.match(
      /onDone: \(done\) => \{[\s\S]*?finalizeStreamPersist\(/,
    );
    expect(doneBlock).not.toBeNull();
    expect(doneBlock[0]).toMatch(/finalizeStreamingMessage\(/);
  });
});
