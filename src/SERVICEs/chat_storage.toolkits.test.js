import {
  chatsStorageConstants,
  createChatInSelectedContext,
  getChatsStore,
  setChatSelectedToolkits,
} from "./chat_storage";
import { sanitizeSelectedToolkits } from "./chat_storage/chat_storage_sanitize";

describe("chat_storage selected toolkits persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("defaults selectedToolkits to [] for legacy chat payloads", () => {
    const seeded = getChatsStore();
    const activeChatId = seeded.activeChatId;
    const legacy = JSON.parse(JSON.stringify(seeded));
    delete legacy.chatsById[activeChatId].selectedToolkits;
    window.localStorage.setItem(chatsStorageConstants.key, JSON.stringify(legacy));

    const hydrated = getChatsStore();
    expect(hydrated.chatsById[activeChatId].selectedToolkits).toEqual([]);
  });

  test("new chats inherit code_toolkit when no explicit global default exists", () => {
    const seeded = getChatsStore();
    expect(seeded.chatsById[seeded.activeChatId].selectedToolkits).toEqual([
      "code_toolkit",
    ]);
  });

  test("setChatSelectedToolkits persists normalized toolkit ids", () => {
    const seeded = getChatsStore();
    const activeChatId = seeded.activeChatId;

    setChatSelectedToolkits(
      activeChatId,
      ["  toolkit.alpha  ", "", "toolkit.alpha", null, "toolkit.beta"],
      { source: "test" },
    );

    const hydrated = getChatsStore();
    expect(hydrated.chatsById[activeChatId].selectedToolkits).toEqual([
      "toolkit.alpha",
      "toolkit.beta",
    ]);
  });

  test("sanitizeSelectedToolkits migrates legacy toolkit ids to current class ids", () => {
    expect(
      sanitizeSelectedToolkits([
        "access_workspace_toolkit",
        "run_terminal_toolkit",
        "interaction_toolkit",
        "workspace_toolkit",
        "CodeToolkit",
        "code",
        "ask-user-toolkit",
      ]),
    ).toEqual([
      "workspace_toolkit",
      "terminal_toolkit",
      "ask-user-toolkit",
      "code_toolkit",
    ]);
  });

  test("sanitizeSelectedToolkits drops removed MCP toolkit ids", () => {
    expect(
      sanitizeSelectedToolkits([
        "WorkspaceToolkit",
        "mcp",
        "MCPToolkit",
      ]),
    ).toEqual(["workspace_toolkit"]);
  });

  test("persists selected toolkits per chat", () => {
    const seeded = getChatsStore();
    const firstChatId = seeded.activeChatId;
    const second = createChatInSelectedContext(
      { title: "Second chat" },
      { source: "test" },
    );

    setChatSelectedToolkits(firstChatId, ["toolkit.one"], { source: "test" });
    setChatSelectedToolkits(second.chatId, ["toolkit.two"], { source: "test" });

    const hydrated = getChatsStore();
    expect(hydrated.chatsById[firstChatId].selectedToolkits).toEqual([
      "toolkit.one",
    ]);
    expect(hydrated.chatsById[second.chatId].selectedToolkits).toEqual([
      "toolkit.two",
    ]);
  });
});
