/** @jest-environment jsdom */

jest.mock("./chat_storage/chat_storage_store", () => ({
  getChatsStore: jest.fn(() => ({ activeChatId: null, chatsById: {} })),
  subscribeChatsStore: jest.fn(() => () => {}),
}));

import { api } from "./api";
import { fetchAndSyncSkillInventory } from "./plugin_skill_sync";
import {
  _resetSkillInventoryForTest,
  getLastSkillInventoryRevision,
} from "./skill_inventory_store";

const REV_A = `sha256:${"a".repeat(64)}`;
const REV_B = `sha256:${"b".repeat(64)}`;
const inventory = (revision) => ({
  schema: "pupu.skill_inventory.v1",
  revision,
  skills: [],
  diagnostics: [],
});

const send = (toolkits, extraOptions = {}) => {
  api.unchain.startStreamV4({
    message: "hello",
    options: { modelId: "openai:gpt-5", workspaceRoot: "/tmp/project", toolkits, ...extraOptions },
  });
  const calls = window.unchainAPI.startStreamV4.mock.calls;
  const [payload] = calls[calls.length - 1];
  expect(Object.keys(payload.options.skills)).toEqual(["include_user_dirs"]);
  expect(payload.options.toolkits).toEqual(toolkits);
  return payload.options.skill_inventory_revision;
};

describe("skill inventory context through fetch, cache, and stream bridge", () => {
  const originalUnchainApi = window.unchainAPI;

  beforeEach(() => {
    window.localStorage.clear();
    _resetSkillInventoryForTest();
    window.unchainAPI = {
      getSkillInventory: jest.fn(),
      startStreamV4: jest.fn(() => ({ disconnect: jest.fn() })),
    };
  });

  afterEach(() => {
    window.localStorage.clear();
    _resetSkillInventoryForTest();
    jest.clearAllMocks();
  });

  afterAll(() => {
    window.unchainAPI = originalUnchainApi;
  });

  test("A revision stays off B sends until B's validated response arrives", async () => {
    const responseA = inventory(REV_A);
    expect(Object.keys(responseA).sort()).toEqual(["diagnostics", "revision", "schema", "skills"]);
    window.unchainAPI.getSkillInventory.mockResolvedValueOnce(responseA);
    await fetchAndSyncSkillInventory({ workspaceRoot: "/tmp/project", toolkits: ["a"] });
    expect(window.unchainAPI.getSkillInventory).toHaveBeenCalledWith({
      workspaceRoot: "/tmp/project", includeUserDirs: true, toolkits: ["a"],
    });

    let resolveB;
    window.unchainAPI.getSkillInventory.mockImplementationOnce(() => new Promise((resolve) => {
      resolveB = resolve;
    }));
    const fetchB = fetchAndSyncSkillInventory({ workspaceRoot: "/tmp/project", toolkits: ["b"] });
    await Promise.resolve();
    expect(send(["b"])).toBeUndefined();
    expect(send(["a"])).toBe(REV_A);

    const responseB = inventory(REV_B);
    expect(Object.keys(responseB).sort()).toEqual(["diagnostics", "revision", "schema", "skills"]);
    resolveB(responseB);
    await fetchB;
    expect(send(["b"])).toBe(REV_B);
    expect(send(["a"])).toBeUndefined();
  });

  test("newer B wins an inverted response order and invalid inventory preserves B", async () => {
    let resolveA;
    let resolveB;
    window.unchainAPI.getSkillInventory
      .mockImplementationOnce(() => new Promise((resolve) => { resolveA = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveB = resolve; }));
    const fetchA = fetchAndSyncSkillInventory({ workspaceRoot: "/tmp/project", toolkits: ["a"] });
    const fetchB = fetchAndSyncSkillInventory({ workspaceRoot: "/tmp/project", toolkits: ["b"] });
    await Promise.resolve();

    resolveB(inventory(REV_B));
    await fetchB;
    resolveA(inventory(REV_A));
    await fetchA;
    expect(send(["b"])).toBe(REV_B);
    expect(send(["a"])).toBeUndefined();

    window.unchainAPI.getSkillInventory.mockResolvedValueOnce({ ...inventory(REV_A), unknown: true });
    await fetchAndSyncSkillInventory({ workspaceRoot: "/tmp/project", toolkits: ["a"] });
    expect(getLastSkillInventoryRevision({ workspaceRoot: "/tmp/project", toolkits: ["b"] })).toBe(REV_B);
    expect(send(["b"])).toBe(REV_B);
  });
});
