import {
  createChatInSelectedContext,
  getChatsStore,
  upsertChatPlanDoc,
} from "./chat_storage_store";

describe("chat storage plan docs", () => {
  test("upserts plan docs outside messages", () => {
    const { chatId } = createChatInSelectedContext(
      { title: "Plans" },
      { source: "test" },
    );

    upsertChatPlanDoc(
      chatId,
      {
        plan_id: "plan_1",
        markdown: "# Plan",
        artifact: {
          type: "plan_doc",
          plan_id: "plan_1",
          revision: 1,
          status: "draft",
          title: "Plan",
        },
      },
      { source: "test" },
    );

    const chat = getChatsStore().chatsById[chatId];
    expect(chat.messages).toEqual([]);
    expect(chat.planDocs).toEqual([
      {
        plan_id: "plan_1",
        title: "Plan",
        status: "draft",
        revision: 1,
        markdown: "# Plan",
        artifact: {
          type: "plan_doc",
          plan_id: "plan_1",
          revision: 1,
          status: "draft",
          title: "Plan",
        },
      },
    ]);
  });
});
