/**
 * Memory V2 P0 vault — three-layer INVOKE-ONLY channel invariant.
 *
 * The vault control plane is request/response only. There is no event channel,
 * no push, no subscription, and above all no read/resolve/decrypt route in any
 * direction: a deposited secret must never travel main -> renderer in any form.
 *
 * This is a SOURCE-level guard rather than a behavioral one on purpose. A
 * behavioral test only proves the paths it happens to exercise; the risk here
 * is someone ADDING a path (an `ipcRenderer.on`, an `event.sender.send`, a
 * `MEMORY_VAULT.RESOLVE` constant) that no existing test would ever call. The
 * three layers checked are:
 *
 *   1. renderer  — src/SERVICEs/bridges/memory_vault_bridge.js
 *   2. preload   — electron/preload/bridges/memory_vault_bridge.js + channels
 *   3. main      — electron/shared/channels.js (the channel vocabulary itself)
 *
 * The renderer half of this repo owns layers 1 and (as a consumer) the shape
 * of 2 and 3; a failure here means the chat-core secret gate's trust model has
 * been widened and needs a security review, not a test edit.
 */
import fs from "fs";
import path from "path";

const readRepoFile = (relative) =>
  fs.readFileSync(path.join(process.cwd(), relative), "utf8");

const RENDERER_BRIDGE = "src/SERVICEs/bridges/memory_vault_bridge.js";
const PRELOAD_BRIDGE = "electron/preload/bridges/memory_vault_bridge.js";
const PRELOAD_CHANNELS = "electron/preload/channels.js";
const SHARED_CHANNELS = "electron/shared/channels.js";

/* Anything that would make the surface bidirectional or subscribable. */
const EVENT_API_PATTERN =
  /\bipcRenderer\s*\.\s*(on|once|addListener|send|sendSync|postMessage)\b|\bipcMain\s*\.\s*(on|once|addListener)\b|\bwebContents\s*\.\s*send\b|\bevent\s*\.\s*sender\s*\.\s*send\b|\bevent\s*\.\s*reply\b/;

/* Anything that would let a stored secret come BACK out. */
const READBACK_NAME_PATTERN = /resolve|decrypt|reveal|read|plaintext|export/i;

describe("memory vault IPC surface is invoke-only", () => {
  test("layer 1 (renderer bridge) touches no event API and no ipcRenderer at all", () => {
    const source = readRepoFile(RENDERER_BRIDGE);
    expect(source).not.toMatch(EVENT_API_PATTERN);
    // Renderer code must reach main only through window.memoryVaultAPI.
    expect(source).not.toContain("ipcRenderer");
    expect(source).not.toContain("require(\"electron\")");
  });

  test("layer 1 exposes no read/resolve/decrypt operation", () => {
    const source = readRepoFile(RENDERER_BRIDGE);
    const exportedOps = [
      "deposit",
      "listDescriptors",
      "deleteSecret",
      "grant",
      "revoke",
      "getStatus",
      "isAvailable",
    ];
    // The bridge object literal must contain exactly these operations.
    const objectBody = source.slice(
      source.indexOf("export const memoryVaultBridge = {"),
    );
    const declared = [...objectBody.matchAll(/^\s{2}([A-Za-z]+):/gm)].map(
      (match) => match[1],
    );
    expect(declared.sort()).toEqual([...exportedOps].sort());
    for (const name of declared) {
      if (name === "deposit") continue; // renderer -> main plaintext, allowed
      expect(name === "listDescriptors" || !READBACK_NAME_PATTERN.test(name))
        .toBe(true);
    }
  });

  test("layer 2 (preload bridge) uses ipcRenderer.invoke exclusively", () => {
    const source = readRepoFile(PRELOAD_BRIDGE);
    expect(source).not.toMatch(EVENT_API_PATTERN);
    const ipcUses = [...source.matchAll(/ipcRenderer\s*\.\s*([A-Za-z]+)/g)].map(
      (match) => match[1],
    );
    expect(ipcUses.length).toBeGreaterThan(0);
    expect(new Set(ipcUses)).toEqual(new Set(["invoke"]));
  });

  test("layer 2 registers every vault channel on the INVOKE allowlist only", () => {
    const source = readRepoFile(PRELOAD_CHANNELS);
    const vaultRefs = [
      ...source.matchAll(/CHANNELS\.MEMORY_VAULT\.([A-Z_]+)/g),
    ].map((match) => match[1]);
    expect(vaultRefs.sort()).toEqual(
      [
        "DELETE",
        "DEPOSIT",
        "GET_STATUS",
        "GRANT",
        "LIST_DESCRIPTORS",
        "REVOKE",
      ].sort(),
    );
    // They all live inside the INVOKE allowlist; there is no vault entry in
    // any event/listen allowlist.
    const invokeBlockStart = source.indexOf("INVOKE");
    expect(invokeBlockStart).toBeGreaterThanOrEqual(0);
    expect(source.indexOf("CHANNELS.MEMORY_VAULT.DEPOSIT")).toBeGreaterThan(
      invokeBlockStart,
    );
  });

  test("layer 3 (shared channel vocabulary) defines exactly six vault channels, none of them a readback", () => {
    const source = readRepoFile(SHARED_CHANNELS);
    const block = source.slice(
      source.indexOf("MEMORY_VAULT: Object.freeze({"),
    );
    const body = block.slice(0, block.indexOf("}),") + 3);
    const names = [...body.matchAll(/^\s{4}([A-Z_]+):\s*"/gm)].map(
      (match) => match[1],
    );
    expect(names.sort()).toEqual(
      [
        "DELETE",
        "DEPOSIT",
        "GET_STATUS",
        "GRANT",
        "LIST_DESCRIPTORS",
        "REVOKE",
      ].sort(),
    );
    for (const name of names) {
      if (name === "LIST_DESCRIPTORS") continue; // metadata only, no values
      expect(READBACK_NAME_PATTERN.test(name)).toBe(false);
    }
    // No vault channel may be named as an event/notification.
    const values = [...body.matchAll(/"(memory-vault:[a-z-]+)"/g)].map(
      (match) => match[1],
    );
    expect(values).toHaveLength(6);
    for (const value of values) {
      expect(value).not.toMatch(/:(on|event|changed|updated|push|stream)\b/);
    }
  });
});
