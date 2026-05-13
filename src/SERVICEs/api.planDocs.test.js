import { api } from "./api";

describe("api.unchain plan docs", () => {
  const originalUnchainApi = window.unchainAPI;

  beforeEach(() => {
    window.unchainAPI = {
      listChatPlans: jest.fn(async () => ({
        thread_id: "chat-1",
        active_plan_id: "plan_1",
        count: 1,
        plans: [{ plan_id: "plan_1", markdown: "# Plan" }],
      })),
      getChatPlan: jest.fn(async () => ({
        thread_id: "chat-1",
        plan_id: "plan_1",
        markdown: "# Plan",
      })),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    window.unchainAPI = originalUnchainApi;
  });

  test("lists plan docs through the bridge", async () => {
    const payload = await api.unchain.listChatPlans("chat-1");

    expect(window.unchainAPI.listChatPlans).toHaveBeenCalledWith("chat-1");
    expect(payload.count).toBe(1);
    expect(payload.plans[0].plan_id).toBe("plan_1");
  });

  test("reads a single plan doc through the bridge", async () => {
    const payload = await api.unchain.getChatPlan("chat-1", "plan_1");

    expect(window.unchainAPI.getChatPlan).toHaveBeenCalledWith(
      "chat-1",
      "plan_1",
    );
    expect(payload.markdown).toBe("# Plan");
  });
});
