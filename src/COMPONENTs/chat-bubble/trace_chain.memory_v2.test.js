import React from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import { StreamingMessageStoreContext } from "./components/streaming_message_store_context";
import TraceChain from "./trace_chain";

const mockIsAvailable = jest.fn(() => true);
const mockReadContent = jest.fn();
const mockListEvents = jest.fn();
const mockListCandidates = jest.fn();
const mockListCandidateReviews = jest.fn();
const mockListPromotions = jest.fn();
const mockListSpaces = jest.fn();
const mockDecideCandidate = jest.fn();
const mockDecideCandidateReview = jest.fn();
const mockDecidePromotion = jest.fn();
const mockParseContextV2ErrorCode = jest.fn((error) => {
  const match = /\[([a-z0-9_]+)\]\s/.exec(error?.message || "");
  return match ? match[1] : null;
});

jest.mock("../../SERVICEs/bridges/context_v2_bridge", () => ({
  __esModule: true,
  parseContextV2ErrorCode: (...args) => mockParseContextV2ErrorCode(...args),
  default: {
    isAvailable: (...args) => mockIsAvailable(...args),
    readContent: (...args) => mockReadContent(...args),
    listEvents: (...args) => mockListEvents(...args),
    listCandidates: (...args) => mockListCandidates(...args),
    listCandidateReviews: (...args) => mockListCandidateReviews(...args),
    listPromotions: (...args) => mockListPromotions(...args),
    listSpaces: (...args) => mockListSpaces(...args),
    decideCandidate: (...args) => mockDecideCandidate(...args),
    decideCandidateReview: (...args) => mockDecideCandidateReview(...args),
    decidePromotion: (...args) => mockDecidePromotion(...args),
  },
}));

jest.mock("../../BUILTIN_COMPONENTs/icon/icon", () => () => null);

const toBase64 = (value) => Buffer.from(value, "utf8").toString("base64");
const bytesToBase64 = (value) => Buffer.from(value).toString("base64");

const renderMemoryTrace = (memoryV2, { chatId = "owner-chat" } = {}) =>
  render(
    <ConfigContext.Provider
      value={{
        theme: { color: "#222", font: { fontFamily: "sans-serif" } },
        onThemeMode: "light_mode",
      }}
    >
      <StreamingMessageStoreContext.Provider
        value={{
          chatId,
          store: null,
          notifyStreamingContentCommitted: jest.fn(),
        }}
      >
        <TraceChain
          frames={[]}
          status="done"
          messageId="assistant-memory-v2"
          bundle={{ memory_v2: memoryV2 }}
        />
      </StreamingMessageStoreContext.Provider>
    </ConfigContext.Provider>,
  );

describe("TraceChain Memory V2 audit", () => {
  beforeEach(() => {
    mockIsAvailable.mockReturnValue(true);
    mockReadContent.mockReset();
    mockListEvents.mockReset().mockResolvedValue({
      owner_chat_id: "owner-chat",
      events: [],
      next_after: 0,
      has_more: false,
    });
    mockListCandidates.mockReset().mockResolvedValue({ candidates: [] });
    mockListCandidateReviews.mockReset().mockResolvedValue({ reviews: [] });
    mockListPromotions.mockReset().mockResolvedValue({ promotions: [] });
    mockListSpaces.mockReset().mockResolvedValue({ spaces: [] });
    mockDecideCandidate.mockReset().mockResolvedValue({ status: "applied" });
    mockDecideCandidateReview
      .mockReset()
      .mockResolvedValue({ status: "applied" });
    mockDecidePromotion.mockReset().mockResolvedValue({ status: "applied" });
    // CRA's jest config sets `resetMocks: true`, which strips the factory
    // implementation of every jest.fn between tests. Re-establishing it here is
    // what makes the parsed error code (and the stale-reload branch that keys
    // off it) actually observable.
    mockParseContextV2ErrorCode.mockReset().mockImplementation((error) => {
      const match = /\[([a-z0-9_]+)\]\s/.exec(error?.message || "");
      return match ? match[1] : null;
    });
  });

  test("renders Context V2 and Memory Agent as collapsed, auditable rows", async () => {
    renderMemoryTrace({
      mode: "active",
      available_input_tokens: 80000,
      predicted_total_tokens: 72000,
      compression_threshold_tokens: 72000,
      compacted: true,
      before_estimated_tokens: 74000,
      after_estimated_tokens: 61000,
      dropped_turn_count: 7,
      source_event_range: {
        first_event_id: "evt-1",
        last_event_id: "evt-77",
        event_count: 77,
      },
      checkpoint_ref: "pupu://context/checkpoint/checkpoint-1",
      memory_agent_run: {
        run_id: "curator-run-1",
        status: "completed",
        trigger_reason: "checkpoint_consolidation",
        provider: "openai",
        model: "gpt-memory",
        model_version: "2026-07",
        consumed_tokens: 300,
        cost_usd: 0.02,
        write_diff: { path: "/task/decisions.md", action: "create" },
        undo_operation_id: "undo-curator-run-1",
        reasoning: "hidden chain must not render",
      },
    });

    expect(screen.getByTestId("memory-v2-trace-title")).toHaveTextContent(
      "Memory V2 · Complete",
    );
    expect(screen.getByText("90% context")).toBeInTheDocument();
    expect(screen.getByTestId("memory-agent-trace-title")).toHaveTextContent(
      "Memory Agent · Completed",
    );
    const [contextDetailButton, memoryAgentDetailButton] = screen.getAllByRole(
      "button",
      { name: "detail" },
    );
    expect(contextDetailButton).toHaveTextContent("detail");
    expect(memoryAgentDetailButton).toHaveTextContent("detail");
    expect(
      screen.queryByText("hidden chain must not render"),
    ).not.toBeInTheDocument();

    fireEvent.click(contextDetailButton);
    expect(contextDetailButton).toHaveTextContent("hide");
    expect(
      await screen.findByText("No pending memory decisions."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("74,000 → 61,000 tokens · 7 closed turns checkpointed"),
    ).toBeInTheDocument();
    expect(screen.getByText("evt-1 → evt-77 · 77 events")).toBeInTheDocument();

    fireEvent.click(memoryAgentDetailButton);
    expect(memoryAgentDetailButton).toHaveTextContent("hide");
    expect(screen.getByText("checkpoint_consolidation")).toBeInTheDocument();
    expect(
      screen.getByText("openai · gpt-memory · v2026-07"),
    ).toBeInTheDocument();
    expect(screen.getByText(/task\/decisions\.md/)).toBeInTheDocument();
    expect(screen.getByText("undo-curator-run-1")).toBeInTheDocument();
  });

  test("reads durable refs through the controlled paginated bridge", async () => {
    mockReadContent
      .mockResolvedValueOnce({
        mime_type: "text/markdown",
        data: toBase64("page one\n"),
        total_bytes: 18,
        next_offset: 9,
      })
      .mockResolvedValueOnce({
        mime_type: "text/markdown",
        data: toBase64("page two"),
        total_bytes: 18,
        next_offset: null,
      });

    renderMemoryTrace({
      mode: "active",
      checkpoint_ref: "pupu://context/checkpoint/checkpoint-1",
    });
    fireEvent.click(screen.getByRole("button", { name: "detail" }));
    fireEvent.click(screen.getByRole("button", { name: "read" }));

    expect(await screen.findByText(/page one/)).toBeInTheDocument();
    expect(mockReadContent).toHaveBeenNthCalledWith(1, {
      ownerChatId: "owner-chat",
      ref: "pupu://context/checkpoint/checkpoint-1",
      offset: 0,
      limit: 32 * 1024,
    });

    fireEvent.click(screen.getByRole("button", { name: /read next page/ }));
    expect(await screen.findByText(/page two/)).toBeInTheDocument();
    expect(mockReadContent).toHaveBeenNthCalledWith(2, {
      ownerChatId: "owner-chat",
      ref: "pupu://context/checkpoint/checkpoint-1",
      offset: 9,
      limit: 32 * 1024,
    });
  });

  test("keeps a selectable ref without offering reads when the bridge is unavailable", () => {
    mockIsAvailable.mockReturnValue(false);
    renderMemoryTrace({
      mode: "active",
      handoff_ref: "pupu://artifact/handoff-1@1",
    });
    fireEvent.click(screen.getByRole("button", { name: "detail" }));

    expect(screen.getByLabelText("handoff reference")).toHaveTextContent(
      "pupu://artifact/handoff-1@1",
    );
    expect(
      screen.queryByRole("button", { name: "read" }),
    ).not.toBeInTheDocument();
  });

  test("does not load pending decisions when the trace has no owner chat", () => {
    renderMemoryTrace({ mode: "active" }, { chatId: "" });
    fireEvent.click(screen.getByRole("button", { name: "detail" }));

    expect(mockListCandidates).not.toHaveBeenCalled();
    expect(mockListCandidateReviews).not.toHaveBeenCalled();
    expect(mockListPromotions).not.toHaveBeenCalled();
    expect(mockListSpaces).not.toHaveBeenCalled();
    expect(mockListEvents).not.toHaveBeenCalled();
    expect(
      screen.queryByTestId("memory-v2-pending-reviews"),
    ).not.toBeInTheDocument();
  });

  test("keeps raw candidates read-only and never offers a Curator bypass", async () => {
    mockListCandidates.mockResolvedValue({
      candidates: [
        {
          candidate_id: "mem_candidate_readonly",
          status: "pending",
          revision: 3,
          target_space_id: "mem_space_chat_1",
          target_path: "/task/decisions.md",
          kind: "file",
          description: "Keep the confirmed architecture decision.",
          rationale: "The user explicitly confirmed it.",
          sensitivity: "normal",
          source_agent_run_id: "run-curator-1",
          source_event_ids: ["evt-10", "evt-11"],
        },
      ],
    });
    mockListSpaces.mockResolvedValue({
      spaces: [{ space_id: "mem_space_chat_1", revision: 9 }],
    });

    renderMemoryTrace({ mode: "active" });
    fireEvent.click(screen.getByRole("button", { name: "detail" }));

    expect(
      await screen.findByText("Awaiting Memory Agent"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Create file at \/task\/decisions\.md/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The Memory Agent curates this proposal before anyone can decide it.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("memory-v2-pending-count")).toHaveTextContent(
      "1 awaiting Memory Agent",
    );

    // The direct-apply path is gone: no button on this card, and the bypassing
    // facade method is never reachable from the review surface.
    expect(
      screen.queryByRole("button", { name: "Add to chat memory" }),
    ).not.toBeInTheDocument();
    within(
      screen.getByTestId("memory-v2-awaiting-candidate"),
    ).queryAllByRole("button").forEach((button) => {
      throw new Error(`unexpected action button: ${button.textContent}`);
    });
    expect(mockDecideCandidate).not.toHaveBeenCalled();
  });

  test("decides a Curator conflict review through the four-fence CAS payload", async () => {
    mockListCandidateReviews.mockResolvedValue({
      ownerChatId: "owner-chat",
      reviews: [
        {
          reviewId: "mem_review_1",
          reviewRef: "pupu://memory/review/mem_review_1@2",
          ownerChatId: "owner-chat",
          jobId: "mem_job_1",
          candidateId: "mem_candidate_1",
          candidateRef: "pupu://memory/candidate/mem_candidate_1@3",
          candidateRevision: 3,
          status: "pending",
          revision: 2,
          target: {
            spaceId: "mem_space_chat_1",
            path: "/task/decisions.md",
            entryId: "mem_entry_1",
            expectedRevision: 4,
          },
          proposed: {
            mode: "overwrite",
            kind: "file",
            description: "Replace the superseded architecture decision.",
            mimeType: "text/markdown",
            sourceEventIds: ["evt-20", "evt-21"],
            content: {
              ref: "pupu://memory/review/mem_review_1@1/proposed",
              mediaType: "text/markdown",
              bytes: 128,
              sha256: "b".repeat(64),
            },
          },
          diffRef: "pupu://memory/review/mem_review_1@1/diff",
          diffPreview:
            "--- before\n+++ after\n-old decision\n+new decision cited from /Users/red/private/notes.md\n",
        },
      ],
    });
    mockListSpaces.mockResolvedValue({
      spaces: [{ space_id: "mem_space_chat_1", revision: 9 }],
    });

    renderMemoryTrace({ mode: "active" });
    fireEvent.click(screen.getByRole("button", { name: "detail" }));

    expect(
      await screen.findByText("Memory conflict review"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Replace the existing entry — file at \/task\/decisions\.md @ r4/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Replace the superseded architecture decision."),
    ).toBeInTheDocument();
    expect(screen.getByText("text/markdown · 128 bytes")).toBeInTheDocument();
    expect(screen.getByText("frozen at r3")).toBeInTheDocument();
    expect(screen.getByText("evt-20, evt-21")).toBeInTheDocument();
    expect(screen.getByTestId("memory-v2-pending-count")).toHaveTextContent(
      "1 to decide",
    );

    // Untrusted diff content is bounded and host paths are scrubbed; no object
    // id, review id or candidate id reaches the DOM.
    const diff = screen.getByTestId("memory-v2-review-diff");
    expect(diff).toHaveTextContent("+new decision cited from [redacted path]");
    expect(
      screen.queryByText(/\/Users\/red\/private\/notes\.md/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/mem_review_1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/mem_candidate_1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/mem_entry_1/)).not.toBeInTheDocument();
    expect(screen.queryByText("b".repeat(64))).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() =>
      expect(mockDecideCandidateReview).toHaveBeenCalledTimes(1),
    );

    expect(mockDecideCandidateReview).toHaveBeenCalledWith({
      ownerChatId: "owner-chat",
      reviewId: "mem_review_1",
      decision: "apply",
      expectedReviewRevision: 2,
      expectedCandidateRevision: 3,
      expectedTargetRevision: 4,
      expectedSpaceRevision: 9,
      decisionReason: "user_trace_review_apply",
      operationId: expect.stringMatching(
        /^memory-review:review:apply:r2:[a-f0-9]{8}$/,
      ),
    });
    expect(mockDecideCandidate).not.toHaveBeenCalled();
  });

  test("reads immutable review diff and proposed content refs page by page", async () => {
    const splitUtf8 = Buffer.from("🧠", "utf8");
    mockReadContent
      .mockResolvedValueOnce({
        mime_type: "application/json",
        data: bytesToBase64(splitUtf8.subarray(0, 2)),
        total_bytes: splitUtf8.length,
        next_offset: 2,
      })
      .mockResolvedValueOnce({
        mime_type: "application/json",
        data: bytesToBase64(splitUtf8.subarray(2)),
        total_bytes: splitUtf8.length,
        next_offset: null,
      })
      .mockResolvedValueOnce({
        mime_type: "text/markdown",
        data: toBase64("durable proposed content"),
        total_bytes: 24,
        next_offset: null,
      });
    mockListCandidateReviews.mockResolvedValue({
      reviews: [
        {
          reviewId: "mem_review_reader",
          reviewRef: "pupu://memory/review/mem_review_reader@1",
          candidateRef: "pupu://memory/candidate/mem_candidate_reader@1",
          candidateRevision: 1,
          status: "pending",
          revision: 1,
          target: {
            spaceId: "mem_space_reader",
            path: "/task/reader.md",
            entryId: "mem_entry_reader",
            expectedRevision: 1,
          },
          proposed: {
            mode: "overwrite",
            kind: "markdown",
            description: "Inspect the complete immutable proposal.",
            sourceEventIds: ["evt-reader"],
            content: {
              ref: "pupu://memory/review/mem_review_reader@1/proposed",
              mediaType: "text/markdown",
              bytes: 24,
              sha256: "c".repeat(64),
            },
          },
          diffRef: "pupu://memory/review/mem_review_reader@1/diff",
          diffPreview: "preview",
        },
      ],
    });
    mockListSpaces.mockResolvedValue({
      spaces: [{ space_id: "mem_space_reader", revision: 2 }],
    });

    renderMemoryTrace({ mode: "active" });
    fireEvent.click(screen.getByRole("button", { name: "detail" }));
    await screen.findByText("Memory conflict review");

    fireEvent.click(screen.getByRole("button", { name: "Read full diff" }));
    await waitFor(() => expect(mockReadContent).toHaveBeenCalledTimes(1));
    expect(mockReadContent).toHaveBeenCalledWith({
      ownerChatId: "owner-chat",
      ref: "pupu://memory/review/mem_review_reader@1/diff",
      offset: 0,
      limit: 32 * 1024,
    });
    await screen.findByRole("button", { name: "Close full diff" });
    fireEvent.click(screen.getByRole("button", { name: "Read next page" }));
    await waitFor(() => expect(mockReadContent).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByTestId("memory-v2-review-content")).toHaveTextContent(
        "🧠",
      ),
    );
    expect(mockReadContent).toHaveBeenNthCalledWith(2, {
      ownerChatId: "owner-chat",
      ref: "pupu://memory/review/mem_review_reader@1/diff",
      offset: 2,
      limit: 32 * 1024,
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Read proposed content" }),
    );
    expect(
      await screen.findByText("durable proposed content"),
    ).toBeInTheDocument();
    expect(mockReadContent).toHaveBeenNthCalledWith(3, {
      ownerChatId: "owner-chat",
      ref: "pupu://memory/review/mem_review_reader@1/proposed",
      offset: 0,
      limit: 32 * 1024,
    });
  });

  test("blocks a review decision when no current target-space revision resolves", async () => {
    mockListCandidateReviews.mockResolvedValue({
      reviews: [
        {
          reviewId: "mem_review_no_space",
          candidateRef: "pupu://memory/candidate/mem_candidate_2@1",
          candidateRevision: 1,
          status: "pending",
          revision: 1,
          target: {
            spaceId: "mem_space_missing",
            path: "/task/decisions.md",
            entryId: "mem_entry_2",
            expectedRevision: 2,
          },
          proposed: { mode: "overwrite", kind: "file", description: "" },
          diffRef: "pupu://memory/review/mem_review_no_space@1/diff",
          diffPreview: "",
        },
      ],
    });
    mockListSpaces.mockResolvedValue({ spaces: [] });

    renderMemoryTrace({ mode: "active" });
    fireEvent.click(screen.getByRole("button", { name: "detail" }));

    expect(
      await screen.findByText(
        "This review has no current target-space revision and cannot be decided yet.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(mockDecideCandidateReview).not.toHaveBeenCalled();
  });

  test("treats an inherited-prototype proposal mode as undecidable", async () => {
    mockListCandidateReviews.mockResolvedValue({
      reviews: [
        {
          reviewId: "mem_review_proto",
          candidateRef: "pupu://memory/candidate/mem_candidate_proto@1",
          candidateRevision: 1,
          status: "pending",
          revision: 1,
          target: {
            spaceId: "mem_space_chat_1",
            path: "/task/decisions.md",
            entryId: "mem_entry_proto",
            expectedRevision: 2,
          },
          // `toString` resolves on Object.prototype; an unguarded lookup would
          // hand a function to JSX and blow up the whole trace row.
          proposed: { mode: "toString", kind: "file", description: "Proto." },
          diffRef: "pupu://memory/review/mem_review_proto@1/diff",
          diffPreview: "",
        },
      ],
    });
    mockListSpaces.mockResolvedValue({
      spaces: [{ space_id: "mem_space_chat_1", revision: 9 }],
    });

    renderMemoryTrace({ mode: "active" });
    fireEvent.click(screen.getByRole("button", { name: "detail" }));

    expect(
      await screen.findByText(
        "This proposal uses a change type this build cannot present, so it cannot be decided here.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Unrecognized change — file/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeDisabled();
    expect(mockDecideCandidateReview).not.toHaveBeenCalled();
  });

  test("reloads the queue when a review decision hits a stale revision", async () => {
    mockListCandidateReviews.mockResolvedValue({
      reviews: [
        {
          reviewId: "mem_review_stale",
          candidateRef: "pupu://memory/candidate/mem_candidate_3@2",
          candidateRevision: 2,
          status: "pending",
          revision: 6,
          target: {
            spaceId: "mem_space_chat_1",
            path: "/task/stale.md",
            entryId: "mem_entry_3",
            expectedRevision: 3,
          },
          proposed: { mode: "overwrite", kind: "file", description: "Stale." },
          diffRef: "pupu://memory/review/mem_review_stale@1/diff",
          diffPreview: "--- before\n+++ after\n",
        },
      ],
    });
    mockListSpaces.mockResolvedValue({
      spaces: [{ space_id: "mem_space_chat_1", revision: 5 }],
    });
    mockDecideCandidateReview.mockRejectedValueOnce(
      new Error("[context_v2_revision_conflict] candidate review revision conflict"),
    );

    renderMemoryTrace({ mode: "active" });
    fireEvent.click(screen.getByRole("button", { name: "detail" }));
    expect(
      await screen.findByText("Memory conflict review"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(mockListCandidateReviews).toHaveBeenCalledTimes(1),
    );

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "context_v2_revision_conflict",
    );
    await waitFor(() =>
      expect(mockListCandidateReviews).toHaveBeenCalledTimes(2),
    );
    expect(mockListCandidateReviews).toHaveBeenLastCalledWith({
      ownerChatId: "owner-chat",
      status: "pending",
      limit: 25,
    });
  });

  test("loads pending decisions only after the Memory V2 row is expanded and keeps promotion CAS revisions", async () => {
    mockListCandidates
      .mockResolvedValueOnce({
        candidates: [
          {
            candidate_id: "mem_candidate_1",
            status: "pending",
            revision: 3,
            target_space_id: "mem_space_chat_1",
            target_path: "/task/decisions.md",
            kind: "file",
            description: "Keep the confirmed architecture decision.",
            rationale: "The user explicitly confirmed it.",
            sensitivity: "normal",
            source_agent_run_id: "run-curator-1",
            source_tool_call_id: "call-memory-propose-1",
            source_event_ids: ["evt-10", "evt-11"],
          },
        ],
      })
      .mockResolvedValue({ candidates: [] });
    mockListPromotions.mockResolvedValue({
      promotions: [
        {
          promotion_id: "mem_promotion_1",
          status: "pending",
          revision: 5,
          source: {
            space_id: "mem_space_chat_1",
            entry_id: "mem_entry_1",
            revision: 2,
            path: "/task/preferences.md",
          },
          target_path: "/preferences/pupu.md",
          target_entry_id: "",
          expected_target_revision: null,
        },
      ],
    });
    mockListSpaces.mockResolvedValue({
      spaces: [{ space_id: "mem_space_chat_1", revision: 9 }],
    });

    renderMemoryTrace({ mode: "active" });

    expect(mockListCandidates).not.toHaveBeenCalled();
    expect(mockListCandidateReviews).not.toHaveBeenCalled();
    expect(mockListPromotions).not.toHaveBeenCalled();
    expect(mockListSpaces).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "detail" }));

    expect(await screen.findByText("Awaiting Memory Agent")).toBeInTheDocument();
    expect(screen.getByText("Long-term promotion")).toBeInTheDocument();
    expect(
      screen.getByText(/Create file at \/task\/decisions\.md/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/run run-curator-1 .* evt-10, evt-11/),
    ).toBeInTheDocument();
    expect(mockListCandidateReviews).toHaveBeenCalledWith({
      ownerChatId: "owner-chat",
      status: "pending",
      limit: 25,
    });

    fireEvent.click(screen.getByRole("button", { name: "Confirm long-term" }));
    await waitFor(() => expect(mockDecidePromotion).toHaveBeenCalledTimes(1));

    expect(mockDecidePromotion).toHaveBeenCalledWith({
      ownerChatId: "owner-chat",
      promotionId: "mem_promotion_1",
      decision: "apply",
      expectedRevision: 5,
      decisionReason: "user_trace_review_apply",
      operationId: expect.stringMatching(
        /^memory-review:promotion:apply:r5:[a-f0-9]{8}$/,
      ),
    });
  });

  test("recovers allowlisted refs and Curator audit from paged canonical events", async () => {
    const artifactRef = "pupu://artifact/artifact-shared@1";
    const handoffRef = "pupu://artifact/handoff-recovered@1";
    const checkpointRef =
      "pupu://context/checkpoint/checkpoint-recovered";
    mockListEvents
      .mockResolvedValueOnce({
        owner_chat_id: "owner-chat",
        events: [
          {
            event_id: "evt-context",
            cursor: 1,
            type: "context.build",
            event: {
              type: "context.build",
              payload: {
                diagnostics: {
                  checkpoint_ref: { checkpoint_ref: checkpointRef },
                  reasoning: "journal reasoning must stay hidden",
                },
              },
            },
          },
          {
            event_id: "evt-artifact",
            cursor: 2,
            type: "artifact.recorded",
            event: {
              type: "artifact.recorded",
              payload: {
                artifact_ref: {
                  uri: artifactRef,
                  media_type: "application/json",
                  bytes: 42,
                  sha256: "a".repeat(64),
                  preview: "artifact payload must stay hidden",
                },
              },
            },
          },
          {
            event_id: "evt-handoff",
            cursor: 3,
            type: "handoff.recorded",
            event: {
              type: "handoff.recorded",
              payload: {
                artifact_ref: {
                  uri: handoffRef,
                  media_type: "application/json",
                  bytes: 84,
                  preview: "child output must stay hidden",
                },
              },
            },
          },
          {
            event_id: "evt-curator-pending",
            cursor: 4,
            type: "memory.curator.pending",
            event: {
              type: "memory.curator.pending",
              run_id: "curator-recovered",
              job_id: "job-recovered",
              status: "Pending",
              trigger: "completed_root_run",
              reason: "curator_worker_not_configured",
              model: { provider: "openai", model_id: "gpt-memory" },
              reasoning: "hidden curator reasoning",
            },
          },
        ],
        next_after: 4,
        has_more: true,
      })
      .mockResolvedValueOnce({
        owner_chat_id: "owner-chat",
        events: [
          {
            event_id: "evt-curator-complete",
            cursor: 5,
            type: "memory.curator.completed",
            event: {
              type: "memory.curator.completed",
              run_id: "curator-recovered",
              job_id: "job-recovered",
              status: "Completed",
              reason: "curation_completed",
              token_usage: 77,
              cost: 0.01,
            },
          },
          {
            event_id: "evt-untrusted-tool",
            cursor: 6,
            type: "tool_result",
            event: {
              type: "tool_result",
              payload: {
                artifact_ref: "pupu://artifact/forged-from-tool@1",
                password: "do-not-render-this-password",
              },
              reasoning: "tool reasoning must stay hidden",
            },
          },
        ],
        next_after: 6,
        has_more: false,
      });

    renderMemoryTrace({
      mode: "active",
      artifact_ref: {
        uri: artifactRef,
        media_type: "application/json",
        bytes: 42,
      },
    });

    expect(mockListEvents).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "detail" }));

    const reload = await screen.findByTestId("memory-v2-journal-reload");
    expect(await within(reload).findByText("Complete")).toBeInTheDocument();
    expect(within(reload).getByText("2 pages · 6 events")).toBeInTheDocument();
    expect(mockListEvents).toHaveBeenNthCalledWith(1, {
      ownerChatId: "owner-chat",
      after: 0,
      limit: 500,
      includePayload: true,
    });
    expect(mockListEvents).toHaveBeenNthCalledWith(2, {
      ownerChatId: "owner-chat",
      after: 4,
      limit: 500,
      includePayload: true,
    });

    expect(screen.getAllByText(artifactRef, { exact: true })).toHaveLength(1);
    expect(screen.getByText(checkpointRef, { exact: true })).toBeInTheDocument();
    expect(screen.getByText(handoffRef, { exact: true })).toBeInTheDocument();
    expect(
      await screen.findByTestId("memory-agent-trace-title"),
    ).toHaveTextContent("Memory Agent · Completed");
    fireEvent.click(screen.getByRole("button", { name: "detail" }));
    expect(screen.getByText("curation_completed")).toBeInTheDocument();
    expect(screen.getByText("77 total")).toBeInTheDocument();
    expect(
      screen.queryByText("artifact payload must stay hidden"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("child output must stay hidden")).not.toBeInTheDocument();
    expect(screen.queryByText("hidden curator reasoning")).not.toBeInTheDocument();
    expect(
      screen.queryByText("do-not-render-this-password"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("pupu://artifact/forged-from-tool@1"),
    ).not.toBeInTheDocument();
  });

  test("keeps bundle refs and marks an empty journal reload unavailable", async () => {
    const checkpointRef = "pupu://context/checkpoint/bundle-checkpoint";
    mockListEvents.mockRejectedValue(
      new Error("[context_v2_unavailable] sidecar unavailable"),
    );

    renderMemoryTrace({ mode: "active", checkpoint_ref: checkpointRef });
    fireEvent.click(screen.getByRole("button", { name: "detail" }));

    const reload = await screen.findByTestId("memory-v2-journal-reload");
    expect(await within(reload).findByText("Unavailable")).toBeInTheDocument();
    expect(
      within(reload).getByText(
        /journal_reload_failed .* context_v2_(?:unavailable|journal_unavailable)/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(checkpointRef, { exact: true })).toBeInTheDocument();
    expect(screen.getByTestId("memory-v2-trace-title")).toHaveTextContent(
      "Memory V2 · Complete",
    );
  });

  test("retains recovered refs and marks a later-page failure partial", async () => {
    const recoveredRef = "pupu://artifact/recovered-before-failure@1";
    mockListEvents
      .mockResolvedValueOnce({
        owner_chat_id: "owner-chat",
        events: [
          {
            event_id: "evt-artifact-before-failure",
            cursor: 1,
            type: "artifact.recorded",
            event: {
              type: "artifact.recorded",
              payload: { artifact_ref: { uri: recoveredRef } },
            },
          },
        ],
        next_after: 1,
        has_more: true,
      })
      .mockRejectedValueOnce(
        new Error("[context_v2_unavailable] connection lost"),
      );

    renderMemoryTrace({ mode: "active" });
    fireEvent.click(screen.getByRole("button", { name: "detail" }));

    const reload = await screen.findByTestId("memory-v2-journal-reload");
    expect(await within(reload).findByText("Partial")).toBeInTheDocument();
    expect(screen.getByText(recoveredRef, { exact: true })).toBeInTheDocument();
    expect(within(reload).getByText("1 page · 1 events")).toBeInTheDocument();
  });

  test("keeps a stable operation id across a conflicted rejection retry", async () => {
    const conflict = new Error(
      "[context_v2_revision_conflict] promotion revision changed",
    );
    mockListPromotions.mockResolvedValue({
      promotions: [
        {
          promotion_id: "mem_promotion_retry",
          status: "pending",
          revision: 4,
          source: {
            entry_id: "mem_entry_retry",
            revision: 1,
            path: "/task/retry.md",
          },
          target_path: "/long-term/retry.md",
        },
      ],
    });
    mockDecidePromotion
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce({ status: "rejected" });

    renderMemoryTrace({ mode: "active" });
    fireEvent.click(screen.getByRole("button", { name: "detail" }));
    expect(await screen.findByText("Long-term promotion")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "context_v2_revision_conflict",
    );

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(mockDecidePromotion).toHaveBeenCalledTimes(2));

    expect(mockDecidePromotion.mock.calls[1][0].operationId).toBe(
      mockDecidePromotion.mock.calls[0][0].operationId,
    );
    expect(mockDecidePromotion.mock.calls[1][0]).toMatchObject({
      decision: "reject",
      expectedRevision: 4,
      decisionReason: "user_trace_review_reject",
    });
  });
});
