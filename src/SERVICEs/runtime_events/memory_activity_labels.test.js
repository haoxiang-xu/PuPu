import { conversationActivity, organizationActivity, applyMemoryJobStatuses } from "./memory_activity_labels";
import en from "../../locales/en.json";
import zh from "../../locales/zh-CN.json";

const translate = (messages) => (key) => messages.memory_activity[key.split(".")[1]];

test("known activity states have truthful English and Chinese labels", () => {
  expect(conversationActivity({ status: "Complete" }, translate(en))).toBe("Conversation ready");
  expect(conversationActivity({ status: "Unavailable" }, translate(zh))).toBe("无法获取对话状态");
  expect(conversationActivity({ status: "Partial" }, translate(zh))).toBe("对话准备未完成");
  expect(organizationActivity([{ status: "Pending" }], translate(zh))).toBe("等待整理记忆");
  expect(organizationActivity([{ status: "leased" }], translate(en))).toBe("Organizing memories…");
  expect(organizationActivity([{ status: "completed" }, { status: "failed" }], translate(en))).toBe("Memory organization failed");
  expect(organizationActivity([{ status: "future_secret_status" }], translate(en))).toBe("Memory organization status unavailable");
  expect(organizationActivity([{ status: "noop" }], translate(en))).toBe("No memories to organize");
});

const run = { id: "job-1", status: "Pending" };
const job = { job_id: "job-1", run_id: "run-1", owner_chat_id: "chat-1", revision: 2, status: "completed" };
const page = (jobs = [job]) => ({ owner_chat_id: "chat-1", jobs });
test("job refresh binds owner and exact identity without changing the original run", () => {
  expect(applyMemoryJobStatuses([run], page(), "chat-1")[0]).toEqual({ ...run, status: "completed", jobRevision: 2 });
  expect(run.status).toBe("Pending");
  expect(applyMemoryJobStatuses([run], page([]), "chat-1")[0].status).toBe("Unavailable");
  expect(applyMemoryJobStatuses([run], page([job, job]), "chat-1")[0].status).toBe("Unavailable");
});
test.each([
  { ...page(), owner_chat_id: "foreign" },
  page([{ ...job, owner_chat_id: "foreign" }]),
  page([{ ...job, status: "future" }]),
  page([{ ...job, revision: 0 }]),
  page(Array(101).fill(job)),
])("malformed or foreign job states cannot show success", (value) => {
  expect(() => applyMemoryJobStatuses([run], value, "chat-1")).toThrow();
});
test("a late older revision cannot overwrite newer state", () => {
  expect(() => applyMemoryJobStatuses([{ ...run, jobRevision: 3 }], page(), "chat-1")).toThrow();
});
