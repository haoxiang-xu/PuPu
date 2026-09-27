import { act, render } from "@testing-library/react";
import MemoryAgentLiveDetails from "./memory_agent_live_details";
import contextV2Bridge from "../../SERVICEs/bridges/context_v2_bridge";

jest.mock("../../SERVICEs/bridges/context_v2_bridge", () => ({ __esModule: true, default: { listJobs: jest.fn() } }));
jest.mock("./memory_v2_trace_audit", () => ({ MemoryAgentAudit: ({ runs }) => <div>{runs.map((r) => r.status).join(",")}</div> }));
const runs = [{ id: "job", status: "Pending" }];
const page = (status, revision = 1) => ({ owner_chat_id: "chat", jobs: [{ job_id: "job", run_id: "run", owner_chat_id: "chat", status, revision }] });
beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });

test("expanded details refresh pending jobs and stop after completion", async () => {
  contextV2Bridge.listJobs.mockResolvedValueOnce(page("pending")).mockResolvedValueOnce(page("completed", 2));
  const onUpdate = jest.fn();
  const view = render(<MemoryAgentLiveDetails runs={runs} ownerChatId="chat" messageId="msg" onUpdate={onUpdate} />);
  await act(async () => {});
  expect(contextV2Bridge.listJobs).toHaveBeenCalledWith({ ownerChatId: "chat", limit: 100 });
  await act(async () => { jest.advanceTimersByTime(2000); });
  expect(view.getByText("completed")).toBeInTheDocument();
  await act(async () => { jest.advanceTimersByTime(10000); });
  expect(contextV2Bridge.listJobs).toHaveBeenCalledTimes(2);
  expect(onUpdate.mock.calls[1][0]).toMatchObject({ ownerChatId: "chat", messageId: "msg", runs: [{ status: "completed" }] });
});
test("a rejected stale lowercase page keeps polling a title-cased pending run", async () => {
  contextV2Bridge.listJobs
    .mockResolvedValueOnce(page("pending", 2))
    .mockResolvedValueOnce(page("completed", 4));
  const current = [{
    id: "job",
    jobId: "job",
    runId: "run",
    status: "Pending",
    jobRevision: 3,
  }];
  const view = render(
    <MemoryAgentLiveDetails
      runs={current}
      ownerChatId="chat"
      messageId="msg"
    />,
  );

  await act(async () => {});
  expect(contextV2Bridge.listJobs).toHaveBeenCalledTimes(1);
  expect(view.getByText("Pending")).toBeInTheDocument();

  await act(async () => { jest.advanceTimersByTime(2000); });
  expect(contextV2Bridge.listJobs).toHaveBeenCalledTimes(2);
  expect(view.getByText("completed")).toBeInTheDocument();
});
test("unmount discards a late response and stops polling", async () => {
  let resolve;
  contextV2Bridge.listJobs.mockImplementation(() => new Promise((done) => { resolve = done; }));
  const onUpdate = jest.fn();
  const view = render(<MemoryAgentLiveDetails runs={runs} ownerChatId="chat" messageId="msg" onUpdate={onUpdate} />);
  view.unmount();
  await act(async () => { resolve(page("completed")); });
  expect(onUpdate).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(10000); });
  expect(contextV2Bridge.listJobs).toHaveBeenCalledTimes(1);
});
test("a stale in-flight page cannot regress newer terminal props", async () => {
  let resolve;
  contextV2Bridge.listJobs.mockImplementation(
    () => new Promise((done) => { resolve = done; }),
  );
  const onUpdate = jest.fn();
  const view = render(
    <MemoryAgentLiveDetails
      runs={[{ ...runs[0], jobId: "job", runId: "run", jobRevision: 1 }]}
      ownerChatId="chat"
      messageId="msg"
      onUpdate={onUpdate}
    />,
  );
  view.rerender(
    <MemoryAgentLiveDetails
      runs={[
        {
          ...runs[0],
          jobId: "job",
          runId: "run",
          status: "completed",
          jobRevision: 3,
        },
      ]}
      ownerChatId="chat"
      messageId="msg"
      onUpdate={onUpdate}
    />,
  );
  await act(async () => { resolve(page("leased", 2)); });
  expect(view.getByText("completed")).toBeInTheDocument();
  expect(onUpdate.mock.calls[0][0].runs[0]).toMatchObject({
    status: "completed",
    jobRevision: 3,
  });
});
test("failed reads show unavailable and do not retry indefinitely", async () => {
  contextV2Bridge.listJobs.mockRejectedValue(new Error("deleted"));
  const view = render(<MemoryAgentLiveDetails runs={runs} ownerChatId="chat" messageId="msg" />);
  await act(async () => {});
  expect(view.getByText("Unavailable")).toBeInTheDocument();
  await act(async () => { jest.advanceTimersByTime(10000); });
  expect(contextV2Bridge.listJobs).toHaveBeenCalledTimes(1);
});
