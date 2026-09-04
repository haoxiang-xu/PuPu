const {
  registerIpcHandlers,
  IPC_HANDLE_CHANNELS,
  IPC_ON_CHANNELS,
  IPC_ON_SYNC_CHANNELS,
  MAIN_EVENT_CHANNELS,
} = require("../../main/ipc/register_handlers");
const {
  PRELOAD_INVOKE_CHANNELS,
  PRELOAD_SEND_CHANNELS,
  PRELOAD_SEND_SYNC_CHANNELS,
  PRELOAD_EVENT_CHANNELS,
} = require("../../preload/channels");
const { CHANNELS } = require("../../shared/channels");

describe("ipc channel parity", () => {
  test("preload invoke/send channels are registered in main handlers", () => {
    const mainRegistered = new Set([...IPC_HANDLE_CHANNELS, ...IPC_ON_CHANNELS]);

    PRELOAD_INVOKE_CHANNELS.forEach((channel) => {
      expect(mainRegistered.has(channel)).toBe(true);
    });

    PRELOAD_SEND_CHANNELS.forEach((channel) => {
      expect(mainRegistered.has(channel)).toBe(true);
    });
  });

  test("preload event channels are emitted by main", () => {
    const mainEvents = new Set(MAIN_EVENT_CHANNELS);

    PRELOAD_EVENT_CHANNELS.forEach((channel) => {
      expect(mainEvents.has(channel)).toBe(true);
    });
  });

  test("preload sendSync channels are registered in main sync handlers", () => {
    const mainSync = new Set(IPC_ON_SYNC_CHANNELS);
    PRELOAD_SEND_SYNC_CHANNELS.forEach((channel) => {
      expect(mainSync.has(channel)).toBe(true);
    });
  });

  test("boot readiness channels are classified on both sides", () => {
    // Two invoke channels + one push event. The push alone would race the
    // renderer's subscription during boot — which is the exact window this
    // gate exists for — so GET_READINESS must stay an invoke channel.
    expect(PRELOAD_INVOKE_CHANNELS).toContain(CHANNELS.BOOT.GET_READINESS);
    expect(PRELOAD_INVOKE_CHANNELS).toContain(CHANNELS.BOOT.RETRY);
    expect(IPC_HANDLE_CHANNELS).toContain(CHANNELS.BOOT.GET_READINESS);
    expect(IPC_HANDLE_CHANNELS).toContain(CHANNELS.BOOT.RETRY);

    expect(PRELOAD_EVENT_CHANNELS).toContain(CHANNELS.BOOT.READINESS_CHANGED);
    expect(MAIN_EVENT_CHANNELS).toContain(CHANNELS.BOOT.READINESS_CHANGED);

    // The event channel is push-only: never an invoke or a send target.
    expect(IPC_HANDLE_CHANNELS).not.toContain(CHANNELS.BOOT.READINESS_CHANGED);
    expect(IPC_ON_CHANNELS).not.toContain(CHANNELS.BOOT.READINESS_CHANGED);
    expect(PRELOAD_SEND_CHANNELS).not.toContain(
      CHANNELS.BOOT.READINESS_CHANGED,
    );
  });

  test("the boot namespace exposes read-only status plus exactly one control verb", () => {
    const bootChannels = Object.values(CHANNELS.BOOT);
    expect(bootChannels).toHaveLength(3);
    bootChannels.forEach((channel) => {
      expect(channel.startsWith("boot:")).toBe(true);
    });

    // No configuration/setter surface may appear here: the boot gate must not
    // become a way for the renderer to point the sidecar somewhere.
    expect(
      bootChannels.filter((channel) => /set-|configure|start|port|path|token/.test(channel)),
    ).toEqual([]);
  });

  test("boot readiness handlers delegate to the service and take no renderer input", async () => {
    const handlers = new Map();
    const readiness = { ready: true, phase: "ready" };
    const bootReadinessService = {
      getReadiness: jest.fn(() => readiness),
      retry: jest.fn(async () => readiness),
    };

    registerIpcHandlers({
      ipcMain: {
        handle: (channel, handler) => handlers.set(channel, handler),
        on: () => {},
      },
      app: { getVersion: () => "0.0.0" },
      services: {
        windowService: {},
        updateService: {},
        ollamaService: {},
        unchainService: {},
        runtimeService: {},
        screenshotService: {},
        chatStorageService: {},
        settingsStorageService: {},
        memoryVaultService: {},
        bootReadinessService,
      },
    });

    expect(handlers.get(CHANNELS.BOOT.GET_READINESS)({}, { evil: "payload" })).toEqual(
      readiness,
    );

    await expect(
      handlers.get(CHANNELS.BOOT.RETRY)({}, { port: 1234, path: "/etc" }),
    ).resolves.toEqual(readiness);

    // Whatever the renderer sent, main forwards nothing.
    expect(bootReadinessService.retry).toHaveBeenCalledWith();
    expect(bootReadinessService.getReadiness).toHaveBeenCalledWith();
  });

  test("custom provider test-connection channel is registered on both sides", () => {
    expect(PRELOAD_INVOKE_CHANNELS).toContain(
      CHANNELS.UNCHAIN.TEST_CUSTOM_PROVIDER,
    );
    expect(IPC_HANDLE_CHANNELS).toContain(
      CHANNELS.UNCHAIN.TEST_CUSTOM_PROVIDER,
    );
  });

  test("chat storage v3 channels are classified on both sides", () => {
    expect(IPC_ON_SYNC_CHANNELS).toContain(
      CHANNELS.CHAT_STORAGE.READ_MESSAGES,
    );
    expect(IPC_HANDLE_CHANNELS).toContain(
      CHANNELS.CHAT_STORAGE.APPLY_OPS,
    );
    expect(PRELOAD_SEND_SYNC_CHANNELS).toContain(
      CHANNELS.CHAT_STORAGE.READ_MESSAGES,
    );
    expect(PRELOAD_INVOKE_CHANNELS).toContain(
      CHANNELS.CHAT_STORAGE.APPLY_OPS,
    );
    expect(IPC_ON_SYNC_CHANNELS).toContain(
      CHANNELS.CHAT_STORAGE.APPLY_OPS_SYNC,
    );
    expect(PRELOAD_SEND_SYNC_CHANNELS).toContain(
      CHANNELS.CHAT_STORAGE.APPLY_OPS_SYNC,
    );
    expect(IPC_ON_CHANNELS).not.toContain(CHANNELS.CHAT_STORAGE.APPLY_OPS);
    expect(PRELOAD_SEND_CHANNELS).not.toContain(
      CHANNELS.CHAT_STORAGE.APPLY_OPS,
    );
  });

  test("settings storage channels are classified on both sides", () => {
    // bootstrap is sendSync → main on-sync
    expect(IPC_ON_SYNC_CHANNELS).toContain(
      CHANNELS.SETTINGS_STORAGE.BOOTSTRAP_READ,
    );
    expect(PRELOAD_SEND_SYNC_CHANNELS).toContain(
      CHANNELS.SETTINGS_STORAGE.BOOTSTRAP_READ,
    );

    // mutations/queries are invoke → main handle (Phase 2 token usage
    // channels included — sync IPC stays bootstrap-only, plan §4.2)
    [
      CHANNELS.SETTINGS_STORAGE.MIGRATE_LEGACY,
      CHANNELS.SETTINGS_STORAGE.SET_NAMESPACE,
      CHANNELS.SETTINGS_STORAGE.DELETE_NAMESPACE,
      CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_APPEND,
      CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_QUERY,
      CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_CLEAR,
      CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_MIGRATE_LEGACY,
      CHANNELS.SETTINGS_STORAGE.DEFAULT_TOOLKITS_READ_ALL,
      CHANNELS.SETTINGS_STORAGE.DEFAULT_TOOLKITS_REPLACE_SCOPE,
      CHANNELS.SETTINGS_STORAGE.DEFAULT_TOOLKITS_MIGRATE_LEGACY,
      CHANNELS.SETTINGS_STORAGE.TOOLKIT_AUTO_APPROVE_READ_ALL,
      CHANNELS.SETTINGS_STORAGE.TOOLKIT_AUTO_APPROVE_REPLACE_ALL,
      CHANNELS.SETTINGS_STORAGE.TOOLKIT_AUTO_APPROVE_MIGRATE_LEGACY,
      CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_READ_ALL,
      CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_SET_KEY,
      CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_CLEAR_KEY,
      CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_MIGRATE_LEGACY,
      CHANNELS.SETTINGS_STORAGE.MCP_ICON_GET,
      CHANNELS.SETTINGS_STORAGE.MCP_ICON_SET,
      CHANNELS.SETTINGS_STORAGE.MCP_ICON_DELETE,
      CHANNELS.SETTINGS_STORAGE.MCP_ICON_LIST_OWNERS,
      CHANNELS.SETTINGS_STORAGE.MCP_ICON_MIGRATE_LEGACY,
      CHANNELS.SETTINGS_STORAGE.MIGRATE_PROVIDER_CREDENTIALS,
      CHANNELS.SETTINGS_STORAGE.SET_PROVIDER_CREDENTIAL,
      CHANNELS.SETTINGS_STORAGE.DELETE_PROVIDER_CREDENTIAL,
      // Phase 5 — reset-settings + db-stats (plan §6-Phase5)
      CHANNELS.SETTINGS_STORAGE.RESET_SETTINGS,
      CHANNELS.SETTINGS_STORAGE.DB_STATS,
    ].forEach((channel) => {
      expect(PRELOAD_INVOKE_CHANNELS).toContain(channel);
      expect(IPC_HANDLE_CHANNELS).toContain(channel);
      // sync IPC is bootstrap-only (plan §4.2)
      expect(PRELOAD_SEND_SYNC_CHANNELS).not.toContain(channel);
    });
  });

  test("memory vault channels are invoke-only, classified on both sides, with no read/resolve surface", () => {
    const vaultChannels = Object.values(CHANNELS.MEMORY_VAULT);
    expect(vaultChannels).toHaveLength(6);
    vaultChannels.forEach((channel) => {
      // invoke → handle on both sides…
      expect(PRELOAD_INVOKE_CHANNELS).toContain(channel);
      expect(IPC_HANDLE_CHANNELS).toContain(channel);
      // …and NEVER sync, send or event — the vault has no other transport.
      expect(PRELOAD_SEND_SYNC_CHANNELS).not.toContain(channel);
      expect(IPC_ON_SYNC_CHANNELS).not.toContain(channel);
      expect(PRELOAD_SEND_CHANNELS).not.toContain(channel);
      expect(IPC_ON_CHANNELS).not.toContain(channel);
      expect(MAIN_EVENT_CHANNELS).not.toContain(channel);
      // Security sign-off condition: no plaintext-read IPC exists.
      expect(channel).not.toMatch(/read|resolve|decrypt|reveal|export|plaintext/);
      // …and no sink executor / broker control plane either: registering an
      // executor or starting the broker is main-process-only.
      expect(channel).not.toMatch(/configure|executor|sink|broker|worker|intent/);
    });
    // Whole-namespace lock, not just the six values.
    for (const key of Object.keys(CHANNELS.MEMORY_VAULT)) {
      expect(key).not.toMatch(/CONFIGURE|EXECUTOR|SINK|BROKER|WORKER|INTENT/);
    }
  });

  test("memory vault handlers are wired through registerIpcHandlers", () => {
    const handleChannels = new Set();
    const ipcMain = {
      handle: jest.fn((channel) => handleChannels.add(channel)),
      on: jest.fn(),
    };

    registerIpcHandlers({
      ipcMain,
      app: {},
      services: {
        windowService: {},
        updateService: {},
        ollamaService: {},
        unchainService: {},
        runtimeService: {},
        screenshotService: {},
        chatStorageService: {},
        settingsStorageService: {},
        memoryVaultService: {},
      },
    });

    Object.values(CHANNELS.MEMORY_VAULT).forEach((channel) => {
      expect(handleChannels.has(channel)).toBe(true);
    });
  });

  test("context v2 channels are invoke-only, classified on both sides, and carry no generic proxy", () => {
    const contextChannels = Object.values(CHANNELS.CONTEXT_V2);
    expect(contextChannels).toHaveLength(18);
    // The whole namespace is one channel per explicit capability.
    expect(new Set(contextChannels).size).toBe(18);

    contextChannels.forEach((channel) => {
      expect(PRELOAD_INVOKE_CHANNELS).toContain(channel);
      expect(IPC_HANDLE_CHANNELS).toContain(channel);
      // No other transport: not sync, not send, not event.
      expect(PRELOAD_SEND_SYNC_CHANNELS).not.toContain(channel);
      expect(IPC_ON_SYNC_CHANNELS).not.toContain(channel);
      expect(PRELOAD_SEND_CHANNELS).not.toContain(channel);
      expect(IPC_ON_CHANNELS).not.toContain(channel);
      expect(MAIN_EVENT_CHANNELS).not.toContain(channel);
      // Namespaced away from the already-high-risk unchain bridge.
      expect(channel.startsWith("context-v2:")).toBe(true);
      expect(channel.startsWith("unchain:")).toBe(false);
      // No generic proxy / privileged-plumbing channel may ever appear here.
      expect(channel).not.toMatch(
        /invoke|proxy|request|fetch|url|endpoint|path|token|port|claim|lease|heartbeat|bootstrap|append/,
      );
      // Chat deletion is main-internal (chat store + deletion outbox); the
      // renderer gets no Context V2 delete channel of any kind.
      expect(channel).not.toMatch(/delete|destroy|purge|drop/i);
    });
    expect(CHANNELS.CONTEXT_V2.DELETE_CHAT).toBeUndefined();
    expect(PRELOAD_INVOKE_CHANNELS).not.toContain("context-v2:delete-chat");
    expect(IPC_HANDLE_CHANNELS).not.toContain("context-v2:delete-chat");

    // Capability freeze: exactly these operations, nothing more.
    expect(contextChannels.slice().sort()).toEqual(
      [
        "context-v2:get-status",
        "context-v2:list-events",
        "context-v2:read-content",
        "context-v2:get-session-head",
        "context-v2:rebase-session",
        "context-v2:list-spaces",
        "context-v2:get-tree",
        "context-v2:list-entries",
        "context-v2:search-entries",
        "context-v2:list-candidates",
        "context-v2:list-jobs",
        "context-v2:list-promotions",
        "context-v2:decide-candidate",
        "context-v2:create-promotion",
        "context-v2:decide-promotion",
        "context-v2:list-candidate-reviews",
        "context-v2:get-candidate-review",
        "context-v2:decide-candidate-review",
      ].sort(),
    );

    // The review triad is read + adjudicate only. A propose/create channel
    // would let the renderer manufacture the diff it then approves, and a
    // second content channel would bypass the READ_CONTENT ref grammar.
    [
      "context-v2:propose-candidate-review",
      "context-v2:create-candidate-review",
      "context-v2:read-candidate-review-content",
    ].forEach((channel) => {
      expect(contextChannels).not.toContain(channel);
      expect(PRELOAD_INVOKE_CHANNELS).not.toContain(channel);
      expect(IPC_HANDLE_CHANNELS).not.toContain(channel);
    });
    expect(
      contextChannels.filter((channel) => /propose|create-candidate/.test(channel)),
    ).toEqual([]);
  });

  test("context v2 handlers are wired 1:1 to explicit unchain service methods", async () => {
    const registeredHandlers = new Map();
    const ipcMain = {
      handle: jest.fn((channel, handler) => {
        registeredHandlers.set(channel, handler);
      }),
      on: jest.fn(),
    };
    const called = [];
    const unchainService = new Proxy(
      {},
      {
        get: (_target, property) => (payload) => {
          called.push([property, payload]);
          return Promise.resolve({ ok: true, method: property });
        },
      },
    );

    registerIpcHandlers({
      ipcMain,
      app: {},
      services: {
        windowService: {},
        updateService: {},
        ollamaService: {},
        unchainService,
        runtimeService: {},
        screenshotService: {},
        chatStorageService: {},
        settingsStorageService: {},
        memoryVaultService: {},
      },
    });

    const expectedBindings = [
      [CHANNELS.CONTEXT_V2.GET_STATUS, "getContextV2Status"],
      [CHANNELS.CONTEXT_V2.LIST_EVENTS, "listContextV2Events"],
      [CHANNELS.CONTEXT_V2.READ_CONTENT, "readContextV2Content"],
      [CHANNELS.CONTEXT_V2.GET_SESSION_HEAD, "getContextV2SessionHead"],
      [CHANNELS.CONTEXT_V2.REBASE_SESSION, "rebaseContextV2Session"],
      [CHANNELS.CONTEXT_V2.LIST_SPACES, "listContextV2Spaces"],
      [CHANNELS.CONTEXT_V2.GET_TREE, "getContextV2Tree"],
      [CHANNELS.CONTEXT_V2.LIST_ENTRIES, "listContextV2Entries"],
      [CHANNELS.CONTEXT_V2.SEARCH_ENTRIES, "searchContextV2Entries"],
      [CHANNELS.CONTEXT_V2.LIST_CANDIDATES, "listContextV2Candidates"],
      [CHANNELS.CONTEXT_V2.LIST_JOBS, "listContextV2Jobs"],
      [CHANNELS.CONTEXT_V2.LIST_PROMOTIONS, "listContextV2Promotions"],
      [CHANNELS.CONTEXT_V2.DECIDE_CANDIDATE, "decideContextV2Candidate"],
      [CHANNELS.CONTEXT_V2.CREATE_PROMOTION, "createContextV2Promotion"],
      [CHANNELS.CONTEXT_V2.DECIDE_PROMOTION, "decideContextV2Promotion"],
      [
        CHANNELS.CONTEXT_V2.LIST_CANDIDATE_REVIEWS,
        "listContextV2CandidateReviews",
      ],
      [CHANNELS.CONTEXT_V2.GET_CANDIDATE_REVIEW, "getContextV2CandidateReview"],
      [
        CHANNELS.CONTEXT_V2.DECIDE_CANDIDATE_REVIEW,
        "decideContextV2CandidateReview",
      ],
    ];

    // eslint-disable-next-line no-restricted-syntax
    for (const [channel, method] of expectedBindings) {
      const handler = registeredHandlers.get(channel);
      expect(typeof handler).toBe("function");
      // eslint-disable-next-line no-await-in-loop
      await expect(handler({}, { ownerChatId: "chat-1" })).resolves.toEqual({
        ok: true,
        method,
      });
    }

    expect(called.map(([method]) => method)).toEqual(
      expectedBindings.map(([, method]) => method),
    );
    expect(expectedBindings).toHaveLength(18);

    // No registered handler reaches a review PROPOSE method under any channel.
    expect(called.map(([method]) => method)).not.toContain(
      "proposeContextV2CandidateReview",
    );

    // deleteContextV2Chat still EXISTS on the unchain service and is still
    // driven by the main-process deletion outbox — it is simply not reachable
    // from the renderer. No registered handler may invoke it, under any
    // channel name, and no delete-shaped context-v2 channel may exist at all.
    expect(called.map(([method]) => method)).not.toContain(
      "deleteContextV2Chat",
    );
    expect(
      [...registeredHandlers.keys()].filter(
        (channel) =>
          channel.startsWith("context-v2:") && /delete/i.test(channel),
      ),
    ).toEqual([]);
  });

  test("context v2 handler logs only the operation and the stable error code", async () => {
    const registeredHandlers = new Map();
    const ipcMain = {
      handle: jest.fn((channel, handler) => {
        registeredHandlers.set(channel, handler);
      }),
      on: jest.fn(),
    };
    const secretish = new Error(
      "[context_v2_invalid_request] ownerChatId is invalid :: sk-SENTINEL",
    );
    secretish.code = "context_v2_invalid_request";
    const unchainService = {
      listContextV2Events: jest.fn().mockRejectedValue(secretish),
    };

    registerIpcHandlers({
      ipcMain,
      app: {},
      services: {
        windowService: {},
        updateService: {},
        ollamaService: {},
        unchainService,
        runtimeService: {},
        screenshotService: {},
        chatStorageService: {},
        settingsStorageService: {},
        memoryVaultService: {},
      },
    });

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await expect(
        registeredHandlers.get(CHANNELS.CONTEXT_V2.LIST_EVENTS)(
          {},
          { ownerChatId: "../../etc/passwd" },
        ),
      ).rejects.toThrow(/context_v2_invalid_request/);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      const logged = warnSpy.mock.calls[0].join(" ");
      expect(logged).toContain("listContextV2Events");
      expect(logged).toContain("context_v2_invalid_request");
      // Neither the payload nor the upstream message may be logged.
      expect(logged).not.toContain("sk-SENTINEL");
      expect(logged).not.toContain("etc/passwd");
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("settings quit drain uses only asynchronous control channels", () => {
    expect(PRELOAD_SEND_CHANNELS).toContain(
      CHANNELS.SETTINGS_STORAGE.QUIT_DRAIN_RESULT,
    );
    expect(IPC_ON_CHANNELS).toContain(
      CHANNELS.SETTINGS_STORAGE.QUIT_DRAIN_RESULT,
    );
    [
      CHANNELS.SETTINGS_STORAGE.QUIT_DRAIN_REQUEST,
      CHANNELS.SETTINGS_STORAGE.QUIT_DRAIN_ABORT,
    ].forEach((channel) => {
      expect(MAIN_EVENT_CHANNELS).toContain(channel);
      expect(PRELOAD_EVENT_CHANNELS).toContain(channel);
    });
    [
      CHANNELS.SETTINGS_STORAGE.QUIT_DRAIN_REQUEST,
      CHANNELS.SETTINGS_STORAGE.QUIT_DRAIN_RESULT,
      CHANNELS.SETTINGS_STORAGE.QUIT_DRAIN_ABORT,
    ].forEach((channel) => {
      expect(PRELOAD_SEND_SYNC_CHANNELS).not.toContain(channel);
      expect(IPC_ON_SYNC_CHANNELS).not.toContain(channel);
    });
  });

  test("settings storage handlers are wired through registerIpcHandlers", () => {
    const handleChannels = new Set();
    const onChannels = new Set();
    const ipcMain = {
      handle: jest.fn((channel) => handleChannels.add(channel)),
      on: jest.fn((channel) => onChannels.add(channel)),
    };

    registerIpcHandlers({
      ipcMain,
      app: {},
      services: {
        windowService: {},
        updateService: {},
        ollamaService: {},
        unchainService: {},
        runtimeService: {},
        screenshotService: {},
        chatStorageService: {},
        settingsStorageService: {},
        memoryVaultService: {},
      },
    });

    expect(onChannels.has(CHANNELS.SETTINGS_STORAGE.BOOTSTRAP_READ)).toBe(true);
    [
      CHANNELS.SETTINGS_STORAGE.MIGRATE_LEGACY,
      CHANNELS.SETTINGS_STORAGE.SET_NAMESPACE,
      CHANNELS.SETTINGS_STORAGE.DELETE_NAMESPACE,
      CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_APPEND,
      CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_QUERY,
      CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_CLEAR,
      CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_MIGRATE_LEGACY,
      CHANNELS.SETTINGS_STORAGE.DEFAULT_TOOLKITS_READ_ALL,
      CHANNELS.SETTINGS_STORAGE.DEFAULT_TOOLKITS_REPLACE_SCOPE,
      CHANNELS.SETTINGS_STORAGE.DEFAULT_TOOLKITS_MIGRATE_LEGACY,
      CHANNELS.SETTINGS_STORAGE.TOOLKIT_AUTO_APPROVE_READ_ALL,
      CHANNELS.SETTINGS_STORAGE.TOOLKIT_AUTO_APPROVE_REPLACE_ALL,
      CHANNELS.SETTINGS_STORAGE.TOOLKIT_AUTO_APPROVE_MIGRATE_LEGACY,
      CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_READ_ALL,
      CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_SET_KEY,
      CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_CLEAR_KEY,
      CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_MIGRATE_LEGACY,
      CHANNELS.SETTINGS_STORAGE.MCP_ICON_GET,
      CHANNELS.SETTINGS_STORAGE.MCP_ICON_SET,
      CHANNELS.SETTINGS_STORAGE.MCP_ICON_DELETE,
      CHANNELS.SETTINGS_STORAGE.MCP_ICON_LIST_OWNERS,
      CHANNELS.SETTINGS_STORAGE.MCP_ICON_MIGRATE_LEGACY,
      CHANNELS.SETTINGS_STORAGE.MIGRATE_PROVIDER_CREDENTIALS,
      CHANNELS.SETTINGS_STORAGE.SET_PROVIDER_CREDENTIAL,
      CHANNELS.SETTINGS_STORAGE.DELETE_PROVIDER_CREDENTIAL,
      // Phase 5 — reset-settings + db-stats (plan §6-Phase5)
      CHANNELS.SETTINGS_STORAGE.RESET_SETTINGS,
      CHANNELS.SETTINGS_STORAGE.DB_STATS,
    ].forEach((channel) => {
      expect(handleChannels.has(channel)).toBe(true);
    });
  });

  test("v4 stream attach/detach channels are classified on both sides", () => {
    // attach-v4 is a request/response invoke → main handle
    expect(PRELOAD_INVOKE_CHANNELS).toContain(
      CHANNELS.UNCHAIN.STREAM_ATTACH_V4,
    );
    expect(IPC_HANDLE_CHANNELS).toContain(CHANNELS.UNCHAIN.STREAM_ATTACH_V4);

    // detach is fire-and-forget send → main on
    expect(PRELOAD_SEND_CHANNELS).toContain(CHANNELS.UNCHAIN.STREAM_DETACH);
    expect(IPC_ON_CHANNELS).toContain(CHANNELS.UNCHAIN.STREAM_DETACH);
  });

  test("skill-repo download channel is classified on both sides", () => {
    expect(PRELOAD_INVOKE_CHANNELS).toContain(
      CHANNELS.UNCHAIN.DOWNLOAD_SKILL_REPO,
    );
    expect(IPC_HANDLE_CHANNELS).toContain(
      CHANNELS.UNCHAIN.DOWNLOAD_SKILL_REPO,
    );
  });

  test("skill-repo download invoke delegates to the runtime service", async () => {
    const registeredHandlers = new Map();
    const ipcMain = {
      handle: jest.fn((channel, handler) => {
        registeredHandlers.set(channel, handler);
      }),
      on: jest.fn(),
    };
    const downloadAck = { ok: true, dir: "/tmp/pupu-skillpack-abc" };
    const runtimeService = {
      downloadSkillRepo: jest.fn().mockResolvedValue(downloadAck),
    };

    registerIpcHandlers({
      ipcMain,
      app: {},
      services: {
        windowService: {},
        updateService: {},
        ollamaService: {},
        unchainService: {},
        runtimeService,
        screenshotService: {},
        chatStorageService: {},
        settingsStorageService: {},
        memoryVaultService: {},
      },
    });

    const payload = {
      repo: "obra/superpowers",
      sha: "a".repeat(40),
      manifest: [{ path: "skills/a/SKILL.md", sha256: "b".repeat(64) }],
    };
    const handler = registeredHandlers.get(
      CHANNELS.UNCHAIN.DOWNLOAD_SKILL_REPO,
    );

    await expect(handler({}, payload)).resolves.toEqual(downloadAck);
    expect(runtimeService.downloadSkillRepo).toHaveBeenCalledWith(payload);
  });

  test("semantic cancel invoke delegates to the unchain service", async () => {
    const registeredHandlers = new Map();
    const ipcMain = {
      handle: jest.fn((channel, handler) => {
        registeredHandlers.set(channel, handler);
      }),
      on: jest.fn(),
    };
    const cancelAck = {
      status: "ok",
      execution_id: "chat-1",
      attempt_id: "attempt-1",
      disposition: "applied",
      state: "cancelled",
    };
    const unchainService = {
      cancelMisoExecution: jest.fn().mockResolvedValue(cancelAck),
    };

    registerIpcHandlers({
      ipcMain,
      app: {},
      services: {
        windowService: {},
        updateService: {},
        ollamaService: {},
        unchainService,
        runtimeService: {},
        screenshotService: {},
        chatStorageService: {},
        settingsStorageService: {},
        memoryVaultService: {},
      },
    });

    const payload = {
      executionId: "chat-1",
      attemptId: "attempt-1",
      reason: "user_stop",
    };
    const handler = registeredHandlers.get(CHANNELS.UNCHAIN.CANCEL_EXECUTION);

    await expect(handler({}, payload)).resolves.toEqual(cancelAck);
    expect(unchainService.cancelMisoExecution).toHaveBeenCalledWith(payload);
  });

  test("set-computer-use-enabled rejects non-boolean and delegates strict boolean", async () => {
    const registeredHandlers = new Map();
    const ipcMain = {
      handle: jest.fn((channel, handler) => {
        registeredHandlers.set(channel, handler);
      }),
      on: jest.fn(),
    };
    const unchainService = {
      setComputerUseEnabled: jest.fn().mockResolvedValue({ enabled: true }),
    };

    registerIpcHandlers({
      ipcMain,
      app: {},
      services: {
        windowService: {},
        updateService: {},
        ollamaService: {},
        unchainService,
        runtimeService: {},
        screenshotService: {},
        chatStorageService: {},
        settingsStorageService: {},
        memoryVaultService: {},
      },
    });

    const handler = registeredHandlers.get(
      CHANNELS.UNCHAIN.SET_COMPUTER_USE_ENABLED,
    );
    expect(typeof handler).toBe("function");

    // Every non-boolean shape must be rejected outright with no truthy coercion
    // and no delegation into the service.
    const rejectedInputs = ["true", "false", 1, 0, null, undefined, {}, []];
    // eslint-disable-next-line no-restricted-syntax
    for (const enabled of rejectedInputs) {
      // eslint-disable-next-line no-await-in-loop
      await expect(handler({}, { enabled })).rejects.toThrow(
        /strict boolean/i,
      );
    }
    // Missing payload entirely is also rejected.
    await expect(handler({})).rejects.toThrow(/strict boolean/i);
    expect(unchainService.setComputerUseEnabled).not.toHaveBeenCalled();

    // Strict booleans pass through unchanged.
    await expect(handler({}, { enabled: true })).resolves.toEqual({
      enabled: true,
    });
    expect(unchainService.setComputerUseEnabled).toHaveBeenCalledWith(true);

    await handler({}, { enabled: false });
    expect(unchainService.setComputerUseEnabled).toHaveBeenLastCalledWith(false);
  });

  test("local Computer Beta channels validate and delegate", async () => {
    const registeredHandlers = new Map();
    const ipcMain = {
      handle: jest.fn((channel, handler) => registeredHandlers.set(channel, handler)),
      on: jest.fn(),
    };
    const unchainService = {
      setComputerUseLocalBetaEnabled: jest.fn().mockResolvedValue({
        local_beta_enabled: true,
      }),
      probeComputerUseModel: jest.fn().mockResolvedValue({ supported: true }),
    };
    registerIpcHandlers({
      ipcMain,
      app: {},
      services: {
        windowService: {}, updateService: {}, ollamaService: {}, unchainService,
        runtimeService: {}, screenshotService: {}, chatStorageService: {},
        settingsStorageService: {},
        memoryVaultService: {},
      },
    });

    const setBeta = registeredHandlers.get(
      CHANNELS.UNCHAIN.SET_COMPUTER_USE_LOCAL_BETA_ENABLED,
    );
    await expect(setBeta({}, { enabled: "true" })).rejects.toThrow(/strict boolean/i);
    await expect(setBeta({}, { enabled: true })).resolves.toEqual({
      local_beta_enabled: true,
    });
    expect(unchainService.setComputerUseLocalBetaEnabled).toHaveBeenCalledWith(true);

    const probe = registeredHandlers.get(CHANNELS.UNCHAIN.PROBE_COMPUTER_USE_MODEL);
    await expect(probe({}, { model: "", force: true })).rejects.toThrow(/requires/i);
    await expect(
      probe({}, { model: "qwen3.5:4b", force: true }),
    ).resolves.toEqual({ supported: true });
    expect(unchainService.probeComputerUseModel).toHaveBeenCalledWith(
      "qwen3.5:4b",
      true,
    );
  });
});
