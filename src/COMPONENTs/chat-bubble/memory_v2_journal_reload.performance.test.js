import {
  JOURNAL_RELOAD_PAGE_SIZE,
  loadCanonicalMemoryV2Journal,
} from "./memory_v2_journal_reload";

const EVENT_COUNT = 10000;
const SAMPLE_COUNT = 30;
const WARMUP_COUNT = 5;
const ACCEPTANCE_THRESHOLD_MS = 500;
const OWNER_CHAT_ID = "trace-reload-performance-chat";

const canonicalEvent = (index) => {
  const cursor = index + 1;
  if (index % 250 === 0) {
    return {
      event_id: `curator-${cursor}`,
      cursor,
      type: "memory.curator.completed",
      event: {
        type: "memory.curator.completed",
        run_id: `curator-run-${cursor}`,
        status: "completed",
        consumed_tokens: 200 + index,
      },
    };
  }
  if (index % 200 === 0) {
    return {
      event_id: `checkpoint-${cursor}`,
      cursor,
      type: "context.build",
      event: {
        type: "context.build",
        payload: {
          diagnostics: {
            checkpoint_ref: `pupu://context/checkpoint/checkpoint-${cursor}`,
          },
        },
      },
    };
  }
  if (index % 125 === 0) {
    return {
      event_id: `artifact-${cursor}`,
      cursor,
      type: "artifact.recorded",
      event: {
        type: "artifact.recorded",
        payload: {
          artifact_ref: `pupu://artifact/artifact-${cursor}@1`,
        },
      },
    };
  }
  return {
    event_id: `message-${cursor}`,
    cursor,
    type: index % 2 === 0 ? "message.user" : "message.assistant",
    event: {
      type: index % 2 === 0 ? "message.user" : "message.assistant",
      payload: { index, summary: "ignored non-Trace payload" },
    },
  };
};

const CANONICAL_EVENTS = Array.from(
  { length: EVENT_COUNT },
  (_, index) => canonicalEvent(index),
);

const percentileNearestRank = (samples, percentile) => {
  const ordered = [...samples].sort((left, right) => left - right);
  return ordered[Math.max(0, Math.ceil(percentile * ordered.length) - 1)];
};

const createPagedEventReader = () =>
  jest.fn(({ ownerChatId, after, limit }) => {
    if (ownerChatId !== OWNER_CHAT_ID) {
      return Promise.reject(new Error("unexpected owner scope"));
    }
    const start = after;
    const end = Math.min(start + limit, CANONICAL_EVENTS.length);
    return Promise.resolve({
      owner_chat_id: OWNER_CHAT_ID,
      events: CANONICAL_EVENTS.slice(start, end),
      next_after: end,
      has_more: end < CANONICAL_EVENTS.length,
    });
  });

describe("Memory V2 10k-event Trace reload performance", () => {
  test("projects the full canonical journal below the 500ms p95 ceiling", async () => {
    const listEvents = createPagedEventReader();
    let expectedProjection;

    for (let index = 0; index < WARMUP_COUNT; index += 1) {
      const projection = await loadCanonicalMemoryV2Journal({
        ownerChatId: OWNER_CHAT_ID,
        listEvents,
      });
      expectedProjection = expectedProjection || projection;
      expect(projection).toEqual(expectedProjection);
    }

    listEvents.mockClear();
    const samples = [];
    for (let index = 0; index < SAMPLE_COUNT; index += 1) {
      const started = performance.now();
      const projection = await loadCanonicalMemoryV2Journal({
        ownerChatId: OWNER_CHAT_ID,
        listEvents,
      });
      samples.push(performance.now() - started);
      expect(projection).toEqual(expectedProjection);
    }

    const p95 = percentileNearestRank(samples, 0.95);
    expect(expectedProjection).toMatchObject({
      status: "Complete",
      pagesRead: EVENT_COUNT / JOURNAL_RELOAD_PAGE_SIZE,
      eventsScanned: EVENT_COUNT,
    });
    expect(expectedProjection.refs.length).toBeGreaterThan(0);
    expect(expectedProjection.agentRuns.length).toBeGreaterThan(0);
    expect(listEvents).toHaveBeenCalledTimes(
      SAMPLE_COUNT * (EVENT_COUNT / JOURNAL_RELOAD_PAGE_SIZE),
    );

    if (process.env.PUPU_PERF_VERBOSE === "1") {
      // This opt-in line is the machine-readable evidence emitted in focused runs.
      // eslint-disable-next-line no-console
      console.info(
        JSON.stringify({
          benchmark: "memory_v2_frontend_trace_projection_10k",
          events: EVENT_COUNT,
          pages: EVENT_COUNT / JOURNAL_RELOAD_PAGE_SIZE,
          samples: SAMPLE_COUNT,
          warmups: WARMUP_COUNT,
          p95_ms: Number(p95.toFixed(3)),
          minimum_ms: Number(Math.min(...samples).toFixed(3)),
          maximum_ms: Number(Math.max(...samples).toFixed(3)),
          threshold_ms: ACCEPTANCE_THRESHOLD_MS,
        }),
      );
    }

    expect(p95).toBeLessThan(ACCEPTANCE_THRESHOLD_MS);
  });
});
