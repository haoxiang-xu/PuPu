const fs = require("fs");
const path = require("path");

const HOOK_PATH = path.join(__dirname, "use_chat_stream.js");

describe("use_chat_stream external streaming text wiring", () => {
  let source;

  beforeAll(() => {
    source = fs.readFileSync(HOOK_PATH, "utf8");
  });

  test("token flush appends to the external streaming message store instead of syncing React messages", () => {
    expect(source).toMatch(/activeStreamingMessageStore/);
    expect(source).toMatch(/activeStreamingMessageStore\.append\(\{\s*chatId:\s*targetChatId/);

    const tokenFlush = source.match(
      /const flushBufferedTokenDelta = \(\) => \{[\s\S]*?bufferedTokenDelta = "";[\s\S]*?\};/,
    );
    expect(tokenFlush).not.toBeNull();
    expect(tokenFlush[0]).toMatch(/activeStreamingMessageStore\.append\(/);
    expect(tokenFlush[0]).not.toMatch(/syncStreamMessages\(/);
    expect(tokenFlush[0]).not.toMatch(/appendStreamingMessageDelta\(/);
  });

  test("done materializes external streaming text before finalizing persisted content", () => {
    expect(source).toMatch(/materializeStreamingMessages/);

    const doneBlock = source.match(
      /onDone: \(done\) => \{[\s\S]*?finalizeStreamPersist\(/,
    );
    expect(doneBlock).not.toBeNull();
    expect(doneBlock[0]).toMatch(/flushStreamingMessageStore\(/);
    expect(doneBlock[0]).toMatch(/materializeStreamingMessages\(/);
    expect(doneBlock[0]).toMatch(/finalizeStreamingMessage\(/);
  });
});
