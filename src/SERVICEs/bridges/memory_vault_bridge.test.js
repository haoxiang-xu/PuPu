import {
  memoryVaultBridge,
  isMemoryVaultBridgeAvailable,
  parseMemoryVaultErrorCode,
  MEMORY_VAULT_SINK_KINDS,
} from "./memory_vault_bridge";

const makeFakeApi = () => ({
  deposit: jest.fn(() => Promise.resolve({ ok: true })),
  listDescriptors: jest.fn(() => Promise.resolve({ ok: true, descriptors: [] })),
  delete: jest.fn(() => Promise.resolve({ ok: true })),
  grant: jest.fn(() => Promise.resolve({ ok: true })),
  revoke: jest.fn(() => Promise.resolve({ ok: true })),
  getStatus: jest.fn(() =>
    Promise.resolve({
      ok: true,
      available: true,
      secretStorageStatus: "available",
    }),
  ),
});

describe("memory vault renderer bridge", () => {
  afterEach(() => {
    delete window.memoryVaultAPI;
  });

  test("exposes no read/resolve/decrypt operation", () => {
    for (const name of Object.keys(memoryVaultBridge)) {
      expect(name).not.toMatch(/read|resolve|decrypt|reveal|export|plaintext/i);
    }
    expect(Object.keys(memoryVaultBridge).sort()).toEqual([
      "deleteSecret",
      "deposit",
      "getStatus",
      "grant",
      "isAvailable",
      "listDescriptors",
      "revoke",
    ]);
  });

  test("sink kinds are the closed controlled set (mirrors main)", () => {
    expect([...MEMORY_VAULT_SINK_KINDS]).toEqual([
      "computer_input",
      "shell_secret_env",
      "shell_secret_stdin",
      "mcp_schema_secret",
    ]);
    expect(Object.isFrozen(MEMORY_VAULT_SINK_KINDS)).toBe(true);
  });

  test("is unavailable until the preload API is installed, then forwards calls", async () => {
    expect(isMemoryVaultBridgeAvailable()).toBe(false);
    await expect(memoryVaultBridge.getStatus()).rejects.toMatchObject({
      code: "memory_vault_unavailable",
    });

    const api = makeFakeApi();
    window.memoryVaultAPI = api;
    expect(isMemoryVaultBridgeAvailable()).toBe(true);

    const scope = { scopeKind: "chat", scopeId: "chat-1" };
    await memoryVaultBridge.listDescriptors(scope);
    expect(api.listDescriptors).toHaveBeenCalledWith(scope);

    const grantPayload = {
      operationId: "op-1234567",
      ...scope,
      handle: `pvh1_${"a".repeat(64)}`,
      sinkKind: MEMORY_VAULT_SINK_KINDS[0],
    };
    await memoryVaultBridge.grant(grantPayload);
    expect(api.grant).toHaveBeenCalledWith(grantPayload);

    // getStatus carries availability only — never a row count.
    const status = await memoryVaultBridge.getStatus();
    expect(status.counts).toBeUndefined();
  });

  test("a bridge without the full method set reads as unavailable (fail closed)", () => {
    const partial = makeFakeApi();
    delete partial.grant;
    window.memoryVaultAPI = partial;
    expect(isMemoryVaultBridgeAvailable()).toBe(false);
  });

  test("parses the stable error code out of the transported message", () => {
    expect(
      parseMemoryVaultErrorCode(new Error("[invalid_sink_kind] boom")),
    ).toBe("invalid_sink_kind");
    expect(parseMemoryVaultErrorCode(new Error("no code here"))).toBeNull();
  });
});
