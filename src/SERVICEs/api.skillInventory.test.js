// Ticket #291 P4/P1/P5: api.unchain.getSkillInventory (renderer facade for the
// GET_SKILL_INVENTORY IPC channel) and injectSkillsOptionsIntoPayload (the
// payload-injection chain entry that attaches options.skills and, once a
// valid inventory has been cached, options.skill_inventory_revision to every
// composer send). Modeled after api.workspaceRoot.test.js's pattern for the
// sibling injectWorkspaceRootIntoPayload.
//
// P1: getSkillInventory also forwards the active chat's selected executable
// toolkit ids as `toolkits` so the backend can include their embedded
// [[skills]] in the response.
// P5: a cached revision only ever gets attached when it matches the sha256
// digest shape the backend actually emits — skill_inventory_store already
// enforces this before caching, but injectSkillsOptionsIntoPayload re-checks
// at the wire boundary too (defense in depth, locked in here by forcing the
// cache accessor to return a malformed value).

jest.mock("./skill_inventory_store", () => {
  const actual = jest.requireActual("./skill_inventory_store");
  return {
    ...actual,
    getLastSkillInventoryRevision: jest.fn(actual.getLastSkillInventoryRevision),
  };
});

import { api } from "./api";
import {
  applySkillInventory,
  getLastSkillInventoryRevision,
  _resetSkillInventoryForTest,
} from "./skill_inventory_store";

const writeSettings = (settings) => {
  window.localStorage.setItem("settings", JSON.stringify(settings || {}));
};

// Valid-shape sha256 digests (64 lowercase hex chars) — a bare "sha256:rev1"
// style string is REJECTED by skill_inventory_store's P5 schema now, so
// every fixture in this file must use one of these instead.
const REV_1 = `sha256:${"a".repeat(64)}`;
const REV_CACHED = `sha256:${"c".repeat(64)}`;
const REV_EXPLICIT = `sha256:${"d".repeat(64)}`;

describe("api.unchain.getSkillInventory", () => {
  const originalUnchainApi = window.unchainAPI;

  beforeEach(() => {
    window.localStorage.clear();
    _resetSkillInventoryForTest();
    getLastSkillInventoryRevision.mockImplementation(
      jest.requireActual("./skill_inventory_store").getLastSkillInventoryRevision,
    );
  });

  afterEach(() => {
    window.localStorage.clear();
    _resetSkillInventoryForTest();
    jest.clearAllMocks();
  });

  afterAll(() => {
    window.unchainAPI = originalUnchainApi;
  });

  test("returns the empty-schema fallback when the bridge method is unavailable", async () => {
    window.unchainAPI = {};

    const result = await api.unchain.getSkillInventory();

    expect(result).toEqual({
      schema: "pupu.skill_inventory.v1",
      revision: "",
      skills: [],
      diagnostics: [],
    });
  });

  test("forwards workspaceRoot/includeUserDirs/toolkits and returns the bridge payload", async () => {
    const payload = {
      schema: "pupu.skill_inventory.v1",
      revision: REV_1,
      skills: [],
      diagnostics: [],
    };
    window.unchainAPI = {
      getSkillInventory: jest.fn().mockResolvedValue(payload),
    };

    const result = await api.unchain.getSkillInventory({
      workspaceRoot: "/tmp/project",
      includeUserDirs: false,
      toolkits: ["notion", "github"],
    });

    expect(window.unchainAPI.getSkillInventory).toHaveBeenCalledWith({
      workspaceRoot: "/tmp/project",
      includeUserDirs: false,
      toolkits: ["notion", "github"],
    });
    expect(result).toEqual(payload);
  });

  test("filters non-string/empty entries out of toolkits before forwarding", async () => {
    window.unchainAPI = {
      getSkillInventory: jest.fn().mockResolvedValue({
        schema: "pupu.skill_inventory.v1",
        revision: REV_1,
        skills: [],
        diagnostics: [],
      }),
    };

    await api.unchain.getSkillInventory({
      toolkits: ["notion", "", 42, null, "github"],
    });

    expect(window.unchainAPI.getSkillInventory).toHaveBeenCalledWith({
      workspaceRoot: "",
      includeUserDirs: true,
      toolkits: ["notion", "github"],
    });
  });

  test("defaults includeUserDirs to true, workspaceRoot to '', and toolkits to [] when omitted", async () => {
    window.unchainAPI = {
      getSkillInventory: jest.fn().mockResolvedValue({
        schema: "pupu.skill_inventory.v1",
        revision: "",
        skills: [],
        diagnostics: [],
      }),
    };

    await api.unchain.getSkillInventory();

    expect(window.unchainAPI.getSkillInventory).toHaveBeenCalledWith({
      workspaceRoot: "",
      includeUserDirs: true,
      toolkits: [],
    });
  });

  test("a non-array toolkits value is coerced to []", async () => {
    window.unchainAPI = {
      getSkillInventory: jest.fn().mockResolvedValue({
        schema: "pupu.skill_inventory.v1",
        revision: "",
        skills: [],
        diagnostics: [],
      }),
    };

    await api.unchain.getSkillInventory({ toolkits: "not-an-array" });

    expect(window.unchainAPI.getSkillInventory).toHaveBeenCalledWith({
      workspaceRoot: "",
      includeUserDirs: true,
      toolkits: [],
    });
  });

  test("wraps a bridge failure into a FrontendApiError with the unchain_skill_inventory_failed fallback code", async () => {
    window.unchainAPI = {
      getSkillInventory: jest.fn().mockRejectedValue(new Error("sidecar down")),
    };

    await expect(api.unchain.getSkillInventory()).rejects.toMatchObject({
      code: "unchain_skill_inventory_failed",
    });
  });
});

describe("api.unchain.startStreamV2 skill options injection", () => {
  const originalUnchainApi = window.unchainAPI;

  beforeEach(() => {
    window.localStorage.clear();
    _resetSkillInventoryForTest();
    getLastSkillInventoryRevision.mockImplementation(
      jest.requireActual("./skill_inventory_store").getLastSkillInventoryRevision,
    );
    window.unchainAPI = {
      startStreamV2: jest.fn(() => ({ cancel: jest.fn() })),
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

  test("defaults options.skills.include_user_dirs to true when the runtime setting is missing", () => {
    api.unchain.startStreamV2({
      message: "hello",
      options: { modelId: "openai:gpt-5" },
    });

    const [payload] = window.unchainAPI.startStreamV2.mock.calls[0];
    expect(payload.options.skills).toEqual({ include_user_dirs: true });
  });

  test("reads options.skills.include_user_dirs from settings.runtime.skills.include_user_dirs", () => {
    writeSettings({ runtime: { skills: { include_user_dirs: false } } });

    api.unchain.startStreamV2({
      message: "hello",
      options: { modelId: "openai:gpt-5" },
    });

    const [payload] = window.unchainAPI.startStreamV2.mock.calls[0];
    expect(payload.options.skills).toEqual({ include_user_dirs: false });
  });

  test("does not attach skill_inventory_revision when no inventory has been cached yet", () => {
    api.unchain.startStreamV2({
      message: "hello",
      options: { modelId: "openai:gpt-5" },
    });

    const [payload] = window.unchainAPI.startStreamV2.mock.calls[0];
    expect(payload.options.skill_inventory_revision).toBeUndefined();
  });

  test("attaches the last cached skill inventory revision", () => {
    applySkillInventory({
      schema: "pupu.skill_inventory.v1",
      revision: REV_CACHED,
      skills: [],
      diagnostics: [],
    });

    api.unchain.startStreamV2({
      message: "hello",
      options: { modelId: "openai:gpt-5" },
    });

    const [payload] = window.unchainAPI.startStreamV2.mock.calls[0];
    expect(payload.options.skill_inventory_revision).toBe(REV_CACHED);
  });

  test("never overwrites an explicitly provided skill_inventory_revision", () => {
    applySkillInventory({
      schema: "pupu.skill_inventory.v1",
      revision: REV_CACHED,
      skills: [],
      diagnostics: [],
    });

    api.unchain.startStreamV2({
      message: "hello",
      options: {
        modelId: "openai:gpt-5",
        skill_inventory_revision: REV_EXPLICIT,
      },
    });

    const [payload] = window.unchainAPI.startStreamV2.mock.calls[0];
    expect(payload.options.skill_inventory_revision).toBe(REV_EXPLICIT);
  });

  test("an explicit blank skill_inventory_revision is treated as not provided and filled from the cache", () => {
    applySkillInventory({
      schema: "pupu.skill_inventory.v1",
      revision: REV_CACHED,
      skills: [],
      diagnostics: [],
    });

    api.unchain.startStreamV2({
      message: "hello",
      options: { modelId: "openai:gpt-5", skill_inventory_revision: "   " },
    });

    const [payload] = window.unchainAPI.startStreamV2.mock.calls[0];
    expect(payload.options.skill_inventory_revision).toBe(REV_CACHED);
  });

  // Ticket #291 P5: injectSkillsOptionsIntoPayload re-validates the cached
  // revision itself rather than trusting the cache blindly. skill_inventory_
  // store's own admission already guarantees only a valid-shape revision is
  // ever cached (see skill_inventory_store.test.js), so this forces the
  // accessor to return a malformed value to lock in the defense-in-depth
  // check independently of that guarantee.
  test("never attaches a cached revision that does not match the sha256 digest pattern", () => {
    getLastSkillInventoryRevision.mockReturnValue("not-a-real-revision");

    api.unchain.startStreamV2({
      message: "hello",
      options: { modelId: "openai:gpt-5" },
    });

    const [payload] = window.unchainAPI.startStreamV2.mock.calls[0];
    expect(payload.options.skill_inventory_revision).toBeUndefined();
  });

  test("never attaches a cached revision with the right prefix but the wrong digest length/charset", () => {
    getLastSkillInventoryRevision.mockReturnValue("sha256:not-hex-and-too-short");

    api.unchain.startStreamV2({
      message: "hello",
      options: { modelId: "openai:gpt-5" },
    });

    const [payload] = window.unchainAPI.startStreamV2.mock.calls[0];
    expect(payload.options.skill_inventory_revision).toBeUndefined();
  });
});
