const path = require("path");
const { CHANNELS } = require("../../shared/channels");

describe("preload API contract", () => {
  let exposed;
  let ipcRenderer;

  beforeEach(() => {
    jest.resetModules();
    exposed = {};

    ipcRenderer = {
      invoke: jest.fn(),
      send: jest.fn(),
      sendSync: jest.fn(),
      on: jest.fn(),
      removeListener: jest.fn(),
    };

    jest.doMock("electron", () => ({
      contextBridge: {
        exposeInMainWorld: (name, value) => {
          exposed[name] = value;
        },
      },
      ipcRenderer,
    }));

    require(path.resolve(__dirname, "../../preload/index.js"));
  });

  test("exposes expected window APIs", () => {
    expect(Object.keys(exposed).sort()).toEqual(
      [
        "__pupuTestBridge",
        "appInfoAPI",
        "appUpdateAPI",
        "chatStorageAPI",
        "contextV2API",
        "memoryVaultAPI",
        "unchainAPI",
        "ollamaAPI",
        "ollamaLibraryAPI",
        "osInfo",
        "runtime",
        "screenshotAPI",
        "settingsStorageAPI",
        "themeAPI",
        "windowStateAPI",
      ].sort(),
    );

    expect(exposed.runtime).toEqual({
      isElectron: true,
      platform: process.platform,
    });
    expect(exposed.osInfo).toEqual({
      platform: process.platform,
    });
  });

  test("memory vault API exposes exactly the six control-plane methods", () => {
    // Security sign-off condition: deposit/listDescriptors/delete/grant/
    // revoke/getStatus and NOTHING else — no read/resolve/decrypt method may
    // ever appear on this surface.
    expect(Object.keys(exposed.memoryVaultAPI).sort()).toEqual([
      "delete",
      "deposit",
      "getStatus",
      "grant",
      "listDescriptors",
      "revoke",
    ]);
  });

  test("context v2 API exposes exactly the eighteen control-plane methods", () => {
    // Capability freeze. Context V2 lives on its OWN window global rather than
    // as more methods on the already-high-risk unchain bridge.
    expect(Object.keys(exposed.contextV2API)).toHaveLength(18);
    expect(Object.keys(exposed.contextV2API).sort()).toEqual(
      [
        "getStatus",
        "listEvents",
        "readContent",
        "getSessionHead",
        "rebaseSession",
        "listSpaces",
        "getTree",
        "listEntries",
        "search",
        "listCandidates",
        "listJobs",
        "listPromotions",
        "decideCandidate",
        "createPromotion",
        "decidePromotion",
        "listCandidateReviews",
        "getCandidateReview",
        "decideCandidateReview",
      ].sort(),
    );

    // No generic proxy and no privileged plumbing may ever appear here.
    Object.keys(exposed.contextV2API).forEach((method) => {
      expect(method).not.toMatch(
        /^(invoke|request|fetch|call|proxy)$|url|endpoint|token|port|path$/i,
      );
    });
    // Explicitly absent surface (internal / lease / server-bound).
    [
      "appendEvent",
      "bootstrapSession",
      "claimJob",
      "heartbeatJob",
      "completeJob",
      "failJob",
      "createJob",
      "createSpace",
      "createEntry",
      "updateEntry",
      "deleteEntry",
      "createCandidate",
      // schema-v4 reviews are read + adjudicate only. Proposing one is a
      // curator-job product; a renderer that could propose AND decide would be
      // approving its own writes.
      "proposeCandidateReview",
      "createCandidateReview",
      "readCandidateReviewContent",
      // Chat deletion is main-internal: the renderer asks the chat store to
      // delete, and the deletion outbox finishes Context V2 cleanup durably.
      "deleteChat",
      "deleteContextV2Chat",
    ].forEach((method) => {
      expect(exposed.contextV2API[method]).toBeUndefined();
    });

    // Nothing delete-shaped survives on this API under any name, and the
    // channel constant it used to invoke is gone from the shared table.
    expect(
      Object.keys(exposed.contextV2API).filter((method) =>
        /delete|destroy|purge|drop/i.test(method),
      ),
    ).toEqual([]);
    expect(CHANNELS.CONTEXT_V2.DELETE_CHAT).toBeUndefined();
    expect(
      Object.values(CHANNELS.CONTEXT_V2).filter((channel) =>
        /delete|destroy|purge|drop/i.test(channel),
      ),
    ).toEqual([]);

    // The Context V2 surface must NOT have been bolted onto window.unchainAPI.
    [
      "getContextV2Status",
      "listContextV2Events",
      "contextV2",
      "decideCandidate",
      "createPromotion",
    ].forEach((method) => {
      expect(exposed.unchainAPI[method]).toBeUndefined();
    });
  });

  test("context v2 bridge reconstructs allowlisted fields and never forwards the caller object", () => {
    const api = exposed.contextV2API;

    api.getStatus();
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.CONTEXT_V2.GET_STATUS,
    );

    api.listEvents({
      ownerChatId: "chat-1",
      sessionId: "session-1",
      attemptId: "attempt-1",
      after: 12,
      limit: 50,
      includePayload: false,
      // Hostile extras must be dropped by the allowlist rebuild.
      unchainAuthToken: "auth-token-123",
      url: "http://127.0.0.1:5879/health",
      __proto__PollutionAttempt: true,
    });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.CONTEXT_V2.LIST_EVENTS,
      {
        ownerChatId: "chat-1",
        sessionId: "session-1",
        attemptId: "attempt-1",
        after: 12,
        limit: 50,
        includePayload: false,
      },
    );

    api.readContent({
      ownerChatId: "chat-1",
      ref: "pupu://context/event/evt-1/content",
      offset: 0,
      limit: 1024,
      path: "/etc/passwd",
    });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.CONTEXT_V2.READ_CONTENT,
      {
        ownerChatId: "chat-1",
        ref: "pupu://context/event/evt-1/content",
        offset: 0,
        limit: 1024,
      },
    );

    api.getSessionHead({
      ownerChatId: "chat-1",
      sessionId: "session-1",
      path: "/etc/passwd",
    });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.CONTEXT_V2.GET_SESSION_HEAD,
      {
        ownerChatId: "chat-1",
        sessionId: "session-1",
      },
    );

    const replacementHistory = [{ role: "user", content: "Replacement" }];
    api.rebaseSession({
      ownerChatId: "chat-1",
      sessionId: "session-1",
      replacementHistory,
      sourceGenerationId: "generation-2",
      expectedSessionRevision: 3,
      operationId: "op-rebase-0001",
      reason: "edit",
      attemptId: "must-be-dropped",
      expectedRevision: 99,
    });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.CONTEXT_V2.REBASE_SESSION,
      {
        ownerChatId: "chat-1",
        sessionId: "session-1",
        replacementHistory,
        sourceGenerationId: "generation-2",
        expectedSessionRevision: 3,
        operationId: "op-rebase-0001",
        reason: "edit",
      },
    );

    // No deleteChat call to make: the capability does not exist on this API.
    expect(api.deleteChat).toBeUndefined();

    api.listSpaces({ ownerChatId: "chat-1", scope: "user" });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.CONTEXT_V2.LIST_SPACES,
      { ownerChatId: "chat-1" },
    );

    api.getTree({ ownerChatId: "chat-1", spaceId: "space-1" });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.CONTEXT_V2.GET_TREE,
      { ownerChatId: "chat-1", spaceId: "space-1" },
    );

    api.listEntries({
      ownerChatId: "chat-1",
      spaceId: "space-1",
      parentPath: "/notes",
      includeDescendants: false,
    });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.CONTEXT_V2.LIST_ENTRIES,
      {
        ownerChatId: "chat-1",
        spaceId: "space-1",
        parentPath: "/notes",
        includeDescendants: false,
      },
    );

    api.search({
      ownerChatId: "chat-1",
      query: "deploy notes",
      spaceId: "space-1",
      limit: 20,
    });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.CONTEXT_V2.SEARCH_ENTRIES,
      {
        ownerChatId: "chat-1",
        query: "deploy notes",
        spaceId: "space-1",
        limit: 20,
      },
    );

    [
      [api.listCandidates, CHANNELS.CONTEXT_V2.LIST_CANDIDATES],
      [api.listJobs, CHANNELS.CONTEXT_V2.LIST_JOBS],
      [api.listPromotions, CHANNELS.CONTEXT_V2.LIST_PROMOTIONS],
      [api.listCandidateReviews, CHANNELS.CONTEXT_V2.LIST_CANDIDATE_REVIEWS],
    ].forEach(([method, channel]) => {
      method({
        ownerChatId: "chat-1",
        status: "pending",
        limit: 10,
        workerId: "worker-1",
        leaseMs: 30000,
      });
      expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(channel, {
        ownerChatId: "chat-1",
        status: "pending",
        limit: 10,
      });
    });

    api.getCandidateReview({
      ownerChatId: "chat-1",
      reviewId: "review-1",
      // Everything below is a steering attempt and must be stripped.
      spaceId: "space-attacker",
      path: "/etc/passwd",
      includeContent: true,
    });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.CONTEXT_V2.GET_CANDIDATE_REVIEW,
      { ownerChatId: "chat-1", reviewId: "review-1" },
    );

    api.decideCandidateReview({
      ownerChatId: "chat-1",
      reviewId: "review-1",
      decision: "apply",
      expectedReviewRevision: 2,
      expectedCandidateRevision: 3,
      expectedTargetRevision: 4,
      expectedSpaceRevision: 5,
      decisionReason: "looks right",
      operationId: "op-review-0001",
      // A review decides WHETHER a proposed write lands, never WHERE: none of
      // these may cross the line.
      targetPath: "/profile/attacker.md",
      targetNamespace: "user:attacker",
      target_namespace: "user:attacker",
      targetSpaceId: "space-attacker",
      jobId: "job-1",
      leaseToken: "lease-1",
    });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.CONTEXT_V2.DECIDE_CANDIDATE_REVIEW,
      {
        ownerChatId: "chat-1",
        reviewId: "review-1",
        decision: "apply",
        expectedReviewRevision: 2,
        expectedCandidateRevision: 3,
        expectedTargetRevision: 4,
        expectedSpaceRevision: 5,
        decisionReason: "looks right",
        operationId: "op-review-0001",
      },
    );
    const [, reviewDecision] = ipcRenderer.invoke.mock.calls.at(-1);
    expect(Object.keys(reviewDecision)).toHaveLength(9);
    expect(JSON.stringify(reviewDecision)).not.toContain("attacker");

    api.decideCandidate({
      ownerChatId: "chat-1",
      candidateId: "cand-1",
      decision: "apply",
      expectedRevision: 1,
      expectedSpaceRevision: 4,
      decisionReason: "user approved",
      operationId: "op-candidate-0001",
    });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.CONTEXT_V2.DECIDE_CANDIDATE,
      {
        ownerChatId: "chat-1",
        candidateId: "cand-1",
        decision: "apply",
        expectedRevision: 1,
        expectedSpaceRevision: 4,
        decisionReason: "user approved",
        operationId: "op-candidate-0001",
      },
    );

    // targetNamespace is server-bound: even when a caller supplies it, the
    // allowlist rebuild must drop it before the channel.
    api.createPromotion({
      ownerChatId: "chat-1",
      sourceSpaceId: "space-1",
      sourceEntryId: "entry-1",
      sourceEntryRevision: 2,
      targetPath: "/profile/preferences.md",
      targetEntryId: "",
      expectedTargetRevision: 5,
      operationId: "op-promote-0001",
      targetNamespace: "user:attacker",
      target_namespace: "user:attacker",
    });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.CONTEXT_V2.CREATE_PROMOTION,
      {
        ownerChatId: "chat-1",
        sourceSpaceId: "space-1",
        sourceEntryId: "entry-1",
        sourceEntryRevision: 2,
        targetPath: "/profile/preferences.md",
        targetEntryId: "",
        expectedTargetRevision: 5,
        operationId: "op-promote-0001",
      },
    );

    api.decidePromotion({
      ownerChatId: "chat-1",
      promotionId: "promo-1",
      decision: "reject",
      expectedRevision: 2,
      decisionReason: "not now",
      operationId: "op-promo-decide-0001",
    });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.CONTEXT_V2.DECIDE_PROMOTION,
      {
        ownerChatId: "chat-1",
        promotionId: "promo-1",
        decision: "reject",
        expectedRevision: 2,
        decisionReason: "not now",
        operationId: "op-promo-decide-0001",
      },
    );

    // Called with no argument at all: the shape is still the allowlist, with
    // every field explicitly undefined, so main rejects rather than defaulting.
    api.listSpaces();
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.CONTEXT_V2.LIST_SPACES,
      { ownerChatId: undefined },
    );
  });

  test("unchain API keeps required method surface", () => {
    const unchain = exposed.unchainAPI;

    [
      "getStatus",
      "getComputerUseStatus",
      "setComputerUseEnabled",
      "setComputerUseLocalBetaEnabled",
      "probeComputerUseModel",
      "openComputerUsePrivacySettings",
      "getModelCatalog",
      "getToolkitCatalog",
      "listMcpToolkits",
      "installMcpToolkit",
      "testCustomProvider",
      "deleteMcpToolkit",
      "reloadMcpToolkits",
      "checkMcpToolkitHealth",
      "configureMcpToolkit",
      "startMcpOAuth",
      "cancelMcpOAuth",
      "getMcpOAuthStatus",
      "disconnectMcpOAuth",
      "listMcpOAuthApps",
      "configureMcpOAuthApp",
      "deleteMcpOAuthApp",
      "listMcpStoreMetadata",
      "reloadMcpStoreMetadata",
      "listMcpStoreEntries",
      "listMcpStoreRegistries",
      "importMcpStoreRegistry",
      "validateMcpStoreRegistry",
      "refreshMcpStoreRegistry",
      "deleteMcpStoreRegistry",
      "approveMcpStoreEntry",
      "revokeMcpStoreEntryApproval",
      "respondToolConfirmation",
      "getPendingInteraction",
      "interject",
      "setChromeTerminalOpen",
      "syncBuildFeatureFlagsSnapshot",
      "pickWorkspaceRoot",
      "validateWorkspaceRoot",
      "openRuntimeFolder",
      "getRuntimeDirSize",
      "deleteRuntimeEntry",
      "clearRuntimeDir",
      "getSessionMemoryExport",
      "listCharacters",
      "getCharacter",
      "saveCharacter",
      "deleteCharacter",
      "previewCharacterDecision",
      "buildCharacterAgentConfig",
      "replaceSessionMemory",
      "startStream",
      "startStreamV2",
      "startStreamV4",
      "cancelStream",
      "cancelExecution",
    ].forEach((method) => {
      expect(typeof unchain[method]).toBe("function");
    });
    expect(unchain.startStreamV3).toBeUndefined();
  });

  test("chat storage API keeps required method surface", async () => {
    expect(Object.keys(exposed.chatStorageAPI).sort()).toEqual(
      [
        "applyOps",
        "applyOpsSync",
        "bootstrap",
        "readMessages",
        "write",
      ].sort(),
    );
    [
      "bootstrap",
      "write",
      "readMessages",
      "applyOps",
      "applyOpsSync",
    ].forEach((method) => {
      expect(typeof exposed.chatStorageAPI[method]).toBe("function");
    });

    ipcRenderer.sendSync.mockReturnValueOnce({
      ok: true,
      value: [{ role: "user" }],
    });
    const messages = exposed.chatStorageAPI.readMessages("chat-1");
    expect(ipcRenderer.sendSync).toHaveBeenLastCalledWith(
      CHANNELS.CHAT_STORAGE.READ_MESSAGES,
      "chat-1",
    );
    expect(messages).toEqual([{ role: "user" }]);

    const ops = [{ type: "delete_chats", chatIds: ["chat-1"] }];
    ipcRenderer.invoke.mockResolvedValueOnce({ ok: true, value: null });
    await exposed.chatStorageAPI.applyOps(ops);
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.CHAT_STORAGE.APPLY_OPS,
      ops,
    );
  });

  test("settings storage API keeps required method surface", () => {
    expect(Object.keys(exposed.settingsStorageAPI).sort()).toEqual(
      [
        "bootstrap",
        "deleteNamespace",
        "migrateLegacy",
        "setNamespace",
        "appendTokenUsage",
        "queryTokenUsage",
        "clearTokenUsage",
        "migrateLegacyTokenUsage",
        "readDefaultToolkits",
        "replaceDefaultToolkitsScope",
        "migrateLegacyDefaultToolkits",
        "readToolkitAutoApprove",
        "replaceToolkitAutoApprove",
        "migrateLegacyToolkitAutoApprove",
        "readComputerUsePreferences",
        "setComputerUsePreference",
        "clearComputerUsePreference",
        "migrateLegacyComputerUse",
        "getMcpIconAsset",
        "setMcpIconAsset",
        "deleteMcpIconAsset",
        "listMcpIconOwners",
        "migrateMcpIconsLegacy",
        "migrateProviderCredentials",
        "setProviderCredential",
        "deleteProviderCredential",
        "resetSettings",
        "getDbStats",
        "onQuitDrainRequest",
        "onQuitDrainAbort",
        "sendQuitDrainResult",
      ].sort(),
    );
    [
      "bootstrap",
      "migrateLegacy",
      "setNamespace",
      "deleteNamespace",
      "appendTokenUsage",
      "queryTokenUsage",
      "clearTokenUsage",
      "migrateLegacyTokenUsage",
      "readDefaultToolkits",
      "replaceDefaultToolkitsScope",
      "migrateLegacyDefaultToolkits",
      "readToolkitAutoApprove",
      "replaceToolkitAutoApprove",
      "migrateLegacyToolkitAutoApprove",
      "readComputerUsePreferences",
      "setComputerUsePreference",
      "clearComputerUsePreference",
      "migrateLegacyComputerUse",
      "getMcpIconAsset",
      "setMcpIconAsset",
      "deleteMcpIconAsset",
      "listMcpIconOwners",
      "migrateMcpIconsLegacy",
      "migrateProviderCredentials",
      "setProviderCredential",
      "deleteProviderCredential",
      "resetSettings",
      "getDbStats",
      "onQuitDrainRequest",
      "onQuitDrainAbort",
      "sendQuitDrainResult",
    ].forEach((method) => {
      expect(typeof exposed.settingsStorageAPI[method]).toBe("function");
    });

    ipcRenderer.sendSync.mockReturnValueOnce({
      available: true,
      namespaces: {},
    });
    const snapshot = exposed.settingsStorageAPI.bootstrap();
    expect(ipcRenderer.sendSync).toHaveBeenLastCalledWith(
      CHANNELS.SETTINGS_STORAGE.BOOTSTRAP_READ,
    );
    expect(snapshot).toEqual({ available: true, namespaces: {} });

    exposed.settingsStorageAPI.setNamespace(
      "appearance",
      { theme_mode: "dark_mode" },
      { expectedRevision: 2 },
    );
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.SETTINGS_STORAGE.SET_NAMESPACE,
      {
        namespace: "appearance",
        value: { theme_mode: "dark_mode" },
        options: { expectedRevision: 2 },
      },
    );

    exposed.settingsStorageAPI.deleteNamespace("dev");
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.SETTINGS_STORAGE.DELETE_NAMESPACE,
      { namespace: "dev" },
    );

    const migrationPayload = {
      migrationVersion: 1,
      settingsRoot: { app: { setup_completed: true } },
    };
    exposed.settingsStorageAPI.migrateLegacy(migrationPayload);
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.SETTINGS_STORAGE.MIGRATE_LEGACY,
      migrationPayload,
    );

    const tokenRecord = {
      timestamp: 1,
      provider: "openai",
      model: "gpt-5",
      model_id: "openai:gpt-5",
      consumed_tokens: 42,
    };
    exposed.settingsStorageAPI.appendTokenUsage(tokenRecord);
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_APPEND,
      { record: tokenRecord },
    );

    exposed.settingsStorageAPI.queryTokenUsage({ startMs: 1, endMs: 2 });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_QUERY,
      { query: { startMs: 1, endMs: 2 } },
    );

    exposed.settingsStorageAPI.clearTokenUsage();
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_CLEAR,
    );

    const tokenMigrationPayload = { migrationVersion: 1, records: [tokenRecord] };
    exposed.settingsStorageAPI.migrateLegacyTokenUsage(tokenMigrationPayload);
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_MIGRATE_LEGACY,
      tokenMigrationPayload,
    );

    exposed.settingsStorageAPI.readDefaultToolkits();
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.SETTINGS_STORAGE.DEFAULT_TOOLKITS_READ_ALL,
    );

    exposed.settingsStorageAPI.replaceDefaultToolkitsScope("global", ["core"]);
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.SETTINGS_STORAGE.DEFAULT_TOOLKITS_REPLACE_SCOPE,
      { scopeKey: "global", toolkitIds: ["core"] },
    );

    const defaultToolkitsMigrationPayload = {
      migrationVersion: 1,
      scopes: { global: ["core"] },
    };
    exposed.settingsStorageAPI.migrateLegacyDefaultToolkits(
      defaultToolkitsMigrationPayload,
    );
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.SETTINGS_STORAGE.DEFAULT_TOOLKITS_MIGRATE_LEGACY,
      defaultToolkitsMigrationPayload,
    );

    exposed.settingsStorageAPI.readToolkitAutoApprove();
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.SETTINGS_STORAGE.TOOLKIT_AUTO_APPROVE_READ_ALL,
    );

    const autoApprovePayload = {
      toolkits: ["core"],
      tools: [{ toolkitId: "core", toolName: "write_file" }],
    };
    exposed.settingsStorageAPI.replaceToolkitAutoApprove(autoApprovePayload);
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.SETTINGS_STORAGE.TOOLKIT_AUTO_APPROVE_REPLACE_ALL,
      autoApprovePayload,
    );

    const autoApproveMigrationPayload = {
      migrationVersion: 1,
      toolkits: ["core"],
      tools: [],
    };
    exposed.settingsStorageAPI.migrateLegacyToolkitAutoApprove(
      autoApproveMigrationPayload,
    );
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.SETTINGS_STORAGE.TOOLKIT_AUTO_APPROVE_MIGRATE_LEGACY,
      autoApproveMigrationPayload,
    );

    exposed.settingsStorageAPI.readComputerUsePreferences();
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_READ_ALL,
    );

    const consentValue = { version: 1, acceptedAt: "2026-07-24T10:00:00.000Z" };
    exposed.settingsStorageAPI.setComputerUsePreference(
      "consent",
      consentValue,
    );
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_SET_KEY,
      { key: "consent", value: consentValue },
    );

    exposed.settingsStorageAPI.clearComputerUsePreference("enabled");
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_CLEAR_KEY,
      { key: "enabled" },
    );

    const computerUseMigrationPayload = {
      migrationVersion: 1,
      records: { consent: consentValue },
    };
    exposed.settingsStorageAPI.migrateLegacyComputerUse(
      computerUseMigrationPayload,
    );
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_MIGRATE_LEGACY,
      computerUseMigrationPayload,
    );

    exposed.settingsStorageAPI.getMcpIconAsset("mcp.custom.local-test");
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.SETTINGS_STORAGE.MCP_ICON_GET,
      { toolkitId: "mcp.custom.local-test" },
    );

    const iconValue = { mime: "image/png", content: "aGVsbG8=" };
    exposed.settingsStorageAPI.setMcpIconAsset(
      "mcp.custom.local-test",
      iconValue,
    );
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.SETTINGS_STORAGE.MCP_ICON_SET,
      { toolkitId: "mcp.custom.local-test", icon: iconValue },
    );

    exposed.settingsStorageAPI.deleteMcpIconAsset("mcp.custom.local-test");
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.SETTINGS_STORAGE.MCP_ICON_DELETE,
      { toolkitId: "mcp.custom.local-test" },
    );

    exposed.settingsStorageAPI.listMcpIconOwners();
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.SETTINGS_STORAGE.MCP_ICON_LIST_OWNERS,
    );

    const iconMigrationPayload = {
      migrationVersion: 1,
      icons: { "mcp.custom.local-test": iconValue },
    };
    exposed.settingsStorageAPI.migrateMcpIconsLegacy(iconMigrationPayload);
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.SETTINGS_STORAGE.MCP_ICON_MIGRATE_LEGACY,
      iconMigrationPayload,
    );

    const providerCredentialsPayload = {
      migrationVersion: 1,
      credentials: { openai: "sk-SENTINEL" },
    };
    exposed.settingsStorageAPI.migrateProviderCredentials(
      providerCredentialsPayload,
    );
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.SETTINGS_STORAGE.MIGRATE_PROVIDER_CREDENTIALS,
      providerCredentialsPayload,
    );
  });

  test("bridges call expected channels", () => {
    exposed.appInfoAPI.getVersion();
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(CHANNELS.APP.GET_VERSION);

    exposed.appUpdateAPI.getState();
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(CHANNELS.UPDATE.GET_STATE);

    exposed.ollamaAPI.getStatus();
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(CHANNELS.OLLAMA.GET_STATUS);

    exposed.ollamaAPI.listInstalledModels();
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.OLLAMA.LIST_INSTALLED_MODELS,
    );

    exposed.ollamaLibraryAPI.search("q", "c");
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(CHANNELS.OLLAMA.LIBRARY_SEARCH, {
      query: "q",
      category: "c",
    });

    exposed.unchainAPI.getComputerUseStatus();
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.GET_COMPUTER_USE_STATUS,
    );

    exposed.unchainAPI.setComputerUseEnabled(true);
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.SET_COMPUTER_USE_ENABLED,
      { enabled: true },
    );

    // Boundary tightening: the bridge coerces any non-boolean to a strict
    // boolean before it crosses the IPC line — a truthy object becomes `true`.
    exposed.unchainAPI.setComputerUseEnabled({ sneaky: "payload" });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.SET_COMPUTER_USE_ENABLED,
      { enabled: true },
    );

    exposed.unchainAPI.setComputerUseLocalBetaEnabled(true);
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.SET_COMPUTER_USE_LOCAL_BETA_ENABLED,
      { enabled: true },
    );

    exposed.unchainAPI.probeComputerUseModel("qwen3.5:4b", true);
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.PROBE_COMPUTER_USE_MODEL,
      { model: "qwen3.5:4b", force: true },
    );

    exposed.unchainAPI.openComputerUsePrivacySettings("accessibility");
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.OPEN_COMPUTER_USE_PRIVACY_SETTINGS,
      { target: "accessibility" },
    );

    exposed.unchainAPI.setChromeTerminalOpen(true);
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.SET_CHROME_TERMINAL_OPEN,
      { open: true },
    );

    exposed.unchainAPI.syncBuildFeatureFlagsSnapshot({
      enable_user_access_to_agents: true,
    });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.SYNC_BUILD_FEATURE_FLAGS_SNAPSHOT,
      {
        featureFlags: {
          enable_user_access_to_agents: true,
        },
      },
    );

    exposed.unchainAPI.replaceSessionMemory({ sessionId: "chat-1", messages: [] });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.REPLACE_SESSION_MEMORY,
      { sessionId: "chat-1", messages: [] },
    );

    exposed.unchainAPI.getPendingInteraction({ session_id: "chat-1" });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.PENDING_INTERACTION,
      { session_id: "chat-1" },
    );

    exposed.unchainAPI.cancelExecution({
      executionId: "chat-1",
      attemptId: "attempt-1",
    });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.CANCEL_EXECUTION,
      {
        executionId: "chat-1",
        attemptId: "attempt-1",
      },
    );

    exposed.unchainAPI.installMcpToolkit({
      entryId: "custom",
      secrets: {
        SLACK_BOT_TOKEN: "xoxb-test",
        SLACK_TEAM_ID: "T012345",
      },
      customRecipe: {
        toolkit_id: "mcp.custom.local-test",
        toolkit_name: "Local Test",
        mcp: { transport: "stdio", command: "echo", args: ["ok"] },
      },
    });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.INSTALL_MCP_TOOLKIT,
      {
        entryId: "custom",
        secrets: {
          SLACK_BOT_TOKEN: "xoxb-test",
          SLACK_TEAM_ID: "T012345",
        },
        customRecipe: {
          toolkit_id: "mcp.custom.local-test",
          toolkit_name: "Local Test",
          mcp: { transport: "stdio", command: "echo", args: ["ok"] },
        },
      },
    );

    exposed.unchainAPI.deleteMcpToolkit("mcp.memory.memory");
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.DELETE_MCP_TOOLKIT,
      { toolkitId: "mcp.memory.memory" },
    );

    exposed.unchainAPI.testCustomProvider(
      {
        id: "sap-hyperspace",
        protocol: "anthropic",
        base_url: "http://localhost:6655/anthropic",
        models: [{ id: "anthropic--claude-4.5-haiku" }],
      },
      "hs-secret-key",
    );
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.TEST_CUSTOM_PROVIDER,
      {
        custom_provider: {
          id: "sap-hyperspace",
          protocol: "anthropic",
          base_url: "http://localhost:6655/anthropic",
          models: [{ id: "anthropic--claude-4.5-haiku" }],
        },
        api_key: "hs-secret-key",
      },
    );

    exposed.unchainAPI.configureMcpToolkit("mcp.memory.memory", {
      secrets: { OPENAI_API_KEY: "sk-test" },
    });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.CONFIGURE_MCP_TOOLKIT,
      {
        toolkitId: "mcp.memory.memory",
        secrets: { OPENAI_API_KEY: "sk-test" },
      },
    );

    exposed.unchainAPI.startMcpOAuth("productivity.notion-remote");
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.START_MCP_OAUTH,
      { entryId: "productivity.notion-remote" },
    );

    exposed.unchainAPI.cancelMcpOAuth("state-123");
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.CANCEL_MCP_OAUTH,
      { state: "state-123" },
    );

    exposed.unchainAPI.getMcpOAuthStatus("state-123");
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.GET_MCP_OAUTH_STATUS,
      { state: "state-123" },
    );

    exposed.unchainAPI.disconnectMcpOAuth("mcp.productivity.notion-remote");
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.DISCONNECT_MCP_OAUTH,
      { toolkitId: "mcp.productivity.notion-remote" },
    );

    exposed.unchainAPI.listMcpOAuthApps();
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.LIST_MCP_OAUTH_APPS,
    );

    exposed.unchainAPI.configureMcpOAuthApp({
      toolkitId: "mcp.dev.github-remote",
      clientId: "github-client-id",
      clientSecret: "github-client-secret",
    });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.CONFIGURE_MCP_OAUTH_APP,
      {
        toolkitId: "mcp.dev.github-remote",
        clientId: "github-client-id",
        clientSecret: "github-client-secret",
      },
    );

    exposed.unchainAPI.deleteMcpOAuthApp("mcp.dev.github-remote");
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.DELETE_MCP_OAUTH_APP,
      { toolkitId: "mcp.dev.github-remote" },
    );

    exposed.unchainAPI.listMcpStoreMetadata();
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.LIST_MCP_STORE_METADATA,
    );

    exposed.unchainAPI.reloadMcpStoreMetadata({
      entryId: "browser.playwright",
    });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.RELOAD_MCP_STORE_METADATA,
      { entryId: "browser.playwright" },
    );

    exposed.unchainAPI.listMcpStoreEntries();
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.LIST_MCP_STORE_ENTRIES,
    );

    exposed.unchainAPI.listMcpStoreRegistries();
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.LIST_MCP_STORE_REGISTRIES,
    );

    exposed.unchainAPI.importMcpStoreRegistry({
      registry: { version: 1, entries: [] },
    });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.IMPORT_MCP_STORE_REGISTRY,
      { registry: { version: 1, entries: [] } },
    );

    exposed.unchainAPI.validateMcpStoreRegistry({
      registry: { version: 1, entries: [] },
    });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.VALIDATE_MCP_STORE_REGISTRY,
      { registry: { version: 1, entries: [] } },
    );

    exposed.unchainAPI.refreshMcpStoreRegistry("registry.inline.test");
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.REFRESH_MCP_STORE_REGISTRY,
      { registryId: "registry.inline.test" },
    );

    exposed.unchainAPI.deleteMcpStoreRegistry("registry.inline.test");
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.DELETE_MCP_STORE_REGISTRY,
      { registryId: "registry.inline.test" },
    );

    exposed.unchainAPI.approveMcpStoreEntry("external.sample", {
      registryId: "registry.inline.test",
      acknowledgedRisk: true,
    });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.APPROVE_MCP_STORE_ENTRY,
      {
        entryId: "external.sample",
        registryId: "registry.inline.test",
        acknowledgedRisk: true,
      },
    );

    exposed.unchainAPI.revokeMcpStoreEntryApproval("external.sample", {
      registryId: "registry.inline.test",
    });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.REVOKE_MCP_STORE_ENTRY_APPROVAL,
      {
        entryId: "external.sample",
        registryId: "registry.inline.test",
      },
    );

    exposed.unchainAPI.listCharacters();
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.LIST_CHARACTERS,
    );

    exposed.unchainAPI.buildCharacterAgentConfig({ characterId: "mina" });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.BUILD_CHARACTER_AGENT_CONFIG,
      { characterId: "mina" },
    );

    exposed.themeAPI.setThemeMode("dark_mode");
    expect(ipcRenderer.send).toHaveBeenLastCalledWith(
      CHANNELS.THEME.SET_MODE,
      "dark_mode",
    );

    exposed.windowStateAPI.windowStateEventHandler("maximize");
    expect(ipcRenderer.send).toHaveBeenLastCalledWith(
      CHANNELS.WINDOW_STATE.HANDLE_ACTION,
      "maximize",
    );
  });

  test("forwards unchain runtime logs to chrome console", () => {
    const runtimeLogCall = ipcRenderer.on.mock.calls.find(
      (call) => call[0] === CHANNELS.UNCHAIN.RUNTIME_LOG,
    );

    expect(runtimeLogCall).toBeDefined();

    const runtimeLogListener = runtimeLogCall[1];
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      runtimeLogListener({}, { level: "stdout", text: "hello from unchain" });
      runtimeLogListener({}, { level: "stderr", text: "oops from unchain" });
      runtimeLogListener(
        {},
        {
          level: "stderr",
          text: '127.0.0.1 - - [14/Mar/2026 14:09:23] "GET /health HTTP/1.1" 200 -',
        },
      );
      runtimeLogListener({}, { level: "stdout", text: "   " });

      expect(logSpy).toHaveBeenCalledWith("[unchain] hello from unchain");
      expect(errorSpy).toHaveBeenCalledWith("[unchain:error] oops from unchain");
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledTimes(1);
    } finally {
      logSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  test("event listener bridges return unsubscribe", () => {
    const unsubUpdate = exposed.appUpdateAPI.onStateChange(() => {});
    expect(ipcRenderer.on).toHaveBeenCalledWith(
      CHANNELS.UPDATE.STATE_CHANGED,
      expect.any(Function),
    );
    expect(typeof unsubUpdate).toBe("function");
    unsubUpdate();
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(
      CHANNELS.UPDATE.STATE_CHANGED,
      expect.any(Function),
    );

    const unsubWindow = exposed.windowStateAPI.windowStateEventListener(() => {});
    expect(ipcRenderer.on).toHaveBeenCalledWith(
      CHANNELS.WINDOW_STATE.LISTENER_EVENT,
      expect.any(Function),
    );
    expect(typeof unsubWindow).toBe("function");
    unsubWindow();
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(
      CHANNELS.WINDOW_STATE.LISTENER_EVENT,
      expect.any(Function),
    );
  });
});
