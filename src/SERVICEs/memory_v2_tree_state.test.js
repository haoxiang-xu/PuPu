/* eslint-env jest */

/*
 * The decision table is the whole reason this module exists, so it is tested
 * branch by branch rather than through the component. Two properties matter
 * more than the individual cases:
 *
 *   1. ORDER. `get_tree` cannot distinguish "V2 is off" from "this owner never
 *      existed". The module avoids that ambiguity by never reaching get_tree
 *      when getStatus already said off — so the tests assert the calls that
 *      must NOT happen, not just the returned state.
 *   2. BOUNDEDNESS. flatten must terminate and must cap, including on inputs
 *      no healthy backend produces (a cycle, a 10k-deep chain).
 */

import {
  MEMORY_V2_TREE_STATES,
  MEMORY_V2_TREE_DISABLED_REASONS,
  MEMORY_V2_TREE_MAX_VISIBLE_ROWS,
  defaultExpandedPaths,
  flattenMemoryV2Tree,
  loadMemoryV2TreeState,
} from "./memory_v2_tree_state";

const codedError = (code) => new Error(`[${code}] something happened`);

const entry = (path, kind = "file", extra = {}) => ({
  entry_id: `entry-${path}`,
  path,
  parent_path: path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "",
  name: path.slice(path.lastIndexOf("/") + 1),
  kind,
  description: "",
  ...extra,
});

const makeBridge = (overrides = {}) => ({
  isAvailable: () => true,
  getStatus: jest.fn().mockResolvedValue({ available: true, rolloutMode: "all" }),
  listSpaces: jest
    .fn()
    .mockResolvedValue({ spaces: [{ space_id: "space-1", name: "workspace" }] }),
  getTree: jest.fn().mockResolvedValue({ entries: [], tree: [] }),
  ...overrides,
});

describe("loadMemoryV2TreeState — disabled branches", () => {
  test("no ownerChatId is `no_owner`, and never touches the bridge", async () => {
    const bridge = makeBridge();
    const result = await loadMemoryV2TreeState({ bridge });

    expect(result.state).toBe(MEMORY_V2_TREE_STATES.DISABLED);
    expect(result.reason).toBe(MEMORY_V2_TREE_DISABLED_REASONS.NO_OWNER);
    /* The settings/long_term mount renders with no owner. It must degrade,
       not fire requests that cannot be scoped. */
    expect(bridge.getStatus).not.toHaveBeenCalled();
    expect(bridge.listSpaces).not.toHaveBeenCalled();
  });

  test("blank ownerChatId is treated the same as absent", async () => {
    const bridge = makeBridge();
    const result = await loadMemoryV2TreeState({ ownerChatId: "   ", bridge });
    expect(result.reason).toBe(MEMORY_V2_TREE_DISABLED_REASONS.NO_OWNER);
    expect(bridge.getStatus).not.toHaveBeenCalled();
  });

  test("an unavailable bridge is `no_bridge`", async () => {
    const bridge = makeBridge({ isAvailable: () => false });
    const result = await loadMemoryV2TreeState({ ownerChatId: "chat-1", bridge });

    expect(result.state).toBe(MEMORY_V2_TREE_STATES.DISABLED);
    expect(result.reason).toBe(MEMORY_V2_TREE_DISABLED_REASONS.NO_BRIDGE);
    expect(bridge.getStatus).not.toHaveBeenCalled();
  });

  test("status.available false is `sidecar_unavailable` and stops before the tree", async () => {
    const bridge = makeBridge({
      getStatus: jest.fn().mockResolvedValue({ available: false, rolloutMode: "all" }),
    });
    const result = await loadMemoryV2TreeState({ ownerChatId: "chat-1", bridge });

    expect(result.state).toBe(MEMORY_V2_TREE_STATES.DISABLED);
    expect(result.reason).toBe(
      MEMORY_V2_TREE_DISABLED_REASONS.SIDECAR_UNAVAILABLE,
    );
    /* THE ordering guarantee: get_tree is never asked a question it cannot
       answer unambiguously. */
    expect(bridge.listSpaces).not.toHaveBeenCalled();
    expect(bridge.getTree).not.toHaveBeenCalled();
  });

  test("rolloutMode off is `rollout_off` and stops before the tree", async () => {
    const bridge = makeBridge({
      getStatus: jest.fn().mockResolvedValue({ available: true, rolloutMode: "off" }),
    });
    const result = await loadMemoryV2TreeState({ ownerChatId: "chat-1", bridge });

    expect(result.reason).toBe(MEMORY_V2_TREE_DISABLED_REASONS.ROLLOUT_OFF);
    expect(bridge.getTree).not.toHaveBeenCalled();
  });

  test("shadow and canary still serve reads", async () => {
    for (const rolloutMode of ["shadow", "canary", "all"]) {
      const bridge = makeBridge({
        getStatus: jest.fn().mockResolvedValue({ available: true, rolloutMode }),
      });
      const result = await loadMemoryV2TreeState({ ownerChatId: "chat-1", bridge });
      expect(result.state).not.toBe(MEMORY_V2_TREE_STATES.DISABLED);
    }
  });

  test("context_v2_store_disabled from listSpaces is disabled, not an error", async () => {
    const bridge = makeBridge({
      listSpaces: jest.fn().mockRejectedValue(codedError("context_v2_store_disabled")),
    });
    const result = await loadMemoryV2TreeState({ ownerChatId: "chat-1", bridge });

    expect(result.state).toBe(MEMORY_V2_TREE_STATES.DISABLED);
    expect(result.reason).toBe(MEMORY_V2_TREE_DISABLED_REASONS.STORE_DISABLED);
  });
});

describe("loadMemoryV2TreeState — empty is provably distinct from disabled", () => {
  test("no spaces, with V2 confirmed on, is EMPTY", async () => {
    const bridge = makeBridge({
      listSpaces: jest.fn().mockResolvedValue({ spaces: [] }),
    });
    const result = await loadMemoryV2TreeState({ ownerChatId: "chat-1", bridge });

    expect(result.state).toBe(MEMORY_V2_TREE_STATES.EMPTY);
    expect(bridge.getStatus).toHaveBeenCalled();
    expect(bridge.getTree).not.toHaveBeenCalled();
  });

  test("a space with zero entries is EMPTY, never DISABLED", async () => {
    const bridge = makeBridge();
    const result = await loadMemoryV2TreeState({ ownerChatId: "chat-1", bridge });

    expect(result.state).toBe(MEMORY_V2_TREE_STATES.EMPTY);
    expect(result.entryCount).toBe(0);
  });

  test("EMPTY and DISABLED are different states for the same absence of rows", async () => {
    const off = await loadMemoryV2TreeState({
      ownerChatId: "chat-1",
      bridge: makeBridge({
        getStatus: jest.fn().mockResolvedValue({ available: true, rolloutMode: "off" }),
      }),
    });
    const empty = await loadMemoryV2TreeState({
      ownerChatId: "chat-1",
      bridge: makeBridge(),
    });

    expect(off.roots).toHaveLength(0);
    expect(empty.roots).toHaveLength(0);
    /* Same zero rows, two states — this is the AC-5 distinction at its source. */
    expect(off.state).not.toBe(empty.state);
  });
});

describe("loadMemoryV2TreeState — ready and failure", () => {
  test("entries produce READY with the tree and a count", async () => {
    const bridge = makeBridge({
      getTree: jest.fn().mockResolvedValue({
        entries: [entry("notes", "folder"), entry("notes/a.md")],
        tree: [{ ...entry("notes", "folder"), children: [entry("notes/a.md")] }],
      }),
    });
    const result = await loadMemoryV2TreeState({ ownerChatId: "chat-1", bridge });

    expect(result.state).toBe(MEMORY_V2_TREE_STATES.READY);
    expect(result.entryCount).toBe(2);
    expect(result.spaceId).toBe("space-1");
    expect(result.spaceName).toBe("workspace");
  });

  test("the requested space wins when it exists, else the first", async () => {
    const bridge = makeBridge({
      listSpaces: jest.fn().mockResolvedValue({
        spaces: [
          { space_id: "space-1", name: "one" },
          { space_id: "space-2", name: "two" },
        ],
      }),
    });

    await loadMemoryV2TreeState({ ownerChatId: "chat-1", spaceId: "space-2", bridge });
    expect(bridge.getTree).toHaveBeenCalledWith({
      ownerChatId: "chat-1",
      spaceId: "space-2",
    });

    bridge.getTree.mockClear();
    await loadMemoryV2TreeState({ ownerChatId: "chat-1", spaceId: "gone", bridge });
    expect(bridge.getTree).toHaveBeenCalledWith({
      ownerChatId: "chat-1",
      spaceId: "space-1",
    });
  });

  test("a failing getTree is ERROR, carries the code, and keeps the space list", async () => {
    const bridge = makeBridge({
      getTree: jest.fn().mockRejectedValue(codedError("context_v2_unavailable")),
    });
    const result = await loadMemoryV2TreeState({ ownerChatId: "chat-1", bridge });

    expect(result.state).toBe(MEMORY_V2_TREE_STATES.ERROR);
    expect(result.errorCode).toBe("context_v2_unavailable");
    /* Keeping the spaces is what lets the user switch away from the space
       that is the thing failing. */
    expect(result.spaces).toHaveLength(1);
  });

  test("an uncoded rejection is still ERROR, never a throw", async () => {
    const bridge = makeBridge({
      getStatus: jest.fn().mockRejectedValue(new Error("socket hang up")),
    });
    const result = await loadMemoryV2TreeState({ ownerChatId: "chat-1", bridge });

    expect(result.state).toBe(MEMORY_V2_TREE_STATES.ERROR);
    expect(result.errorCode).toBe("");
    expect(result.errorMessage).toBe("socket hang up");
  });
});

describe("loadMemoryV2TreeState — UNKNOWN is its own class", () => {
  test("a non-object status is UNKNOWN, not EMPTY and not ERROR", async () => {
    const bridge = makeBridge({ getStatus: jest.fn().mockResolvedValue(null) });
    const result = await loadMemoryV2TreeState({ ownerChatId: "chat-1", bridge });
    expect(result.state).toBe(MEMORY_V2_TREE_STATES.UNKNOWN);
  });

  test("a tree payload without a `tree` array is UNKNOWN", async () => {
    const bridge = makeBridge({
      getTree: jest.fn().mockResolvedValue({ entries: [entry("a")] }),
    });
    const result = await loadMemoryV2TreeState({ ownerChatId: "chat-1", bridge });
    expect(result.state).toBe(MEMORY_V2_TREE_STATES.UNKNOWN);
  });

  test("a spaces payload that is not a list is UNKNOWN", async () => {
    const bridge = makeBridge({ listSpaces: jest.fn().mockResolvedValue({}) });
    const result = await loadMemoryV2TreeState({ ownerChatId: "chat-1", bridge });
    expect(result.state).toBe(MEMORY_V2_TREE_STATES.UNKNOWN);
  });
});

describe("flattenMemoryV2Tree — bounded rendering", () => {
  const node = (path, children = []) => ({
    ...entry(path, children.length ? "folder" : "file"),
    children,
  });

  test("collapsed children are not rows", () => {
    const roots = [node("a", [node("a/1"), node("a/2")])];
    const collapsed = flattenMemoryV2Tree(roots, { expanded: new Set() });
    const opened = flattenMemoryV2Tree(roots, { expanded: new Set(["a"]) });

    expect(collapsed.rows).toHaveLength(1);
    expect(opened.rows).toHaveLength(3);
    expect(opened.rows.map((r) => r.depth)).toEqual([0, 1, 1]);
  });

  test("rows are capped and the withheld count is reported, not hidden", () => {
    const children = Array.from({ length: 50 }, (_, i) => node(`a/${i}`));
    const roots = [node("a", children)];
    const flat = flattenMemoryV2Tree(roots, {
      expanded: new Set(["a"]),
      limit: 10,
    });

    expect(flat.rows).toHaveLength(10);
    expect(flat.visibleCount).toBe(51);
    expect(flat.hiddenCount).toBe(41);
    expect(flat.truncated).toBe(true);
  });

  test("the default cap applies with no explicit limit", () => {
    const children = Array.from(
      { length: MEMORY_V2_TREE_MAX_VISIBLE_ROWS + 25 },
      (_, i) => node(`a/${i}`),
    );
    const flat = flattenMemoryV2Tree([node("a", children)], {
      expanded: new Set(["a"]),
    });

    expect(flat.rows).toHaveLength(MEMORY_V2_TREE_MAX_VISIBLE_ROWS);
    expect(flat.truncated).toBe(true);
  });

  test("a self-referential child terminates instead of looping", () => {
    const loop = node("a", []);
    loop.children = [loop];
    const flat = flattenMemoryV2Tree([loop], { expanded: new Set(["a"]) });
    expect(flat.rows).toHaveLength(1);
  });

  test("a 10k-deep chain does not recurse into a stack overflow", () => {
    let deepest = node("n9999");
    const expanded = new Set(["n9999"]);
    for (let i = 9998; i >= 0; i -= 1) {
      deepest = node(`n${i}`, [deepest]);
      expanded.add(`n${i}`);
    }
    const flat = flattenMemoryV2Tree([deepest], { expanded });
    expect(flat.rows).toHaveLength(MEMORY_V2_TREE_MAX_VISIBLE_ROWS);
    expect(flat.visibleCount).toBe(10000);
  });

  test("a malformed roots value yields nothing rather than throwing", () => {
    expect(flattenMemoryV2Tree(null).rows).toEqual([]);
    expect(flattenMemoryV2Tree(undefined).truncated).toBe(false);
  });
});

describe("defaultExpandedPaths", () => {
  test("opens exactly one level — roots that have children", () => {
    const roots = [
      { ...entry("a", "folder"), children: [{ ...entry("a/1"), children: [] }] },
      { ...entry("b"), children: [] },
    ];
    const paths = defaultExpandedPaths(roots);
    expect([...paths]).toEqual(["a"]);
  });

  test("is empty for a malformed input", () => {
    expect(defaultExpandedPaths(null).size).toBe(0);
  });
});
