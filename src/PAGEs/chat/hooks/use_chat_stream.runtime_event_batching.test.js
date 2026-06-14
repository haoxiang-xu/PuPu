const fs = require("fs");
const path = require("path");

const HOOK_PATH = path.join(__dirname, "use_chat_stream.js");

describe("use_chat_stream runtime event batching", () => {
  let source;

  beforeAll(() => {
    source = fs.readFileSync(HOOK_PATH, "utf8");
  });

  test("imports the runtime event batcher helper", () => {
    expect(source).toMatch(/createRuntimeEventBatcher/);
    expect(source).toMatch(/\.\/runtime_event_batcher/);
  });

  test("V4 stream path enables runtime event batching while V3 remains unbatched", () => {
    expect(source).toMatch(/RUNTIME_EVENT_BATCH_FLUSH_MS\s*=\s*64/);
    expect(source).toMatch(/batchRuntimeEvents:\s*true/);
    expect(source).toMatch(/batchRuntimeEvents:\s*false/);
    expect(source).toMatch(/batchFlushMs:\s*RUNTIME_EVENT_BATCH_FLUSH_MS/);

    const v4Branch = source.match(
      /if \(shouldUseRuntimeEventsV4\)[\s\S]*?startStream:\s*api\.unchain\.startStreamV4[\s\S]*?\}\);/,
    );
    const v3Branch = source.match(
      /if \(!shouldUseRuntimeEventsV3\)[\s\S]*?return api\.unchain\.startStreamV2\(payload, handlers\);\s*\}\s*return startRuntimeEventStream\(\{[\s\S]*?startStream:\s*api\.unchain\.startStreamV3[\s\S]*?\}\);/,
    );

    expect(v4Branch?.[0]).toMatch(/batchRuntimeEvents:\s*true/);
    expect(v4Branch?.[0]).toMatch(/batchFlushMs:\s*RUNTIME_EVENT_BATCH_FLUSH_MS/);
    expect(v3Branch?.[0]).toMatch(/batchRuntimeEvents:\s*false/);
    expect(v3Branch?.[0]).not.toMatch(/batchFlushMs/);
  });

  test("batched runtime event flush appends many events before one reduce pass", () => {
    const flushBatch = source.match(
      /const flushRuntimeEventBatch[\s\S]*?return dispatchRuntimeEventEffects\(effects\);/,
    );
    expect(flushBatch).not.toBeNull();
    expect(flushBatch[0]).toMatch(/runtimeEventStore\.appendMany\(events\)/);
    expect(flushBatch[0]).toMatch(/flushRuntimeEventEffects\(\)/);
  });

  test("done and error synchronously flush pending runtime events before handlers", () => {
    const onDone = source.match(/onDone: \(done\) => \{[\s\S]*?handlers\.onDone\?\.\(donePayload\);/);
    const onError = source.match(/onError: \(error\) => \{[\s\S]*?handlers\.onError\?\.\(error\);/);

    expect(onDone).not.toBeNull();
    expect(onError).not.toBeNull();
    expect(onDone[0]).toMatch(/runtimeEventBatcher\?\.flushNow\(\)/);
    expect(onDone[0].indexOf("runtimeEventBatcher?.flushNow()")).toBeLessThan(
      onDone[0].indexOf("adaptTree(runtimeEventActivityTree)"),
    );
    expect(onError[0]).toMatch(/runtimeEventBatcher\?\.flushNow\(\)/);
    expect(onError[0].indexOf("runtimeEventBatcher?.flushNow()")).toBeLessThan(
      onError[0].indexOf("handlers.onError?.(error)"),
    );
  });
});
