import {
  JOURNAL_RELOAD_MAX_PAGES,
  JOURNAL_RELOAD_PAGE_SIZE,
  loadCanonicalMemoryV2Journal,
  mergeMemoryV2AuditWithJournal,
} from "./memory_v2_journal_reload";

describe("Memory V2 canonical journal reload bounds", () => {
  test("stops at the strict page ceiling and reports a partial projection", async () => {
    const listEvents = jest.fn(({ after }) =>
      Promise.resolve({
        owner_chat_id: "owner-chat",
        events: [
          {
            event_id: `evt-${after + 1}`,
            cursor: after + 1,
            type: "message.user",
            event: {
              type: "message.user",
              content: "must never enter the projection",
            },
          },
        ],
        next_after: after + 1,
        has_more: true,
      }),
    );

    const projection = await loadCanonicalMemoryV2Journal({
      ownerChatId: "owner-chat",
      listEvents,
    });

    expect(listEvents).toHaveBeenCalledTimes(JOURNAL_RELOAD_MAX_PAGES);
    expect(listEvents).toHaveBeenNthCalledWith(1, {
      ownerChatId: "owner-chat",
      after: 0,
      limit: JOURNAL_RELOAD_PAGE_SIZE,
      includePayload: true,
    });
    expect(projection).toMatchObject({
      status: "Partial",
      reason: "journal_reload_limit_reached",
      pagesRead: JOURNAL_RELOAD_MAX_PAGES,
      eventsScanned: JOURNAL_RELOAD_MAX_PAGES,
      refs: [],
      agentRuns: [],
    });
    expect(JSON.stringify(projection)).not.toContain(
      "must never enter the projection",
    );
  });

  test("rejects an invalid owner without touching the bridge", async () => {
    const listEvents = jest.fn();

    const projection = await loadCanonicalMemoryV2Journal({
      ownerChatId: "../other-chat",
      listEvents,
    });

    expect(listEvents).not.toHaveBeenCalled();
    expect(projection).toMatchObject({
      status: "Unavailable",
      reason: "journal_reload_unavailable",
      eventsScanned: 0,
    });
  });

  test("never accepts more than one bounded page from a response", async () => {
    const listEvents = jest.fn(() =>
      Promise.resolve({
        owner_chat_id: "owner-chat",
        events: Array.from({ length: JOURNAL_RELOAD_PAGE_SIZE + 20 }, (_, index) => ({
          event_id: `evt-overflow-${index}`,
          cursor: index + 1,
          type: "message.user",
          event: { type: "message.user", content: "not projected" },
        })),
        next_after: JOURNAL_RELOAD_PAGE_SIZE + 20,
        has_more: false,
      }),
    );

    const projection = await loadCanonicalMemoryV2Journal({
      ownerChatId: "owner-chat",
      listEvents,
    });

    expect(listEvents).toHaveBeenCalledTimes(1);
    expect(projection).toMatchObject({
      status: "Partial",
      reason: "journal_reload_limit_reached",
      pagesRead: 1,
      eventsScanned: JOURNAL_RELOAD_PAGE_SIZE,
    });
  });

  test("recovers only allowlisted checkpoint refs from context build diagnostics", async () => {
    const checkpointRef = "pupu://context/checkpoint/cp-restart-1";
    const listEvents = jest.fn(() =>
      Promise.resolve({
        owner_chat_id: "owner-chat",
        events: [
          {
            event_id: "evt-context-build",
            cursor: 1,
            type: "context.build",
            event: {
              type: "context.build",
              payload: {
                diagnostics: {
                  checkpoint_refs: [checkpointRef],
                  content: "must never enter the projection",
                  reasoning: "must never enter the projection",
                },
              },
            },
          },
        ],
        next_after: 1,
        has_more: false,
      }),
    );

    const projection = await loadCanonicalMemoryV2Journal({
      ownerChatId: "owner-chat",
      listEvents,
    });

    expect(projection).toMatchObject({
      status: "Complete",
      eventsScanned: 1,
      refs: [{ kind: "checkpoint", ref: checkpointRef }],
      agentRuns: [],
    });
    expect(JSON.stringify(projection)).not.toContain(
      "must never enter the projection",
    );
  });

  test("deduplicates bundle state without downgrading a terminal Curator run", () => {
    const artifactRef = "pupu://artifact/shared@1";
    const merged = mergeMemoryV2AuditWithJournal(
      {
        refs: [{ kind: "artifact", ref: artifactRef, bytes: 10 }],
        agentRuns: [
          {
            id: "curator-run",
            status: "Completed",
            consumedTokens: 90,
            cost: 0.02,
            refs: [],
          },
        ],
      },
      {
        status: "Partial",
        refs: [{ kind: "artifact", ref: artifactRef, bytes: 20 }],
        agentRuns: [
          {
            id: "curator-run",
            status: "Pending",
            consumedTokens: 0,
            cost: 0,
            refs: [],
          },
        ],
      },
    );

    expect(merged.refs).toEqual([
      { kind: "artifact", ref: artifactRef, bytes: 10 },
    ]);
    expect(merged.agentRuns).toEqual([
      expect.objectContaining({
        id: "curator-run",
        status: "Completed",
        consumedTokens: 90,
        cost: 0.02,
      }),
    ]);
  });
});
