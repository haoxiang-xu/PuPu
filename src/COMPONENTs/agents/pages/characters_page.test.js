import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import CharactersPage from "./characters_page";
import { api } from "../../../SERVICEs/api";
import { getChatsStore, openCharacterChat } from "../../../SERVICEs/chat_storage";

jest.mock("../../../SERVICEs/api", () => ({
  api: {
    miso: {
      listSeedCharacters: jest.fn(),
      listCharacters: jest.fn(),
    },
  },
}));

jest.mock("../../../SERVICEs/chat_storage", () => ({
  getChatsStore: jest.fn(() => ({
    activeChatId: "chat-1",
    chatsById: {
      "chat-1": {
        id: "chat-1",
        kind: "default",
        model: { id: "openai:gpt-5" },
      },
    },
  })),
  openCharacterChat: jest.fn(() => ({
    ok: true,
    chatId: "chat-character-nico",
  })),
}));

jest.mock("../../../BUILTIN_COMPONENTs/input/button", () => {
  return function MockButton({ label, onClick, children, disabled }) {
    return (
      <button type="button" onClick={onClick} disabled={disabled}>
        {label || children}
      </button>
    );
  };
});

jest.mock("../../../BUILTIN_COMPONENTs/icon/icon", () => {
  return function MockIcon({ src }) {
    return <span data-testid={`icon-${src}`}>{src}</span>;
  };
});

describe("CharactersPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("loads and renders the Nico row and auto-selects detail", async () => {
    api.miso.listCharacters.mockResolvedValue({
      characters: [
        {
          id: "nico",
          name: "Nico",
          role: "22-year-old HR at an internet company",
          metadata: {
            age: 22,
            list_blurb: "互联网公司 HR，刚开始有点冷，熟了以后很会聊情绪和关系。",
            list_tags: ["INFP", "HR", "猫控", "古灵精怪"],
            primary_language: "zh-CN",
          },
        },
      ],
      count: 1,
    });

    render(<CharactersPage isDark={false} />);

    expect(screen.getByTestId("characters-loading")).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByTestId("character-row-nico")).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByTestId("character-detail-nico")).toBeInTheDocument(),
    );

    expect(api.miso.listCharacters).toHaveBeenCalledTimes(1);
    /* Name appears in both contact row and detail panel */
    expect(screen.getAllByText("Nico")).toHaveLength(2);
    /* Subtitle now appears only in the detail panel */
    expect(
      screen.getAllByText("22-year-old HR at an internet company · zh-CN"),
    ).toHaveLength(1);

    /* Detail panel auto-selected — shows age badge, tags, blurb, Open Chat */
    expect(screen.getByTestId("character-detail-nico")).toBeInTheDocument();
    expect(screen.getByTestId("character-detail-scroll-region")).toHaveStyle(
      "overflow-y: auto; overflow-x: hidden;",
    );
    expect(screen.getByText("22")).toBeInTheDocument();
    expect(screen.getByText("INFP")).toBeInTheDocument();
    expect(screen.getByText("猫控")).toBeInTheDocument();
    expect(screen.getAllByText("Chat").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("character-avatar-fallback-nico")).toHaveLength(2);
  });

  test("open chat uses the character chat store entrypoint and closes on success", async () => {
    api.miso.listCharacters.mockResolvedValue({
      characters: [
        {
          id: "nico",
          name: "Nico",
          role: "22-year-old HR at an internet company",
          metadata: { age: 22, list_tags: [], primary_language: "zh-CN" },
        },
      ],
      count: 1,
    });
    const onOpenChat = jest.fn();
    openCharacterChat.mockReturnValueOnce({
      ok: true,
      chatId: "chat-character-nico",
    });
    getChatsStore.mockReturnValueOnce({
      activeChatId: "chat-1",
      chatsById: {
        "chat-1": {
          id: "chat-1",
          kind: "default",
          model: { id: "openai:gpt-5" },
        },
      },
    });

    render(<CharactersPage isDark={false} onOpenChat={onOpenChat} />);

    await waitFor(() =>
      expect(screen.getByTestId("character-detail-nico")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByText("Chat"));

    await waitFor(() => {
      expect(getChatsStore).toHaveBeenCalled();
      expect(openCharacterChat).toHaveBeenCalledWith(
        expect.objectContaining({
          character: expect.objectContaining({ id: "nico" }),
          sourceModelId: "openai:gpt-5",
        }),
        { source: "characters-page" },
      );
      expect(onOpenChat).toHaveBeenCalled();
      expect(
        screen.queryByText("Could not open this character chat."),
      ).not.toBeInTheDocument();
    });
  });

  test("open chat shows store errors inline", async () => {
    api.miso.listCharacters.mockResolvedValue({
      characters: [
        {
          id: "nico",
          name: "Nico",
          role: "22-year-old HR at an internet company",
          metadata: { age: 22, list_tags: [], primary_language: "zh-CN" },
        },
      ],
      count: 1,
    });
    openCharacterChat.mockReturnValueOnce({
      ok: false,
      error: "Select a model in a normal chat before opening this character.",
    });

    render(<CharactersPage isDark={false} />);

    await waitFor(() =>
      expect(screen.getByTestId("character-detail-nico")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByText("Chat"));

    await waitFor(() => {
      expect(
        screen.getByText(
          "Select a model in a normal chat before opening this character.",
        ),
      ).toBeInTheDocument();
    });
  });

  test("renders an empty state when no characters exist", async () => {
    api.miso.listCharacters.mockResolvedValue({
      characters: [],
      count: 0,
    });

    render(<CharactersPage isDark={true} />);

    await waitFor(() =>
      expect(screen.getByTestId("characters-added-empty")).toBeInTheDocument(),
    );
    expect(
      screen.getByText("Not following any characters yet"),
    ).toBeInTheDocument();
  });

  test("renders an error state when loading fails", async () => {
    api.miso.listCharacters.mockRejectedValue(new Error("runtime unavailable"));

    render(<CharactersPage isDark={false} />);

    await waitFor(() =>
      expect(screen.getByTestId("characters-error")).toBeInTheDocument(),
    );
    expect(screen.getByText("Could not load characters")).toBeInTheDocument();
    expect(screen.getByText("runtime unavailable")).toBeInTheDocument();
  });

  test("renders avatar images when the API provides avatar urls", async () => {
    api.miso.listCharacters.mockResolvedValue({
      characters: [
        {
          id: "nico",
          name: "Nico",
          role: "22-year-old HR at an internet company",
          avatar: {
            url: "http://127.0.0.1:5879/characters/nico/avatar",
          },
          metadata: {
            age: 22,
            list_tags: ["INFP"],
            primary_language: "zh-CN",
          },
        },
      ],
      count: 1,
    });

    render(<CharactersPage isDark={false} />);

    await waitFor(() =>
      expect(screen.getByTestId("character-detail-nico")).toBeInTheDocument(),
    );

    expect(screen.getAllByAltText("Nico avatar")).toHaveLength(2);
    expect(
      screen.queryByTestId("character-avatar-fallback-nico"),
    ).not.toBeInTheDocument();
  });
});
