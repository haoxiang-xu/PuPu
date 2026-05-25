import { sanitizeChatSession } from "./chat_storage_sanitize";

describe("chat storage plan docs", () => {
  test("drops legacy plan docs and scrubs legacy plan tool payloads", () => {
    const chat = sanitizeChatSession({
      id: "chat-plan-docs",
      title: "Plans",
      planDocs: [
        {
          plan_id: "plan_1",
          markdown: "# Plan",
          artifact: { type: "plan_doc", plan_id: "plan_1" },
        },
      ],
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          content: "",
          traceFrames: [
            {
              type: "tool_result",
              payload: {
                tool_name: "plan_update",
                result: {
                  ok: true,
                  plan_id: "plan_1",
                  status: "draft",
                  revision: 2,
                  workspace_file: {
                    path: "/tmp/workspace/plans/plan_1.md",
                    relative_path: "plans/plan_1.md",
                  },
                  plan: { title: "Legacy structured state" },
                  markdown: "# Legacy markdown",
                  artifact: { type: "plan_doc", plan_id: "plan_1" },
                  artifacts: [{ type: "plan_doc", plan_id: "plan_1" }],
                  proposed_plan: "<proposed_plan># Plan</proposed_plan>",
                },
              },
            },
          ],
        },
      ],
    });

    expect(chat).not.toHaveProperty("planDocs");

    const result = chat.messages[0].traceFrames[0].payload.result;
    expect(result).toEqual({
      ok: true,
      plan_id: "plan_1",
      status: "draft",
      revision: 2,
      workspace_file: {
        path: "/tmp/workspace/plans/plan_1.md",
        relative_path: "plans/plan_1.md",
      },
    });
  });
});
