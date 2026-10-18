/**
 * The production entry for a stored Skeleton Agent: what the chat sends.
 *
 * Harness mirrors use_chat_stream.memory_v2_payload.test.js — real
 * ChatInterface, mocked ChatMessages / ChatInput, the payload read from the
 * `window.unchainAPI.startStreamV2` mock, which is the last hop on this side
 * of the bridge.
 *
 * What is locked here is the producer half of BC-001. The consumer half is the
 * server's own `prepare_skeleton_chat_selection`, and the payload captured by
 * this suite is the thing the probe feeds to it — the key set, the schema
 * string and the id spelling are not re-derived in a second place, they are
 * asserted here and admitted there.
 *
 * Set PUPU_CAPTURE_DIR to have the first captured payload written out for that
 * probe. Unset, nothing is written.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  LocaleContext,
  NavigationContext,
  ThemeContext,
} from "../../../CONTAINERs/config/context";
import ChatInterface from "../chat";
import {
  createChatInSelectedContext,
  getChatsStore,
  selectTreeNode,
  setChatModel,
} from "../../../SERVICEs/chat_storage";
import { buildTreeNodeLookupByChatId } from "../../../SERVICEs/chat_storage/chat_storage_tree";
import { SKELETON_CHAT_SELECTION_SCHEMA } from "../../../SERVICEs/skeleton_chat_selection";
import { writeFeatureFlags } from "../../../SERVICEs/feature_flags";

let lastChatInputProps = null;
var mockScopedLogger;

jest.mock("../../../SERVICEs/console_logger", () => ({
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

jest.mock("../../../COMPONENTs/chat-messages/chat_messages", () => ({
  __esModule: true,
  default: () => <div data-testid="chat-messages" />,
}));

jest.mock("../../../COMPONENTs/chat-input/chat_input", () => ({
  __esModule: true,
  default: (props) => {
    lastChatInputProps = props;
    const { value, onChange, onSend, sendDisabled } = props;
    return (
      <div>
        <input
          data-testid="chat-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button data-testid="send-button" onClick={onSend} disabled={sendDisabled}>
          Send
        </button>
      </div>
    );
  },
}));

/* A store listing as the real bridge returns it: one Agent, one Workflow, one
   archived Agent, and an Agent whose name is the same spelling as a legacy
   Recipe. `listSkeletonResources(false)` is what the page calls, so the
   archived row is the one the store would already be filtering — it is here to
   prove the renderer does not need it to. */
const RESOURCES = [
  {
    id: "legacy-132613d90b9bfa97c0545330",
    kind: "agent",
    name: "Reviewer",
    description: null,
    archived: false,
    edit_token: "edit-1",
    draft_digest: null,
    source_identity: null,
  },
  {
    id: "wf-1",
    kind: "workflow",
    name: "Nightly",
    description: null,
    archived: false,
    edit_token: "edit-2",
    draft_digest: null,
    source_identity: null,
    published_revisions: 2,
  },
  {
    id: "retired-agent",
    kind: "agent",
    name: "Retired",
    description: null,
    archived: true,
    edit_token: "edit-3",
    draft_digest: null,
    source_identity: null,
  },
  {
    id: "research.agent:v2",
    kind: "agent",
    name: "Research Agent",
    description: null,
    archived: false,
    edit_token: "edit-4",
    draft_digest: null,
    source_identity: null,
  },
];

describe("sending with a stored Skeleton Agent", () => {
  let streamHandlers;

  beforeEach(() => {
    streamHandlers = null;
    window.localStorage.clear();
    lastChatInputProps = null;
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
      listRecipes: jest.fn(async () => ({
        recipes: [{ name: "Default" }, { name: "Research Agent" }],
      })),
      listSkeletonResources: jest.fn(async () => ({ resources: RESOURCES })),
      startStream: jest.fn(),
      startStreamV2: jest.fn((_payload, handlers = {}) => {
        streamHandlers = handlers;
        return { cancel: jest.fn() };
      }),
      cancelStream: jest.fn(),
    };
  });

  afterEach(() => {
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
      expect(window.unchainAPI.getModelCatalog).toHaveBeenCalled();
      expect(lastChatInputProps?.sendDisabled).toBe(false);
    });
    await waitFor(() =>
      expect(lastChatInputProps.skeletonAgentOptions.length).toBe(2),
    );
  };

  const choose = async (id) => {
    await act(async () => {
      lastChatInputProps.onSelectSkeletonAgent(id);
    });
  };

  const send = async (text) => {
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: text },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("send-button"));
    });
  };

  const settle = async () => {
    await act(async () => {
      streamHandlers.onDone?.({});
    });
    await waitFor(() => expect(lastChatInputProps.sendDisabled).toBe(false));
  };

  const sentOptions = (call = 0) =>
    window.unchainAPI.startStreamV2.mock.calls[call][0].options;

  test("only the resources that declare themselves available Agents are offered", async () => {
    renderChat();
    await waitForReady();
    /* Asked without the archived rows, and a Workflow is not an Agent even
       though it is a resource in the same store. */
    expect(window.unchainAPI.listSkeletonResources).toHaveBeenCalledWith(false);
    expect(lastChatInputProps.skeletonAgentOptions).toEqual([
      { id: "legacy-132613d90b9bfa97c0545330", name: "Reviewer" },
      { id: "research.agent:v2", name: "Research Agent" },
    ]);
    /* And the legacy Recipe of the same spelling is still its own list. */
    expect(lastChatInputProps.recipeOptions).toEqual([
      { label: "Default", value: "Default" },
      { label: "Research Agent", value: "Research Agent" },
    ]);
  });

  test("the request carries the closed three-field selection and no Recipe name", async () => {
    renderChat();
    await waitForReady();
    await choose("research.agent:v2");
    await send("run this with the Agent");
    await waitFor(() =>
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1),
    );
    const options = sentOptions();
    /* Exactly these three keys — a fourth is `unknown_field` and a missing one
       `invalid_shape` by the server's own contract. */
    expect(Object.keys(options.skeleton_selection).sort()).toEqual([
      "kind",
      "resource_id",
      "schema",
    ]);
    expect(options.skeleton_selection).toEqual({
      schema: SKELETON_CHAT_SELECTION_SCHEMA,
      kind: "resource",
      resource_id: "research.agent:v2",
    });
    /* Not beside a Recipe name: the server refuses that outright, and the two
       are different identities even when they share a spelling. */
    expect("recipe_name" in options).toBe(false);
    /* An id, and only an id: no document, digest, edit token or preflight
       result is assembled here. */
    const serialized = JSON.stringify(options.skeleton_selection);
    ["document", "definition_digest", "edit_token", "diagnostics", "nodes"].forEach(
      (field) => expect(serialized.includes(field)).toBe(false),
    );

    if (process.env.PUPU_CAPTURE_DIR) {
      // eslint-disable-next-line global-require
      const fs = require("fs");
      fs.writeFileSync(
        `${process.env.PUPU_CAPTURE_DIR}/renderer-payload.json`,
        JSON.stringify(
          {
            captured_from:
              "startStreamV2 bridge argument (renderer side of the IPC hop)",
            options: {
              skeleton_selection: options.skeleton_selection,
              recipe_name_present: "recipe_name" in options,
            },
            owner_chat_id:
              window.unchainAPI.startStreamV2.mock.calls[0][0].owner_chat_id,
            memory_v2_requested:
              window.unchainAPI.startStreamV2.mock.calls[0][0]
                .memory_v2_requested,
          },
          null,
          2,
        ) + "\n",
      );
    }
  });

  test("the second message in the same chat sends the same id", async () => {
    renderChat();
    await waitForReady();
    await choose("legacy-132613d90b9bfa97c0545330");
    await send("first");
    await waitFor(() =>
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1),
    );
    await settle();
    await send("second");
    await waitFor(() =>
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(2),
    );
    expect(sentOptions(0).skeleton_selection.resource_id).toBe(
      "legacy-132613d90b9bfa97c0545330",
    );
    expect(sentOptions(1).skeleton_selection).toEqual(
      sentOptions(0).skeleton_selection,
    );
  });

  test("a chat that selected nothing sends no selection at all", async () => {
    renderChat();
    await waitForReady();
    await send("ordinary message");
    await waitFor(() =>
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1),
    );
    /* Absent, not null and not an empty object: the server routes on the key
       being there, so an empty one would send an ordinary chat down the
       Skeleton path. */
    expect("skeleton_selection" in sentOptions()).toBe(false);
    expect("recipe_name" in sentOptions()).toBe(false);
  });

  test("choosing a legacy Recipe afterwards leaves exactly one identity", async () => {
    renderChat();
    await waitForReady();
    await choose("research.agent:v2");
    await act(async () => {
      lastChatInputProps.onSelectRecipe("Research Agent");
      lastChatInputProps.onSelectSkeletonAgent("");
    });
    await send("with the legacy Recipe of the same name");
    await waitFor(() =>
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1),
    );
    expect(sentOptions().recipe_name).toBe("Research Agent");
    expect("skeleton_selection" in sentOptions()).toBe(false);
  });

  test("the selection belongs to its own chat", async () => {
    renderChat();
    await waitForReady();
    const first = getChatsStore().activeChatId;
    await choose("research.agent:v2");
    await waitFor(() =>
      expect(getChatsStore().chatsById[first].selectedSkeletonAgentId).toBe(
        "research.agent:v2",
      ),
    );

    /* A second chat starts with nothing selected, and selecting there does not
       reach into the first chat's record. */
    await act(async () => {
      createChatInSelectedContext();
    });
    const second = getChatsStore().activeChatId;
    expect(second).not.toBe(first);
    await waitFor(() =>
      expect(lastChatInputProps.selectedSkeletonAgentId).toBe(""),
    );
    await choose("legacy-132613d90b9bfa97c0545330");
    await waitFor(() =>
      expect(getChatsStore().chatsById[second].selectedSkeletonAgentId).toBe(
        "legacy-132613d90b9bfa97c0545330",
      ),
    );
    expect(getChatsStore().chatsById[first].selectedSkeletonAgentId).toBe(
      "research.agent:v2",
    );

    /* Switching back restores the first chat's own id into the composer. */
    const firstNode = buildTreeNodeLookupByChatId(getChatsStore().tree)[first];
    expect(firstNode).toBeTruthy();
    await act(async () => {
      selectTreeNode({ nodeId: firstNode }, { source: "test" });
    });
    await waitFor(() =>
      expect(
        document.querySelector("[data-chat-id]")?.getAttribute("data-chat-id"),
      ).toBe(first),
    );
    await waitFor(() =>
      expect(lastChatInputProps.selectedSkeletonAgentId).toBe(
        "research.agent:v2",
      ),
    );
    /* The second chat was a transient new chat with nothing in it, so leaving
       it discards the whole record — its selection included. That is the
       existing rule for a chat nobody wrote in, not something this selection
       changes, and it is why its id was asserted above while it was open. */
    expect(getChatsStore().chatsById[second]).toBeUndefined();
  });

  test("a stored id survives a cold reopen of the app", async () => {
    renderChat();
    await waitForReady();
    const chatId = getChatsStore().activeChatId;
    await choose("research.agent:v2");
    await waitFor(() =>
      expect(getChatsStore().chatsById[chatId].selectedSkeletonAgentId).toBe(
        "research.agent:v2",
      ),
    );
    /* The next launch reads the store through the sanitizer — the one place a
       field that nobody declared would be dropped — and sends the same id. */
    const { unmount } = { unmount: () => {} };
    unmount();
    const reread = getChatsStore().chatsById[chatId];
    expect(reread.selectedSkeletonAgentId).toBe("research.agent:v2");
    expect(reread.selectedRecipeName).toBe("Default");
  });

  test("a refused selection says why, and nothing runs instead", async () => {
    /* The server fails closed on a selection it cannot admit. What the chat
       must not do is answer with the default Agent's reply — the message
       fails, with the reason, and the selection stays what the person
       chose. */
    renderChat();
    await waitForReady();
    await choose("research.agent:v2");
    await send("this Agent cannot be admitted");
    await waitFor(() =>
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1),
    );
    await act(async () => {
      streamHandlers.onError?.({
        code: "skeleton_chat_admission_failed",
        message: "Skeleton chat resource admission failed.",
      });
    });
    /* This chat's own sentence for a code the selection owns, not the
       server's boundary wording. */
    expect(lastChatInputProps.disclaimer || "").toMatch(
      /could not be admitted/i,
    );
    /* No second request went out with anything else, and the choice stands. */
    expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
    expect(lastChatInputProps.selectedSkeletonAgentId).toBe(
      "research.agent:v2",
    );
  });

  test("an unrelated failure keeps the server's own message", async () => {
    renderChat();
    await waitForReady();
    await choose("research.agent:v2");
    await send("something else went wrong");
    await waitFor(() =>
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1),
    );
    await act(async () => {
      streamHandlers.onError?.({
        code: "end_count",
        message: "a graph must have exactly one end node",
      });
    });
    expect(lastChatInputProps.disclaimer || "").toMatch(
      /exactly one end node/i,
    );
  });

  test("an id the chat holds for a resource that is gone is still the chat's own", async () => {
    /* The resource can be archived, deleted or converted while this chat sits
       there. What must not happen is a quiet move to the default Agent: the
       chat keeps naming what it was given, the row says it is unavailable, and
       the send still goes out with that id for the server to refuse. */
    renderChat();
    await waitForReady();
    await choose("research.agent:v2");
    window.unchainAPI.listSkeletonResources = jest.fn(async () => ({
      resources: [RESOURCES[0]],
    }));
    await send("the Agent went away");
    await waitFor(() =>
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1),
    );
    expect(sentOptions().skeleton_selection.resource_id).toBe(
      "research.agent:v2",
    );
    expect(lastChatInputProps.selectedSkeletonAgentId).toBe("research.agent:v2");
  });

  /* ── The composer's model requirement, and who it is for ──────────────────
     A Skeleton run takes its provider, model and context window from the
     Kernel profile saved inside the resource; the composer's pill is not
     consulted and cannot override it. So the pill requirement — written for
     the model THIS composer would run — must not stand between a correctly
     configured Agent and its own model. Everything else stays: an ordinary
     chat, a character chat and a legacy Recipe all still need one, and the
     attachment rules are about what the pill's model can read, so they do
     not move either.

     The requirement is lifted in three places, and all three are asked here,
     because unblocking only the button would stop the user at the next door
     with "Select a model before sending a message." instead. */
  const EMPTY_CATALOG = {
    activeModel: "",
    providers: { openai: [], ollama: [], anthropic: [] },
    model_capabilities: {},
  };

  const waitForNoModelReady = async () => {
    await waitFor(() => {
      expect(window.unchainAPI.getModelCatalog).toHaveBeenCalled();
      expect(lastChatInputProps?.skeletonAgentOptions?.length).toBe(2);
    });
  };

  test("an Agent with its own stored Kernel sends with no model chosen in the composer", async () => {
    window.unchainAPI.getModelCatalog.mockResolvedValue(EMPTY_CATALOG);
    renderChat();
    await waitForNoModelReady();
    /* Before: nothing selected, so this composer genuinely has nothing to
       run with. */
    expect(lastChatInputProps.sendDisabled).toBe(true);
    await choose("research.agent:v2");
    expect(lastChatInputProps.sendDisabled).toBe(false);
    expect(lastChatInputProps.disclaimer).toBe(
      "This Agent runs with the model saved inside it.",
    );
    await send("run using the model already stored in the Agent");
    await waitFor(() =>
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1),
    );
    /* The hook's own door opened too: a send stopped there reports that
       sentence and never reaches the bridge. */
    expect(lastChatInputProps.disclaimer).not.toMatch(/Select a model/i);
    expect(sentOptions().skeleton_selection).toEqual({
      schema: SKELETON_CHAT_SELECTION_SCHEMA,
      kind: "resource",
      resource_id: "research.agent:v2",
    });
    expect("recipe_name" in sentOptions()).toBe(false);
    if (process.env.PUPU_CAPTURE_DIR) {
      /* The whole payload, not just the selection: with the pill unset the
         request still has to be one the server's admission accepts, and that
         is checked against the real consumer rather than asserted here. */
      // eslint-disable-next-line global-require
      const fs = require("fs");
      /* The WHOLE argument, not a reduction of it: with no pill chosen the
         question is whether everything this chat sends is still admitted, so
         the probe gets the entire object to hand to the real consumer. */
      fs.writeFileSync(
        `${process.env.PUPU_CAPTURE_DIR}/renderer-payload-no-model.json`,
        JSON.stringify(
          {
            captured_from:
              "startStreamV2 bridge argument with an empty model catalog (renderer side of the IPC hop)",
            payload: window.unchainAPI.startStreamV2.mock.calls[0][0],
          },
          null,
          2,
        ) + "\n",
      );
    }
  });

  test("an ordinary chat with no Agent still has to choose a model", async () => {
    window.unchainAPI.getModelCatalog.mockResolvedValue(EMPTY_CATALOG);
    renderChat();
    await waitForNoModelReady();
    expect(lastChatInputProps.sendDisabled).toBe(true);
    expect(lastChatInputProps.disclaimer).toBe(
      "Select a model to send a message.",
    );
    await send("no model, no Agent");
    expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();
  });

  test("a legacy Recipe is not a Kernel and still needs a model", async () => {
    /* The one case a lookalike gets wrong: a Recipe is also "an Agent" in the
       row, but it runs on the composer's model. Its requirement stands. */
    window.unchainAPI.getModelCatalog.mockResolvedValue(EMPTY_CATALOG);
    renderChat();
    await waitForNoModelReady();
    await act(async () => {
      lastChatInputProps.onSelectRecipe("Research Agent");
    });
    expect(lastChatInputProps.sendDisabled).toBe(true);
    await send("a Recipe has no Kernel of its own");
    expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();
  });

  test("going back to no Agent restores the model requirement", async () => {
    window.unchainAPI.getModelCatalog.mockResolvedValue(EMPTY_CATALOG);
    renderChat();
    await waitForNoModelReady();
    await choose("research.agent:v2");
    expect(lastChatInputProps.sendDisabled).toBe(false);
    await choose("");
    expect(lastChatInputProps.sendDisabled).toBe(true);
    await send("back to nothing");
    expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();
  });

  test("an Agent does not make attachments work without a model", async () => {
    /* What an attachment needs is a model that can read it, and that is the
       pill's model — the Agent's Kernel is not consulted by this composer. So
       this gate does NOT move, and says the true thing. */
    window.unchainAPI.getModelCatalog.mockResolvedValue(EMPTY_CATALOG);
    renderChat();
    await waitForNoModelReady();
    await choose("research.agent:v2");
    expect(lastChatInputProps.attachmentsEnabled).toBe(false);
    expect(lastChatInputProps.attachmentsDisabledReason).toBe(
      "Select a model to enable attachments.",
    );
  });

  test("the test bridge's own send door follows the same rule", async () => {
    /* `sendForTest` (window.__pupuTestBridge "startChatRun"/"sendMessage") is
       a third door with its own model check, reading the chat's stored row
       rather than the composer. It was not named in the review; it refuses
       the same legitimate configuration, so it moves with the others. */
    const handlers = new Map();
    window.__pupuTestBridge = {
      register: (name, handler) => {
        handlers.set(name, handler);
        return () => handlers.delete(name);
      },
    };
    window.unchainAPI.getModelCatalog.mockResolvedValue(EMPTY_CATALOG);
    renderChat();
    await waitForNoModelReady();
    await waitFor(() => expect(handlers.has("startChatRun")).toBe(true));
    const chatId = getChatsStore().activeChatId;

    /* Without an Agent this chat has nothing runnable, and that is still the
       answer — the door did not simply open. */
    await expect(
      handlers.get("startChatRun")({ id: chatId, text: "no model, no Agent" }),
    ).rejects.toMatchObject({ code: "chat_config_unavailable" });
    expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();

    await choose("research.agent:v2");
    await waitFor(() =>
      expect(
        getChatsStore().chatsById[chatId].selectedSkeletonAgentId,
      ).toBe("research.agent:v2"),
    );
    const outcome = await handlers
      .get("startChatRun")({ id: chatId, text: "run the stored Agent" })
      .catch((error) => error);
    expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
    expect(sentOptions().skeleton_selection.resource_id).toBe(
      "research.agent:v2",
    );
    expect(outcome?.code).not.toBe("chat_config_unavailable");
    delete window.__pupuTestBridge;
  });

  /* ── A stale composer model, and the facade that completes it ─────────────
     `api.unchain` resolves the composer model's custom provider before the
     bridge and refuses to send when that provider is gone. A model choice
     outliving its provider is ordinary persisted state, and a chat running a
     stored Agent never runs that model — so it must not be stopped there
     either. Driven through the real facade: these sends reach (or do not
     reach) the bridge mock, which is on the far side of it. */
  const REMOVED_PROVIDER_MODEL = "custom.removed-composer-provider:old-model";

  const sessionBundleSnapshot = (chatId) =>
    getChatsStore().chatsById[chatId] || {};

  const storeStaleModel = async () => {
    const chatId = getChatsStore().activeChatId;
    /* The composer's selections reach the store on a 150ms debounce, and any
       other write to this chat in that window is reconciled back over them —
       the same for the Recipe name and the toolkits, measured, and not
       something this slice changed. So the choice is allowed to land first,
       which is also the order a person produces. */
    await waitFor(() =>
      expect(
        sessionBundleSnapshot(chatId).selectedSkeletonAgentId,
      ).toBe(lastChatInputProps.selectedSkeletonAgentId),
    );
    await act(async () => {
      setChatModel(chatId, { id: REMOVED_PROVIDER_MODEL }, { source: "test" });
    });
    await waitFor(() =>
      expect(lastChatInputProps.selectedModelId).toBe(REMOVED_PROVIDER_MODEL),
    );
    return chatId;
  };

  test("a deleted custom provider in the pill does not stop a stored Agent", async () => {
    writeFeatureFlags({
      enable_user_access_to_agents: true,
      enable_custom_model_providers: true,
    });
    renderChat();
    await waitForReady();
    await choose("research.agent:v2");
    await storeStaleModel();
    await send("use the saved Agent, ignore the obsolete pill");
    await waitFor(() =>
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1),
    );
    expect(sentOptions().skeleton_selection.resource_id).toBe(
      "research.agent:v2",
    );
    /* Not merely "it got through": nothing was invented for the dead provider,
       and the stale choice still travels as the composer's own field. */
    expect("custom_provider" in sentOptions()).toBe(false);
    expect(sentOptions().modelId).toBe(REMOVED_PROVIDER_MODEL);
    expect(lastChatInputProps.disclaimer || "").not.toMatch(
      /Custom provider not found/i,
    );
    if (process.env.PUPU_CAPTURE_DIR) {
      /* Captured for the same reason as the no-model payload: whether the host
         admits what this chat sends while the pill names a provider that no
         longer exists. */
      // eslint-disable-next-line global-require
      const fs = require("fs");
      fs.writeFileSync(
        `${process.env.PUPU_CAPTURE_DIR}/renderer-payload-stale-pill.json`,
        JSON.stringify(
          {
            captured_from:
              "startStreamV2 bridge argument with a deleted custom provider in the composer (renderer side of the IPC hop)",
            payload: window.unchainAPI.startStreamV2.mock.calls[0][0],
          },
          null,
          2,
        ) + "\n",
      );
    }
  });

  test("the same stale pill still stops a chat that runs no Agent", async () => {
    writeFeatureFlags({
      enable_user_access_to_agents: true,
      enable_custom_model_providers: true,
    });
    renderChat();
    await waitForReady();
    await storeStaleModel();
    await send("nothing else runs this message");
    expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(lastChatInputProps.disclaimer || "").toMatch(
        /Custom provider not found/i,
      ),
    );
  });

  test("a legacy Recipe with the same stale pill is stopped too", async () => {
    /* A Recipe runs on the composer's model, so its provider is its business. */
    writeFeatureFlags({
      enable_user_access_to_agents: true,
      enable_custom_model_providers: true,
    });
    renderChat();
    await waitForReady();
    await act(async () => {
      lastChatInputProps.onSelectRecipe("Research Agent");
    });
    await storeStaleModel();
    await send("the Recipe needs a provider that exists");
    expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(lastChatInputProps.disclaimer || "").toMatch(
        /Custom provider not found/i,
      ),
    );
  });

});
