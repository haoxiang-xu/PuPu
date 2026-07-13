const fs = require("fs");
const path = require("path");

const HOOK_PATH = path.join(__dirname, "use_chat_stream.js");

/* Source-level contract tests for the interject "queue" channel wiring
 * (steer → queue rename). Same style as use_chat_stream.streaming_chunks:
 * the hook is too heavy to render in jsdom, so we pin the load-bearing
 * source patterns instead. */
describe("use_chat_stream interject queue channel wiring", () => {
  let source;

  beforeAll(() => {
    source = fs.readFileSync(HOOK_PATH, "utf8");
  });

  test("channel resolution reads the registry channel field, never a hardcoded command-name list", () => {
    // the old pattern: ["/btw", "/fyi", "/steer"].includes(...) + slice(1)
    expect(source).not.toMatch(/\[\s*"\/btw"/);
    expect(source).not.toMatch(/\/steer/);
    const handleBlock = source.match(
      /const handleInterject = useCallback\([\s\S]*?\n {2}\);/,
    );
    expect(handleBlock).not.toBeNull();
    expect(handleBlock[0]).toMatch(/\.channel\b/);
    expect(handleBlock[0]).not.toMatch(/slice\(1\)/);
  });

  test("local queue dispatch and wire channel use 'queue'", () => {
    expect(source).toMatch(/channel === "queue"/);
    expect(source).toMatch(/resolvedChannel === "queue"/);
  });

  test("legacy resolved_channel 'steer' from older servers is normalized to 'queue' at exactly one read point", () => {
    const quotedSteer = source.match(/"steer"/g) || [];
    expect(quotedSteer).toHaveLength(1);
    expect(source).toMatch(/=== "steer" \? "queue"/);
  });

  test("queued-turns identifiers replaced the steer ones", () => {
    expect(source).toMatch(/queuedTurnsByChatIdRef/);
    expect(source).toMatch(/onQueueUndo/);
    expect(source).toMatch(/queueItems/);
    expect(source).toMatch(/createQueuedTurnBuffer/);
    expect(source).not.toMatch(/steerQueueByChatIdRef/);
    expect(source).not.toMatch(/onSteerUndo/);
    expect(source).not.toMatch(/steerItems/);
    expect(source).not.toMatch(/createSteerQueue/);
    expect(source).not.toMatch(/pushSteer/);
  });

  test("clarify options offer the queue channel, not steer", () => {
    expect(source).toMatch(/value: "queue"/);
    expect(source).not.toMatch(/value: "steer"/);
  });
});
