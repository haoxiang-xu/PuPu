import { act, render } from "@testing-library/react";
import MemoryJobDiscovery from "./memory_job_discovery";
import contextV2Bridge from "../../SERVICEs/bridges/context_v2_bridge";
import page from "../../SERVICEs/runtime_events/fixtures/memory_job_page_ticket349.json";

jest.mock("../../SERVICEs/bridges/context_v2_bridge", () => ({ __esModule: true, default: { listJobs: jest.fn() } }));
const props = { ownerChatId: page.owner_chat_id, messageId: "message", rootRunId: page.jobs[0].run_id };

test("actual Python/IPC producer page exposes only this message's completed job", async () => {
  contextV2Bridge.listJobs.mockResolvedValue(page);
  const onUpdate = jest.fn();
  render(<MemoryJobDiscovery {...props} onUpdate={onUpdate} />);
  await act(async () => {});
  expect(onUpdate).toHaveBeenCalledTimes(1);
  const projection = onUpdate.mock.calls[0][0];
  expect(Object.keys(projection).sort()).toEqual(["messageId", "ownerChatId", "runs"]);
  expect(projection.ownerChatId).toBe(page.owner_chat_id);
  expect(projection.runs).toHaveLength(1);
  expect(projection.runs[0].id).toBe(page.jobs[0].job_id);
  expect(projection.runs[0].status).toBe("completed");
  expect(projection.runs[0].jobRevision).toBe(page.jobs[0].revision);
});
test("another root in the same chat cannot inherit this job", async () => {
  contextV2Bridge.listJobs.mockResolvedValue(page);
  const onUpdate = jest.fn();
  render(<MemoryJobDiscovery {...props} rootRunId="another-run" onUpdate={onUpdate} />);
  await act(async () => {});
  expect(onUpdate.mock.calls[0][0].runs).toEqual([]);
});
test("foreign owner is unavailable and never updates the message", async () => {
  contextV2Bridge.listJobs.mockResolvedValue(page);
  const onUpdate = jest.fn();
  const view = render(<MemoryJobDiscovery {...props} ownerChatId="foreign" onUpdate={onUpdate} />);
  await act(async () => {});
  expect(onUpdate).not.toHaveBeenCalled();
  expect(view.getByRole("status")).toHaveTextContent("Memory organization status unavailable");
});
test("unmount discards late discovery", async () => {
  let finish;
  contextV2Bridge.listJobs.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const onUpdate = jest.fn();
  const view = render(<MemoryJobDiscovery {...props} onUpdate={onUpdate} />);
  view.unmount();
  await act(async () => { finish(page); });
  expect(onUpdate).not.toHaveBeenCalled();
});
