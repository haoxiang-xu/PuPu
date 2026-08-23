/**
 * Memory V2 P0 secret gate — outbox disposition + legacy purge.
 *
 * Two things are locked here:
 *  1. `disposition` is a CLOSED enum on every persisted shape. A hand-edited
 *     or forged localStorage value can never claim an approval, and the
 *     approval survives every clarify <-> FYI <-> queue transition (otherwise
 *     an item the user explicitly approved would be purged as "ungated" on the
 *     next launch).
 *  2. Pre-gate entries whose text looks like a credential are DELETED from
 *     localStorage — not quarantined in place, which would preserve exactly
 *     the exposure the gate exists to remove — and the purge report carries
 *     nothing quotable about the removed text.
 */
import {
  QUEUED_TURN_OUTBOX_STORAGE_KEY,
  QUEUED_TURN_PLAIN_DISPOSITION,
  convertPendingFyiToClarify,
  fallbackPendingClarifyToQueue,
  migratePendingFyiForAttemptToQueue,
  migratePendingFyiToQueue,
  purgeUngatedSecretOutboxEntries,
  readPendingClarifyForChat,
  readPendingFyisForAttempt,
  readQueuedTurnsForAttempt,
  transitionPendingClarifyToPendingFyi,
  writePendingClarify,
  writePendingFyi,
  writeQueuedTurnsForAttempt,
} from "./queued_turn_outbox";
import {
  detectLikelySecretAssignment,
  hasSecretCaptureSyntax,
} from "../PAGEs/chat/hooks/secret_capture";

const SECRET_TEXT = "api_key=abcd1234efgh please";
const looksLikeSecret = (text) =>
  hasSecretCaptureSyntax(text) || detectLikelySecretAssignment(text);

beforeEach(() => {
  window.localStorage.clear();
});

describe("disposition is a closed enum", () => {
  test("only plain_user_approved survives normalization on a queue item", () => {
    writeQueuedTurnsForAttempt({
      chatId: "chat-a",
      attemptId: "attempt-1",
      items: [
        { id: "q1", text: "one", status: "queued", disposition: "quarantined" },
        { id: "q2", text: "two", status: "queued", disposition: "any" },
        {
          id: "q3",
          text: "three",
          status: "queued",
          disposition: QUEUED_TURN_PLAIN_DISPOSITION,
        },
      ],
    });
    const stored = readQueuedTurnsForAttempt("chat-a", "attempt-1");
    expect(stored.items[0].disposition).toBeUndefined();
    expect(stored.items[1].disposition).toBeUndefined();
    expect(stored.items[2].disposition).toBe(QUEUED_TURN_PLAIN_DISPOSITION);
  });

  test("the approval survives clarify -> FYI -> queue", () => {
    writePendingClarify({
      chatId: "chat-a",
      sourceAttemptId: "attempt-1",
      id: "clarify-1",
      text: SECRET_TEXT,
      disposition: QUEUED_TURN_PLAIN_DISPOSITION,
    });
    expect(readPendingClarifyForChat("chat-a").disposition).toBe(
      QUEUED_TURN_PLAIN_DISPOSITION,
    );

    transitionPendingClarifyToPendingFyi({
      chatId: "chat-a",
      clarifyId: "clarify-1",
      attemptId: "attempt-1",
      messageId: "fyi-1",
      requestedChannel: "fyi",
      threadId: "thread-1",
    });
    expect(readPendingFyisForAttempt("chat-a", "attempt-1")[0].disposition).toBe(
      QUEUED_TURN_PLAIN_DISPOSITION,
    );

    migratePendingFyiToQueue({
      chatId: "chat-a",
      attemptId: "attempt-1",
      messageId: "fyi-1",
    });
    expect(
      readQueuedTurnsForAttempt("chat-a", "attempt-1").items[0].disposition,
    ).toBe(QUEUED_TURN_PLAIN_DISPOSITION);
  });

  test("the approval survives FYI -> clarify and clarify -> queue fallback", () => {
    writePendingFyi({
      chatId: "chat-b",
      attemptId: "attempt-2",
      messageId: "fyi-2",
      text: SECRET_TEXT,
      requestedChannel: "btw",
      threadId: "thread-2",
      disposition: QUEUED_TURN_PLAIN_DISPOSITION,
    });
    convertPendingFyiToClarify({
      chatId: "chat-b",
      attemptId: "attempt-2",
      messageId: "fyi-2",
      clarifyId: "clarify-2",
    });
    expect(readPendingClarifyForChat("chat-b").disposition).toBe(
      QUEUED_TURN_PLAIN_DISPOSITION,
    );

    fallbackPendingClarifyToQueue({ chatId: "chat-b", id: "clarify-2" });
    expect(
      readQueuedTurnsForAttempt("chat-b", "attempt-2").items[0].disposition,
    ).toBe(QUEUED_TURN_PLAIN_DISPOSITION);
  });

  test("the approval survives the bulk FYI -> queue migration", () => {
    writePendingFyi({
      chatId: "chat-c",
      attemptId: "attempt-3",
      messageId: "fyi-3",
      text: SECRET_TEXT,
      requestedChannel: "fyi",
      threadId: "thread-3",
      disposition: QUEUED_TURN_PLAIN_DISPOSITION,
    });
    migratePendingFyiForAttemptToQueue("chat-c", "attempt-3");
    expect(
      readQueuedTurnsForAttempt("chat-c", "attempt-3").items[0].disposition,
    ).toBe(QUEUED_TURN_PLAIN_DISPOSITION);
  });
});

describe("purgeUngatedSecretOutboxEntries", () => {
  test("deletes ungated secret queue items and keeps clean siblings", () => {
    writeQueuedTurnsForAttempt({
      chatId: "chat-a",
      attemptId: "attempt-1",
      items: [
        { id: "q1", text: "please summarize the doc", status: "queued" },
        { id: "q2", text: SECRET_TEXT, status: "queued" },
      ],
    });

    const report = purgeUngatedSecretOutboxEntries(looksLikeSecret);
    expect(report.removedQueueItems).toBe(1);
    expect(report.chatIds).toEqual(["chat-a"]);

    const remaining = readQueuedTurnsForAttempt("chat-a", "attempt-1");
    expect(remaining.items.map((item) => item.id)).toEqual(["q1"]);

    // The plaintext is GONE from localStorage entirely — not quarantined.
    const raw = window.localStorage.getItem(QUEUED_TURN_OUTBOX_STORAGE_KEY);
    expect(raw).not.toContain("abcd1234efgh");
  });

  test("keeps an item that carries the plain_user_approved disposition", () => {
    writeQueuedTurnsForAttempt({
      chatId: "chat-a",
      attemptId: "attempt-1",
      items: [
        {
          id: "q1",
          text: SECRET_TEXT,
          status: "queued",
          disposition: QUEUED_TURN_PLAIN_DISPOSITION,
        },
      ],
    });
    const report = purgeUngatedSecretOutboxEntries(looksLikeSecret);
    expect(report.removedQueueItems).toBe(0);
    expect(readQueuedTurnsForAttempt("chat-a", "attempt-1").items).toHaveLength(
      1,
    );
  });

  test("drops the whole queue entry when every item is purged", () => {
    writeQueuedTurnsForAttempt({
      chatId: "chat-a",
      attemptId: "attempt-1",
      items: [{ id: "q1", text: SECRET_TEXT, status: "queued" }],
    });
    purgeUngatedSecretOutboxEntries(looksLikeSecret);
    expect(readQueuedTurnsForAttempt("chat-a", "attempt-1")).toBeNull();
  });

  test("purges pending clarifies and FYIs too", () => {
    writePendingClarify({
      chatId: "chat-b",
      sourceAttemptId: "attempt-2",
      id: "clarify-1",
      text: SECRET_TEXT,
    });
    writePendingFyi({
      chatId: "chat-c",
      attemptId: "attempt-3",
      messageId: "fyi-1",
      text: `{{secret:k}}abcd1234efgh{{/secret}}`,
      requestedChannel: "fyi",
      threadId: "thread-3",
    });

    const report = purgeUngatedSecretOutboxEntries(looksLikeSecret);
    expect(report.removedClarifies).toBe(1);
    expect(report.removedFyis).toBe(1);
    expect(report.chatIds.sort()).toEqual(["chat-b", "chat-c"]);
    expect(readPendingClarifyForChat("chat-b")).toBeNull();
    expect(readPendingFyisForAttempt("chat-c", "attempt-3")).toEqual([]);
  });

  test("the report carries nothing quotable about the removed text", () => {
    writeQueuedTurnsForAttempt({
      chatId: "chat-a",
      attemptId: "attempt-1",
      items: [{ id: "q1", text: SECRET_TEXT, status: "queued" }],
    });
    const report = purgeUngatedSecretOutboxEntries(looksLikeSecret);
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("abcd1234efgh");
    expect(serialized).not.toContain("api_key");
    expect(Object.keys(report).sort()).toEqual([
      "chatIds",
      "removedClarifies",
      "removedFyis",
      "removedQueueItems",
    ]);
  });

  test("a clean outbox is left untouched and reports nothing", () => {
    writeQueuedTurnsForAttempt({
      chatId: "chat-a",
      attemptId: "attempt-1",
      items: [{ id: "q1", text: "summarize this", status: "queued" }],
    });
    const before = window.localStorage.getItem(QUEUED_TURN_OUTBOX_STORAGE_KEY);
    const report = purgeUngatedSecretOutboxEntries(looksLikeSecret);
    expect(report.removedQueueItems).toBe(0);
    expect(report.chatIds).toEqual([]);
    expect(window.localStorage.getItem(QUEUED_TURN_OUTBOX_STORAGE_KEY)).toBe(
      before,
    );
  });

  test("a throwing predicate removes the entry rather than keeping plaintext", () => {
    writeQueuedTurnsForAttempt({
      chatId: "chat-a",
      attemptId: "attempt-1",
      items: [{ id: "q1", text: SECRET_TEXT, status: "queued" }],
    });
    const report = purgeUngatedSecretOutboxEntries(() => {
      throw new Error("boom");
    });
    expect(report.removedQueueItems).toBe(1);
    expect(readQueuedTurnsForAttempt("chat-a", "attempt-1")).toBeNull();
  });

  test("a non-function predicate is a no-op", () => {
    writeQueuedTurnsForAttempt({
      chatId: "chat-a",
      attemptId: "attempt-1",
      items: [{ id: "q1", text: SECRET_TEXT, status: "queued" }],
    });
    expect(purgeUngatedSecretOutboxEntries(null).removedQueueItems).toBe(0);
    expect(
      readQueuedTurnsForAttempt("chat-a", "attempt-1").items,
    ).toHaveLength(1);
  });
});
