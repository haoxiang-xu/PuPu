/**
 * The saved Skeleton library, as an open chat sees it (#356, R-SEL-02).
 *
 * The Agent row offers what the store HAS SAVED. Read once when the runtime
 * became ready, that list is a snapshot: an Agent saved a moment later — in
 * the Builder, in this same window — cannot be chosen at all, and the only way
 * out is to unmount and mount the chat again, which is not a state a user can
 * know they are in.
 *
 * So this suite owns the lifecycle of that list: when it is re-read, what a
 * read that failed is allowed to do to it, and what must never happen to the
 * chat's own selection while it is re-read.
 *
 * The write side is the production helper (`skeleton_resources.save_draft`),
 * not a hand-made "something changed" event: what the chat reacts to is a
 * store answer, and a refusal or an unreachable store changed nothing. The
 * read side is the real `ChatInput`/`AttachPanel`/`Select`, so "the list was
 * refreshed" and "the new Agent can be chosen" are the same claim.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  LocaleContext,
  NavigationContext,
  ThemeContext,
} from "../../CONTAINERs/config/context";
import ChatInterface from "./chat";
import { save_draft } from "../../COMPONENTs/agents/pages/recipes_page/skeleton_resources";
import { emitSkeletonLibraryRefresh } from "../../SERVICEs/skeleton_library_refresh";
import { writeFeatureFlags } from "../../SERVICEs/feature_flags";

let lastChatInputProps = null;
var mockScopedLogger;

jest.mock("../../SERVICEs/console_logger", () => ({
  createLogger: () => {
    if (!mockScopedLogger) {
      mockScopedLogger = {
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      };
    }
    return mockScopedLogger;
  },
}));

jest.mock("../../COMPONENTs/chat-messages/chat_messages", () => ({
  __esModule: true,
  default: () => <div data-testid="chat-messages" />,
}));

/* The props are captured AND the real composer is rendered: the row under
   test is the real Select, and the list it is given is the page's own prop. */
jest.mock("../../COMPONENTs/chat-input/chat_input", () => ({
  __esModule: true,
  default: (props) => {
    lastChatInputProps = props;
    const Real = jest.requireActual(
      "../../COMPONENTs/chat-input/chat_input",
    ).default;
    return <Real {...props} />;
  },
}));

const agentRow = (id, name) => ({
  id,
  kind: "agent",
  name,
  description: null,
  archived: false,
  edit_token: "edit-1",
  draft_digest: null,
  source_identity: null,
});

const ORIGINAL = agentRow("original-agent", "Original Agent");
const NEWLY_SAVED = agentRow("newly-saved-agent", "Newly saved Agent");

/* The document shape `save_draft` sends; the store is the thing that decides
   whether it is valid, and here it is mocked, so this only has to be the real
   envelope and not a runnable graph. */
const NEW_DOCUMENT = {
  schema_version: 1,
  id: "newly-saved-agent",
  kind: "agent",
  name: "Newly saved Agent",
  description: null,
  nodes: [],
  edges: [],
};

describe("the saved Agent library of a chat that is already open", () => {
  let listing;

  beforeEach(() => {
    listing = [ORIGINAL];
    lastChatInputProps = null;
    window.localStorage.clear();
    jest.spyOn(console, "error").mockImplementation(() => {});
    writeFeatureFlags({ enable_user_access_to_agents: true });
    window.unchainAPI = {
      getStatus: jest.fn(async () => ({
        status: "ready",
        ready: true,
        url: "http://localhost:3000",
        reason: "",
      })),
      isRuntimeEventStreamV4Available: jest.fn(() => false),
      getModelCatalog: jest.fn(async () => ({
        activeModel: "openai:gpt-5",
        providers: { openai: ["gpt-5"], ollama: [], anthropic: [] },
        model_capabilities: {},
      })),
      listRecipes: jest.fn(async () => ({ recipes: [{ name: "Default" }] })),
      listSkeletonResources: jest.fn(async () => ({ resources: listing })),
      startStream: jest.fn(),
      startStreamV2: jest.fn(() => ({ cancel: jest.fn() })),
      cancelStream: jest.fn(),
    };
  });

  afterEach(() => {
    cleanup();
    jest.restoreAllMocks();
    delete window.unchainAPI;
  });

  const renderChat = () =>
    render(
      <ThemeContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
        <NavigationContext.Provider
          value={{ onFragment: "main", setOnFragment: jest.fn() }}
        >
          <LocaleContext.Provider value={{ locale: "en", setLocale: jest.fn() }}>
            <ChatInterface />
          </LocaleContext.Provider>
        </NavigationContext.Provider>
      </ThemeContext.Provider>,
    );

  const waitForReady = async () => {
    await waitFor(() => {
      expect(lastChatInputProps?.sendDisabled).toBe(false);
      expect(lastChatInputProps?.skeletonAgentOptions).toEqual([
        { id: "original-agent", name: "Original Agent" },
      ]);
    });
    await screen.findByTestId("attach-agent-row");
  };

  const listCalls = () =>
    window.unchainAPI.listSkeletonResources.mock.calls.length;

  const openAgentSelector = async () => {
    const combo = within(screen.getByTestId("attach-agent-row")).getByRole(
      "combobox",
    );
    fireEvent.keyDown(combo, { key: "ArrowDown" });
    await waitFor(() =>
      expect(combo).toHaveAttribute("aria-expanded", "true"),
    );
    return combo;
  };

  const optionIds = () =>
    (lastChatInputProps.skeletonAgentOptions || []).map((option) => option.id);

  test("an Agent saved while this chat is open becomes choosable without remounting", async () => {
    renderChat();
    await waitForReady();
    expect(listCalls()).toBe(1);

    /* The production save helper, with the store answering as the store does.
       Nothing about the chat is told what was saved — the announcement carries
       no document, and the row shows what a fresh read of the store says. */
    window.unchainAPI.saveSkeletonResource = jest.fn(async () => {
      listing = [ORIGINAL, NEWLY_SAVED];
      return { id: "newly-saved-agent", edit_token: "edit-2" };
    });
    await act(async () => {
      const reply = await save_draft(NEW_DOCUMENT);
      expect(reply.ok).toBe(true);
    });

    await waitFor(() =>
      expect(optionIds()).toEqual(["original-agent", "newly-saved-agent"]),
    );
    expect(listCalls()).toBe(2);
    /* And it is choosable in the real row, not merely present in a prop. */
    await openAgentSelector();
    fireEvent.click(screen.getByText("Newly saved Agent", { exact: true }));
    await waitFor(() =>
      expect(lastChatInputProps.selectedSkeletonAgentId).toBe(
        "newly-saved-agent",
      ),
    );
  });

  test("opening the Agent selector reads the library again", async () => {
    /* The other half: a resource written where this window cannot see it —
       another process, or a write path with no UI caller yet (rename,
       archive, delete, import all exist in the facade) — is picked up because
       the list is re-read at the moment it is shown. */
    renderChat();
    await waitForReady();
    listing = [ORIGINAL, NEWLY_SAVED];
    await openAgentSelector();
    await screen.findByText("Newly saved Agent", { exact: true });
    expect(listCalls()).toBe(2);
  });

  test("a save the store refused changes nothing", async () => {
    renderChat();
    await waitForReady();
    window.unchainAPI.saveSkeletonResource = jest.fn(async () => ({
      error: { code: "edit_conflict", message: "changed elsewhere" },
    }));
    await act(async () => {
      const reply = await save_draft(NEW_DOCUMENT, "stale-token");
      expect(reply.ok).toBe(false);
      expect(reply.reason).toBe("refused");
    });
    expect(listCalls()).toBe(1);
    expect(optionIds()).toEqual(["original-agent"]);
  });

  test("a store that cannot be reached announces nothing", async () => {
    renderChat();
    await waitForReady();
    /* No bridge method at all: `save_draft` reports `unavailable` and nothing
       was written, so there is nothing to re-read. */
    await act(async () => {
      const reply = await save_draft(NEW_DOCUMENT);
      expect(reply.ok).toBe(false);
      expect(reply.reason).toBe("unavailable");
    });
    expect(listCalls()).toBe(1);
    expect(optionIds()).toEqual(["original-agent"]);
  });

  test("a late answer does not put the older library back on screen", async () => {
    renderChat();
    await waitForReady();
    const pending = [];
    window.unchainAPI.listSkeletonResources = jest.fn(
      () =>
        new Promise((resolve) => {
          pending.push(resolve);
        }),
    );
    /* Two reads in flight — a save and an opening selector a moment apart.
       The first one answers second, and with the library from before. */
    act(() => {
      emitSkeletonLibraryRefresh({ reason: "first" });
      emitSkeletonLibraryRefresh({ reason: "second" });
    });
    await waitFor(() => expect(pending.length).toBe(2));
    await act(async () => {
      pending[1]({ resources: [ORIGINAL, NEWLY_SAVED] });
    });
    expect(optionIds()).toEqual(["original-agent", "newly-saved-agent"]);
    await act(async () => {
      pending[0]({ resources: [ORIGINAL] });
    });
    expect(optionIds()).toEqual(["original-agent", "newly-saved-agent"]);
  });

  test("a read that failed is not an empty library, and never drops the selection", async () => {
    renderChat();
    await waitForReady();
    await act(async () => {
      lastChatInputProps.onSelectSkeletonAgent("original-agent");
    });
    window.unchainAPI.listSkeletonResources = jest.fn(async () => {
      throw Object.assign(new Error("bridge is gone"), {
        code: "bridge_unavailable",
      });
    });
    await act(async () => {
      emitSkeletonLibraryRefresh({ reason: "read fails" });
    });
    expect(optionIds()).toEqual(["original-agent"]);
    /* And the chat still names what it was given: a selection is not dropped
       because a listing could not be read, and nothing moved to Default. */
    expect(lastChatInputProps.selectedSkeletonAgentId).toBe("original-agent");
    expect(lastChatInputProps.selectedRecipeName).toBe("Default");
  });

  test("a bridge answer that is not a listing arrives here as an empty one", async () => {
    /* Measured, not wished for: the distinction between "the store holds no
       Agents" and "the answer was not a listing" is already gone by the time
       the page sees it — `api.unchain.listSkeletonResources` returns
       `{resources: []}` for anything that is not an array. So the row empties.
       The page keeps its own array check (a strict consumer does not trust its
       transport to have checked the shape), and it is that facade, shared with
       the Builder's own resource list, that would have to say "unreadable"
       instead; that is a separate seam and is reported rather than changed
       here. What still holds in this case is the part that matters for a run:
       the chat keeps the id it was given. */
    renderChat();
    await waitForReady();
    await act(async () => {
      lastChatInputProps.onSelectSkeletonAgent("original-agent");
    });
    window.unchainAPI.listSkeletonResources = jest.fn(async () => ({
      resources: null,
    }));
    await act(async () => {
      emitSkeletonLibraryRefresh({ reason: "malformed" });
    });
    await waitFor(() => expect(optionIds()).toEqual([]));
    expect(lastChatInputProps.selectedSkeletonAgentId).toBe("original-agent");
    expect(lastChatInputProps.selectedRecipeName).toBe("Default");
  });

  test("a store that really holds no Agents empties the row", async () => {
    /* The control for the two above: an empty library IS applied, so keeping
       stale options is not simply what this code always does. */
    renderChat();
    await waitForReady();
    listing = [];
    await act(async () => {
      emitSkeletonLibraryRefresh({ reason: "emptied elsewhere" });
    });
    await waitFor(() => expect(optionIds()).toEqual([]));
  });

  /* ── An empty library is the case that has to stay reachable ──────────────
     The row used to appear only when it had something besides Default to
     offer, which deleted the entrance exactly when it was needed: nothing
     saved yet, no legacy Recipe, so no picker — and the picker is what
     re-reads the library. Another window saving the first Agent could then
     never become visible here, because a module-local announcement does not
     cross a renderer. */
  const emptyLibrary = async () => {
    listing = [];
    renderChat();
    await waitFor(() => {
      expect(lastChatInputProps?.sendDisabled).toBe(false);
      expect(window.unchainAPI.listSkeletonResources).toHaveBeenCalled();
    });
    await act(async () => {});
  };

  test("with nothing saved yet the row is still there, and opening it re-reads", async () => {
    await emptyLibrary();
    expect(optionIds()).toEqual([]);
    /* The entrance exists even with nothing to offer but Default. */
    const row = await screen.findByTestId("attach-agent-row");
    expect(row).toBeInTheDocument();
    expect(listCalls()).toBe(1);

    /* Another writer — another window, or a write path with no UI here —
       has saved the first Agent into the same store. Nothing in this
       renderer was told. */
    listing = [NEWLY_SAVED];
    await openAgentSelector();
    await screen.findByText("Newly saved Agent", { exact: true });
    expect(listCalls()).toBe(2);
    expect(optionIds()).toEqual(["newly-saved-agent"]);

    /* And it is choosable, which is the whole point of keeping the row. */
    fireEvent.click(screen.getByText("Newly saved Agent", { exact: true }));
    await waitFor(() =>
      expect(lastChatInputProps.selectedSkeletonAgentId).toBe(
        "newly-saved-agent",
      ),
    );
  });

  test("a library that is empty because the read failed keeps the row too", async () => {
    /* The row is the way out of this state, so a failed first read must not
       remove it either. */
    window.unchainAPI.listSkeletonResources = jest.fn(async () => {
      throw Object.assign(new Error("bridge is gone"), {
        code: "bridge_unavailable",
      });
    });
    renderChat();
    await waitFor(() => expect(lastChatInputProps?.sendDisabled).toBe(false));
    await screen.findByTestId("attach-agent-row");
    expect(optionIds()).toEqual([]);

    window.unchainAPI.listSkeletonResources = jest.fn(async () => ({
      resources: [NEWLY_SAVED],
    }));
    await openAgentSelector();
    await screen.findByText("Newly saved Agent", { exact: true });
  });
});
