import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import { StreamingMessageStoreContext } from "./components/streaming_message_store_context";
import TraceChain from "./trace_chain";
import bridge from "../../SERVICEs/bridges/context_v2_bridge";
import producerPage from "../../SERVICEs/runtime_events/fixtures/memory_job_page_ticket349.json";

jest.mock("../../SERVICEs/bridges/context_v2_bridge", () => ({
  __esModule: true,
  parseContextV2ErrorCode: () => null,
  default: {
    isAvailable: () => true,
    listJobs: jest.fn(),
    listEvents: jest.fn(),
    listCandidates: jest.fn(),
    listCandidateReviews: jest.fn(),
    listPromotions: jest.fn(),
    listSpaces: jest.fn(),
  },
}));

jest.mock("../../BUILTIN_COMPONENTs/icon/icon", () => () => null);

const owner = producerPage.owner_chat_id;
const root = producerPage.jobs[0].run_id;
const jobPage = (status, revision) => ({
  ...producerPage,
  jobs: [{ ...producerPage.jobs[0], status, revision }],
});

const renderTrace = (memory = {}, ownerChatId = owner, rootRunId = root) =>
  render(
    <ConfigContext.Provider
      value={{
        theme: { color: "#222", font: { fontFamily: "sans-serif" } },
        onThemeMode: "light_mode",
      }}
    >
      <StreamingMessageStoreContext.Provider
        value={{
          chatId: ownerChatId,
          store: null,
          notifyStreamingContentCommitted: jest.fn(),
        }}
      >
        <TraceChain
          frames={[]}
          status="done"
          messageId="assistant-memory-v2"
          bundle={{ identity: { root_run_id: rootRunId } }}
          completionDiagnostics={{
            schema: "pupu.completion_diagnostics.v1",
            memory_v2: { mode: "active", ...memory },
          }}
        />
      </StreamingMessageStoreContext.Provider>
    </ConfigContext.Provider>,
  );

beforeEach(() => {
  bridge.listEvents.mockResolvedValue({
    owner_chat_id: owner,
    events: [],
    next_after: 0,
    has_more: false,
  });
  bridge.listCandidates.mockResolvedValue({ candidates: [] });
  bridge.listCandidateReviews.mockResolvedValue({ reviews: [] });
  bridge.listPromotions.mockResolvedValue({ promotions: [] });
  bridge.listSpaces.mockResolvedValue({ spaces: [] });
});

test("a late discovery page cannot regress the same job after polling reached completed", async () => {
  let finishPoll;
  let finishDiscovery;
  bridge.listJobs
    .mockResolvedValueOnce(jobPage("pending", 1))
    .mockImplementationOnce(
      () => new Promise((resolve) => { finishPoll = resolve; }),
    )
    .mockImplementationOnce(
      () => new Promise((resolve) => { finishDiscovery = resolve; }),
    );

  renderTrace();
  fireEvent.click(screen.getByRole("button", { name: "detail" }));
  await act(async () => {});
  expect(screen.getByTestId("memory-agent-trace-title")).toHaveTextContent(
    "Memory organization queued",
  );

  fireEvent.click(screen.getByRole("button", { name: "detail" }));
  fireEvent.click(screen.getAllByRole("button", { name: "hide" })[0]);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 500));
  });
  fireEvent.click(screen.getByRole("button", { name: "detail" }));
  expect(bridge.listJobs).toHaveBeenCalledTimes(3);

  await act(async () => { finishPoll(jobPage("completed", 3)); });
  expect(screen.getByTestId("memory-agent-trace-title")).toHaveTextContent(
    "Memories organized",
  );

  await act(async () => { finishDiscovery(jobPage("leased", 2)); });
  expect(screen.getByTestId("memory-agent-trace-title")).toHaveTextContent(
    "Memories organized",
  );
});

test("a completed legacy job refreshes its pending foreground snapshot exactly once", async () => {
  const foreground = {
    status: "Pending",
    enqueue_status: "Enqueued",
    reason: "memory_background_queued",
    trigger: "completed_root_run",
    lifecycle: "normal",
    run_id: "attempt_complete",
    job_id: "mem_job_409f8c0806b442adaf6d058bdf6d2d70",
    provider: "openai",
    model_id: "gpt-5",
    worker_status: "Pending",
    consumed_tokens: 0,
    cost_usd: 0,
  };
  const duplicateResume = { ...foreground, lifecycle: "resume" };
  const completedPage = {
    owner_chat_id: "chat_a",
    jobs: [
      {
        job_id: foreground.job_id,
        owner_chat_id: "chat_a",
        session_id: "session_a",
        attempt_id: foreground.run_id,
        job_type: "memory_curator",
        payload: {
          trigger: {
            kind: "completed_root_run",
            run_id: foreground.run_id,
          },
        },
        status: "completed",
        revision: 3,
      },
    ],
  };
  bridge.listJobs.mockResolvedValue(completedPage);

  renderTrace(
    { memory_agent_runs: [foreground, duplicateResume] },
    completedPage.owner_chat_id,
    foreground.run_id,
  );

  expect(screen.getAllByTestId("memory-agent-trace-title")).toHaveLength(1);
  expect(screen.getByTestId("memory-agent-trace-title")).toHaveTextContent(
    "Memory organization queued",
  );

  fireEvent.click(screen.getAllByRole("button", { name: "detail" })[1]);
  await act(async () => {});

  expect(screen.getByTestId("memory-agent-trace-title")).toHaveTextContent(
    "Memories organized",
  );
  expect(
    within(screen.getByTestId("memory-agent-audit")).getAllByText(
      foreground.job_id,
    ),
  ).toHaveLength(1);
});
