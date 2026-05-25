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

  test("does not expose chat plan document facade methods", () => {
    expect(api.unchain.listChatPlans).toBeUndefined();
    expect(api.unchain.getChatPlan).toBeUndefined();
    expect(window.unchainAPI.listChatPlans).not.toHaveBeenCalled();
    expect(window.unchainAPI.getChatPlan).not.toHaveBeenCalled();
  });
});
