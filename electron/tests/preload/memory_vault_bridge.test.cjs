const {
  createMemoryVaultBridge,
} = require("../../preload/bridges/memory_vault_bridge");
const { CHANNELS } = require("../../shared/channels");

const makeFakeIpcRenderer = ({ invokeReturn } = {}) => ({
  invoke: jest.fn(() => Promise.resolve(invokeReturn)),
});

describe("memoryVaultAPI bridge", () => {
  test("requires ipcRenderer", () => {
    expect(() => createMemoryVaultBridge()).toThrow(/ipcRenderer/);
  });

  test("exposes exactly the six control-plane methods — no read/resolve/decrypt", () => {
    const api = createMemoryVaultBridge(makeFakeIpcRenderer());
    expect(Object.keys(api).sort()).toEqual([
      "delete",
      "deposit",
      "getStatus",
      "grant",
      "listDescriptors",
      "revoke",
    ]);
    for (const name of Object.keys(api)) {
      expect(name).not.toMatch(/read|resolve|decrypt|reveal|export|plaintext/i);
      // The sink executor / broker control plane is main-process-only: it must
      // not leak onto the renderer bridge under any name.
      expect(name).not.toMatch(/configure|executor|sink|broker|worker|intent/i);
    }
    const source = require("fs").readFileSync(
      require("path").join(
        __dirname,
        "../../preload/bridges/memory_vault_bridge.js",
      ),
      "utf8",
    );
    expect(source).not.toContain("configureSinkExecutors");
    expect(source).not.toContain("SinkBroker");
  });

  test("deposit rebuilds the payload from the field allowlist (extra fields dropped)", async () => {
    const ipcRenderer = makeFakeIpcRenderer({
      invokeReturn: { ok: true, handle: `pvh1_${"a".repeat(64)}` },
    });
    const api = createMemoryVaultBridge(ipcRenderer);

    const result = await api.deposit({
      operationId: "op-1234567",
      scopeKind: "chat",
      scopeId: "chat-1",
      label: "OpenAI key",
      plaintext: "sk-secret",
      evil: "smuggled",
      onBehalfOf: "someone-else",
    });
    expect(result.ok).toBe(true);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      CHANNELS.MEMORY_VAULT.DEPOSIT,
      {
        operationId: "op-1234567",
        scopeKind: "chat",
        scopeId: "chat-1",
        label: "OpenAI key",
        plaintext: "sk-secret",
      },
    );
  });

  test("listDescriptors always forwards BOTH scope fields — no unscoped call shape exists", async () => {
    const ipcRenderer = makeFakeIpcRenderer({
      invokeReturn: { ok: true, descriptors: [] },
    });
    const api = createMemoryVaultBridge(ipcRenderer);

    // A missing scope is forwarded as an explicit undefined (never omitted),
    // so main rejects it rather than seeing an "empty filter" = list-all.
    await api.listDescriptors();
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.MEMORY_VAULT.LIST_DESCRIPTORS,
      { scopeKind: undefined, scopeId: undefined },
    );

    await api.listDescriptors({ scopeKind: "chat" });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.MEMORY_VAULT.LIST_DESCRIPTORS,
      { scopeKind: "chat", scopeId: undefined },
    );

    await api.listDescriptors({ scopeKind: "chat", scopeId: "chat-1", x: 1 });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.MEMORY_VAULT.LIST_DESCRIPTORS,
      { scopeKind: "chat", scopeId: "chat-1" },
    );
  });

  test("delete / grant / revoke rebuild their payloads from allowlists", async () => {
    const ipcRenderer = makeFakeIpcRenderer({ invokeReturn: { ok: true } });
    const api = createMemoryVaultBridge(ipcRenderer);
    const handle = `pvh1_${"a".repeat(64)}`;
    const grantId = `pvg1_${"b".repeat(32)}`;

    await api.delete({ operationId: "op-1234567", handle, extra: true });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.MEMORY_VAULT.DELETE,
      { operationId: "op-1234567", handle },
    );

    // grant is scope-bound and sink-kind-bound; the legacy free-text
    // `grantee` field is NOT on the allowlist, so it cannot reach main.
    await api.grant({
      operationId: "op-1234568",
      scopeKind: "chat",
      scopeId: "chat-1",
      handle,
      sinkKind: "computer_input",
      grantee: "memory_v2",
      extra: true,
    });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.MEMORY_VAULT.GRANT,
      {
        operationId: "op-1234568",
        scopeKind: "chat",
        scopeId: "chat-1",
        handle,
        sinkKind: "computer_input",
      },
    );
    const invokeCalls = ipcRenderer.invoke.mock.calls;
    const forwarded = invokeCalls[invokeCalls.length - 1][1];
    expect("grantee" in forwarded).toBe(false);
    expect("extra" in forwarded).toBe(false);

    await api.revoke({ operationId: "op-1234569", grantId, extra: true });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.MEMORY_VAULT.REVOKE,
      { operationId: "op-1234569", grantId },
    );
  });

  test("getStatus invokes with no payload", async () => {
    const ipcRenderer = makeFakeIpcRenderer({
      invokeReturn: { ok: true, available: true },
    });
    const api = createMemoryVaultBridge(ipcRenderer);
    await api.getStatus();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      CHANNELS.MEMORY_VAULT.GET_STATUS,
    );
  });

  test("rejections propagate to the caller (no swallowing)", async () => {
    const error = new Error("[invalid_label] boom");
    const ipcRenderer = { invoke: jest.fn(() => Promise.reject(error)) };
    const api = createMemoryVaultBridge(ipcRenderer);
    await expect(api.deposit({})).rejects.toBe(error);
  });
});
